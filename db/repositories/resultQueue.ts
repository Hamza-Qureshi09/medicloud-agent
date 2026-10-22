import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../index.ts";
import { syncOrderInbox } from "../tables/syncOrderInbox.ts";
import { medicloudResultDispatch } from "../tables/medicloudResultDispatch.ts";
import { RESULT_DELIVERY_STATUS } from "../../lib/constants.ts";
import { PulledOrderSchema } from "../../schemas/sync.ts";
import type { ResultUploadItem } from "../../schemas/sync.ts";
import type { PersistedMachineResult } from "../../types.ts";
import { toUploadAnalyte } from "../../lib/utils.ts";

/** Correlate persisted SDK results and queue upstream work without changing the raw payload. */
export async function enqueueMachineResult(
  result: PersistedMachineResult,
  warnMissing = true,
): Promise<boolean> {
  let [inbox] = await db.select().from(syncOrderInbox)
    .where(eq(syncOrderInbox.agentOrderId, result.orderId)).limit(1);

  if (!inbox) {
    // A result can arrive before POST /orders returns and stores agentOrderId.
    // Correlate only when one acknowledged upstream order has this sample
    // and physical profile. Ambiguous matches stay untouched for review.
    const candidates = await db.select().from(syncOrderInbox).where(and(
      eq(syncOrderInbox.source, "upstream"),
      isNull(syncOrderInbox.agentOrderId),
      isNull(syncOrderInbox.targetSlaveId),
      inArray(syncOrderInbox.status, ["acknowledged", "processing"]),
    ));
    const matches = candidates.filter((row) => {
      const parsed = PulledOrderSchema.safeParse(JSON.parse(row.payloadJson));
      return parsed.success &&
        parsed.data.sampleId === result.sampleId &&
        Number(parsed.data.profileKey.split(":").at(-1)) === result.machineId;
    });
    if (matches.length === 1) {
      await db.update(syncOrderInbox).set({
        agentOrderId: result.orderId,
        status: "processing",
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(syncOrderInbox.id, matches[0].id),
        isNull(syncOrderInbox.agentOrderId),
      ));
      [inbox] = await db.select().from(syncOrderInbox)
        .where(eq(syncOrderInbox.agentOrderId, result.orderId)).limit(1);
    }
  }

  if (!inbox) {
    if (warnMissing) {
      console.warn(
        "[ResultDispatcher] Result #" + result.id +
          " has no matched inbox order " + result.orderId,
      );
    }
    return false;
  }

  const now = new Date().toISOString();
  if (inbox.source === "local") {
    await db.update(syncOrderInbox)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(eq(syncOrderInbox.id, inbox.id));
    return false;
  }

  const order = PulledOrderSchema.parse(JSON.parse(inbox.payloadJson));
  const idempotencyKey = inbox.dispatchId + ":" + result.id;
  const upload: ResultUploadItem = {
    idempotencyKey,
    dispatchId: inbox.dispatchId,
    localOrderId: result.orderId,
    localResultId: result.id,
    sampleId: result.sampleId,
    receivedAt: result.receivedAt instanceof Date
      ? result.receivedAt.toISOString()
      : String(result.receivedAt ?? now),
    analytes: (result.payload?.results ?? []).map(toUploadAnalyte),
  };

  const [inserted] = await db.insert(medicloudResultDispatch).values({
    agentResultId: result.id,
    agentOrderId: result.orderId,
    medicloudOrderId: order.orderId,
    medicloudDispatchId: inbox.dispatchId,
    idempotencyKey,
    payloadJson: JSON.stringify(upload),
    deliveryStatus: RESULT_DELIVERY_STATUS.pending,
    createdAt: now,
  }).onConflictDoNothing().returning({ id: medicloudResultDispatch.id });

  if (inserted) {
    console.log(
      "[ResultDispatcher] Queued result #" + result.id +
        " for dispatch " + inbox.dispatchId,
    );
  }
  return inserted !== undefined;
}

/** Queue a slave upload once, including concurrent retries of the same key. */
export async function enqueueSlaveResult(
  item: ResultUploadItem,
  medicloudOrderId: string,
): Promise<void> {
  // The unique key makes repeated and simultaneous uploads idempotent.
  const now = new Date().toISOString();
  await db.insert(medicloudResultDispatch).values({
    agentResultId: null,
    agentOrderId: item.localOrderId,
    medicloudOrderId,
    medicloudDispatchId: item.dispatchId,
    idempotencyKey: item.idempotencyKey,
    payloadJson: JSON.stringify(item),
    deliveryStatus: RESULT_DELIVERY_STATUS.pending,
    createdAt: now,
  }).onConflictDoNothing({ target: medicloudResultDispatch.idempotencyKey });
}
