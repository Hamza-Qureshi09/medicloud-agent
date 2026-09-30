import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../db/index.ts";
import { syncOrderInbox } from "../db/tables/syncOrderInbox.ts";
import { medicloudResultDispatch } from "../db/tables/medicloudResultDispatch.ts";
import {
  JITTER_MS,
  RESULT_DELIVERY_STATUS,
  RESULT_MAX_RETRY_ATTEMPTS,
  RESULT_OFFLINE_BACKOFF_MS,
  RESULT_RETRY_INTERVAL_MS,
  RESULT_UPLOAD_BATCH_SIZE,
} from "../lib/constants.ts";
import { describeError, isTransientFailure } from "../lib/error.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { ResultUploadItem } from "../schemas/sync.ts";
import { PulledOrderSchema, ResultUploadItemSchema } from "../schemas/sync.ts";
import type { PersistedMachineResult } from "../types.ts";
import { toUploadAnalyte } from "../lib/utils.ts";

/**
 * Background worker that delivers machine results to the upstream server
 * (MediCloud or master agent).
 *
 * Results are written to the `medicloudResultDispatch` outbox table first
 * (by onResult / enqueueFromSlave), then flushed upstream in batches.
 * Failed deliveries are retried up to RESULT_MAX_RETRY_ATTEMPTS times before
 * being permanently marked as failed.
 *
 * The retry loop runs via startRetryLoop(). onResult() also triggers an
 * immediate flush so results are delivered quickly.
 */
export class ResultDispatcher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = true;
  private lastError: string | null = null; // Last failure message - prevents log-flooding on persistent outages.
  private offline = false; // Set while upstream is unreachable so the loop backs off instead of spinning.

  constructor(private readonly syncClient: SyncClient) {}

  /**
   * Called by the Machine SDK (via onResultPersisted callback) whenever a
   * new result is saved locally. Queues it for upstream delivery and
   * triggers an immediate flush attempt.
   */
  async onResult(result: PersistedMachineResult): Promise<void> {
    // Find the inbox row that owns this result's order.
    const [inbox] = await db
      .select()
      .from(syncOrderInbox)
      .where(eq(syncOrderInbox.agentOrderId, result.orderId))
      .limit(1);

    // No matching inbox row → this order did not come from MediCloud - ignore.
    if (!inbox) {
      console.log(
        `[ResultDispatcher] Ignoring local result #${result.id} (agent order ${result.orderId}) - not a MediCloud order`,
      );
      return;
    }

    const now = new Date().toISOString();

    // Locally-created orders just need their status updated - no upstream upload.
    if (inbox.source === "local") {
      await db
        .update(syncOrderInbox)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(syncOrderInbox.id, inbox.id));

      console.log(
        `[ResultDispatcher] Completed local order ${inbox.dispatchId} ` +
          `(agent order ${result.orderId}, result #${result.id}) - kept on this agent`,
      );
      return;
    }

    const order = PulledOrderSchema.parse(JSON.parse(inbox.payloadJson));
    const idempotencyKey = `${inbox.dispatchId}:${result.id}`;

    const upload: ResultUploadItem = {
      idempotencyKey,
      dispatchId: inbox.dispatchId,
      localOrderId: result.orderId,
      localResultId: result.id,
      sampleId: result.sampleId,
      receivedAt: result.receivedAt instanceof Date
        ? result.receivedAt.toISOString()
        : String(result.receivedAt ?? now),
      analytes: (result.payload?.results ?? []).map(toUploadAnalyte),
    };

    // Insert into outbox only if not already there (idempotent).
    const [existing] = await db
      .select({ id: medicloudResultDispatch.id })
      .from(medicloudResultDispatch)
      .where(eq(medicloudResultDispatch.agentResultId, result.id))
      .limit(1);

    if (!existing) {
      console.log(
        `[ResultDispatcher] Queued result #${result.id} for dispatch ${inbox.dispatchId} ` +
          `(sample ${result.sampleId}, ${upload.analytes.length} analyte(s): ` +
          `${upload.analytes.map((a) => a.assayNo).join(", ") || "none"})`,
      );
      await db.insert(medicloudResultDispatch).values({
        agentResultId: result.id,
        agentOrderId: result.orderId,
        medicloudOrderId: order.orderId,
        medicloudDispatchId: inbox.dispatchId,
        idempotencyKey,
        payloadJson: JSON.stringify(upload),
        deliveryStatus: RESULT_DELIVERY_STATUS.pending,
        createdAt: now,
      });
    }

    // Try to deliver immediately rather than waiting for the retry loop.
    await this.flush();
  }

  /**
   * Called by the master when a slave forwards a result produced on a slave-owned machine.
   * Queues it under the original MediCloud order.
   */
  async enqueueFromSlave(
    item: ResultUploadItem,
    medicloudOrderId: string,
  ): Promise<void> {
    // Idempotent - slave may retry the upload.
    const [existing] = await db
      .select({ id: medicloudResultDispatch.id })
      .from(medicloudResultDispatch)
      .where(eq(medicloudResultDispatch.idempotencyKey, item.idempotencyKey))
      .limit(1);

    if (existing) return;

    const now = new Date().toISOString();
    await db.insert(medicloudResultDispatch).values({
      agentResultId: null,
      agentOrderId: item.localOrderId,
      medicloudOrderId,
      medicloudDispatchId: item.dispatchId,
      idempotencyKey: item.idempotencyKey,
      payloadJson: JSON.stringify(item),
      deliveryStatus: RESULT_DELIVERY_STATUS.pending,
      createdAt: now,
    });
  }

  /** Starts the background retry loop. Call once after construction. */
  startRetryLoop(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(RESULT_RETRY_INTERVAL_MS);
  }

  /** Stops the retry loop. Safe to call even if never started. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runLoop();
    }, delayMs);
  }

  private async runLoop(): Promise<void> {
    try {
      await this.flush();
    } catch (error) {
      const message = describeError(error);
      if (message !== this.lastError) {
        console.error(`[ResultDispatcher] Flush failed: ${message}`);
        this.lastError = message;
      }
    } finally {
      const interval = this.offline
        ? RESULT_OFFLINE_BACKOFF_MS
        : RESULT_RETRY_INTERVAL_MS;
      this.schedule(interval + Math.floor(Math.random() * JITTER_MS));
    }
  }

  /**
   * Uploads all pending/retryable results to upstream in one batch.
   *
   * - deliveryStatus 0 → pending
   * - deliveryStatus 1 → delivered
   * - deliveryStatus 2 → retryable failure
   * - deliveryStatus 3 → permanent failure
   */
  async flush(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Declared outside try so catch can penalise exactly the rows this attempt carried.
    let deliverable: Array<typeof medicloudResultDispatch.$inferSelect> = [];

    try {
      deliverable = await db
        .select()
        .from(medicloudResultDispatch)
        .where(and(
          or(
            eq(
              medicloudResultDispatch.deliveryStatus,
              RESULT_DELIVERY_STATUS.pending,
            ),
            eq(
              medicloudResultDispatch.deliveryStatus,
              RESULT_DELIVERY_STATUS.retryable,
            ),
          ),
          lt(medicloudResultDispatch.retryCount, RESULT_MAX_RETRY_ATTEMPTS),
        ))
        .limit(RESULT_UPLOAD_BATCH_SIZE);

      if (deliverable.length === 0) return;

      const batchId = crypto.randomUUID();
      const response = await this.syncClient.uploadResults(
        batchId,
        deliverable.map((r) =>
          ResultUploadItemSchema.parse(JSON.parse(r.payloadJson))
        ),
      );

      const deliveredKeys = [...response.accepted, ...response.duplicates];
      const now = new Date().toISOString();
      this.lastError = null;
      this.offline = false;

      console.log(
        `[ResultDispatcher] Uploaded batch ${batchId}: ${deliverable.length} sent, ` +
          `${response.accepted.length} accepted, ${response.duplicates.length} duplicate, ` +
          `${response.rejected.length} rejected` +
          (response.rejected.length
            ? ` (${
              response.rejected.map((r) =>
                `${r.code}${r.retryable ? " retryable" : ""}`
              ).join(", ")
            })`
            : ""),
      );

      // Mark delivered rows.
      if (deliveredKeys.length > 0) {
        await db
          .update(medicloudResultDispatch)
          .set({
            deliveryStatus: RESULT_DELIVERY_STATUS.delivered,
            sentAt: now,
            errorText: null,
          })
          .where(
            inArray(medicloudResultDispatch.idempotencyKey, deliveredKeys),
          );

        const completedDispatches = deliverable
          .filter((r) => deliveredKeys.includes(r.idempotencyKey))
          .map((r) => r.medicloudDispatchId);

        if (completedDispatches.length > 0) {
          await db
            .update(syncOrderInbox)
            .set({ status: "completed", completedAt: now, updatedAt: now })
            .where(inArray(syncOrderInbox.dispatchId, completedDispatches));
        }
      }

      // Handle upstream rejections.
      const giveUp: Array<{ dispatchId: string; message: string }> = [];
      for (const rejection of response.rejected) {
        const row = deliverable.find((r) =>
          r.idempotencyKey === rejection.idempotencyKey
        );
        if (!row) continue;

        const nextRetryCount = row.retryCount + 1;
        const finalStatus =
          !rejection.retryable || nextRetryCount >= RESULT_MAX_RETRY_ATTEMPTS
            ? RESULT_DELIVERY_STATUS.failed
            : RESULT_DELIVERY_STATUS.retryable;
        const message = `${rejection.code}: ${rejection.message}`;

        await db
          .update(medicloudResultDispatch)
          .set({
            deliveryStatus: finalStatus,
            errorText: message,
            retryCount: nextRetryCount,
          })
          .where(eq(medicloudResultDispatch.id, row.id));

        if (finalStatus === RESULT_DELIVERY_STATUS.failed) {
          giveUp.push({ dispatchId: row.medicloudDispatchId, message });
        }
      }
      await this.abandon(giveUp);
    } catch (error) {
      const message = describeError(error);

      // Network failure - do NOT burn the retry budget.
      // A lab whose link drops for hours must not lose patient results.
      if (isTransientFailure(error)) {
        this.offline = true;
        await db
          .update(medicloudResultDispatch)
          .set({
            deliveryStatus: RESULT_DELIVERY_STATUS.retryable,
            errorText: message,
          })
          .where(
            inArray(medicloudResultDispatch.id, deliverable.map((r) => r.id)),
          );
        throw error;
      }

      // Real upstream refusal - penalise only the rows this attempt carried.
      const giveUp: Array<{ dispatchId: string; message: string }> = [];
      for (const row of deliverable) {
        const nextRetryCount = row.retryCount + 1;
        const finalStatus = nextRetryCount >= RESULT_MAX_RETRY_ATTEMPTS
          ? RESULT_DELIVERY_STATUS.failed
          : RESULT_DELIVERY_STATUS.retryable;
        await db
          .update(medicloudResultDispatch)
          .set({
            deliveryStatus: finalStatus,
            errorText: message,
            retryCount: nextRetryCount,
          })
          .where(eq(medicloudResultDispatch.id, row.id));

        if (finalStatus === RESULT_DELIVERY_STATUS.failed) {
          giveUp.push({ dispatchId: row.medicloudDispatchId, message });
        }
      }
      await this.abandon(giveUp);
      throw error;
    } finally {
      this.running = false;
    }
  }

  /**
   * Marks permanently-failed dispatches in the inbox and reports them upstream.
   *
   * Without this, a permanently-failed result leaves its inbox row stuck at
   * "processing" and leaves MediCloud waiting forever with no indication that
   * the lab has stopped trying.
   */
  private async abandon(
    failures: Array<{ dispatchId: string; message: string }>,
  ): Promise<void> {
    if (failures.length === 0) return;

    const now = new Date().toISOString();
    for (const failure of failures) {
      await db
        .update(syncOrderInbox)
        .set({
          status: "failed",
          errorText: `Result delivery abandoned: ${failure.message}`,
          updatedAt: now,
        })
        .where(eq(syncOrderInbox.dispatchId, failure.dispatchId));
    }

    try {
      await this.syncClient.reportStatus(
        failures.map((f) => ({
          dispatchId: f.dispatchId,
          status: "failed" as const,
          message: `Result delivery abandoned: ${f.message}`,
        })),
      );
    } catch (error) {
      console.error(
        "[ResultDispatcher] Failed to report abandoned results upstream:",
        error,
      );
    }
  }
}
