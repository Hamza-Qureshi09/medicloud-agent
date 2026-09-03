import { and, count, desc, eq, or } from "drizzle-orm";
import { db } from "../index.ts";
import { medicloudResultDispatch, syncOrderInbox } from "../schema.ts";
import type { ListPage, ListQuery } from "../../types.ts";
import { contains, toDeliveryStatus, toOrderStatus } from "../../lib/helpers.ts";


/** Newest-first page of MediCloud orders received by this agent, searchable by dispatch ID. */
export async function listExternalOrders(
    { search, status, limit, offset }: ListQuery,
): Promise<ListPage<typeof syncOrderInbox.$inferSelect>> {

    const orderStatus = toOrderStatus(status);
    const where = and(
        search ? contains(syncOrderInbox.dispatchId, search) : undefined,
        orderStatus ? eq(syncOrderInbox.status, orderStatus) : undefined,
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


/** Newest-first page of result deliveries, searchable by dispatch/order/idempotency key. */
export async function listExternalResults(
    { search, status, limit, offset }: ListQuery,
): Promise<ListPage<typeof medicloudResultDispatch.$inferSelect>> {

    const deliveryStatus = toDeliveryStatus(status);
    const where = and(
        search
            ? or(
                contains(medicloudResultDispatch.medicloudDispatchId, search),
                contains(medicloudResultDispatch.medicloudOrderId, search),
                contains(medicloudResultDispatch.idempotencyKey, search),
                // Sample IDs and analytes exist only inside the payload, so it is searched too.
                // This forces a table scan; revisit with FTS if the outbox grows large.
                // contains(medicloudResultDispatch.payloadJson, search),
            )
            : undefined,
        deliveryStatus !== undefined
            ? eq(medicloudResultDispatch.deliveryStatus, deliveryStatus)
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