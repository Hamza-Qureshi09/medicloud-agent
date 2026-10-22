import { eq } from "drizzle-orm";
import { db } from "../index.ts";
import { syncOrderInbox } from "../tables/syncOrderInbox.ts";
import { medicloudResultDispatch } from "../tables/medicloudResultDispatch.ts";

export async function hasSynchronizedWork(): Promise<boolean> {
  const [orders, results] = await Promise.all([
    db.select({ id: syncOrderInbox.id }).from(syncOrderInbox)
      .where(eq(syncOrderInbox.source, "upstream")).limit(1),
    db.select({ id: medicloudResultDispatch.id }).from(medicloudResultDispatch)
      .limit(1),
  ]);
  return orders.length > 0 || results.length > 0;
}
