import { MachineManager } from "@mediCloud/sdk/manager";
import { HeartbeatWorker } from "../jobs/heartbeat";
import { OrderPullWorker } from "../jobs/orderPull";
import { ResultDispatcher } from "../jobs/resultDispatcher";
import { shutdown } from "./signals";


export async function getOrCreateInstanceId(path: string): Promise<string> {
  const existing = await Deno.readTextFile(path).catch(() => "");
  if (existing.trim()) return existing.trim();
  const instanceId = crypto.randomUUID();
  await Deno.mkdir("./data", { recursive: true });
  await Deno.writeTextFile(path, instanceId);
  return instanceId;
}
// handle graceful shutdowns
let shuttingDown = false;

export async function gracefulShutdown(
  signal: "SIGINT" | "SIGTERM",
  workers: {
    heartbeatWorker: HeartbeatWorker;
    orderPullWorker: OrderPullWorker;
    resultDispatcher: ResultDispatcher;
    server: Deno.HttpServer;
    manager: MachineManager;
  },
) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    shutdown(signal);
    workers.heartbeatWorker.stop();
    workers.orderPullWorker.stop();
    workers.resultDispatcher.stop();
    await workers.server.shutdown();
    await workers.manager.shutdown();
    Deno.exit(0);
  } catch (error) {
    console.error("Shutdown failed:", error);
    Deno.exit(1);
  }
}