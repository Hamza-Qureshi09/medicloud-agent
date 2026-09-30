import {
  sync_acknowledge_orders,
  sync_heartbeat,
  sync_pull_orders,
  sync_report_status,
  sync_upload_results,
} from "../../lib/api.ts";
import { ApiError, describeError } from "../../lib/error.ts";
import { env } from "../../lib/env.ts";
import type {
  AckRequest,
  ResultUploadItem,
  StatusRequest,
  SyncHeartbeatPayload,
  SyncMachineCapability,
} from "../../schemas/sync.ts";
import type { SyncAuthHeaders } from "../../types.ts";
import {
  AGENT_PROTOCOL_VERSION,
  AGENT_SOFTWARE_VERSION,
} from "../../lib/constants.ts";

/**
 * Thin wrapper around the authenticated sync HTTP endpoints.
 * Used by all agent modes ("direct", "master", "slave") to talk to their upstream host.
 */
export class SyncClient {
  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly secret: string,
    private readonly instanceId: string,
    private readonly headerPrefix: "agent" | "slave" = "agent",
    private readonly apiPrefix = "/api/agent-sync",
    private readonly authProvider?: () => Promise<SyncAuthHeaders>,
  ) {}

  /** Sends a heartbeat with current mode and machine capabilities. */
  async heartbeat(
    mode: SyncHeartbeatPayload["mode"],
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

  /**
   * Requests a batch of orders from the upstream host.
   * Master and direct agents pull from MediCloud. Slaves pull from the master.
   */
  async pullOrders(capacity: number, availableProfileKeys: string[]) {
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

  /**
   * Acknowledges a pulled batch - confirms which orders were accepted or rejected.
   */
  async acknowledgeOrders(
    leaseId: string,
    accepted: AckRequest["accepted"],
    rejected: AckRequest["rejected"],
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

  /** Reports processing status ("processing" | "failed") for specific dispatches. */
  async reportStatus(
    updates: StatusRequest["updates"],
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

  /** Uploads a batch of finished results to the upstream host. */
  async uploadResults(batchId: string, results: ResultUploadItem[]) {
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

/** Creates a SyncClient that talks directly to MediCloud. Used in "direct" and "master" modes. */
export function createMedicloudSyncClient(instanceId: string): SyncClient {
  return new SyncClient(
    env.MEDICLOUD_API_URL,
    env.MEDICLOUD_AGENT_ID,
    env.MEDICLOUD_AGENT_SECRET,
    instanceId,
  );
}

/**
 * Creates a SyncClient that talks to the master agent. Used in "slave" mode.
 *
 * Constructed without network I/O. Workers use this after the local HTTP server
 * is already listening. Concurrent workers share credentials, failures retry next cycle.
 */
export function createSlaveSyncClient(
  instanceId: string,
  options: { masterUrl?: string } = {},
): SyncClient {
  const masterUrl = options.masterUrl ??
    `http://${env.MASTER_HOST}:${env.MASTER_PORT}`;

  let pending: Promise<SyncAuthHeaders> | undefined;

  const initialize = (): SyncAuthHeaders => {
    const slaveId = env.SLAVE_ID;
    const slaveSecret = env.SLAVE_SECRET;

    if (!slaveId || !slaveSecret) {
      throw new Error(
        "SLAVE_ID and SLAVE_SECRET environment variables are required in slave mode.",
      );
    }

    return {
      clientId: slaveId,
      secret: slaveSecret,
      instanceId,
      headerPrefix: "slave",
    };
  };

  return new SyncClient(
    masterUrl,
    "",
    "",
    instanceId,
    "slave",
    "/slave-sync",
    () => {
      if (!pending) {
        pending = Promise.resolve().then(initialize).catch((error) => {
          pending = undefined;
          throw new ApiError(
            `Slave configuration missing: ${describeError(error)}`,
            503,
          );
        });
      }
      return pending;
    },
  );
}
