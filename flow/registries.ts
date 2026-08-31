import { HeartbeatWorker } from "../jobs/heartbeat.ts";
import { OrderPullWorker } from "../jobs/orderPull.ts";
import { ResultDispatcher } from "../jobs/resultDispatcher.ts";
import { env } from "../lib/env.ts";
import { SlaveRegistry } from "./master/slaveRegistry.ts";
import { getLocalMachineCapabilities, getUpstreamCapabilities } from "./sync/capabilities.ts";
import { createMedicloudSyncClient, createSlaveSyncClient, SyncClient } from "./sync/client.ts";


type AgentRegistries = {
    slaveRegistry: SlaveRegistry | null;
    syncClient: SyncClient;
    heartbeatWorker: HeartbeatWorker;
    orderPullWorker: OrderPullWorker;
    resultDispatcher: ResultDispatcher;
}


/**
 * Initializes all agent registries and background workers.
 *
 * Called once at startup. Returns the constructed instances so `main.ts`
 * can start them in the correct order and wire the SDK callback.
 */
export async function AgentRegistries(instanceId: string): Promise<AgentRegistries> {

    // SlaveRegistry is only needed on "master" to track connected slaves.
    const slaveRegistry = env.AGENT_MODE === "master" ? new SlaveRegistry() : null;

    // "slave" talks to "master"; "direct" and "master" talk to MediCloud.
    const syncClient = env.AGENT_MODE === "slave"
        ? await createSlaveSyncClient(instanceId)
        : createMedicloudSyncClient(instanceId);

    /**
     * What capabilities to report depends on the agent's mode:
     *   slave  → report only LOCAL machines to the master ("here is what I can handle")
     *   direct → report only LOCAL machines to MediCloud  ("here is what this agent can handle")
     *   master → report LOCAL + all active SLAVE machines to MediCloud ("here is everything in this lab")
     */
    const getCapabilities = env.AGENT_MODE === "master"
        ? () => getUpstreamCapabilities(slaveRegistry)
        : getLocalMachineCapabilities;

    // Periodically pings upstream with agent mode and current machine capabilities.
    const heartbeatWorker = new HeartbeatWorker(
        syncClient,
        getCapabilities,
        env.AGENT_MODE as "direct" | "master" | "slave",
        env.MEDICLOUD_PING_INTERVAL_MS,
    );

    // Polls upstream for new orders, validates them, and submits to the local machine SDK.
    const orderPullWorker = new OrderPullWorker(
        syncClient,
        getCapabilities,
        env.DEFAULT_ORDER_PULL_INTERVAL_MS,
    );

    // Delivers machine results to upstream. Receives results via onResult() callback.
    const resultDispatcher = new ResultDispatcher(syncClient);

    return {
        slaveRegistry,
        syncClient,
        heartbeatWorker,
        orderPullWorker,
        resultDispatcher,
    };
}