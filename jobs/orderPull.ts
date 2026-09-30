import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/index.ts";
import { syncOrderInbox } from "../db/tables/syncOrderInbox.ts";
import { postMachineOrder } from "../lib/api.ts";
import {
  IDLE_LOG_EVERY_N_CYCLES,
  IN_FLIGHT_STATUSES,
  INITIAL_ORDER_PULL_DELAY_MS,
  JITTER_MS,
  MAX_CAPACITY,
  ON_ERROR_DELAY_MS,
  ON_ORDERS_RECEIVED_DELAY_MS,
  ORDER_EXPIRY_MS,
} from "../lib/constants.ts";
import { describeError } from "../lib/error.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { PulledOrder, SyncMachineCapability } from "../schemas/sync.ts";
import { PulledOrderSchema } from "../schemas/sync.ts";

/**
 * Background worker that continuously polls the upstream server for new orders.
 *
 * Each cycle:
 *  1. Re-acknowledge any orders stuck at "received" (lost ack recovery).
 *  2. Resume any acknowledged orders not yet submitted to the machine SDK.
 *  3. Calculate available capacity (MAX_CAPACITY minus in-flight count).
 *  4. Pull up to that many new orders from upstream.
 *  5. Validate, persist, acknowledge, then submit the newly accepted orders.
 *
 * Upstream tells us how long to wait before pulling again via `pullAfterMs`.
 * Orders received → pull again sooner. Errors → back off to ON_ERROR_DELAY_MS.
 */
export class OrderPullWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = true;
  private lastError: string | null = null; // Last failure message - prevents log-flooding on persistent outages.
  private idleCycles = 0; //Consecutive empty pulls - throttles the "nothing to do" log line.

  constructor(
    private readonly syncClient: SyncClient,
    private readonly getCapabilities: () => Promise<SyncMachineCapability[]>,
    private readonly orderPullIntervalMs: number,
  ) {}

  /** Starts the pull loop. Subsequent calls are ignored. */
  start(initialDelayMs = INITIAL_ORDER_PULL_DELAY_MS): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(initialDelayMs);
  }

  /** Stops the pull loop. Safe to call even if never started. */
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
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    let nextDelay = this.orderPullIntervalMs;

    try {
      // Recover lost acks, then resume acknowledged orders before fetching more.
      await this.reacknowledgeStoredOrders();
      await this.resumeStoredOrders();

      // Dynamic capacity: skip the pull entirely when full.
      const availableCapacity = await this.getAvailableCapacity();
      this.lastError = null;

      if (availableCapacity === 0) {
        console.log("[OrderPullWorker] At capacity, skipping pull.");
        nextDelay = this.orderPullIntervalMs;
      } else {
        const capabilities = await this.getCapabilities();

        // Only advertise profile keys whose machine is currently running.
        const availableProfileKeys = capabilities
          .filter((m) => m.running)
          .map((m) => m.profileKey);

        // pull orders from the "host" (master/medicloud)
        const response = await this.syncClient.pullOrders(
          availableCapacity,
          availableProfileKeys,
        );

        if (response.leaseId && response.orders.length > 0) {
          console.log(
            `[OrderPullWorker] Pulled ${response.orders.length} order(s) under lease ${response.leaseId}: ` +
              response.orders
                .map((o) =>
                  `${o.dispatchId} (sample ${o.sampleId}, tests ${
                    o.tests.join("/")
                  }, profile ${o.profileKey})`
                )
                .join("; "),
          );
          await this.storeAndAcknowledge(
            response.leaseId,
            response.orders as PulledOrder[],
            capabilities,
          );
          await this.resumeStoredOrders();
          nextDelay = ON_ORDERS_RECEIVED_DELAY_MS;
          this.idleCycles = 0;
        } else {
          if (this.idleCycles % IDLE_LOG_EVERY_N_CYCLES === 0) {
            console.log(
              `[OrderPullWorker] Polled, no pending orders (capacity ${availableCapacity}, ` +
                `${availableProfileKeys.length}/${capabilities.length} profile(s) offered)`,
            );
          }
          this.idleCycles++;
          nextDelay = response.pullAfterMs || this.orderPullIntervalMs;
        }
      }
    } catch (error) {
      const message = describeError(error);
      if (message !== this.lastError) {
        console.error(`[OrderPullWorker] Pull cycle failed: ${message}`);
        this.lastError = message;
      }
      this.idleCycles = 0;
      nextDelay = ON_ERROR_DELAY_MS;
    } finally {
      this.running = false;
      // Small jitter prevents multiple agents hammering upstream simultaneously.
      if (!this.stopped) {
        this.schedule(nextDelay + Math.floor(Math.random() * JITTER_MS));
      }
    }
  }

  /**
   * Returns how many more orders this agent can accept right now.
   * Subtracts the current in-flight count from MAX_CAPACITY.
   */
  private async getAvailableCapacity(): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(syncOrderInbox)
      .where(inArray(syncOrderInbox.status, [...IN_FLIGHT_STATUSES]));

    const inFlight = result?.total ?? 0;
    return Math.max(0, MAX_CAPACITY - inFlight);
  }

  /**
   * Validates each pulled order against available machine capabilities,
   * persists accepted orders to the inbox, then acknowledges the batch upstream.
   */
  private async storeAndAcknowledge(
    leaseId: string,
    orders: PulledOrder[],
    capabilities: SyncMachineCapability[],
  ): Promise<void> {
    const accepted: Array<{ dispatchId: string }> = [];
    const rejected: Array<
      { dispatchId: string; code: string; message: string }
    > = [];
    const now = new Date().toISOString();

    for (const order of orders) {
      // Does a running machine handle this profile key?
      const machine = capabilities.find(
        (m) => m.profileKey === order.profileKey && m.running,
      );
      if (!machine) {
        rejected.push({
          dispatchId: order.dispatchId,
          code: "PROFILE_UNAVAILABLE",
          message: `Profile ${order.profileKey} is not currently running`,
        });
        continue;
      }

      // Does that machine support all requested tests?
      const unsupportedTests = order.tests.filter(
        (test) => !machine.catalogTests.includes(test),
      );
      if (unsupportedTests.length > 0) {
        rejected.push({
          dispatchId: order.dispatchId,
          code: "UNSUPPORTED_TEST",
          message: `Tests not in machine catalog: ${
            unsupportedTests.join(", ")
          }`,
        });
        continue;
      }

      // Persist - idempotent, skip if this dispatchId was already stored.
      const [existing] = await db
        .select({ id: syncOrderInbox.id })
        .from(syncOrderInbox)
        .where(eq(syncOrderInbox.dispatchId, order.dispatchId))
        .limit(1);

      if (!existing) {
        // MediCloud never sets targetSlaveId in the payload - extract from the
        // "slave:<slaveId>:<rest>" namespace prefix built in getUpstreamCapabilities().
        const resolvedTargetSlaveId = machine.isSlaveOwned && machine.slaveId
          ? machine.slaveId
          : (order.targetSlaveId ?? null);

        await db.insert(syncOrderInbox).values({
          dispatchId: order.dispatchId,
          leaseId,
          profileKey: order.profileKey,
          driverId: order.driverId,
          targetSlaveId: resolvedTargetSlaveId,
          payloadJson: JSON.stringify(order),
          status: "received",
          receivedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // Already stored - upstream re-leased after our previous ack was lost.
        // Adopt the new lease so a later re-ack uses one upstream still recognises.
        await db
          .update(syncOrderInbox)
          .set({ leaseId, updatedAt: now })
          .where(eq(syncOrderInbox.dispatchId, order.dispatchId));
      }

      accepted.push({ dispatchId: order.dispatchId });
    }

    // Acknowledge the batch upstream.
    const ackResult = await this.syncClient.acknowledgeOrders(
      leaseId,
      accepted,
      rejected,
    );

    console.log(
      `[OrderPullWorker] Ack sent: ${accepted.length} accepted, ${rejected.length} rejected` +
        (rejected.length
          ? ` (${rejected.map((r) => `${r.dispatchId} ${r.code}`).join(", ")})`
          : ""),
    );

    // Mark acknowledged orders in the DB.
    const acknowledgedAt = new Date().toISOString();
    for (const dispatchId of ackResult.acknowledged) {
      await db
        .update(syncOrderInbox)
        .set({
          status: "acknowledged",
          updatedAt: acknowledgedAt,
          acknowledgedAt,
        })
        .where(eq(syncOrderInbox.dispatchId, dispatchId));
    }
  }

  /**
   * Re-acknowledges orders stuck at "received" whose ack never reached upstream
   * (e.g. network drop mid-cycle).
   *
   * Without this, stuck rows count as in-flight and permanently shrink capacity
   * until it hits zero and the agent stops accepting work altogether.
   */
  private async reacknowledgeStoredOrders(): Promise<void> {
    const stuckRows = await db
      .select()
      .from(syncOrderInbox)
      .where(and(
        eq(syncOrderInbox.status, "received"),
        eq(syncOrderInbox.source, "upstream"),
      ));

    if (stuckRows.length === 0) return;

    // Replay one ack per lease - upstream validates the ack against the lease it issued.
    const byLease = new Map<string, string[]>();
    for (const row of stuckRows) {
      byLease.set(row.leaseId, [
        ...(byLease.get(row.leaseId) ?? []),
        row.dispatchId,
      ]);
    }

    for (const [leaseId, dispatchIds] of byLease) {
      try {
        const ackResult = await this.syncClient.acknowledgeOrders(
          leaseId,
          dispatchIds.map((dispatchId) => ({ dispatchId })), // accepted
          [], // rejected
        );

        const now = new Date().toISOString();
        for (const dispatchId of ackResult.acknowledged) {
          await db
            .update(syncOrderInbox)
            .set({
              status: "acknowledged",
              acknowledgedAt: now,
              updatedAt: now,
            })
            .where(eq(syncOrderInbox.dispatchId, dispatchId));
        }

        // Upstream no longer recognises our lease - it has expired and been handed on.
        // Release the row so it stops consuming capacity until the next pull.
        for (const dispatchId of ackResult.conflicts) {
          await db
            .update(syncOrderInbox)
            .set({
              status: "failed",
              errorText: "Lease no longer valid on upstream, awaiting re-lease",
              updatedAt: now,
            })
            .where(eq(syncOrderInbox.dispatchId, dispatchId));
        }
      } catch (error) {
        // Still unreachable - leave rows alone and retry next cycle.
        console.error(
          `[OrderPullWorker] Re-ack failed for lease ${leaseId}:`,
          error,
        );
      }
    }
  }

  /**
   * Picks up all acknowledged orders not yet submitted to a local machine and submits them.
   * Orders with a targetSlaveId are skipped - the slave handles those itself.
   */
  private async resumeStoredOrders(): Promise<void> {
    const pendingRows = await db
      .select()
      .from(syncOrderInbox)
      .where(and(
        eq(syncOrderInbox.status, "acknowledged"),
        isNull(syncOrderInbox.agentOrderId),
        eq(syncOrderInbox.source, "upstream"),
      ));

    for (const row of pendingRows) {
      const order = PulledOrderSchema.parse(JSON.parse(row.payloadJson));

      // Use the DB column - MediCloud never sets targetSlaveId in the payload.
      if (row.targetSlaveId) continue;

      // Profile key format: "<driverId>:<profileId>" - extract the numeric ID.
      const localProfileId = Number(order.profileKey.split(":").at(-1));
      if (!Number.isInteger(localProfileId) || localProfileId <= 0) {
        await this.markFailed(
          row.dispatchId,
          `Invalid profile key: ${order.profileKey}`,
        );
        continue;
      }

      try {
        await this.submitOrder(row.dispatchId, order, localProfileId);
      } catch (error) {
        await this.markFailed(
          row.dispatchId,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Submits one order to the local machine SDK, marks it "processing",
   * and reports that status back to upstream.
   */
  private async submitOrder(
    dispatchId: string,
    order: PulledOrder,
    localProfileId: number,
  ): Promise<void> {
    const agentOrderId = await postMachineOrder({
      machineId: localProfileId,
      sampleId: order.sampleId,
      ...(order.sampleType ? { sampleType: order.sampleType } : {}),
      ...(order.rackPosition ? { rackPosition: order.rackPosition } : {}),
      tests: order.tests,
      patientName: order.patient.name,
      patientId: order.patient.id ?? "",
      dob: order.patient.dob,
      sex: order.patient.sex,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS).toISOString(),
    });

    const now = new Date().toISOString();
    await db
      .update(syncOrderInbox)
      .set({
        agentOrderId,
        status: "processing",
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(syncOrderInbox.dispatchId, dispatchId));

    console.log(
      `[OrderPullWorker] Submitted ${dispatchId} to machine profile ${localProfileId} ` +
        `as agent order #${agentOrderId} (sample ${order.sampleId}, tests ${
          order.tests.join("/")
        })`,
    );

    try {
      await this.syncClient.reportStatus([{
        dispatchId,
        status: "processing",
      }]);
    } catch (error) {
      // Non-fatal - the machine is already processing the order.
      console.error(
        `[OrderPullWorker] Failed to report processing status for ${dispatchId}:`,
        error,
      );
    }
  }

  /** Marks an order as failed locally and reports the failure upstream. */
  private async markFailed(dispatchId: string, message: string): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(syncOrderInbox)
      .set({ status: "failed", errorText: message, updatedAt: now })
      .where(eq(syncOrderInbox.dispatchId, dispatchId));

    await this.syncClient.reportStatus([{
      dispatchId,
      status: "failed",
      message,
    }]);
    console.error(`[OrderPullWorker] Order ${dispatchId} failed: ${message}`);
  }
}
