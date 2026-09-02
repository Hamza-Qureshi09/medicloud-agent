import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../db/index.ts";
import { medicloudResultDispatch, syncOrderInbox } from "../db/schema.ts";
import {
    RESULT_MAX_RETRY_ATTEMPTS,
    RESULT_RETRY_INTERVAL_MS,
    RESULT_UPLOAD_BATCH_SIZE,
    JITTER_MS,
} from "../lib/constants.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { PulledOrder, ResultUploadItem, UploadAnalyte } from "../types.ts";


/**
 * The SDK's analyte, read structurally so this file does not depend on the
 * exact driver types and keeps compiling across SDK revisions.
 */
type SdkAnalyte = Partial<Record<keyof UploadAnalyte, unknown>>;

/** Optional string field, dropped entirely when the driver did not set it. */
function text(value: unknown): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    return String(value);
}

/**
 * Projects one SDK analyte onto the wire shape MediCloud accepts.
 *
 * Upstream validates against a closed schema, so this whitelist is what keeps a
 * new SDK field from breaking every upload.
 */
function toUploadAnalyte(analyte: SdkAnalyte): UploadAnalyte {
    const projected: UploadAnalyte = { assayNo: String(analyte.assayNo ?? "") };

    const optional = [
        "assayName",
        "resultType",
        "value",
        "qualitative",
        "unit",
        "lowReference",
        "highReference",
        "abnormalFlag",
        "status",
        "completedAt",
    ] as const;

    for (const key of optional) {
        const value = text(analyte[key]);
        if (value !== undefined) projected[key] = value;
    }

    return projected;
}


/**
 * Background worker that delivers machine results to the upstream server (MediCloud or Master).
 *
 * Results are written to the `medicloudResultDispatch` outbox table first (by onResult),
 * then flushed upstream in batches. Failed deliveries are retried up to
 * RESULT_MAX_RETRY_ATTEMPTS times before being permanently marked as failed.
 *
 * The retry loop runs automatically via startRetryLoop(). onResult() also
 * triggers an immediate flush so successful results are delivered quickly.
 */
export class ResultDispatcher {

    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;

    constructor(private readonly syncClient: SyncClient) { }


    /**
     * Called by the Machine SDK (via onResultPersisted callback) whenever a
     * new result is saved locally. Queues it for upstream delivery and
     * triggers an immediate flush attempt.
     */
    async onResult(result: {
        id: number;
        orderId: number;
        sampleId: string;
        receivedAt: Date | string;
        payload?: { results?: SdkAnalyte[] };
    }): Promise<void> {

        // Find the inbox row that owns this result's order.
        const inboxRows = await db
            .select()
            .from(syncOrderInbox)
            .where(eq(syncOrderInbox.agentOrderId, result.orderId));

        // No matching inbox row means this order did not come from MediCloud — ignore.
        if (inboxRows.length === 0) return;

        const inbox = inboxRows[0];
        const order = JSON.parse(inbox.payloadJson) as PulledOrder;
        const idempotencyKey = `${inbox.dispatchId}:${result.id}`;
        const now = new Date().toISOString();

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
        const existing = await db
            .select()
            .from(medicloudResultDispatch)
            .where(eq(medicloudResultDispatch.agentResultId, result.id));

        if (existing.length === 0) {
            await db.insert(medicloudResultDispatch).values({
                agentResultId: result.id,
                agentOrderId: result.orderId,
                medicloudOrderId: order.orderId,
                medicloudDispatchId: inbox.dispatchId,
                idempotencyKey,
                payloadJson: JSON.stringify(upload),
                deliveryStatus: 0,
                createdAt: now,
            });
        }

        // Try to deliver immediately rather than waiting for the retry loop.
        await this.flush();
    }


    /**
     * Called by the Master when a slave forwards a result that was produced
     * on a slave-owned machine. Queues it under the original MediCloud order.
     */
    async enqueueFromSlave(item: ResultUploadItem, medicloudOrderId: string): Promise<void> {

        // Skip if already queued (idempotent — slave may retry the upload).
        const existing = await db
            .select()
            .from(medicloudResultDispatch)
            .where(eq(medicloudResultDispatch.idempotencyKey, item.idempotencyKey));

        if (existing.length > 0) return;

        const now = new Date().toISOString();
        await db.insert(medicloudResultDispatch).values({
            agentResultId: null,
            agentOrderId: item.localOrderId,
            medicloudOrderId,
            medicloudDispatchId: item.dispatchId,
            idempotencyKey: item.idempotencyKey,
            payloadJson: JSON.stringify(item),
            deliveryStatus: 0,
            createdAt: now,
        });
    }


    /** Starts the background retry loop. Call once after construction. */
    startRetryLoop(): void {
        this.schedule(RESULT_RETRY_INTERVAL_MS);
    }


    /** Stops the retry loop. Safe to call even if never started. */
    stop(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }


    private schedule(delayMs: number): void {
        this.stop();
        this.timer = setTimeout(() => void this.runLoop(), delayMs);
    }

    private async runLoop(): Promise<void> {
        try {
            await this.flush();
        } catch (error) {
            console.error("[ResultDispatcher] Flush failed:", error);
        } finally {
            this.schedule(RESULT_RETRY_INTERVAL_MS + Math.floor(Math.random() * JITTER_MS));
        }
    }


    /**
     * Uploads all pending/retryable results to upstream in a single batch.
     * Marks delivered rows as deliveryStatus=1, retryable failures as deliveryStatus=2, and
     * permanent failures as deliveryStatus=3.
     */
    async flush(): Promise<void> {
        if (this.running) return;
        this.running = true;

        // Declared outside the try so the catch penalises exactly the rows this
        // attempt actually carried, and nothing else.
        let deliverable: Array<typeof medicloudResultDispatch.$inferSelect> = [];

        try {
            deliverable = await db
                .select()
                .from(medicloudResultDispatch)
                .where(and(
                    or(
                        eq(medicloudResultDispatch.deliveryStatus, 0), // pending
                        eq(medicloudResultDispatch.deliveryStatus, 2), // retryable failure
                    ),
                    lt(medicloudResultDispatch.retryCount, RESULT_MAX_RETRY_ATTEMPTS),
                ))
                .limit(RESULT_UPLOAD_BATCH_SIZE);

            if (deliverable.length === 0) return;

            const batchId = crypto.randomUUID()
            const response = await this.syncClient.uploadResults(
                batchId,
                deliverable.map((r) => JSON.parse(r.payloadJson) as ResultUploadItem),
            );

            const deliveredKeys = [...response.accepted, ...response.duplicates];
            const now = new Date().toISOString();

            // Mark successfully delivered rows.
            if (deliveredKeys.length > 0) {

                // This result was successfully sent. Record when it was sent and remove any previous error & Only update rows whose idempotencyKey exists inside deliveredKeys.
                await db
                    .update(medicloudResultDispatch)
                    .set({ deliveryStatus: 1, sentAt: now, errorText: null })
                    .where(inArray(medicloudResultDispatch.idempotencyKey, deliveredKeys));

                // Mark the corresponding inbox orders as completed.
                const completedDispatches = deliverable
                    .filter((r) => deliveredKeys.includes(r.idempotencyKey))
                    .map((r) => r.medicloudDispatchId);

                if (completedDispatches.length > 0) {
                    //  Only update rows whose dispatchId exists inside completedDispatches.
                    await db
                        .update(syncOrderInbox)
                        .set({ status: "completed", completedAt: now, updatedAt: now })
                        .where(inArray(syncOrderInbox.dispatchId, completedDispatches));
                }
            }

            // Handle upstream rejections.
            const giveUp: Array<{ dispatchId: string; message: string }> = [];
            for (const rejection of response.rejected) {
                const row = deliverable.find((r) => r.idempotencyKey === rejection.idempotencyKey);
                if (!row) continue;
                const nextRetryCount = row.retryCount + 1;
                const finalStatus = (!rejection.retryable || nextRetryCount >= RESULT_MAX_RETRY_ATTEMPTS) ? 3 : 2;
                const message = `${rejection.code}: ${rejection.message}`;
                await db
                    .update(medicloudResultDispatch)
                    .set({
                        deliveryStatus: finalStatus,
                        errorText: message,
                        retryCount: nextRetryCount,
                    })
                    .where(eq(medicloudResultDispatch.id, row.id));

                if (finalStatus === 3) {
                    giveUp.push({ dispatchId: row.medicloudDispatchId, message });
                }
            }
            await this.abandon(giveUp);

        } catch (error) {
            // Network/upstream failure — penalise only the rows this attempt carried.
            const message = error instanceof Error ? error.message : String(error);
            const giveUp: Array<{ dispatchId: string; message: string }> = [];

            for (const row of deliverable) {
                const nextRetryCount = row.retryCount + 1;
                const finalStatus = nextRetryCount >= RESULT_MAX_RETRY_ATTEMPTS ? 3 : 2;
                await db
                    .update(medicloudResultDispatch)
                    .set({ deliveryStatus: finalStatus, errorText: message, retryCount: nextRetryCount })
                    .where(eq(medicloudResultDispatch.id, row.id));

                if (finalStatus === 3) {
                    giveUp.push({ dispatchId: row.medicloudDispatchId, message });
                }
            }

            // Best-effort: upstream is already unreachable, so this usually
            // fails too and the next cycle re-reports.
            await this.abandon(giveUp);
            throw error;
        } finally {
            this.running = false;
        }
    }


    /**
     * Closes out results we will never deliver.
     *
     * Without this a permanently failed result leaves its inbox row stuck at
     * "processing" and leaves MediCloud's dispatch waiting forever with no
     * indication that the lab is no longer trying.
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
                failures.map((failure) => ({
                    dispatchId: failure.dispatchId,
                    status: "failed" as const,
                    message: `Result delivery abandoned: ${failure.message}`,
                })),
            );
        } catch (error) {
            console.error("[ResultDispatcher] Failed to report abandoned results upstream:", error);
        }
    }
}