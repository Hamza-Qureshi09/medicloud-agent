import { Hono } from "@hono/hono";
import { validator } from "@hono/hono/validator";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { syncOrderInbox } from "../../db/tables/syncOrderInbox.ts";
import type { SyncClient } from "../../flow/sync/client.ts";
import { ApiError, describeError } from "../../lib/error.ts";
import {
  deleteMachineOrder,
  fetchMachineOrder,
  fetchMachineProfiles,
  patchMachineOrder,
  postMachineOrder,
} from "../../lib/api.ts";
import {
  LocalOrderCreateSchema,
  LocalOrderUpdateSchema,
  OrderIdParamSchema,
} from "../../schemas/local.ts";
import { type PulledOrder, PulledOrderSchema } from "../../schemas/sync.ts";
import { ORDER_EXPIRY_MS } from "../../lib/constants.ts";
import type { MachineOrderPatch } from "../../schemas/local.ts";

async function findLocalOrder(
  idParam: string,
  intent: "update" | "delete",
): Promise<
  | typeof syncOrderInbox.$inferSelect
  | { error: string; status: 400 | 404 | 503 }
> {
  const parsedId = OrderIdParamSchema.safeParse(idParam);
  if (!parsedId.success) return { error: "Invalid order ID", status: 400 };
  const id = parsedId.data;

  const [row] = await db
    .select()
    .from(syncOrderInbox)
    .where(eq(syncOrderInbox.id, id))
    .limit(1);

  if (!row) return { error: "Order not found", status: 404 };

  if (row.source !== "local") {
    return {
      error: "Orders received from MediCloud cannot be edited or deleted here",
      status: 400,
    };
  }

  if (row.status === "completed") {
    return {
      error: "Completed orders cannot be changed or deleted",
      status: 400,
    };
  }

  if (row.agentOrderId !== null) {
    let machineOrder: { status?: string } | null;
    try {
      machineOrder = await fetchMachineOrder(row.agentOrderId);
    } catch (error) {
      console.error(
        `[dashboard] Could not read machine order ${row.agentOrderId}:`,
        describeError(error),
      );
      return {
        error:
          "The analyzer service did not answer, so this order cannot be changed right now",
        status: 503,
      };
    }

    const stillOperatorControllable = machineOrder?.status === "pending" ||
      (intent === "delete" && machineOrder?.status === "failed");

    if (machineOrder && !stillOperatorControllable) {
      return {
        error: machineOrder.status === "failed"
          ? "This order failed on the analyzer and can only be deleted"
          : `The analyzer is already working on this order (${
            machineOrder.status ?? "unknown"
          }), so it can no longer be changed or deleted`,
        status: 400,
      };
    }

    if (!machineOrder && intent === "update") {
      return {
        error: "The analyzer no longer has this order, so it cannot be changed",
        status: 400,
      };
    }
  }

  return row;
}

/** Wraps a read call and maps errors to a JSON 500 response. */
export function registerDashboardOrderRoutes(
  app: Hono,
  cloudClient: SyncClient | undefined,
): void {
  app.on(
    "POST",
    ["/orders/:id/reject", "/agent-orders/:id/reject"],
    async (c) => {
      const parsedId = OrderIdParamSchema.safeParse(
        c.req.param("id"),
      );
      if (!parsedId.success) return c.json({ error: "Invalid order ID" }, 400);

      const [row] = await db
        .select()
        .from(syncOrderInbox)
        .where(eq(syncOrderInbox.id, parsedId.data))
        .limit(1);

      if (!row) return c.json({ error: "Order not found" }, 404);

      if (row.source !== "upstream") {
        return c.json({ error: "Only upstream orders can be rejected" }, 400);
      }
      if (row.status !== "received" && row.status !== "acknowledged") {
        return c.json({
          error: "Only pending orders (received/acknowledged) can be rejected",
        }, 400);
      }

      const now = new Date().toISOString();
      await db
        .update(syncOrderInbox)
        .set({
          status: "failed",
          errorText: "Rejected by operator",
          updatedAt: now,
        })
        .where(eq(syncOrderInbox.id, parsedId.data));

      // Report rejection upstream (fire-and-forget - non-fatal if it fails).
      cloudClient
        ?.reportStatus([{
          dispatchId: row.dispatchId,
          status: "failed",
          message: "Rejected by operator from master dashboard",
        }])
        .catch((error) =>
          console.error(
            "[dashboard] Failed to report rejection upstream:",
            error,
          )
        );

      return c.json({ success: true });
    },
  );

  app.post(
    "/agent-orders",
    validator("json", (value, c) => {
      const parsed = LocalOrderCreateSchema.safeParse(value);
      return parsed.success
        ? parsed.data
        : c.json({ error: "Invalid order", issues: parsed.error.issues }, 400);
    }),
    async (c) => {
      const input = c.req.valid("json");

      const profile = (await fetchMachineProfiles()).find((p) =>
        p.id === input.machineId
      );
      if (!profile) {
        return c.json({
          error: `Analyzer profile ${input.machineId} was not found`,
        }, 404);
      }

      const now = new Date().toISOString();
      const expiresAt = input.expiresAt ??
        new Date(Date.now() + ORDER_EXPIRY_MS).toISOString();
      const dispatchId = `local:${crypto.randomUUID().replaceAll("-", "")}`;

      try {
        const agentOrderId = await postMachineOrder({
          machineId: input.machineId,
          sampleId: input.sampleId,
          tests: input.tests ?? [],
          patientName: input.patientName,
          patientId: input.patientId,
          sampleType: input.sampleType,
          rackPosition: input.rackPosition,
          createdAt: now,
          expiresAt,
        });

        const payload: PulledOrder = {
          dispatchId,
          orderId: dispatchId,
          profileKey: `${profile.driverId}:${profile.id}`,
          driverId: profile.driverId,
          sampleId: input.sampleId,
          patient: {
            ...(input.patientId ? { id: input.patientId } : {}),
            name: input.patientName ?? "",
          },
          tests: input.tests ?? [],
          payloadVersion: 1,
          ...(input.sampleType ? { sampleType: input.sampleType } : {}),
          ...(input.rackPosition ? { rackPosition: input.rackPosition } : {}),
        };

        const [row] = await db.insert(syncOrderInbox).values({
          dispatchId,
          leaseId: "local",
          source: "local",
          profileKey: payload.profileKey,
          driverId: profile.driverId,
          payloadJson: JSON.stringify(payload),
          agentOrderId,
          status: "processing",
          receivedAt: now,
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        }).returning();

        console.log(
          `[dashboard] Created local order ${dispatchId} on profile ${payload.profileKey} ` +
            `as agent order #${agentOrderId} (sample ${input.sampleId})`,
        );

        return c.json({ order: row }, 201);
      } catch (error) {
        console.error("[dashboard] Local order creation failed:", error);
        return c.json({
          error: "Order could not be created",
          detail: describeError(error),
        }, error instanceof ApiError && error.status < 500 ? 400 : 500);
      }
    },
  );

  app.patch(
    "/agent-orders/:id",
    validator("json", (value, c) => {
      const parsed = LocalOrderUpdateSchema.safeParse(value);
      return parsed.success ? parsed.data : c.json(
        { error: "Invalid order update", issues: parsed.error.issues },
        400,
      );
    }),
    async (c) => {
      const row = await findLocalOrder(c.req.param("id"), "update");
      if ("error" in row) return c.json({ error: row.error }, row.status);

      const input = c.req.valid("json");
      const update: MachineOrderPatch = {};
      if (input.sampleId) update.sampleId = input.sampleId;
      if (input.tests?.length) update.tests = input.tests;
      if (input.patientId) update.patientId = input.patientId;
      if (input.patientName) update.patientName = input.patientName;
      if (input.sampleType) update.sampleType = input.sampleType;
      if (input.rackPosition) update.rackPosition = input.rackPosition;
      if (input.expiresAt) update.expiresAt = input.expiresAt;

      if (Object.keys(update).length === 0) {
        return c.json({ error: "Nothing to update" }, 400);
      }

      try {
        if (row.agentOrderId !== null) {
          await patchMachineOrder(row.agentOrderId, update);
        }

        const payload = PulledOrderSchema.parse(JSON.parse(row.payloadJson));
        const next: PulledOrder = {
          ...payload,
          sampleId: input.sampleId ?? payload.sampleId,
          tests: input.tests?.length ? input.tests : payload.tests,
          patient: {
            ...payload.patient,
            ...(input.patientId ? { id: input.patientId } : {}),
            name: input.patientName ?? payload.patient.name,
          },
          ...(input.sampleType ? { sampleType: input.sampleType } : {}),
          ...(input.rackPosition ? { rackPosition: input.rackPosition } : {}),
        };

        const now = new Date().toISOString();
        const [updated] = await db
          .update(syncOrderInbox)
          .set({ payloadJson: JSON.stringify(next), updatedAt: now })
          .where(eq(syncOrderInbox.id, row.id))
          .returning();

        return c.json({ order: updated });
      } catch (error) {
        console.error(
          `[dashboard] Local order ${row.dispatchId} update failed:`,
          error,
        );
        return c.json({
          error: "Order could not be updated",
          detail: describeError(error),
        }, error instanceof ApiError && error.status < 500 ? 400 : 500);
      }
    },
  );

  app.delete("/agent-orders/:id", async (c) => {
    const row = await findLocalOrder(c.req.param("id"), "delete");
    if ("error" in row) return c.json({ error: row.error }, row.status);

    try {
      if (row.agentOrderId !== null) {
        await deleteMachineOrder(row.agentOrderId);
      }
      await db.delete(syncOrderInbox).where(eq(syncOrderInbox.id, row.id));
      console.log(`[dashboard] Deleted local order ${row.dispatchId}`);
      return c.json({ success: true, id: row.id });
    } catch (error) {
      console.error(
        `[dashboard] Local order ${row.dispatchId} deletion failed:`,
        error,
      );
      return c.json({
        error: "Order could not be deleted",
        detail: describeError(error),
      }, error instanceof ApiError && error.status < 500 ? 400 : 500);
    }
  });
}
