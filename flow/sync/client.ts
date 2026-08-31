import { register_slave_agent_to_master, sync_acknowledge_orders, sync_heartbeat, sync_pull_orders, sync_report_status, sync_upload_results, } from "../../lib/endpoints.ts";
import { getLocalMachineCapabilities } from "./capabilities.ts";
import { env } from "../../lib/env.ts";
import { SyncMachineCapability, SyncAuthHeaders, ResultUploadItem } from "../../types.ts";



export class SyncClient {
    constructor(
        private readonly baseUrl: string,
        private readonly clientId: string,
        private readonly secret: string,
        private readonly instanceId: string,
        private readonly headerPrefix: "agent" | "slave" = "agent",
        private readonly apiPrefix = "/api/agent-sync",
    ) { }

    // "slave"/"master"/"direct" use this to ping to their host
    heartbeat(
        mode: "direct" | "master" | "slave",
        machines: SyncMachineCapability[],
    ) {
        return sync_heartbeat(
            this.baseUrl,
            this.apiPrefix,
            this.auth,
            {
                mode,
                // protocolVersion: "1.0",
                // softwareVersion: "1.0.0",
                machines,
            },
        );
    }

    // "master"/"direct" agents pull orders from medicloud, "slave" pulls from "master" 
    // while pulling data the agent/master/slave will tell how much to pull 
    // and what data active machine profiles currently they are having
    pullOrders(
        capacity: number,
        availableProfileKeys: string[],
    ) {
        return sync_pull_orders(
            this.baseUrl,
            this.apiPrefix,
            this.auth,
            {
                capacity,
                availableProfileKeys,
            },
        );
    }

    // after data pulling from the "host", & storing data into "syncOrderInbox", send acknowledgment to the "host" with "accepted"/"rejected" orders 
    acknowledgeOrders(
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
            this.auth,
            {
                leaseId,
                accepted,
                rejected,
            },
        );
    }

    // report the "host" about the "failed" order
    reportStatus(
        updates: Array<{
            dispatchId: string;
            status: "processing" | "failed";
            message?: string;
        }>,
    ) {
        return sync_report_status(
            this.baseUrl,
            this.apiPrefix,
            this.auth,
            {
                updates,
            },
        );
    }

    // this will upload results batch to upstream (master,medicloud)
    uploadResults(
        batchId: string,
        results: ResultUploadItem[],
    ) {
        return sync_upload_results(
            this.baseUrl,
            this.apiPrefix,
            this.auth,
            {
                batchId,
                results,
            },
        );
    }




    // private helpers
    private get auth(): SyncAuthHeaders {
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


// sync slave with master
export async function createSlaveSyncClient(
    instanceId: string,
): Promise<SyncClient> {

    const masterUrl = `http://${env.MASTER_HOST}:${env.MASTER_PORT}`;
    const credentialsPath = "./data/slave-credentials.json";
    const readCreds = await Deno.readTextFile(credentialsPath).catch(() => "{}")
    const credentials = JSON.parse(readCreds) as { slaveId?: string; slaveSecret?: string };
    let slaveId = credentials.slaveId ?? "";
    let slaveSecret = credentials.slaveSecret ?? "";


    // fetch machine capabilities (how much machines currently it is handling)
    const machines = await getLocalMachineCapabilities()

    if (!slaveId || !slaveSecret) {
        // first register the "slave" agent to master 
        const data = await register_slave_agent_to_master(masterUrl, { instanceId, machines })

        slaveId = data.slaveId;
        slaveSecret = data.slaveSecret;

        await Deno.writeTextFile(
            credentialsPath,
            JSON.stringify({ slaveId, slaveSecret }),
        );
    }

    // then sync the "slave" to 'master'
    return new SyncClient(
        masterUrl,
        slaveId,
        slaveSecret,
        instanceId,
        "slave",
        "/slave-sync",
    );
}