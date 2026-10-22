import type { SlaveConnectionIdentity } from "./schemas/slaveConnection.ts";
export type {
  CatalogAnalyte,
  CatalogTest,
  PulledOrder,
  PullResponse,
  ResultUploadItem,
  ResultUploadResponse,
  SyncMachineCapability,
  UploadAnalyte,
} from "./schemas/sync.ts";

import type { MachineManager } from "@mediCloud/sdk/manager";
import type { HeartbeatWorker } from "./jobs/heartbeat.ts";
import type { OrderPullWorker } from "./jobs/orderPull.ts";
import type { ResultDispatcher } from "./jobs/resultDispatcher.ts";
import type { SlaveRegistry } from "./flow/master/slaveRegistry.ts";
import type { SyncClient } from "./flow/sync/client.ts";
import type { UploadAnalyte } from "./schemas/sync.ts";

export type {
  ListQuery,
  LocalProfile as TMachineProfile,
  OrderListQuery,
  ResultListQuery,
} from "./schemas/local.ts";

export interface ListPage<T> {
  rows: T[];
  count: number;
}

export interface ApiErrorBody {
  error?: string;
  detail?: string;
}

/**
 * Auth headers forwarded on every sync request.
 * headerPrefix switches between `x-agent-*` and `x-slave-*` header names.
 */
export type SyncAuthHeaders = {
  clientId: string;
  secret: string;
  instanceId: string;
  headerPrefix: "agent" | "slave";
};

export type SdkAnalyte = Partial<Record<keyof UploadAnalyte, unknown>>;

export type PersistedMachineResult = {
  id: number;
  orderId: number;
  machineId: number;
  sampleId: string;
  receivedAt: Date | string;
  payload?: { results?: SdkAnalyte[] };
};

export type AgentRegistriesResult = {
  slaveRegistry: SlaveRegistry | null;
  syncClient: SyncClient;
  heartbeatWorker: HeartbeatWorker;
  orderPullWorker: OrderPullWorker;
  resultDispatcher: ResultDispatcher;
};

export type ShutdownWorkers = AgentWorkers & {
  server: Deno.HttpServer;
  manager: MachineManager;
};

export type SyncConnection = {
  baseUrl: string;
  auth: SyncAuthHeaders;
  slaveName?: string;
};

export type AgentWorkers = Pick<
  AgentRegistriesResult,
  "heartbeatWorker" | "orderPullWorker" | "resultDispatcher"
>;

export type SlaveWorkerControl = {
  pause: () => Promise<void>;
  resume: () => void;
  validateChange: (
    previous: SlaveConnectionIdentity,
    next: SlaveConnectionIdentity,
  ) => Promise<void>;
};
