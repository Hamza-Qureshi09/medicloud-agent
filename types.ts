export interface ApiErrorBody {
    error?: string
    detail?: string
}


// export type TMachineProfile = {
//     id: number, // db id
//     enabled: boolean,
//     name: string,
//     config: unknown,
//     createdAt: string,
//     updatedAt?: string | undefined
// }

// export type TRunningMachine = {
//     machineId: string, // running_machine.machine.id
//     driverId: string, // driver registeration id
//     brand: string,
//     model: string,
//     connected: boolean,
//     running: boolean,
//     profile: TMachineProfile
// }

// sdk register machine profile minimal details
export type TMachineProfile = {
    id: number;
    driverId: string;
    name?: string;
    enabled: boolean;
}


// one analyte a test answers with, keyed by the assayNo the driver reports
export interface CatalogAnalyte {
    code: string;
    name: string;
    unit?: string;
}

// a single orderable test as advertised by the machine SDK's /catalogs route
export interface CatalogTest {
    code: string;
    name: string;

    // will be Absent on SDK builds older than the analyte-aware catalog.
    analytes?: CatalogAnalyte[];
}

// synchronize machine capabilities after (profile/machine) data merge
export interface SyncMachineCapability {
    profileKey: string;
    localProfileId: number;
    driverId: string;
    name: string;
    running: boolean;
    connected: boolean;
    isSlaveOwned: boolean;
    slaveId?: string;
    catalogTests: string[];

    // Per-test analyte breakdown, reported alongside the flat catalogTests list
    // so MediCloud can offer assayNo choices when a dispatch is built. Only the
    // tests whose results/analytes the SDK actually knows appear here.
    catalog?: Array<{ testCode: string; analytes: CatalogAnalyte[] }>;
}

export type TSlaveSyncRegisterPayload = {
    instanceId: string,
    machines: SyncMachineCapability[]
}

// export type TSlavePingPayload = {
//     serverTime: string;
//     heartbeatAfterMs: number;
//     pullAfterMs: number;
//     maxOrderBatchSize: number;
//     maxResultBatchSize: number;
// }

export interface PulledOrder {
    dispatchId: string;
    orderId: string;
    profileKey: string;
    targetSlaveId?: string;
    driverId: string;
    sampleId: string;
    patient: { id?: string; name: string; dob?: string; sex?: string };
    tests: string[];
    payloadVersion: number;
}

export interface PullResponse {
    leaseId: string | null;
    leaseExpiresAt: string | null;
    pullAfterMs: number;
    orders: PulledOrder[];
}

// used in "client.ts"
export type SyncAuthHeaders = {
    clientId: string;
    secret: string;
    instanceId: string;
    headerPrefix: "agent" | "slave";
};


export interface ResultUploadItem {
    idempotencyKey: string;
    dispatchId: string;
    localOrderId: number;
    localResultId: number;
    sampleId: string;
    receivedAt: string;
    analytes: UploadAnalyte[];
}

/**
 * The analyte shape sent upstream.
 *
 * Deliberately explicit rather than forwarding the SDK's result object as-is:
 * MediCloud validates the batch against a closed schema and rejects any
 * property it does not know, so an extra field appearing in a future SDK build
 * would turn every upload into a 400 that only retries into a dead letter.
 */
export interface UploadAnalyte {
    assayNo: string;
    assayName?: string;
    resultType?: string;
    value?: string;
    qualitative?: string;
    unit?: string;
    lowReference?: string;
    highReference?: string;
    abnormalFlag?: string;
    status?: string;
    completedAt?: string;
}

export interface ResultUploadResponse {
    accepted: string[];
    duplicates: string[];
    rejected: Array<{
        idempotencyKey: string;
        code: string;
        retryable: boolean;
        message: string;
    }>;
}
