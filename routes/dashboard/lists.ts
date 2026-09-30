import { Context, Hono } from "@hono/hono";
import { validator } from "@hono/hono/validator";
import {
  OrderListQuerySchema,
  ResultListQuerySchema,
} from "../../schemas/local.ts";
import {
  listAgentOrders,
  listExternalResults,
  listSlaveOrders,
  listSlaveResults,
} from "../../db/repositories/external.ts";

const validateOrderQuery = validator("query", (value, c) => {
  const parsed = OrderListQuerySchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : c.json({ error: "Invalid list query", issues: parsed.error.issues }, 400);
});

const validateResultQuery = validator("query", (value, c) => {
  const parsed = ResultListQuerySchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : c.json({ error: "Invalid list query", issues: parsed.error.issues }, 400);
});

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

export function registerDashboardListRoutes(app: Hono): void {
  // Paged view of all orders in this agent's syncOrderInbox.
  app.get("/agent-orders", validateOrderQuery, (c) =>
    readJson(c, async () => {
      const { rows, count } = await listAgentOrders(c.req.valid("query"));
      return { orders: rows, count };
    }));

  // Paged view of all upstream result deliveries.
  app.get(
    "/external-results",
    validateResultQuery,
    (c) =>
      readJson(c, async () => {
        const { rows, count } = await listExternalResults(c.req.valid("query"));
        return { results: rows, count };
      }),
  );

  // Paged view of orders routed to downstream slaves.
  app.get("/slave-orders", validateOrderQuery, (c) =>
    readJson(c, async () => {
      const { rows, count } = await listSlaveOrders(c.req.valid("query"));
      return { orders: rows, count };
    }));

  // Paged view of results originating from slave-processed orders.
  app.get(
    "/slave-results",
    validateResultQuery,
    (c) =>
      readJson(c, async () => {
        const { rows, count } = await listSlaveResults(c.req.valid("query"));
        return { results: rows, count };
      }),
  );
}
