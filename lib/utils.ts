import type { ShutdownWorkers } from "../types.ts";
import { type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { dirname, join, resolve } from "node:path";
import { PRIVATE_FILE_MODE } from "./constants.ts";
import type { SlaveConnectionSettings } from "../schemas/slaveConnection.ts";
import type { SyncConnection } from "../types.ts";
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

export function getSiblingFilePath(filePath: string, fileName: string): string {
  return join(dirname(resolve(filePath)), fileName);
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await Deno.readTextFile(filePath));
}

export async function writeJsonFileAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  await Deno.mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeTextFile(temporaryPath, JSON.stringify(value, null, 2), {
      mode: PRIVATE_FILE_MODE,
    });
    await Deno.rename(temporaryPath, filePath);
  } finally {
    await Deno.remove(temporaryPath).catch(() => {});
  }
}

export function createMasterUrl(
  masterHost: string,
  masterPort: number,
): string {
  return `http://${masterHost}:${masterPort}`;
}

export function createSlaveSyncConnection(
  settings: SlaveConnectionSettings,
  instanceId: string,
): SyncConnection {
  return {
    baseUrl: createMasterUrl(settings.masterHost, settings.masterPort),
    slaveName: settings.slaveName,
    auth: {
      clientId: settings.slaveId,
      secret: settings.slaveSecret,
      instanceId,
      headerPrefix: "slave",
    },
  };
}

export async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return false;

    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)) );
  }
  return true;
}
