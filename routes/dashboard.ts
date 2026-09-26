import { Context, Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { env } from "../lib/env.ts";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../lib/constants.ts";
import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";
import {
  deleteMachineOrder,
  fetchMachineHealth,
  fetchMachineOrder,
  fetchMachineProfiles,
  patchMachineOrder,
  postMachineOrder,
} from "../lib/endpoints.ts";
import {
  listAgentOrders,
  listExternalResults,
  listSlaveOrders,
  listSlaveResults,
} from "../db/queries/external.ts";
import { db } from "../db/index.ts";
import { syncOrderInbox } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import type { SyncClient } from "../flow/sync/client.ts";
import type { LocalOrderInput, PulledOrder } from "../types.ts";
import { ApiError, describeError } from "../lib/error.ts";

/** Reads the search/status/limit/offset query shared by the paged lists. */
function listQuery(c: Context) {
  const limit = Number(c.req.query("limit"));
  const offset = Number(c.req.query("offset"));

  return {
    search: c.req.query("search")?.trim() || undefined,
    status: c.req.query("status")?.trim() || undefined,
    limit: Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
    offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
  };
}

/** A trimmed string, or undefined when the field was blank or not a string. */
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOrderInput(
  body: Record<string, unknown>,
): Omit<LocalOrderInput, "machineId"> {
  const tests = Array.isArray(body.tests)
    ? body.tests.map(optionalText).filter((test): test is string =>
      Boolean(test)
    )
    : undefined;

  const expiresAt = optionalText(body.expiresAt);

  return {
    sampleId: optionalText(body.sampleId) ?? "",
    ...(tests ? { tests } : {}),
    patientId: optionalText(body.patientId),
    patientName: optionalText(body.patientName),
    sampleType: optionalText(body.sampleType),
    rackPosition: optionalText(body.rackPosition),
    expiresAt: expiresAt && !Number.isNaN(new Date(expiresAt).getTime())
      ? new Date(expiresAt).toISOString()
      : undefined,
  };
}

async function withMachineStatus(
  rows: Array<typeof syncOrderInbox.$inferSelect>,
): Promise<Array<typeof syncOrderInbox.$inferSelect & { machineStatus?: string | null }>> {
  return await Promise.all(rows.map(async (row) => {
    if (row.source !== "local" || row.agentOrderId === null) return row;

    const machineOrder = await fetchMachineOrder(row.agentOrderId).catch(
      (error) => {
        console.error(
          `[dashboard] Could not read machine order ${row.agentOrderId}:`,
          describeError(error),
        );
        return null;
      },
    );

    return { ...row, machineStatus: machineOrder?.status ?? null };
  }));
}

async function findLocalOrder(
  idParam: string,
  intent: "update" | "delete",
): Promise<
  | typeof syncOrderInbox.$inferSelect
  | { error: string; status: 400 | 404 | 503 }
> {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Invalid order ID", status: 400 };
  }

  const [row] = await db.select().from(syncOrderInbox).where(
    eq(syncOrderInbox.id, id),
  ).limit(1);
  if (!row) {
    return { error: "Order not found", status: 404 };
  }
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
        error: "The analyzer service did not answer, so this order cannot be changed right now",
        status: 503,
      };
    }

    const stillTheOperators = machineOrder?.status === "pending" ||
      (intent === "delete" && machineOrder?.status === "failed");

    if (machineOrder && !stillTheOperators) {
      return {
        error: machineOrder.status === "failed"
          ? "This order failed on the analyzer and can only be deleted"
          : `The analyzer is already working on this order (${machineOrder.status ?? "unknown"}), so it can no longer be changed or deleted`,
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

/**
 * Runs a read and reports failures as JSON.
 */
async function readJson(c: Context, read: () => Promise<unknown>) {
  try {
    return c.json(await read());
  } catch (error) {
    console.error("[dashboard] query failed:", error);
    return c.json({
      error: "Query failed",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
}

export function registerDashboardRoutes(
  app: Hono,
  slaveRegistry: SlaveRegistry | undefined,
  cloudClient: SyncClient | undefined,
): void {
  // System info - intercepts the SDK's /health to inject agent mode and version.
  app.get("/info", async (c) => {
    // Forward the request to the SDK's internal health handler
    const { running_machines, registered_drivers } = await fetchMachineHealth();

    // Merge the agent's properties with the SDK's properties
    return c.json({
      running_machines,
      registered_drivers,
      mode: env.AGENT_MODE,
      version: "1.0.0",
    });
  });

  // List all registered slaves (master mode only).
  // Returns every slave — active, inactive, and pre-registered — so the
  // control page always shows the full picture.
  app.get("/slaves", async (c) => {
    if (!slaveRegistry) {
      return c.json({ slaves: [], totalMachines: 0 });
    }

    const [slaves, totalMachines] = await Promise.all([
      slaveRegistry.listAll(),
      slaveRegistry.countMachines(),
    ]);

    return c.json({ slaves, totalMachines });
  });

  // Register a new slave from the master UI.
  // Returns one-time credentials (slaveId + slaveSecret) that the operator
  // must copy — the secret cannot be retrieved again.
  app.post("/slaves/register", async (c) => {
    if (!slaveRegistry) {
      return c.json({
        error: "Slave registration is only available in master mode",
      }, 400);
    }

    const { slaveId, slaveSecret } = await slaveRegistry.register();
    return c.json({ slaveId, slaveSecret });
  });

  // Get a single slave by ID.
  app.get("/slaves/:slaveId", async (c) => {
    if (!slaveRegistry) return c.json({ error: "Not in master mode" }, 400);
    const slave = await slaveRegistry.getBySlaveId(c.req.param("slaveId"));
    if (!slave) return c.json({ error: "Slave not found" }, 404);
    return c.json({ slave });
  });

  // Mark a slave as inactive
  app.post("/slaves/:slaveId/inactive", async (c) => {
    if (!slaveRegistry) return c.json({ success: false }, 400);
    const slaveId = c.req.param("slaveId");
    const found = await slaveRegistry.markInactive(slaveId);
    return c.json({ success: found });
  });

  // Permanently delete a slave from the registry.
  app.post("/slaves/:slaveId/delete", async (c) => {
    if (!slaveRegistry) return c.json({ success: false }, 400);
    const slaveId = c.req.param("slaveId");
    const found = await slaveRegistry.delete(slaveId);

    if (!found) {
      return c.json({ error: "Slave not found" }, 404);
    }

    return c.json({ success: true });
  });

  // External orders - paged view of the agent's syncOrderInbox table.
  app.get("/agent-orders", (c) =>
    readJson(c, async () => {
      const { rows, count } = await listAgentOrders(listQuery(c));
      return { orders: rows, count };
    })
  );

  // External results - paged view of the agent's medicloudResultDispatch table.
  app.get("/external-results", (c) =>
    readJson(c, async () => {
      const { rows, count } = await listExternalResults(listQuery(c));
      return { results: rows, count };
    })
  );

  // Slave-scoped orders - orders that were routed to a downstream slave.
  app.get("/slave-orders", (c) =>
    readJson(c, async () => {
      const { rows, count } = await listSlaveOrders(listQuery(c));
      return { orders: rows, count };
    })
  );

  // Slave-scoped results - results originating from slave-processed orders.
  app.get("/slave-results", (c) =>
    readJson(c, async () => {
      const { rows, count } = await listSlaveResults(listQuery(c));
      return { results: rows, count };
    })
  );

  // Reject an upstream order locally so the master dashboard operator
  // can decline a dispatch manually without running it.
  app.post("/orders/:id/reject", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid order ID" }, 400);
    }

    const [row] = await db.select().from(syncOrderInbox).where(
      eq(syncOrderInbox.id, id),
    ).limit(1);
    if (!row) {
      return c.json({ error: "Order not found" }, 404);
    }

    // Rejecting means telling upstream we will not run its dispatch, which
    // only makes sense for an order upstream actually sent.
    if (row.source !== "upstream") {
      return c.json({ error: "Only upstream orders can be rejected" }, 400);
    }

    if (row.status !== "received" && row.status !== "acknowledged") {
      return c.json({
        error: "Only pending orders (received/acknowledged) can be rejected",
      }, 400);
    }

    const now = new Date().toISOString();
    await db.update(syncOrderInbox).set({
      status: "failed",
      errorText: "Rejected by operator",
      updatedAt: now,
    }).where(eq(syncOrderInbox.id, id));

    // Report rejection upstream (fire-and-forget).
    if (cloudClient) {
      cloudClient.reportStatus([{
        dispatchId: row.dispatchId,
        status: "failed",
        message: "Rejected by operator from master dashboard",
      }]).catch((error) =>
        console.error("[dashboard] Failed to report rejection upstream:", error)
      );
    }

    return c.json({ success: true });
  });

  app.post("/agent-orders", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<
      string,
      unknown
    >;
    const input = readOrderInput(body);

    const machineId = Number(body.machineId);
    if (!Number.isInteger(machineId) || machineId <= 0) {
      return c.json({ error: "An analyzer profile is required" }, 400);
    }
    if (!input.sampleId) {
      return c.json({ error: "Sample ID is required" }, 400);
    }

    // The profile supplies the driver and profile key, the same pair an
    // upstream dispatch carries, so both kinds of row read alike.
    const profile = (await fetchMachineProfiles()).find((item) =>
      item.id === machineId
    );
    if (!profile) {
      return c.json(
        { error: `Analyzer profile ${machineId} was not found` },
        404,
      );
    }

    const now = new Date().toISOString();
    const expiresAt = input.expiresAt ??
      new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    const dispatchId = `local:${crypto.randomUUID().replaceAll("-", "")}`;

    try {
      const agentOrderId = await postMachineOrder({
        machineId,
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
  });

  app.patch("/agent-orders/:id", async (c) => {
    const row = await findLocalOrder(c.req.param("id"), "update");
    if ("error" in row) return c.json({ error: row.error }, row.status);

    const body = await c.req.json().catch(() => ({})) as Record<
      string,
      unknown
    >;
    const input = readOrderInput(body);

    // The SDK rejects empty text, so only fields the operator actually
    const update: Record<string, unknown> = {};
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

      const payload = JSON.parse(row.payloadJson) as PulledOrder;
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
      const [updated] = await db.update(syncOrderInbox).set({
        payloadJson: JSON.stringify(next),
        updatedAt: now,
      }).where(eq(syncOrderInbox.id, row.id)).returning();

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
  });

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

  // Serve pre-built frontend assets under /dashboard/*
  app.use(
    "/dashboard/*",
    serveStatic({
      root: "./frontend/build",
      rewriteRequestPath: (path) => path.replace(/^\/dashboard/, ""),
    }),
  );

  // SPA fallback - any /dashboard route that doesn't match a static file
  // returns index.html so the frontend router handles it.
  app.get(
    "/dashboard",
    (c, next) => serveStatic({ path: "./frontend/build/index.html" })(c, next),
  );
  app.get(
    "/dashboard/*",
    (c, next) => serveStatic({ path: "./frontend/build/index.html" })(c, next),
  );
}
