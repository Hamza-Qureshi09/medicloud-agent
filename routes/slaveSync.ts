import { Hono } from "@hono/hono";
import type { ResultDispatcher } from "../jobs/resultDispatcher.ts";
import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import { registerSlaveHeartbeatRoute } from "./slaveSync/heartbeat.ts";
import { registerSlaveOrderRoutes } from "./slaveSync/orders.ts";
import { registerSlaveResultRoute } from "./slaveSync/results.ts";

export function registerSlaveSyncRoutes(
  app: Hono,
  registry: SlaveRegistry,
  cloudClient: SyncClient,
  resultDispatcher: ResultDispatcher,
): void {
  registerSlaveHeartbeatRoute(app, registry);
  registerSlaveOrderRoutes(app, registry, cloudClient);
  registerSlaveResultRoute(app, registry, resultDispatcher);
}
