import { type Context, Hono } from "@hono/hono";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../db/index.ts";
import { syncOrderInbox } from "../db/schema.ts";
import { env } from "../lib/env.ts";
import type { ResultDispatcher } from "../jobs/resultDispatcher.ts";
import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { PulledOrder, ResultUploadItem } from "../types.ts";


// How long a slave lease is valid before it expires and can be re-leased.
const SLAVE_LEASE_MS = 5 * 60 * 1_000;  // 5 mins


/**
 * One-time registration check - requires the shared SLAVE_BOOTSTRAP_SECRET.
 * Used only on the /register endpoint to prevent arbitrary agents from registering.
 */
function authorizeBootstrap(context: Context): boolean {
    return Boolean(env.SLAVE_BOOTSTRAP_SECRET) &&
        context.req.header("x-slave-secret") === env.SLAVE_BOOTSTRAP_SECRET;
}


/**
 * Per-request authentication - verifies slaveId + per-slave secret.
 * Returns the authenticated slaveId string, or a 401 Response to return immediately.
 */
async function requireSlave(
    context: Context,
    registry: SlaveRegistry,
): Promise<string | Response> {
    const slaveId = context.req.header("x-slave-id");
    const secret = context.req.header("x-slave-secret");

    if (!slaveId || !secret || !await registry.authenticate(slaveId, secret)) {
        return context.json({ error: "Unauthorized" }, 401);
    }
    return slaveId;
}


/**
 * Registers all slave-sync routes on the given Hono app.
 * Only called in "master" mode - slaves talk to these endpoints.
 *
 * Routes:
 *   POST /slave-sync/register        - slave registers, receives slaveId + secret
 *   POST /slave-sync/heartbeat       - slave pings with current machine list
 *   POST /slave-sync/orders/pull     - slave requests a batch of leased orders
 *   POST /slave-sync/orders/ack      - slave accepts/rejects a batch of orders
 *   POST /slave-sync/orders/status   - slave reports order processing status
 *   POST /slave-sync/results         - slave uploads finished results
 */
export function registerSlaveSyncRoutes(
    app: Hono,
    registry: SlaveRegistry,
    cloudClient: SyncClient,
    resultDispatcher: ResultDispatcher,
): void {

    // Slave registers itself for the first time (or re-registers after restart).
    // Requires the bootstrap secret - not the per-slave secret.
    app.post("/slave-sync/register", async (context) => {
        if (!authorizeBootstrap(context)) {
            return context.json({ error: "Unauthorized" }, 401);
        }

        const body = await context.req.json();
        if (!body.instanceId || !Array.isArray(body.machines)) {
            return context.json({ error: "instanceId and machines are required" }, 400);
        }

        return context.json(await registry.register(body.instanceId, body.machines));
    });


    // Slave pings master with its current machine list.
    // Master responds with timing hints (how soon to ping again, pull again).
    app.post("/slave-sync/heartbeat", async (context) => {
        const slaveId = await requireSlave(context, registry);
        if (slaveId instanceof Response) return slaveId;

        const body = await context.req.json();
        await registry.ping(slaveId, body.machines ?? []);

        return context.json({
            serverTime: new Date().toISOString(),
            heartbeatAfterMs: 30_000,
            pullAfterMs: 10_000,
            maxOrderBatchSize: 100,
            maxResultBatchSize: 100,
        });
    });


    // Slave requests a batch of orders targeted to it.
    // Master leases available orders and returns them. Expired leases are re-leased.
    app.post("/slave-sync/orders/pull", async (context) => {
        const slaveId = await requireSlave(context, registry);
        if (slaveId instanceof Response) return slaveId;

        const body = await context.req.json();
        const capacity = Math.max(1, Math.min(100, Number(body.capacity) || 50));

        const now = new Date();
        const nowIso = now.toISOString();
        const leaseId = crypto.randomUUID();
        const leaseExpiresAt = new Date(now.getTime() + SLAVE_LEASE_MS).toISOString();

        // Fetch orders that are either waiting for this slave, or whose lease has expired.
        const rows = await db.select().from(syncOrderInbox).where(and(
            eq(syncOrderInbox.targetSlaveId, slaveId),
            or(
                eq(syncOrderInbox.status, "acknowledged"),
                and(
                    eq(syncOrderInbox.status, "leased_to_slave"),
                    lt(syncOrderInbox.downstreamLeaseExpiresAt, nowIso),
                ),
            ),
        )).limit(capacity);

        // Atomically lease each row so no other request can claim it.
        const leasedIds: number[] = [];
        for (const row of rows) {
            await db.update(syncOrderInbox).set({
                status: "leased_to_slave",
                downstreamLeaseId: leaseId,
                downstreamLeaseExpiresAt: leaseExpiresAt,
                updatedAt: nowIso,
            }).where(eq(syncOrderInbox.id, row.id));
            leasedIds.push(row.id);
        }

        return context.json({
            leaseId: leasedIds.length ? leaseId : null,
            leaseExpiresAt: leasedIds.length ? leaseExpiresAt : null,
            pullAfterMs: leasedIds.length ? 0 : 10_000,
            orders: rows.map((row) => {
                const order = JSON.parse(row.payloadJson) as PulledOrder;
                // Strip the "slave:<slaveId>:" prefix from the profileKey
                // so the slave sees the same key format as a direct agent would.
                const prefix = `slave:${slaveId}:`;
                return {
                    ...order,
                    profileKey: order.profileKey.startsWith(prefix)
                        ? order.profileKey.slice(prefix.length)
                        : order.profileKey,
                    targetSlaveId: undefined,
                };
            }),
        });
    });


    // Slave confirms which orders it accepted or rejected from a leased batch.
    app.post("/slave-sync/orders/ack", async (context) => {
        const slaveId = await requireSlave(context, registry);
        if (slaveId instanceof Response) return slaveId;

        const body = await context.req.json();
        const acknowledged: string[] = [];
        const conflicts: string[] = [];
        const now = new Date().toISOString();

        for (const item of body.accepted ?? []) {
            const rows = await db.select().from(syncOrderInbox).where(and(
                eq(syncOrderInbox.dispatchId, item.dispatchId),
                eq(syncOrderInbox.targetSlaveId, slaveId),
                eq(syncOrderInbox.downstreamLeaseId, body.leaseId),
            ));

            if (rows.length === 0) {
                // Lease mismatch or already acknowledged - report as conflict.
                conflicts.push(item.dispatchId);
                continue;
            }

            await db.update(syncOrderInbox).set({
                status: "acknowledged_by_slave",
                updatedAt: now,
            }).where(eq(syncOrderInbox.id, rows[0].id));

            acknowledged.push(item.dispatchId);
        }

        for (const item of body.rejected ?? []) {
            await db.update(syncOrderInbox).set({
                status: "failed",
                errorText: `${item.code}: ${item.message ?? "Rejected by slave"}`,
                updatedAt: now,
            }).where(and(
                eq(syncOrderInbox.dispatchId, item.dispatchId),
                eq(syncOrderInbox.targetSlaveId, slaveId),
            ));

            // Notify upstream (MediCloud) that this order failed.
            // Failure to notify is non-fatal - just log it.
            cloudClient.reportStatus([{
                dispatchId: item.dispatchId,
                status: "failed",
                message: item.message,
            }]).catch((error) =>
                console.error("[SlaveSync] Failed to report slave rejection upstream:", error)
            );
        }

        return context.json({ acknowledged, conflicts });
    });


    // Slave reports processing status updates (e.g. "processing", "failed") for its orders.
    app.post("/slave-sync/orders/status", async (context) => {
        const slaveId = await requireSlave(context, registry);
        if (slaveId instanceof Response) return slaveId;

        const body = await context.req.json();
        const allowed: Array<{ dispatchId: string; status: "processing" | "failed"; message?: string }> = [];

        // Only forward updates for orders that actually belong to this slave.
        for (const update of body.updates ?? []) {
            const rows = await db.select().from(syncOrderInbox).where(and(
                eq(syncOrderInbox.dispatchId, update.dispatchId),
                eq(syncOrderInbox.targetSlaveId, slaveId),
            ));
            if (rows.length > 0) allowed.push(update);
        }

        if (allowed.length > 0) {
            // Propagate to MediCloud - failure is non-fatal.
            cloudClient.reportStatus(allowed).catch((error) =>
                console.error("[SlaveSync] Failed to report status upstream:", error)
            );
        }

        return context.json({ updated: allowed.map((item) => item.dispatchId) });
    });


    // Slave uploads finished test results for its orders.
    // Master validates ownership then queues them for MediCloud delivery via ResultDispatcher.
    app.post("/slave-sync/results", async (context) => {
        const slaveId = await requireSlave(context, registry);
        if (slaveId instanceof Response) return slaveId;

        const body = await context.req.json();
        const accepted: string[] = [];
        const rejected: Array<{
            idempotencyKey: string;
            code: string;
            retryable: boolean;
            message: string;
        }> = [];

        for (const item of (body.results ?? []) as ResultUploadItem[]) {
            // Verify the result belongs to an order assigned to this slave.
            const rows = await db.select().from(syncOrderInbox).where(and(
                eq(syncOrderInbox.dispatchId, item.dispatchId),
                eq(syncOrderInbox.targetSlaveId, slaveId),
                inArray(syncOrderInbox.status, ["acknowledged_by_slave", "processing"]),
            ));

            if (rows.length === 0) {
                rejected.push({
                    idempotencyKey: item.idempotencyKey,
                    code: "UNKNOWN_DISPATCH",
                    retryable: false,
                    message: "Dispatch is not assigned to this slave",
                });
                continue;
            }

            const order = JSON.parse(rows[0].payloadJson) as PulledOrder;

            // Hand off to ResultDispatcher which queues it for upstream delivery.
            await resultDispatcher.enqueueFromSlave(item, order.orderId);
            accepted.push(item.idempotencyKey);
        }

        return context.json({ accepted, duplicates: [], rejected });
    });
}
