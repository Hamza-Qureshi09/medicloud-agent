import { assertEquals } from "@std/assert";
import { eq } from "drizzle-orm";
import type { SyncClient } from "../flow/sync/client.ts";
import type {
  PulledOrder,
  ResultUploadItem,
  SyncMachineCapability,
} from "../schemas/sync.ts";

Deno.test("replayed work preserves progress and concurrent slave uploads remain idempotent", async (test) => {
  const directory = await Deno.makeTempDir();
  Deno.env.set("MEDICLOUD_AGENT_DB_PATH", `${directory}/agent.db`);
  const { db, initDB } = await import("../db/index.ts");
  const { syncOrderInbox } = await import("../db/tables/syncOrderInbox.ts");
  const { medicloudResultDispatch } = await import(
    "../db/tables/medicloudResultDispatch.ts"
  );
  const { OrderPullWorker } = await import("../jobs/orderPull.ts");
  const { ResultDispatcher } = await import("../jobs/resultDispatcher.ts");
  await initDB();
  const now = new Date().toISOString();
  const machine: SyncMachineCapability = {
    profileKey: "driver:1",
    localProfileId: 1,
    driverId: "driver",
    name: "Test",
    running: true,
    connected: true,
    isSlaveOwned: false,
    catalogTests: ["0"],
  };
  let order: PulledOrder;
  let cycleFinished: () => void = () => {};
  const client = {
    reportStatus: () => Promise.resolve({ updated: [] }),
    acknowledgeOrders: (_lease: string, accepted: { dispatchId: string }[]) =>
      Promise.resolve({
        acknowledged: accepted.map((item) => item.dispatchId),
        conflicts: [],
      }),
    pullOrders: () => {
      cycleFinished();
      return Promise.resolve({
        leaseId: "new-lease",
        orders: [order],
        pullAfterMs: 60_000,
      });
    },
  } as unknown as SyncClient;

  try {
    for (
      const status of [
        "processing",
        "completed",
        "leased_to_slave",
        "acknowledged_by_slave",
      ]
    ) {
      await test.step(`re-acknowledging ${status} does not reset its state`, async () => {
        const dispatchId = `dispatch-${status}`;
        order = {
          dispatchId,
          orderId: "patient-order",
          profileKey: "driver:1",
          driverId: "driver",
          sampleId: `sample-${status}`,
          tests: ["0"],
          patient: { name: "Test" },
          payloadVersion: 1,
        };
        await db.insert(syncOrderInbox).values({
          dispatchId,
          leaseId: "old-lease",
          profileKey: order.profileKey,
          driverId: order.driverId,
          payloadJson: JSON.stringify(order),
          status,
          agentOrderId: status === "processing"
            ? 10
            : status === "completed"
            ? 11
            : null,
          targetSlaveId: status.includes("slave") ? "slave-one" : null,
          downstreamLeaseId: status.includes("slave") ? "slave-lease" : null,
          receivedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        const pulled = new Promise<void>((resolve) => cycleFinished = resolve);
        const worker = new OrderPullWorker(
          client,
          () => Promise.resolve([machine]),
          60_000,
        );
        worker.start(0);
        try {
          await pulled;
          while (worker.busy) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          const [row] = await db.select().from(syncOrderInbox).where(
            eq(syncOrderInbox.dispatchId, dispatchId),
          );
          assertEquals(row.status, status);
          assertEquals(row.leaseId, "new-lease");
          if (status.includes("slave")) {
            assertEquals(row.downstreamLeaseId, "slave-lease");
          }
        } finally {
          worker.stop();
          while (worker.busy) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }
      });
    }
    await test.step("new and explicitly retried inbox orders can still be acknowledged", async () => {
      const { acknowledgeStoredOrders } = await import(
        "../db/repositories/orderAcknowledgements.ts"
      );
      for (const status of ["received", "failed"]) {
        const dispatchId = `ready-${status}`;
        await db.insert(syncOrderInbox).values({
          dispatchId,
          leaseId: "lease",
          profileKey: "driver:1",
          driverId: "driver",
          payloadJson: "{}",
          status,
          receivedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await acknowledgeStoredOrders([dispatchId], now);
        const [row] = await db.select().from(syncOrderInbox).where(
          eq(syncOrderInbox.dispatchId, dispatchId),
        );
        assertEquals(row.status, "acknowledged");
      }
    });
    await test.step("early machine results retain values and queue only once", async () => {
      const { enqueueMachineResult } = await import(
        "../db/repositories/resultQueue.ts"
      );
      const early = {
        dispatchId: "early-result",
        orderId: "patient-order",
        profileKey: "driver:1",
        driverId: "driver",
        sampleId: "early-sample",
        patient: { name: "Test" },
        tests: ["0"],
        payloadVersion: 1,
      };
      await db.insert(syncOrderInbox).values({
        dispatchId: early.dispatchId,
        leaseId: "lease",
        profileKey: early.profileKey,
        driverId: early.driverId,
        payloadJson: JSON.stringify(early),
        status: "acknowledged",
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const result = {
        id: 100,
        orderId: 100,
        machineId: 1,
        sampleId: early.sampleId,
        receivedAt: now,
        payload: {
          results: [{ assayNo: 0, value: 0, unit: "mg/dL", abnormalFlag: "L" }],
        },
      };
      assertEquals(await enqueueMachineResult(result), true);
      assertEquals(await enqueueMachineResult(result), false);
      const [queued] = await db.select().from(medicloudResultDispatch).where(
        eq(medicloudResultDispatch.agentResultId, 100),
      );
      assertEquals(JSON.parse(queued.payloadJson).analytes, [{
        assayNo: "0",
        value: "0",
        unit: "mg/dL",
        abnormalFlag: "L",
      }]);
      const [inbox] = await db.select().from(syncOrderInbox).where(
        eq(syncOrderInbox.dispatchId, early.dispatchId),
      );
      assertEquals(inbox.agentOrderId, 100);
      assertEquals(inbox.status, "processing");
    });
    await test.step("concurrent identical slave results create a single outbox row", async () => {
      const dispatcher = new ResultDispatcher(client);
      const item: ResultUploadItem = {
        idempotencyKey: "slave-result-1",
        dispatchId: "slave-dispatch",
        localOrderId: 1,
        localResultId: 1,
        sampleId: "sample",
        receivedAt: now,
        analytes: [{ assayNo: "0", value: "1" }],
      };
      await Promise.all(
        Array.from(
          { length: 5 },
          () => dispatcher.enqueueFromSlave(item, "patient-order"),
        ),
      );
      const rows = await db.select().from(medicloudResultDispatch).where(
        eq(medicloudResultDispatch.idempotencyKey, item.idempotencyKey),
      );
      assertEquals(rows.length, 1);
      assertEquals(JSON.parse(rows[0].payloadJson), item);
    });
  } finally {
    db.$client.close();
    await Deno.remove(directory, { recursive: true });
  }
});
