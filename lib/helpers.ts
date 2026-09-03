import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { EXTERNAL_ORDER_STATUSES, RESULT_DELIVERY_STATUSES } from "./constants.ts";
import { sql, SQL } from "drizzle-orm";

/** `LIKE '%term%'` with wildcards inside `term` escaped so they match literally. */
export function contains(column: SQLiteColumn, term: string): SQL {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/** Narrows an untrusted query value to a known inbox status. */
export function toOrderStatus(value?: string) {
    const statuses: readonly string[] = EXTERNAL_ORDER_STATUSES;
    return value && statuses.includes(value) ? value : undefined;
}

/** Narrows an untrusted query value to a known delivery status. */
export function toDeliveryStatus(value?: string) {
    const statuses: readonly number[] = RESULT_DELIVERY_STATUSES;
    const parsed = Number(value);
    return statuses.includes(parsed) ? parsed : undefined;
}