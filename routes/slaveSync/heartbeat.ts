import { Hono } from "@hono/hono";
import { validator } from "@hono/hono/validator";
import type { SlaveRegistry } from "../../flow/master/slaveRegistry.ts";
import { requireSlave } from "./auth.ts";
import { HeartbeatRequestSchema } from "../../schemas/sync.ts";
import { env } from "../../lib/env.ts";
import {
  RESULT_UPLOAD_BATCH_SIZE,
  SLAVE_MAX_ORDER_BATCH_SIZE,
} from "../../lib/constants.ts";

export function registerSlaveHeartbeatRoute(
  app: Hono,
  registry: SlaveRegistry,
): void {
  app.post(
    "/slave-sync/heartbeat",
    validator("json", (value, context) => {
      const parsed = HeartbeatRequestSchema.safeParse(value);
      return parsed.success ? parsed.data : context.json({
        error: "Invalid heartbeat",
        issues: parsed.error.issues,
      }, 400);
    }),
    async (context) => {
      const slaveId = await requireSlave(context, registry);
      if (slaveId instanceof Response) return slaveId;

      const body = context.req.valid("json");
      const instanceId = context.req.header("x-slave-instance-id") || "";
      await registry.ping(slaveId, body.machines, instanceId);

      return context.json({
        serverTime: new Date().toISOString(),
        heartbeatAfterMs: env.MEDICLOUD_PING_INTERVAL_MS,
        pullAfterMs: env.DEFAULT_ORDER_PULL_INTERVAL_MS,
        maxOrderBatchSize: SLAVE_MAX_ORDER_BATCH_SIZE,
        maxResultBatchSize: RESULT_UPLOAD_BATCH_SIZE,
      });
    },
  );
}
