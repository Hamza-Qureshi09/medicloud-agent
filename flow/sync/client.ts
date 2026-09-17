import {
    sync_acknowledge_orders,
    sync_heartbeat,
    sync_pull_orders,
    sync_report_status,
    sync_upload_results
} from "../../lib/endpoints.ts";
import { ApiError, describeError } from "../../lib/error.ts";
import { env } from "../../lib/env.ts";
import {
    SyncMachineCapability,
    SyncAuthHeaders,
    ResultUploadItem
} from "../../types.ts";
import { AGENT_PROTOCOL_VERSION, AGENT_SOFTWARE_VERSION } from "../../lib/constants.ts";

export class SyncClient {
    constructor(
        private readonly baseUrl: string,
        private readonly clientId: string,
        private readonly secret: string,
        private readonly instanceId: string,
        private readonly headerPrefix: "agent" | "slave" = "agent",
        private readonly apiPrefix = "/api/agent-sync",
        private readonly authProvider?: () => Promise<SyncAuthHeaders>,
    ) { }

    // "slave"/"master"/"direct" use this to ping to their upstream host
    async heartbeat(
        mode: "direct" | "master" | "slave",
        machines: SyncMachineCapability[],
    ) {
        return sync_heartbeat(
            this.baseUrl,
            this.apiPrefix,
            await this.getAuth(),
            {
                mode,
                protocolVersion: AGENT_PROTOCOL_VERSION,
                softwareVersion: AGENT_SOFTWARE_VERSION,
                machines,
            },
        );
    }


    // "master"/"direct" agents pull orders from medicloud, "slave" pulls from "master" 
    // while pulling data the agent/master/slave will tell how much to pull 
    // and also tells what data of active machine profiles currently they are having
    async pullOrders(
        capacity: number,
        availableProfileKeys: string[],
    ) {
        return sync_pull_orders(
            this.baseUrl,
            this.apiPrefix,
            await this.getAuth(),
            {
                capacity,
                availableProfileKeys,
            },
        );
    }


    // after data pulling from the "host", & storing data into "syncOrderInbox", send acknowledgment to the "host" with "accepted"/"rejected" orders 
    async acknowledgeOrders(
        leaseId: string,
        accepted: Array<{
            dispatchId: string;
            localOrderId?: number;
        }>,
        rejected: Array<{
            dispatchId: string;
            code: string;
            message?: string;
        }>,
    ) {
        return sync_acknowledge_orders(
            this.baseUrl,
            this.apiPrefix,
            await this.getAuth(),
            {
                leaseId,
                accepted,
                rejected,
            },
        );
    }


    // report the "host" about the "failed"/"processing" orders
    async reportStatus(
        updates: Array<{
            dispatchId: string;
            status: "processing" | "failed";
            message?: string;
        }>,
    ) {
        return sync_report_status(
            this.baseUrl,
            this.apiPrefix,
            await this.getAuth(),
            {
                updates,
            },
        );
    }


    // this will upload results batch to upstream (master,medicloud)
    async uploadResults(
        batchId: string,
        results: ResultUploadItem[],
    ) {
        return sync_upload_results(
            this.baseUrl,
            this.apiPrefix,
            await this.getAuth(),
            {
                batchId,
                results,
            },
        );
    }


    // private helpers
    private async getAuth(): Promise<SyncAuthHeaders> {
        // if in "slave" mode, the authProvider will be set to a function that returns the slave credentials
        if (this.authProvider) return await this.authProvider();

        // otherwise, return the agent credentials in "mater"/"direct" mode
        return {
            clientId: this.clientId,
            secret: this.secret,
            instanceId: this.instanceId,
            headerPrefix: this.headerPrefix,
        };
    }
}


// sync master/direct agent with medicloud
export function createMedicloudSyncClient(instanceId: string): SyncClient {
    return new SyncClient(
        env.MEDICLOUD_API_URL,
        env.MEDICLOUD_AGENT_ID,
        env.MEDICLOUD_AGENT_SECRET,
        instanceId,
    );
}


/**
 * Construct without network I/O. Workers first use this client after the local
 * HTTP server is listening, so capability discovery cannot call an unstarted
 * server. Concurrent workers share registration; failures retry next cycle.
 */
export function createSlaveSyncClient(
    instanceId: string,
    options: {
        masterUrl?: string;
    } = {},
): SyncClient {
    const masterUrl = options.masterUrl ?? `http://${env.MASTER_HOST}:${env.MASTER_PORT}`;
    let pending: Promise<SyncAuthHeaders> | undefined;

    const initialize = async (): Promise<SyncAuthHeaders> => {
        const slaveId = env.SLAVE_ID;
        const slaveSecret = env.SLAVE_SECRET;

        if (!slaveId || !slaveSecret) {
            throw new Error("SLAVE_ID and SLAVE_SECRET environment variables are required in slave mode.");
        }

        return { clientId: slaveId, secret: slaveSecret, instanceId, headerPrefix: "slave" };
    };

    return new SyncClient(masterUrl, "", "", instanceId, "slave", "/slave-sync", () => {
        if (!pending) {
            pending = initialize().catch((error) => {
                pending = undefined;
                // Failure to configure says nothing about queued patient results.
                throw new ApiError(`Slave configuration missing: ${describeError(error)}`, 503);
            });
        }
        return pending;
    });
}
