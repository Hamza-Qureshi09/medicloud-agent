import { and, eq, inArray } from "drizzle-orm";
import { db } from "../index.ts";
import { syncOrderInbox } from "../tables/syncOrderInbox.ts";

/** A repeated upstream acknowledgement must not reset local or delegated progress. */
export async function acknowledgeStoredOrders(
  dispatchIds: string[],
  now: string,
): Promise<void> {
  for (const dispatchId of dispatchIds) {
    await db.update(syncOrderInbox).set({
      status: "acknowledged",
      acknowledgedAt: now,
      updatedAt: now,
    }).where(and(
      eq(syncOrderInbox.dispatchId, dispatchId),
      inArray(syncOrderInbox.status, ["received", "failed"]),
    ));
  }
}
