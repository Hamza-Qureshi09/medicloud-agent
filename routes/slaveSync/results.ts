import { Hono } from "@hono/hono";
import { validator } from "@hono/hono/validator";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { syncOrderInbox } from "../../db/tables/syncOrderInbox.ts";
import type { SlaveRegistry } from "../../flow/master/slaveRegistry.ts";
import type { ResultDispatcher } from "../../jobs/resultDispatcher.ts";
import { PulledOrderSchema, ResultRequestSchema } from "../../schemas/sync.ts";
import type { ResultUploadResponse } from "../../schemas/sync.ts";
import { requireSlave } from "./auth.ts";

export function registerSlaveResultRoute(
  app: Hono,
  registry: SlaveRegistry,
  resultDispatcher: ResultDispatcher,
): void {
  app.post(
    "/slave-sync/results",
    validator("json", (value, context) => {
      const parsed = ResultRequestSchema.safeParse(value);
      return parsed.success ? parsed.data : context.json({
        error: "Invalid result upload",
        issues: parsed.error.issues,
      }, 400);
    }),
    async (context) => {
      const slaveId = await requireSlave(context, registry);
      if (slaveId instanceof Response) return slaveId;

      const body = context.req.valid("json");
      const accepted: string[] = [];
      const rejected: ResultUploadResponse["rejected"] = [];

      for (const item of body.results) {
        // Verify the result belongs to an order assigned to this slave.
        const rows = await db.select().from(syncOrderInbox).where(and(
          eq(syncOrderInbox.dispatchId, item.dispatchId),
          eq(syncOrderInbox.targetSlaveId, slaveId),
          // A dispatch can produce multiple batches, and a slave may retry
          // after the master delivered a batch but its reply was lost.
          inArray(syncOrderInbox.status, [
            "acknowledged_by_slave",
            "processing",
            "completed",
          ]),
        ));

        if (rows.length === 0) {
          rejected.push({
            idempotencyKey: item.idempotencyKey,
            code: "UNKNOWN_DISPATCH",
            retryable: false,
            message: "Dispatch is not assigned to this slave",
          });
          continue;
        }

        const order = PulledOrderSchema.parse(JSON.parse(rows[0].payloadJson));

        // Hand off to ResultDispatcher which queues it for upstream delivery.
        await resultDispatcher.enqueueFromSlave(item, order.orderId);
        accepted.push(item.idempotencyKey);
      }

      return context.json({ accepted, duplicates: [], rejected });
    },
  );
}
