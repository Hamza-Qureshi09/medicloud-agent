import { z } from "@zod/zod";
import { env } from "./env.ts";
import { SYNC_REQUEST_TIMEOUT_MS } from "./constants.ts";
import { ApiError } from "./error.ts";
import {
  ApiErrorResponseSchema,
  CatalogResponseSchema,
  CreatedOrderResponseSchema,
  MachineHealthResponseSchema,
  MachineOrderResponseSchema,
  ProfilesResponseSchema,
} from "../schemas/local.ts";
import {
  AckResponseSchema,
  HeartbeatResponseSchema,
  PullResponseSchema,
  ResultUploadResponseSchema,
  StatusResponseSchema,
} from "../schemas/sync.ts";
import type {
  CatalogTest,
  SyncAuthHeaders,
  TMachineProfile,
} from "../types.ts";
import type {
  MachineOrder,
  MachineOrderInput,
  MachineOrderPatch,
} from "../schemas/local.ts";
import type {
  AckRequest,
  StatusRequest,
  SyncHeartbeatPayload,
  SyncPullPayload,
  SyncResultPayload,
} from "../schemas/sync.ts";

const AGENT_URL = env.AGENT_LOCAL_URL;

// calls to the embedded machine SDK.
// machine_api: GET /profiles
export async function fetchMachineProfiles(): Promise<TMachineProfile[]> {
  const response = await fetch(`${AGENT_URL}/profiles`);
  if (!response.ok) {
    throw new ApiError(
      "Failed to fetch local machine profiles.",
      response.status,
    );
  }
  const data = ProfilesResponseSchema.parse(await response.json());
  return data.profiles;
}

// machine_api: GET /health
export async function fetchMachineHealth() {
  const response = await fetch(`${AGENT_URL}/health`);
  if (!response.ok) {
    throw new ApiError(
      "Failed to fetch local machine health (running_machine) details.",
      response.status,
    );
  }
  return MachineHealthResponseSchema.parse(await response.json());
}

/**
 * machine_api: GET /catalogs?driver=<driverId>
 *
 * Each entry carries the analytes ("assayNo" values) the test answers with,
 * which MediCloud needs to offer result mappings at dispatch time.
 */
export async function fetchDriverCatalog(
  driverId: string,
): Promise<CatalogTest[]> {
  const response = await fetch(
    `${AGENT_URL}/catalogs?driver=${encodeURIComponent(driverId)}`,
  );
  if (!response.ok) {
    throw new ApiError(
      `Failed to fetch catalog for driver: ${driverId}`,
      response.status,
    );
  }
  const data = CatalogResponseSchema.parse(await response.json());
  return data.tests ?? [];
}

// machine_api: POST /orders returns the created order ID.
export async function postMachineOrder(
  order: MachineOrderInput,
): Promise<number> {
  // Strip undefined / empty-string / empty-array fields - the SDK rejects them.
  const body = Object.fromEntries(
    Object.entries(order).filter(
      ([, value]) =>
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );

  const response = await fetch(`${AGENT_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = ApiErrorResponseSchema.parse(
      await response.json().catch(() => ({})),
    );
    throw new ApiError(
      error.error ?? "Failed to post order to local machine SDK.",
      response.status,
    );
  }

  const data = CreatedOrderResponseSchema.parse(await response.json());
  if (!data.order) {
    throw new Error("Machine SDK did not return a created order.");
  }
  return data.order.id;
}

// machine_api: GET /orders/:id, returns null for 404.
export async function fetchMachineOrder(
  orderId: number,
): Promise<MachineOrder | null> {
  const response = await fetch(`${AGENT_URL}/orders/${orderId}`);
  if (response.status === 404) return null;

  if (!response.ok) {
    throw new ApiError(
      `Failed to read machine order ${orderId}.`,
      response.status,
    );
  }

  const data = MachineOrderResponseSchema.parse(await response.json());
  return data.order ?? null;
}

// machine_api: PATCH /orders/:id
export async function patchMachineOrder(
  orderId: number,
  update: MachineOrderPatch,
): Promise<void> {
  const response = await fetch(`${AGENT_URL}/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    const body = ApiErrorResponseSchema.parse(
      await response.json().catch(() => ({})),
    );

    throw new ApiError(
      body.error ?? `Failed to update machine order ${orderId}.`,
      response.status,
    );
  }
}

// machine_api: DELETE /orders/:id returns false for 404.
export async function deleteMachineOrder(orderId: number): Promise<boolean> {
  const response = await fetch(`${AGENT_URL}/orders/${orderId}`, {
    method: "DELETE",
  });
  if (response.status === 404) return false;

  if (!response.ok) {
    const body = ApiErrorResponseSchema.parse(
      await response.json().catch(() => ({})),
    );

    throw new ApiError(
      body.error ?? `Failed to delete machine order ${orderId}.`,
      response.status,
    );
  }
  return true;
}

// sync_api: authenticated calls to MediCloud or a master agent.
// Parses every successful response with its Zod schema.
async function syncRequest<T extends z.ZodType>(
  baseUrl: string,
  path: string,
  payload: unknown,
  auth: SyncAuthHeaders,
  schema: T,
): Promise<z.output<T>> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // headerPrefix is either "agent" or "slave"
      [`x-${auth.headerPrefix}-id`]: auth.clientId,
      [`x-${auth.headerPrefix}-secret`]: auth.secret,
      [`x-${auth.headerPrefix}-instance-id`]: auth.instanceId,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      data?.message ?? data?.error ?? `HTTP ${response.status}`,
      response.status,
    );
  }

  // API may return `{ data: ... }` or the shape directly.
  return schema.parse(data?.data ?? data);
}

/**
 * sync_api: POST /heartbeat with agent mode and machine capabilities.
 */
export const sync_heartbeat = (
  baseUrl: string,
  apiPrefix: string,
  auth: SyncAuthHeaders,
  payload: SyncHeartbeatPayload,
) =>
  syncRequest(
    baseUrl,
    `${apiPrefix}/heartbeat`,
    payload,
    auth,
    HeartbeatResponseSchema,
  );

/**
 * sync_api: POST /orders/pull. Direct and master use MediCloud. Slave uses master.
 */
export const sync_pull_orders = (
  baseUrl: string,
  apiPrefix: string,
  auth: SyncAuthHeaders,
  payload: SyncPullPayload,
) =>
  syncRequest(
    baseUrl,
    `${apiPrefix}/orders/pull`,
    payload,
    auth,
    PullResponseSchema,
  );

/**
 * sync_api: POST /orders/ack for accepted and rejected dispatches.
 */
export const sync_acknowledge_orders = (
  baseUrl: string,
  apiPrefix: string,
  auth: SyncAuthHeaders,
  payload: AckRequest,
) =>
  syncRequest(
    baseUrl,
    `${apiPrefix}/orders/ack`,
    payload,
    auth,
    AckResponseSchema,
  );

/**
 * sync_api: POST /orders/status for processing or failed dispatches.
 */
export const sync_report_status = (
  baseUrl: string,
  apiPrefix: string,
  auth: SyncAuthHeaders,
  payload: StatusRequest,
) =>
  syncRequest(
    baseUrl,
    `${apiPrefix}/orders/status`,
    payload,
    auth,
    StatusResponseSchema,
  );

/**
 * sync_api: POST /results with a finished result batch.
 */
export const sync_upload_results = (
  baseUrl: string,
  apiPrefix: string,
  auth: SyncAuthHeaders,
  payload: SyncResultPayload,
) =>
  syncRequest(
    baseUrl,
    `${apiPrefix}/results`,
    payload,
    auth,
    ResultUploadResponseSchema,
  );
