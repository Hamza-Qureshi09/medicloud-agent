import type { Context } from "@hono/hono";
import type { SlaveRegistry } from "../../flow/master/slaveRegistry.ts";

export async function requireSlave(
  context: Context,
  registry: SlaveRegistry,
): Promise<string | Response> {
  const slaveId = context.req.header("x-slave-id");
  const secret = context.req.header("x-slave-secret");

  if (!slaveId || !secret || !await registry.authenticate(slaveId, secret)) {
    return context.json({ error: "Unauthorized" }, 401);
  }
  return slaveId;
}
