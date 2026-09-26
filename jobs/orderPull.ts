import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/index.ts";
import { syncOrderInbox } from "../db/schema.ts";
import { postMachineOrder } from "../lib/endpoints.ts";
import {
    IN_FLIGHT_STATUSES,
    JITTER_MS,
    MAX_CAPACITY,
    ON_ERROR_DELAY_MS,
    ON_ORDERS_RECEIVED_DELAY_MS,
} from "../lib/constants.ts";
import { describeError } from "../lib/error.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { PulledOrder, SyncMachineCapability } from "../types.ts";

/** Idle pulls between "still alive, nothing to do" lines (~1 min at 10s). */
const IDLE_LOG_EVERY_N_CYCLES = 6;





/**
 * Background worker that continuously polls the upstream server for new orders.
 *
 * Each cycle:
 *  1. Resume any acknowledged orders not yet submitted to the machine SDK.
 *  2. Calculate how many more orders this agent can handle (dynamic capacity).
 *  3. Pull up to that many new orders from upstream.
 *  4. Validate, persist, and acknowledge the received orders.
 *  5. Submit newly acknowledged orders to the local machine SDK.
 *
 * Upstream tells us how long to wait before pulling again via `pullAfterMs`.
 * If orders were received we pull again sooner. Errors back off to ON_ERROR_DELAY_MS.
 */
export class OrderPullWorker {

    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;
    private stopped = true;
    /** Last failure printed, so a persistent outage is not logged every cycle. */
    private lastError: string | null = null;
    /** Consecutive empty pulls, so the idle line repeats occasionally. */
    private idleCycles = 0;

    constructor(
        private readonly syncClient: SyncClient,
        private readonly getCapabilities: () => Promise<SyncMachineCapability[]>,
        private readonly orderPullIntervalMs: number,
    ) { }


    /** Starts the pull loop. Safe to call only once - subsequent calls are ignored. */
    start(initialDelayMs = 1_000): void {
        if (!this.stopped) return;
        this.stopped = false;
        this.schedule(initialDelayMs);
    }


    /** Stops the pull loop. Safe to call even if the worker was never started. */
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
            // Re-acknowledge orders whose ack never landed, then resume any
            // acknowledged orders still waiting on the machine, before asking
            // upstream for more work.
            await this.reacknowledgeStoredOrders();
            await this.resumeStoredOrders();

            // before fetching new orders batch check how much capacity is avilable to fetch 
            // e.g:- total capacity is 50 but 30 is already in in-flight then 20 will fetch now.
            const availableCapacity = await this.getAvailableCapacity();
            this.lastError = null;

            if (availableCapacity === 0) {
                // At capacity - skip this pull, check again after default interval.
                console.log("[OrderPullWorker] At capacity, skipping pull.");
                nextDelay = this.orderPullIntervalMs;
            } else {
                const capabilities = await this.getCapabilities();

                // Only advertise profile keys whose machine is currently running.
                const availableProfileKeys = capabilities
                    .filter((m) => m.running)
                    .map((m) => m.profileKey);

                // pull orders from the "host" (master/medicloud)
                const response = await this.syncClient.pullOrders(availableCapacity, availableProfileKeys);

                if (response.leaseId && response.orders.length > 0) {
                    console.log(
                        `[OrderPullWorker] Pulled ${response.orders.length} order(s) under lease ${response.leaseId}: ` +
                        response.orders
                            .map((o) => `${o.dispatchId} (sample ${o.sampleId}, tests ${o.tests.join("/")}, profile ${o.profileKey})`)
                            .join("; "),
                    );
                    await this.storeAndAcknowledge(response.leaseId, response.orders, capabilities);
                    await this.resumeStoredOrders();
                    nextDelay = ON_ORDERS_RECEIVED_DELAY_MS;
                    this.idleCycles = 0;
                } else {
                    // This fires every ~10s, so logging every cycle would bury
                    // everything else. Print the first one, then roughly once a
                    // minute after that: enough to prove the loop is alive
                    // without drowning the console.
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
            // Small jitter to avoid multiple agents hammering upstream at the same time.
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
        const result = await db
            .select({ total: count() })
            .from(syncOrderInbox)
            .where(inArray(syncOrderInbox.status, [...IN_FLIGHT_STATUSES]));

        const inFlight = result[0]?.total ?? 0;
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
        const rejected: Array<{ dispatchId: string; code: string; message: string }> = [];
        const now = new Date().toISOString();

        for (const order of orders) {

            // Does a machine with this profile key exist and is it currently running?
            const machine = capabilities.find((m) => m.profileKey === order.profileKey && m.running);
            if (!machine) {
                rejected.push({
                    dispatchId: order.dispatchId,
                    code: "PROFILE_UNAVAILABLE",
                    message: `Profile ${order.profileKey} is not currently running`,
                });
                continue;
            }

            // Does that machine support all the requested tests?
            const unsupportedTests = order.tests.filter(
                (test) => !machine.catalogTests.includes(test),
            );
            if (unsupportedTests.length > 0) {
                rejected.push({
                    dispatchId: order.dispatchId,
                    code: "UNSUPPORTED_TEST",
                    message: `Tests not in machine catalog: ${unsupportedTests.join(", ")}`,
                });
                continue;
            }

            // Persist - idempotent, skip if this dispatchId was already stored.
            const existing = await db
                .select()
                .from(syncOrderInbox)
                .where(eq(syncOrderInbox.dispatchId, order.dispatchId));

            if (existing.length === 0) {
                // MediCloud echoes back the profileKey we gave it but never sets targetSlaveId.
                // Extract the slaveId from the "slave:<slaveId>:<rest>" namespace prefix we built
                // in getUpstreamCapabilities() so the slave pull endpoint can find this order.
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
                // Already stored - upstream re-leased it after our previous ack
                // was lost. Adopt the new lease so a later re-ack uses a lease
                // upstream still recognises.
                await db
                    .update(syncOrderInbox)
                    .set({ leaseId, updatedAt: now })
                    .where(eq(syncOrderInbox.dispatchId, order.dispatchId));
            }

            accepted.push({ dispatchId: order.dispatchId });
        }

        // acknowledge "host" (master/medicloud) that we received & store order into "syncOrderInbox"
        const ackResult = await this.syncClient.acknowledgeOrders(leaseId, accepted, rejected);

        // "host" give reply as an acknowledgment so update status of these "received" orders
        console.log(
            `[OrderPullWorker] Ack sent: ${accepted.length} accepted, ${rejected.length} rejected` +
            (rejected.length
                ? ` (${rejected.map((r) => `${r.dispatchId} ${r.code}`).join(", ")})`
                : ""),
        );

        const acknowledgedAt = new Date().toISOString();
        for (const dispatchId of ackResult.acknowledged) {
            await db
                .update(syncOrderInbox)
                .set({ status: "acknowledged", acknowledgedAt, updatedAt: acknowledgedAt })
                .where(eq(syncOrderInbox.dispatchId, dispatchId));
        }
    }


    /**
     * Re-acknowledges orders that were stored but whose ack never reached
     * upstream (network drop mid-cycle).
     *
     * Without this they sit at "received" forever: resumeStoredOrders() only
     * looks at "acknowledged" rows, while "received" still counts as in-flight,
     * so every lost ack permanently shrinks this agent's pull capacity until it
     * reaches zero and stops accepting work altogether.
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

        // Upstream validates the ack against the lease it issued, so replay one
        // ack per lease rather than lumping every stuck row into one call.
        const byLease = new Map<string, string[]>();
        for (const row of stuckRows) {
            byLease.set(row.leaseId, [...(byLease.get(row.leaseId) ?? []), row.dispatchId]);
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
                        .set({ status: "acknowledged", acknowledgedAt: now, updatedAt: now })
                        .where(eq(syncOrderInbox.dispatchId, dispatchId));
                }

                // Upstream no longer recognises our lease - it has expired and
                // been handed on. Release the row so it stops consuming capacity,
                // the next pull that re-leases it will revive this same record.
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
                // Still unreachable - leave the rows alone and try again next cycle.
                console.error(`[OrderPullWorker] Re-ack failed for lease ${leaseId}:`, error);
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
            const order = JSON.parse(row.payloadJson) as PulledOrder;

            // Use the DB column - MediCloud never sets targetSlaveId in the payload,
            // so order.targetSlaveId would always be undefined even for slave orders.
            if (row.targetSlaveId) continue;

            // Profile key format is "<driverId>:<profileId>" - extract the numeric ID.
            const localProfileId = Number(order.profileKey.split(":").at(-1));
            if (!Number.isInteger(localProfileId) || localProfileId <= 0) {
                await this.markFailed(row.dispatchId, `Invalid profile key: ${order.profileKey}`);
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
     * Submits one order to the local machine SDK, updates its inbox status to
     * "processing", and reports that status back to upstream.
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
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        });

        const now = new Date().toISOString();
        await db
            .update(syncOrderInbox)
            .set({ agentOrderId, status: "processing", submittedAt: now, updatedAt: now })
            .where(eq(syncOrderInbox.dispatchId, dispatchId));

        console.log(
            `[OrderPullWorker] Submitted ${dispatchId} to machine profile ${localProfileId} ` +
            `as agent order #${agentOrderId} (sample ${order.sampleId}, tests ${order.tests.join("/")})`,
        );

        try {
            await this.syncClient.reportStatus([{ dispatchId, status: "processing" }]);
        } catch (error) {
            console.error(`[OrderPullWorker] Failed to report processing status for ${dispatchId}:`, error);
            // Do not mark the order as failed - the machine is already processing it.
        }
    }


    /** Marks an order as failed in the local DB and reports the failure upstream. */
    private async markFailed(dispatchId: string, message: string): Promise<void> {
        const now = new Date().toISOString();
        await db
            .update(syncOrderInbox)
            .set({ status: "failed", errorText: message, updatedAt: now })
            .where(eq(syncOrderInbox.dispatchId, dispatchId));

        await this.syncClient.reportStatus([{ dispatchId, status: "failed", message }]);
        console.error(`[OrderPullWorker] Order ${dispatchId} failed: ${message}`);
    }
}
