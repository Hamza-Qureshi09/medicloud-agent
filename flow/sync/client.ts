import { createMasterUrl } from "../../lib/utils.ts";
import {
  sync_acknowledge_orders,
  sync_heartbeat,
  sync_pull_orders,
  sync_report_status,
  sync_upload_results,
} from "../../lib/api.ts";
import { env } from "../../lib/env.ts";
import type {
  AckRequest,
  ResultUploadItem,
  StatusRequest,
  SyncHeartbeatPayload,
  SyncMachineCapability,
} from "../../schemas/sync.ts";
import type { SyncAuthHeaders, SyncConnection } from "../../types.ts";
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
    private readonly connectionProvider?: () => SyncConnection,
  ) {}

  /** Sends a heartbeat with current mode and machine capabilities. */
  async heartbeat(
    mode: SyncHeartbeatPayload["mode"],
    machines: SyncMachineCapability[],
  ) {
    const connection = await this.getConnection();
    return sync_heartbeat(
      connection.baseUrl,
      this.apiPrefix,
      connection.auth,
      {
        mode,
        ...(connection.slaveName ? { slaveName: connection.slaveName } : {}),
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
    const connection = await this.getConnection();
    return sync_pull_orders(
      connection.baseUrl,
      this.apiPrefix,
      connection.auth,
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
    const connection = await this.getConnection();
    return sync_acknowledge_orders(
      connection.baseUrl,
      this.apiPrefix,
      connection.auth,
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
    const connection = await this.getConnection();
    return sync_report_status(
      connection.baseUrl,
      this.apiPrefix,
      connection.auth,
      {
        updates,
      },
    );
  }

  /** Uploads a batch of finished results to the upstream host. */
  async uploadResults(batchId: string, results: ResultUploadItem[]) {
    const connection = await this.getConnection();
    return sync_upload_results(
      connection.baseUrl,
      this.apiPrefix,
      connection.auth,
      {
        batchId,
        results,
      },
    );
  }

  private async getConnection(): Promise<SyncConnection> {
    if (this.connectionProvider) return this.connectionProvider();
    return { baseUrl: this.baseUrl, auth: await this.getAuth() };
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
  options: { masterUrl?: string; connectionProvider?: () => SyncConnection } =
    {},
): SyncClient {
  return new SyncClient(
    options.masterUrl ?? createMasterUrl(env.MASTER_HOST, env.MASTER_PORT),
    env.SLAVE_ID,
    env.SLAVE_SECRET,
    instanceId,
    "slave",
    "/slave-sync",
    undefined,
    options.connectionProvider,
  );
}
