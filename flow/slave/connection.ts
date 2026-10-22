import {
  SlaveConnectionFileSchema,
  type SlaveConnectionIdentity,
  SlaveConnectionSchema,
  type SlaveConnectionSettings,
  type SlaveConnectionUpdate,
} from "../../schemas/slaveConnection.ts";
import { ApiError } from "../../lib/error.ts";
import { SLAVE_ACTIVE_WINDOW_MS } from "../../lib/constants.ts";
import type { SlaveWorkerControl, SyncConnection } from "../../types.ts";
import {
  createSlaveSyncConnection,
  readJsonFile,
  writeJsonFileAtomic,
} from "../../lib/utils.ts";

export class SlaveConnection {
  private settings: SlaveConnectionSettings | null = null;
  private previousIdentity: SlaveConnectionIdentity | null = null;
  private updating = false;
  private control?: SlaveWorkerControl;
  private lastHeartbeatAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly settingsFilePath: string,
    private readonly instanceId: string,
    private readonly defaultMasterPort: number,
  ) {}

  async load(fallback: unknown): Promise<void> {
    try {
      const saved = SlaveConnectionFileSchema.parse(
        await readJsonFile(this.settingsFilePath),
      );
      if ("disconnected" in saved) {
        this.previousIdentity = saved.previousIdentity;
        return;
      }
      this.settings = saved;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        this.lastError =
          "Saved master connection could not be loaded. Add the connection again or check local storage access.";
        return;
      }
      const parsed = SlaveConnectionSchema.safeParse(fallback);
      this.settings = parsed.success ? parsed.data : null;
    }
  }

  setWorkerControl(control: SlaveWorkerControl): void {
    this.control = control;
  }
  get configured(): boolean {
    return this.settings !== null;
  }

  getStatus() {
    const fresh = this.lastHeartbeatAt !== null &&
      Date.now() - Date.parse(this.lastHeartbeatAt) <= SLAVE_ACTIVE_WINDOW_MS;
    return {
      configured: this.configured,
      slaveName: this.settings?.slaveName ?? "",
      masterHost: this.settings?.masterHost ?? "",
      masterPort: this.settings?.masterPort ?? this.defaultMasterPort,
      slaveId: this.settings?.slaveId ?? "",
      hasSecret: Boolean(this.settings?.slaveSecret),
      lastHeartbeatAt: this.lastHeartbeatAt,
      status: !this.configured
        ? "unconfigured"
        : this.lastError || (this.lastHeartbeatAt && !fresh)
        ? "disconnected"
        : fresh
        ? "connected"
        : "connecting",
      error: this.lastError,
    };
  }

  getConnection(): SyncConnection {
    if (!this.settings || this.updating) {
      throw new ApiError(
        "Configure the master connection in the agent dashboard",
        503,
      );
    }
    return createSlaveSyncConnection(this.settings, this.instanceId);
  }

  recordHeartbeat(error?: unknown): void {
    if (error) {
      this.lastError =
        "Master heartbeat failed. Check the master address, credentials, and network.";
    } else {
      this.lastHeartbeatAt = new Date().toISOString();
      this.lastError = null;
    }
  }

  private async update(action: () => Promise<void>): Promise<void> {
    if (this.updating) {
      throw new ApiError("A connection update is already running", 409);
    }
    this.updating = true;
    try {
      await this.control?.pause();
      await action();
    } finally {
      this.updating = false;
      this.control?.resume();
    }
  }

  async save(
    input: SlaveConnectionUpdate,
    verify: (settings: SlaveConnectionSettings) => Promise<unknown>,
  ): Promise<void> {
    await this.update(async () => {
      if (this.configured) {
        throw new ApiError(
          "This slave already has a master. Remove that connection before adding another",
          409,
        );
      }
      const next = SlaveConnectionSchema.parse(input);
      if (this.previousIdentity) {
        await this.control?.validateChange(this.previousIdentity, next);
      }
      await verify(next);
      await writeJsonFileAtomic(this.settingsFilePath, next);
      this.settings = next;
      this.recordHeartbeat();
    });
  }

  async remove(): Promise<void> {
    await this.update(async () => {
      const previousIdentity = this.settings
        ? {
          masterHost: this.settings.masterHost,
          masterPort: this.settings.masterPort,
          slaveId: this.settings.slaveId,
        }
        : this.previousIdentity;
      await writeJsonFileAtomic(this.settingsFilePath, {
        disconnected: true,
        previousIdentity,
      });
      this.previousIdentity = previousIdentity;
      this.settings = null;
      this.lastHeartbeatAt = null;
      this.lastError = null;
    });
  }
}
