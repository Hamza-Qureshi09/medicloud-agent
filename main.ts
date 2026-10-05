import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { MachineManager } from "@mediCloud/sdk/manager";
import { env, validateEnvironment } from "./lib/env.ts";
import {
  getOrCreateInstanceId,
  gracefulShutdown,
  setShutdownListeners,
} from "./lib/utils.ts";
import { createAgentRegistries } from "./flow/registries.ts";
import { registerDashboardRoutes } from "./routes/dashboard.ts";
import { registerSlaveSyncRoutes } from "./routes/slaveSync.ts";
import { initDB } from "./db/index.ts";

if (import.meta.main) {
  validateEnvironment();

  await initDB();
  const instanceId = await getOrCreateInstanceId("./data/agent-instance-id");

  const {
    slaveRegistry,
    syncClient,
    resultDispatcher,
    heartbeatWorker,
    orderPullWorker,
  } = createAgentRegistries(instanceId);

  // resultDispatcher is already available here so we can pass it directly
  // into the onResultPersisted callback without a forward reference.
  const manager = new MachineManager({
    dbPath: env.MEDICLOUD_MACHINES_SDK_DB_PATH,
    onResultPersisted: (result) => resultDispatcher.onResult(result),
  });
  const machineHandler = await manager.getHandler();

  const app = new Hono();
  app.use("*", cors());

  // Agent dashboard routes (orders, results, slave management).
  registerDashboardRoutes(
    app,
    slaveRegistry ?? undefined,
    syncClient ?? undefined,
    resultDispatcher,
  );

  // Slave sync routes only exist on master. Slaves call these to register,
  // ping, pull orders, and upload results.
  if (slaveRegistry && syncClient) {
    registerSlaveSyncRoutes(app, slaveRegistry, syncClient, resultDispatcher);
  }

  // All unmatched requests are forwarded to the Machine SDK HTTP handler.
  app.all("*", (context) => machineHandler(context.req.raw));

  const server = Deno.serve(
    {
      hostname: env.MEDICLOUD_AGENT_HTTP_HOST,
      port: env.MEDICLOUD_AGENT_HTTP_PORT,
      onListen: ({ hostname, port }) => {
        console.info(
          `[Agent] Listening on http://${hostname}:${port} in ${env.AGENT_MODE} mode`,
        );
      },
    },
    app.fetch,
  );

  heartbeatWorker.start();
  orderPullWorker.start();
  resultDispatcher.startRetryLoop();

  const workers = {
    heartbeatWorker,
    orderPullWorker,
    resultDispatcher,
    server,
    manager,
  };

  setShutdownListeners(
    () => void gracefulShutdown("SIGINT", workers),
    () => void gracefulShutdown("SIGTERM", workers),
  );
}
