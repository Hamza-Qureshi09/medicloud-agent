import { MachineManager } from "@mediCloud/sdk/manager";
import { HeartbeatWorker } from "../jobs/heartbeat";
import { OrderPullWorker } from "../jobs/orderPull";
import { ResultDispatcher } from "../jobs/resultDispatcher";
import { shutdown } from "./signals";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { EXTERNAL_ORDER_STATUSES, RESULT_DELIVERY_STATUSES } from "./constants.ts";
import { sql, SQL } from "drizzle-orm";


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

/** `LIKE '%term%'` with wildcards inside `term` escaped so they match literally. */
export function contains(column: SQLiteColumn, term: string): SQL {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/** Narrows an untrusted query value to a known inbox status. */
export function toOrderStatus(value?: string) {
    const statuses: readonly string[] = EXTERNAL_ORDER_STATUSES;
    return value && statuses.includes(value) ? value : undefined;
}

/** Narrows an untrusted query value to a known delivery status. */
export function toDeliveryStatus(value?: string) {
    const statuses: readonly number[] = RESULT_DELIVERY_STATUSES;
    const parsed = Number(value);
    return statuses.includes(parsed) ? parsed : undefined;
}