import { env } from "./env.ts";
import { ApiError } from "./error.ts";
import type { RunningMachineView } from "@mediCloud/sdk/registry";
import {
    CatalogTest,
    PullResponse,
    ResultUploadItem,
    ResultUploadResponse,
    SyncAuthHeaders,
    SyncMachineCapability,
    TMachineProfile,
    TSlaveSyncRegisterPayload,
} from "../types.ts";



// The machine SDK is served by this same agent/process, so it is reached over
// loopback. AGENT_PUBLIC_URL is the outside-facing address.
const AGENT_URL = env.AGENT_LOCAL_URL;


// 1. Machine SDK - raw fetch calls

/** Fetches all registered machine profiles from the local SDK. */
export async function fetchMachineProfiles(): Promise<TMachineProfile[]> {
    const response = await fetch(`${AGENT_URL}/profiles`);
    if (!response.ok) {
        throw new ApiError("Failed to fetch local machine profiles.", response.status);
    }
    const data = await response.json() as { profiles: TMachineProfile[] };
    return data.profiles;
}

/** Fetches the health "/health" running-machine list from the local SDK. */
export async function fetchMachineHealth(): Promise<RunningMachineView[]> {
    const response = await fetch(`${AGENT_URL}/health`);
    if (!response.ok) {
        throw new ApiError(
            "Failed to fetch local machine health (running_machine) details.",
            response.status,
        );
    }
    const data = await response.json() as { running_machines: RunningMachineView[] };
    return data.running_machines;
}

/**
 * Fetches the test catalog supported by a specific driver.
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
    const data = await response.json() as { tests?: CatalogTest[] };
    return data.tests ?? [];
}

/** Posts a new order to the local machine SDK. Returns the created order's ID. */
export async function postMachineOrder(order: {
    machineId: number;
    sampleId: string;
    tests: string[];
    patientName: string;
    patientId: string;
    dob?: string;
    sex?: string;
    createdAt: string;
    expiresAt: string;
}): Promise<number> {
    const response = await fetch(`${AGENT_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
    });
    if (!response.ok) {
        throw new ApiError("Failed to post order to local machine SDK.", response.status);
    }
    const data = await response.json() as { order: { id: number } | null };
    if (!data.order) {
        throw new Error("Machine SDK did not return a created order.");
    }
    return data.order.id;
}



// 2. Agent/Medicloud related calls

/**
 * Register a slave with the master.
 *
 * This endpoint uses the bootstrap secret because the slave
 * does not yet have its own slaveId/slaveSecret.
 */
export const register_slave_agent_to_master = async (
    masterUrl: string,
    payload: TSlaveSyncRegisterPayload
) => {

    const response = await fetch(`${masterUrl.replace(/\/$/, "")}/slave-sync/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-slave-secret": env.SLAVE_BOOTSTRAP_SECRET,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.slaveId || !data.slaveSecret) {
        throw new ApiError(
            data?.message ?? data?.error ?? "Slave registration failed",
            response.status
        )
    }

    return data
}

/**
 * Common POST request used by authenticated sync endpoints.
 */
async function syncRequest<T>(
    baseUrl: string,
    path: string,
    payload: unknown,
    auth: SyncAuthHeaders,
): Promise<T> {
    const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}${path}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",

                // can be "agent" or "slave"
                [`x-${auth.headerPrefix}-id`]: auth.clientId,
                [`x-${auth.headerPrefix}-secret`]: auth.secret,
                [`x-${auth.headerPrefix}-instance-id`]: auth.instanceId,
            },
            body: JSON.stringify(payload),
        },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiError(
            data?.message ?? data?.error ?? `HTTP ${response.status}`,
            response.status,
        );
    }

    // API returning either:
    // data?.data or directly data
    return (data?.data ?? data) as T;
}


// "slave"/"master"/"direct" use this to ping to their host with available data (machines)
export const sync_heartbeat = (
    baseUrl: string,
    apiPrefix: string,
    auth: SyncAuthHeaders,
    payload: {
        mode: "direct" | "master" | "slave";
        protocolVersion: string;
        softwareVersion?: string;
        machines: SyncMachineCapability[];
    },
) => {
    return syncRequest<{
        serverTime: string;
        heartbeatAfterMs: number;
        pullAfterMs: number;
        maxOrderBatchSize: number;
        maxResultBatchSize: number;
    }>(
        baseUrl,
        `${apiPrefix}/heartbeat`,
        payload,
        auth,
    );
};


// "master"/"direct" agents pull orders from medicloud, "slave" pulls from "master" 
// while pulling data the agent/master/slave will tell how much to pull 
// and also tells what data of active machine profiles currently they are having
export const sync_pull_orders = (
    baseUrl: string,
    apiPrefix: string,
    auth: SyncAuthHeaders,
    payload: {
        capacity: number;
        availableProfileKeys: string[];
    },
) => {
    return syncRequest<PullResponse>(
        baseUrl,
        `${apiPrefix}/orders/pull`,
        payload,
        auth,
    );
};


// after data pulling from the "host", & storing data into "syncOrderInbox", send acknowledgment to the "host" with "accepted"/"rejected" orders 
export const sync_acknowledge_orders = (
    baseUrl: string,
    apiPrefix: string,
    auth: SyncAuthHeaders,
    payload: {
        leaseId: string;

        accepted: Array<{
            dispatchId: string;
            localOrderId?: number;
        }>;

        rejected: Array<{
            dispatchId: string;
            code: string;
            message?: string;
        }>;
    },
) => {
    return syncRequest<{
        acknowledged: string[];
        conflicts: string[];
    }>(
        baseUrl,
        `${apiPrefix}/orders/ack`,
        payload,
        auth,
    );
};


// report the "host" about the "failed" order
export const sync_report_status = (
    baseUrl: string,
    apiPrefix: string,
    auth: SyncAuthHeaders,
    payload: {
        updates: Array<{
            dispatchId: string;
            status: "processing" | "failed";
            message?: string;
        }>;
    },
) => {
    return syncRequest<{
        updated: string[];
    }>(
        baseUrl,
        `${apiPrefix}/orders/status`,
        payload,
        auth,
    );
};


// upload results batch to upstream (master or medicloud)
export const sync_upload_results = (
    baseUrl: string,
    apiPrefix: string,
    auth: SyncAuthHeaders,
    payload: {
        batchId: string;
        results: ResultUploadItem[];
    },
) => {
    return syncRequest<ResultUploadResponse>(
        baseUrl,
        `${apiPrefix}/results`,
        payload,
        auth,
    );
};