import { HeartbeatWorker } from "../jobs/heartbeat.ts";
import { OrderPullWorker } from "../jobs/orderPull.ts";
import { ResultDispatcher } from "../jobs/resultDispatcher.ts";
import { env } from "../lib/env.ts";
import type { AgentRegistriesResult } from "../types.ts";
import { SlaveRegistry } from "./master/slaveRegistry.ts";
import {
  getLocalMachineCapabilities,
  getUpstreamCapabilities,
} from "./sync/capabilities.ts";
import {
  createMedicloudSyncClient,
  createSlaveSyncClient,
} from "./sync/client.ts";

/**
 * Constructs all agent registries and background workers.
 *
 * Called once at startup. Returns the instances so `main.ts` can start them
 * in the correct order and wire the Machine SDK callback.
 *
 * Mode behaviour:
 *   - "slave"  → talks to master, reports only local machines.
 *   - "direct" → talks to MediCloud, reports only local machines.
 *   - "master" → talks to MediCloud, reports local + all active slave machines.
 */
export function createAgentRegistries(
  instanceId: string,
): AgentRegistriesResult {
  // SlaveRegistry is only needed on "master" to track connected slaves.
  const slaveRegistry = env.AGENT_MODE === "master"
    ? new SlaveRegistry()
    : null;

  // Slaves talk to master. Direct and master agents talk to MediCloud.
  const syncClient = env.AGENT_MODE === "slave"
    ? createSlaveSyncClient(instanceId)
    : createMedicloudSyncClient(instanceId);

  // What capabilities to report depends on the agent's mode:
  //   slave / direct → only local machines
  //   master         → local machines + all active slave machines
  const getCapabilities = env.AGENT_MODE === "master"
    ? () => getUpstreamCapabilities(slaveRegistry)
    : getLocalMachineCapabilities;

  // Periodically pings upstream with agent mode and current machine list.
  const heartbeatWorker = new HeartbeatWorker(
    syncClient,
    getCapabilities,
    env.AGENT_MODE,
    env.MEDICLOUD_PING_INTERVAL_MS,
  );

  // Polls upstream for new orders, validates them, submits to the local machine SDK.
  const orderPullWorker = new OrderPullWorker(
    syncClient,
    getCapabilities,
    env.DEFAULT_ORDER_PULL_INTERVAL_MS,
  );

  // Delivers machine results upstream. Receives results via the onResult() callback.
  const resultDispatcher = new ResultDispatcher(syncClient);

  return {
    slaveRegistry,
    syncClient,
    heartbeatWorker,
    orderPullWorker,
    resultDispatcher,
  };
}
