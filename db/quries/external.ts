import { and, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "../index.ts";
import { medicloudResultDispatch, syncOrderInbox } from "../schema.ts";


/** Lifecycle states a `syncOrderInbox` row can hold. Mirrors the status doc in schema.ts. */
export const EXTERNAL_ORDER_STATUSES = [
    "received",
    "acknowledged",
    "processing",
    "leased_to_slave",
    "acknowledged_by_slave",
    "completed",
    "failed",
] as const;

/** Delivery states a `medicloudResultDispatch` row can hold. */
export const RESULT_DELIVERY_STATUSES = [0, 1, 2, 3] as const;

export interface ListQuery {
    search?: string;
    status?: string;
    limit: number;
    offset: number;
}

export interface ListPage<T> {
    rows: T[];
    count: number;
}


/** `LIKE '%term%'` with wildcards inside `term` escaped so they match literally. */
function contains(column: SQLiteColumn, term: string): SQL {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/** Narrows an untrusted query value to a known inbox status. */
function toOrderStatus(value?: string) {
    const statuses: readonly string[] = EXTERNAL_ORDER_STATUSES;
    return value && statuses.includes(value) ? value : undefined;
}

/** Narrows an untrusted query value to a known delivery status. */
function toDeliveryStatus(value?: string) {
    const statuses: readonly number[] = RESULT_DELIVERY_STATUSES;
    const parsed = Number(value);
    return statuses.includes(parsed) ? parsed : undefined;
}


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