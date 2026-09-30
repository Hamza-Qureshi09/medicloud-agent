import type { ShutdownWorkers } from "../types.ts";
import { type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { dirname } from "node:path";
import type { SdkAnalyte } from "../types.ts";
import type { UploadAnalyte } from "../schemas/sync.ts";

/**
 * Reads or creates a stable UUID for this agent instance from a local file.
 * Used to identify the agent across restarts in upstream heartbeat calls.
 */
export async function getOrCreateInstanceId(path: string): Promise<string> {
  const existing = await Deno.readTextFile(path).catch(() => "");
  if (existing.trim()) return existing.trim();

  const instanceId = crypto.randomUUID();
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, instanceId);
  return instanceId;
}

let shuttingDown = false;

/**
 * Stops all background workers, shuts down the HTTP server, then exits.
 * Safe to call multiple times - only the first call takes effect.
 */
export async function gracefulShutdown(
  signal: "SIGINT" | "SIGTERM",
  workers: ShutdownWorkers,
): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    Deno.removeSignalListener("SIGINT", onSigInt);
    if (Deno.build.os !== "windows") {
      Deno.removeSignalListener("SIGTERM", onSigTerm);
    }
    console.log(`${signal} received, shutting down...`);
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

let onSigInt = () => {};
let onSigTerm = () => {};

export function setShutdownListeners(
  sigInt: () => void,
  sigTerm: () => void,
): void {
  onSigInt = sigInt;
  onSigTerm = sigTerm;
  Deno.addSignalListener("SIGINT", onSigInt);
  if (Deno.build.os !== "windows") Deno.addSignalListener("SIGTERM", onSigTerm);
}

/**
 * Builds a case-insensitive `LIKE '%term%'` SQL expression with
 * wildcards inside `term` properly escaped.
 */
export function contains(column: SQLiteColumn, term: string): SQL {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

export function toUploadAnalyte(analyte: SdkAnalyte): UploadAnalyte {
  const projected: UploadAnalyte = { assayNo: String(analyte.assayNo ?? "") };
  const optional = [
    "assayName",
    "resultType",
    "value",
    "qualitative",
    "unit",
    "lowReference",
    "highReference",
    "abnormalFlag",
    "status",
    "completedAt",
  ] as const;

  for (const key of optional) {
    const value = analyte[key];
    if (value !== undefined && value !== null && value !== "") {
      projected[key] = String(value);
    }
  }
  return projected;
}
