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
import type { SyncClient } from "../flow/sync/client.ts";
import type { PulledOrder, SyncMachineCapability } from "../types.ts";





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
            // Resume any stuck acknowledged orders before asking for new ones.
            await this.resumeStoredOrders();

            // before fetching new orders batch check how much capacity is avilable to fetch 
            // e.g:- total capacity is 50 but 30 is already in in-flight then 20 will fetch now.
            const availableCapacity = await this.getAvailableCapacity();

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
                    await this.storeAndAcknowledge(response.leaseId, response.orders, capabilities);
                    await this.resumeStoredOrders();
                    nextDelay = ON_ORDERS_RECEIVED_DELAY_MS;
                } else {
                    nextDelay = response.pullAfterMs || this.orderPullIntervalMs;
                }
            }

        } catch (error) {
            console.error("[OrderPullWorker] Pull cycle failed:", error);
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
            }

            accepted.push({ dispatchId: order.dispatchId });
        }

        // acknowledge "host" (master/medicloud) that we received & store order into "syncOrderInbox"
        const ackResult = await this.syncClient.acknowledgeOrders(leaseId, accepted, rejected);

        // "host" give reply as an acknowledgment so update status of these "received" orders
        const acknowledgedAt = new Date().toISOString();
        for (const dispatchId of ackResult.acknowledged) {
            await db
                .update(syncOrderInbox)
                .set({ status: "acknowledged", acknowledgedAt, updatedAt: acknowledgedAt })
                .where(eq(syncOrderInbox.dispatchId, dispatchId));
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
            ));

        for (const row of pendingRows) {
            const order = JSON.parse(row.payloadJson) as PulledOrder;

            // Use the DB column — MediCloud never sets targetSlaveId in the payload,
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

        try {
            await this.syncClient.reportStatus([{ dispatchId, status: "processing" }]);
        } catch (error) {
            console.error(`[OrderPullWorker] Failed to report processing status for ${dispatchId}:`, error);
            // Do not mark the order as failed — the machine is already processing it.
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
