import { Hono } from "@hono/hono";
import { MachineManager } from "@mediCloud/sdk/manager";
import { env } from "./lib/env.ts";
import { getOrCreateInstanceId, gracefulShutdown } from "./lib/utils.ts";
import { AgentRegistries } from "./flow/registries.ts";
import { registerDashboardRoutes } from "./routes/dashboard.ts";
import { registerSlaveSyncRoutes } from "./routes/slaveSync.ts";
import { initDB } from "./db/index.ts";
import { cors } from "@hono/hono/cors";

const DB_PATH = env.MEDICLOUD_MACHINES_SDK_DB_PATH;

// environment checkups
// function environmentCheckups() {
//   // "master" and "slave" modes both need SLAVE_BOOTSTRAP_SECRET
//   if (
//     (env.AGENT_MODE === "master" || env.AGENT_MODE === "slave") &&
//     !env.SLAVE_BOOTSTRAP_SECRET
//   ) {
//     throw new Error("SLAVE_BOOTSTRAP_SECRET is required in master and slave modes");
//   }

//   // slave mode also needs to know where the "master" lives
//   if (env.AGENT_MODE === "slave" && !env.MASTER_HOST) {
//     throw new Error("MASTER_HOST is required in slave mode");
//   }

//   // "direct" and "master" modes communicate with MediCloud directly
//   if (
//     env.AGENT_MODE !== "slave" &&
//     (!env.MEDICLOUD_AGENT_ID || !env.MEDICLOUD_AGENT_SECRET || !env.MEDICLOUD_ACCOUNT_ID || !env.MEDICLOUD_API_URL)
//   ) {
//     throw new Error("[MEDICLOUD_AGENT_ID, MEDICLOUD_AGENT_SECRET, MEDICLOUD_ACCOUNT_ID, MEDICLOUD_API_URL] are required!");
//   }
// }

if (import.meta.main) {

  // // 1. environment validation
  // environmentCheckups();

  // 2. Agent db + instance identity
  await initDB();
  const instanceId = await getOrCreateInstanceId("./data/agent-instance-id");

  // 3. initialize all workers and registries
  const registries = await AgentRegistries(instanceId);
  const {
    slaveRegistry,
    syncClient,
    resultDispatcher,
    heartbeatWorker,
    orderPullWorker
  } = registries;

  // 4. initialize Machine SDK - created here so resultDispatcher is already available and passed directly into the callback.
  const manager = new MachineManager({
    dbPath: DB_PATH,
    onResultPersisted: (result) => resultDispatcher.onResult(result),
  });
  const machineHandler = await manager.getHandler();

  // 5. HTTP server - agent routes + optional slave-sync routes + machine SDK passthrough
  const app = new Hono();
  app.use("*", cors())

  // dashboard routes
  registerDashboardRoutes(app, slaveRegistry!);

  // slave-sync routes only exist on "master" - slaves call these to register, ping, pull orders, upload results
  if (slaveRegistry) {
    registerSlaveSyncRoutes(app, slaveRegistry, syncClient, resultDispatcher);
  }
  
  // all unmatched requests go directly to the Machine SDK HTTP handler
  app.all("*", async (context) => await machineHandler(context.req.raw));

  // host agent
  const server = Deno.serve({
    hostname: env.MEDICLOUD_AGENT_HTTP_HOST,
    port: env.MEDICLOUD_AGENT_HTTP_PORT,
    onListen: ({ hostname, port }) => {
      console.info(`Agent listening on http://${hostname}:${port} in ${env.AGENT_MODE} mode`);
    },
  }, app.fetch);

  // // 6. start background workers
  // heartbeatWorker.start();
  // orderPullWorker.start();
  // resultDispatcher.startRetryLoop();

  // 7. graceful shutdown
  Deno.addSignalListener("SIGINT",
    () => void gracefulShutdown("SIGINT", {
      heartbeatWorker,
      orderPullWorker,
      resultDispatcher,
      server,
      manager
    })
  );
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM",
      () => void gracefulShutdown("SIGTERM", {
        heartbeatWorker,
        orderPullWorker,
        resultDispatcher,
        server,
        manager
      }));
  }
}