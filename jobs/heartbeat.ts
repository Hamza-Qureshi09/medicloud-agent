import { describeError } from "../lib/error.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { SyncMachineCapability } from "../schemas/sync.ts";
import {
  HEARTBEAT_MAX_BACKOFF_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
  JITTER_MS,
} from "../lib/constants.ts";

export class HeartbeatWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = true;
  private failures = 0;
  private lastError: string | null = null;

  constructor(
    private readonly syncClient: SyncClient,
    private readonly getCapabilities: () => Promise<SyncMachineCapability[]>,
    private readonly mode: "direct" | "master" | "slave",
    private readonly intervalMs: number,
    private readonly onHeartbeat?: (error?: unknown) => void,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.failures = 0;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  get busy(): boolean {
    return this.running;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.beat();
    }, delayMs);
  }

  private async beat(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    let delay = this.intervalMs;
    try {
      const machines = await this.getCapabilities();
      const response = await this.syncClient.heartbeat(this.mode, machines);
      delay = Math.max(HEARTBEAT_MIN_INTERVAL_MS, response.heartbeatAfterMs);
      this.failures = 0;
      this.lastError = null;
      this.onHeartbeat?.();
      console.log(
        `[HeartbeatWorker] OK - ${machines.length} machines reported, ${
          machines.filter((machine) => machine.running && machine.connected)
            .length
        } connected`,
      );
    } catch (error) {
      this.failures++;
      delay = Math.min(
        HEARTBEAT_MAX_BACKOFF_MS,
        Math.max(HEARTBEAT_MIN_INTERVAL_MS, this.intervalMs) *
          2 ** Math.min(this.failures, 8),
      );
      this.onHeartbeat?.(error);
      const message = describeError(error);
      if (message !== this.lastError) {
        console.error(`[HeartbeatWorker] Failed: ${message}`);
      }
      this.lastError = message;
    } finally {
      this.running = false;
      this.schedule(delay + Math.floor(Math.random() * JITTER_MS));
    }
  }
}
