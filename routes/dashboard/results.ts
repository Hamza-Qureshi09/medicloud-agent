import { Hono } from "@hono/hono";
import type { ResultDispatcher } from "../../jobs/resultDispatcher.ts";

export function registerDashboardResultRoutes(
  app: Hono,
  dispatcher: ResultDispatcher,
): void {
  app.post("/external-results/reconcile", async (context) => {
    try {
      return context.json(await dispatcher.reconcileAndFlush());
    } catch (error) {
      console.error("[dashboard] Result reconciliation failed:", error);
      return context.json({ error: "Result reconciliation failed" }, 500);
    }
  });

  app.post("/external-results/:id/retry", async (context) => {
    const id = Number(context.req.param("id"));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return context.json({ error: "Invalid result delivery ID" }, 400);
    }
    try {
      if (!await dispatcher.retryDelivery(id)) {
        return context.json({
          error: "Result delivery is absent or already sent",
        }, 409);
      }
      return context.json({ queued: true });
    } catch (error) {
      console.error("[dashboard] Result retry failed:", error);
      return context.json({ error: "Result retry failed" }, 500);
    }
  });
}
