import { Hono } from "@hono/hono";
import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import { registerSlaveManagementRoutes } from "./dashboard/slaves.ts";
import { registerDashboardListRoutes } from "./dashboard/lists.ts";
import { registerDashboardOrderRoutes } from "./dashboard/orders.ts";
import { registerDashboardFrontendRoutes } from "./dashboard/frontend.ts";
import { registerInfoRoute } from "./dashboard/info.ts";
import { registerDashboardResultRoutes } from "./dashboard/results.ts";
import type { ResultDispatcher } from "../jobs/resultDispatcher.ts";

export function registerDashboardRoutes(
  app: Hono,
  slaveRegistry: SlaveRegistry | undefined,
  cloudClient: SyncClient | undefined,
  resultDispatcher: ResultDispatcher,
): void {
  registerInfoRoute(app);
  registerSlaveManagementRoutes(app, slaveRegistry);
  registerDashboardListRoutes(app);
  registerDashboardOrderRoutes(app, cloudClient);
  registerDashboardResultRoutes(app, resultDispatcher);
  registerDashboardFrontendRoutes(app);
}
