import { and, count, desc, eq, getColumns, isNotNull, or } from "drizzle-orm";
import { db } from "../index.ts";
import { medicloudResultDispatch } from "../tables/medicloudResultDispatch.ts";
import { slaveRegistry } from "../tables/slaveRegistry.ts";
import { syncOrderInbox } from "../tables/syncOrderInbox.ts";
import type { ListPage } from "../../types.ts";
import type { OrderListQuery, ResultListQuery } from "../../schemas/local.ts";
import { contains } from "../../lib/utils.ts";

/**
 * Newest-first page of this agent's orders (MediCloud dispatches and locally
 * created ones), optionally filtered by dispatch ID search string and status.
 */
export async function listAgentOrders(
  { search, status, limit, offset }: OrderListQuery,
): Promise<ListPage<typeof syncOrderInbox.$inferSelect>> {
  const where = and(
    search ? contains(syncOrderInbox.dispatchId, search) : undefined,
    status ? eq(syncOrderInbox.status, status) : undefined,
  );

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(syncOrderInbox)
      .where(where)
      .orderBy(desc(syncOrderInbox.receivedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(syncOrderInbox).where(where),
  ]);

  return { rows, count: totals[0]?.total ?? 0 };
}

/**
 * Newest-first page of result deliveries, searchable by dispatch ID,
 * order ID, or idempotency key.
 */
export async function listExternalResults(
  { search, status, limit, offset }: ResultListQuery,
): Promise<ListPage<typeof medicloudResultDispatch.$inferSelect>> {
  const where = and(
    search
      ? or(
        contains(medicloudResultDispatch.medicloudDispatchId, search),
        contains(medicloudResultDispatch.medicloudOrderId, search),
        contains(medicloudResultDispatch.idempotencyKey, search),
      )
      : undefined,
    status !== undefined
      ? eq(medicloudResultDispatch.deliveryStatus, status)
      : undefined,
  );

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(medicloudResultDispatch)
      .where(where)
      .orderBy(desc(medicloudResultDispatch.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(medicloudResultDispatch).where(where),
  ]);

  return { rows, count: totals[0]?.total ?? 0 };
}

/**
 * Newest-first page of MediCloud orders targeted at slave agents.
 * Supports searching by dispatch ID, slave ID, or slave instance ID.
 */
export async function listSlaveOrders(
  { search, status, limit, offset }: OrderListQuery,
): Promise<ListPage<typeof syncOrderInbox.$inferSelect>> {
  const where = and(
    search
      ? or(
        contains(syncOrderInbox.dispatchId, search),
        contains(syncOrderInbox.targetSlaveId, search),
        contains(slaveRegistry.instanceId, search),
      )
      : undefined,
    status ? eq(syncOrderInbox.status, status) : undefined,
    isNotNull(syncOrderInbox.targetSlaveId),
  );

  const [rows, totals] = await Promise.all([
    db
      .select(getColumns(syncOrderInbox))
      .from(syncOrderInbox)
      .leftJoin(
        slaveRegistry,
        eq(syncOrderInbox.targetSlaveId, slaveRegistry.slaveId),
      )
      .where(where)
      .orderBy(desc(syncOrderInbox.receivedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(syncOrderInbox)
      .leftJoin(
        slaveRegistry,
        eq(syncOrderInbox.targetSlaveId, slaveRegistry.slaveId),
      )
      .where(where),
  ]);

  return { rows, count: totals[0]?.total ?? 0 };
}

/**
 * Newest-first page of result deliveries originating from slave-processed orders.
 * Supports searching by dispatch ID, order ID, idempotency key, slave ID, or instance ID.
 */
export async function listSlaveResults(
  { search, status, limit, offset }: ResultListQuery,
): Promise<ListPage<typeof medicloudResultDispatch.$inferSelect>> {
  const where = and(
    search
      ? or(
        contains(medicloudResultDispatch.medicloudDispatchId, search),
        contains(medicloudResultDispatch.medicloudOrderId, search),
        contains(medicloudResultDispatch.idempotencyKey, search),
        contains(syncOrderInbox.targetSlaveId, search),
        contains(slaveRegistry.instanceId, search),
      )
      : undefined,
    status !== undefined
      ? eq(medicloudResultDispatch.deliveryStatus, status)
      : undefined,
    isNotNull(syncOrderInbox.targetSlaveId),
  );

  const [rows, totals] = await Promise.all([
    db
      .select(getColumns(medicloudResultDispatch))
      .from(medicloudResultDispatch)
      .innerJoin(
        syncOrderInbox,
        eq(
          medicloudResultDispatch.medicloudDispatchId,
          syncOrderInbox.dispatchId,
        ),
      )
      .leftJoin(
        slaveRegistry,
        eq(syncOrderInbox.targetSlaveId, slaveRegistry.slaveId),
      )
      .where(where)
      .orderBy(desc(medicloudResultDispatch.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(medicloudResultDispatch)
      .innerJoin(
        syncOrderInbox,
        eq(
          medicloudResultDispatch.medicloudDispatchId,
          syncOrderInbox.dispatchId,
        ),
      )
      .leftJoin(
        slaveRegistry,
        eq(syncOrderInbox.targetSlaveId, slaveRegistry.slaveId),
      )
      .where(where),
  ]);

  return { rows, count: totals[0]?.total ?? 0 };
}
