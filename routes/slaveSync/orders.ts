import { Hono } from "@hono/hono";
import { validator } from "@hono/hono/validator";
import { and, eq, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { syncOrderInbox } from "../../db/tables/syncOrderInbox.ts";
import type { SlaveRegistry } from "../../flow/master/slaveRegistry.ts";
import type { SyncClient } from "../../flow/sync/client.ts";
import {
  AckRequestSchema,
  PulledOrderSchema,
  PullRequestSchema,
  StatusRequestSchema,
} from "../../schemas/sync.ts";
import type { StatusRequest } from "../../schemas/sync.ts";
import { env } from "../../lib/env.ts";
import { SLAVE_LEASE_MS } from "../../lib/constants.ts";
import { requireSlave } from "./auth.ts";

function availableForSlave(slaveId: string, nowIso: string) {
  return and(
    eq(syncOrderInbox.targetSlaveId, slaveId),
    or(
      eq(syncOrderInbox.status, "acknowledged"),
      and(
        eq(syncOrderInbox.status, "leased_to_slave"),
        lt(syncOrderInbox.downstreamLeaseExpiresAt, nowIso),
      ),
    ),
  );
}

function leasedToSlave(dispatchId: string, slaveId: string, leaseId: string) {
  return and(
    eq(syncOrderInbox.dispatchId, dispatchId),
    eq(syncOrderInbox.targetSlaveId, slaveId),
    eq(syncOrderInbox.downstreamLeaseId, leaseId),
  );
}

export function registerSlaveOrderRoutes(
  app: Hono,
  registry: SlaveRegistry,
  cloudClient: SyncClient,
): void {
  app.post(
    "/slave-sync/orders/pull",
    validator("json", (value, context) => {
      const parsed = PullRequestSchema.safeParse(value);
      return parsed.success ? parsed.data : context.json({
        error: "Invalid pull request",
        issues: parsed.error.issues,
      }, 400);
    }),
    async (context) => {
      const slaveId = await requireSlave(context, registry);
      if (slaveId instanceof Response) return slaveId;

      const capacity = context.req.valid("json").capacity;

      const now = new Date();
      const nowIso = now.toISOString();
      const leaseId = crypto.randomUUID();
      const leaseExpiresAt = new Date(now.getTime() + SLAVE_LEASE_MS)
        .toISOString();

      // Fetch orders that are either waiting for this slave, or whose lease has expired.
      const rows = await db.select().from(syncOrderInbox)
        .where(availableForSlave(slaveId, nowIso)).limit(capacity);

      // Atomically lease each row so no other request can claim it.
      const leased: typeof rows = [];
      for (const row of rows) {
        const claimed = await db.update(syncOrderInbox).set({
          status: "leased_to_slave",
          downstreamLeaseId: leaseId,
          downstreamLeaseExpiresAt: leaseExpiresAt,
          updatedAt: nowIso,
        }).where(and(
          eq(syncOrderInbox.id, row.id),
          availableForSlave(slaveId, nowIso),
        )).returning({ id: syncOrderInbox.id });
        if (claimed.length) leased.push(row);
      }

      return context.json({
        leaseId: leased.length ? leaseId : null,
        leaseExpiresAt: leased.length ? leaseExpiresAt : null,
        pullAfterMs: leased.length ? 0 : env.DEFAULT_ORDER_PULL_INTERVAL_MS,
        orders: leased.map((row) => {
          const order = PulledOrderSchema.parse(JSON.parse(row.payloadJson));
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
    },
  );

  // Slave confirms which orders it accepted or rejected from a leased batch.
  app.post(
    "/slave-sync/orders/ack",
    validator("json", (value, context) => {
      const parsed = AckRequestSchema.safeParse(value);
      return parsed.success ? parsed.data : context.json({
        error: "Invalid acknowledgement",
        issues: parsed.error.issues,
      }, 400);
    }),
    async (context) => {
      const slaveId = await requireSlave(context, registry);
      if (slaveId instanceof Response) return slaveId;

      const body = context.req.valid("json");
      const acknowledged: string[] = [];
      const conflicts: string[] = [];
      const now = new Date().toISOString();

      for (const item of body.accepted) {
        const claimed = await db.update(syncOrderInbox).set({
          status: "acknowledged_by_slave",
          updatedAt: now,
        }).where(and(
          leasedToSlave(item.dispatchId, slaveId, body.leaseId),
          eq(syncOrderInbox.status, "leased_to_slave"),
        )).returning({ id: syncOrderInbox.id });

        if (claimed.length === 0) {
          const [alreadyAcknowledged] = await db.select({
            id: syncOrderInbox.id,
          })
            .from(syncOrderInbox).where(and(
              leasedToSlave(item.dispatchId, slaveId, body.leaseId),
              inArray(syncOrderInbox.status, [
                "acknowledged_by_slave",
                "processing",
                "completed",
              ]),
            )).limit(1);
          if (alreadyAcknowledged) {
            acknowledged.push(item.dispatchId);
            continue;
          }
          conflicts.push(item.dispatchId);
          continue;
        }
        acknowledged.push(item.dispatchId);
      }

      for (const item of body.rejected) {
        const rejected = await db.update(syncOrderInbox).set({
          status: "failed",
          errorText: `${item.code}: ${item.message ?? "Rejected by slave"}`,
          upstreamStatusPending: "failed",
          upstreamStatusMessage: item.message ?? "Rejected by slave",
          updatedAt: now,
        }).where(and(
          leasedToSlave(item.dispatchId, slaveId, body.leaseId),
          eq(syncOrderInbox.status, "leased_to_slave"),
        )).returning({ id: syncOrderInbox.id });
        if (rejected.length === 0) {
          conflicts.push(item.dispatchId);
          continue;
        }

        // Notify upstream (MediCloud) that this order failed.
        // Failure to notify is non-fatal - just log it.
        cloudClient.reportStatus([{
          dispatchId: item.dispatchId,
          status: "failed",
          message: item.message,
        }]).catch((error) =>
          console.error(
            "[SlaveSync] Failed to report slave rejection upstream:",
            error,
          )
        );
      }

      return context.json({ acknowledged, conflicts });
    },
  );

  // Slave reports processing status updates (e.g. "processing", "failed") for its orders.
  app.post(
    "/slave-sync/orders/status",
    validator("json", (value, context) => {
      const parsed = StatusRequestSchema.safeParse(value);
      return parsed.success ? parsed.data : context.json({
        error: "Invalid status update",
        issues: parsed.error.issues,
      }, 400);
    }),
    async (context) => {
      const slaveId = await requireSlave(context, registry);
      if (slaveId instanceof Response) return slaveId;

      const body = context.req.valid("json");
      const allowed: StatusRequest["updates"] = [];

      // Only forward updates for orders that actually belong to this slave.
      for (const update of body.updates) {
        const rows = await db.select().from(syncOrderInbox).where(and(
          eq(syncOrderInbox.dispatchId, update.dispatchId),
          eq(syncOrderInbox.targetSlaveId, slaveId),
        ));
        if (rows.length > 0 && rows[0].status !== "completed") {
          const changed = await db.update(syncOrderInbox).set({
            status: update.status === "failed"
              ? "failed"
              : "acknowledged_by_slave",
            ...(update.status === "failed"
              ? { errorText: update.message ?? "Slave reported failure" }
              : {}),
            upstreamStatusPending: update.status,
            upstreamStatusMessage: update.message ?? null,
            updatedAt: new Date().toISOString(),
          }).where(and(
            eq(syncOrderInbox.id, rows[0].id),
            ne(syncOrderInbox.status, "completed"),
          )).returning({ id: syncOrderInbox.id });
          if (changed.length > 0) allowed.push(update);
        }
      }

      if (allowed.length > 0) {
        // Propagate to MediCloud - failure is non-fatal.
        cloudClient.reportStatus(allowed).catch((error) =>
          console.error("[SlaveSync] Failed to report status upstream:", error)
        );
      }

      return context.json({ updated: allowed.map((item) => item.dispatchId) });
    },
  );
}
