import { validateSlaveConnectionChange } from "./slave/runtime.ts";
import { waitForCondition } from "../lib/utils.ts";
import { ApiError } from "../lib/error.ts";
import {
  WORKER_DRAIN_POLL_INTERVAL_MS,
  WORKER_DRAIN_TIMEOUT_MS,
} from "../lib/constants.ts";
import type { SlaveConnection } from "./slave/connection.ts";
import type { AgentWorkers, SlaveWorkerControl } from "../types.ts";

function resumeAgentWorkers(
  workers: AgentWorkers,
  connection?: SlaveConnection,
): void {
  if (connection && !connection.configured) return;
  workers.heartbeatWorker.start();
  workers.orderPullWorker.start();
  workers.resultDispatcher.startRetryLoop();
}

function stopAgentWorkers(workers: AgentWorkers): void {
  workers.heartbeatWorker.stop();
  workers.orderPullWorker.stop();
  workers.resultDispatcher.stop();
}

async function pauseAgentWorkers(workers: AgentWorkers): Promise<void> {
  stopAgentWorkers(workers);
  const idle = await waitForCondition(
    () =>
      !workers.heartbeatWorker.busy && !workers.orderPullWorker.busy &&
      !workers.resultDispatcher.busy,
    WORKER_DRAIN_TIMEOUT_MS,
    WORKER_DRAIN_POLL_INTERVAL_MS,
  );
  if (!idle) {
    throw new ApiError(
      "Synchronization is still finishing. Try saving again shortly",
      409,
    );
  }
}

function createSlaveWorkerControl(
  workers: AgentWorkers,
  connection: SlaveConnection,
): SlaveWorkerControl {
  return {
    pause: () => pauseAgentWorkers(workers),
    resume: () => resumeAgentWorkers(workers, connection),
    validateChange: validateSlaveConnectionChange,
  };
}

export function startAgentWorkers(
  workers: AgentWorkers,
  connection?: SlaveConnection,
): void {
  if (connection) {
    connection.setWorkerControl(createSlaveWorkerControl(workers, connection));
  }
  resumeAgentWorkers(workers, connection);
}
