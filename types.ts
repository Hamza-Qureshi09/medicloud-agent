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


// synchronize machine capabilities after (profile/machine) data merge
export interface SyncMachineCapability {
    profileKey: string;
    localProfileId: number;
    driverId: string;
    name: string;
    catalogTests: string[];
    running: boolean;
    connected: boolean;
    isSlaveOwned: boolean;
    slaveId?: string;
}
export type TSlaveSyncRegisterPayload = {
    instanceId: string,
    machines: SyncMachineCapability[]
}

export type TSlavePingPayload = {
    serverTime: string;
    heartbeatAfterMs: number;
    pullAfterMs: number;
    maxOrderBatchSize: number;
    maxResultBatchSize: number;
}

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
    analytes: Array<{
        assayNo: string;
        value?: string;
        qualitative?: string;
        unit?: string;
        lowReference?: string;
        highReference?: string;
        abnormalFlag?: string;
    }>;
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
