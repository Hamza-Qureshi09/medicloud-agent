import { describeError } from "../lib/error.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { SyncMachineCapability } from "../schemas/sync.ts";

/**
 * Periodically sends a heartbeat to the upstream server (MediCloud or Master).
 *
 * Each heartbeat reports:
 *   - The agent's current mode ("direct", "master", or "slave")
 *   - All machine capabilities this agent is responsible for
 *
 * Mode behaviour:
 *   - "direct" / "master" → reports to MediCloud.
 *   - "slave"             → reports to master (not MediCloud).
 *
 * Failures are logged but do not stop the loop.
 */

export class HeartbeatWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastError: string | null = null; // Last failure message - prevents repeating the same error on every beat.

  constructor(
    private readonly syncClient: SyncClient,
    private readonly getCapabilities: () => Promise<SyncMachineCapability[]>,
    private readonly mode: "direct" | "master" | "slave",
    private readonly intervalMs: number,
  ) {}

  /**
   * Starts the heartbeat loop.
   * Fires one heartbeat immediately, then repeats every `intervalMs`.
   */
  start(): void {
    if (this.timer !== null) return;
    void this.beat(); // fire & forget pattern (initial call)
    this.timer = setInterval(() => void this.beat(), this.intervalMs);
  }

  /**
   * Stops the heartbeat loop.
   * Safe to call even if the worker was never started.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async beat(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const machines = await this.getCapabilities();
      await this.syncClient.heartbeat(this.mode, machines);

      // Count connected machines separately - "4 machines" reads healthy
      // even when every analyzer is unplugged.
      const online = machines.filter((m) => m.running && m.connected).length;
      console.log(
        `[HeartbeatWorker] OK - ${machines.length} machine(s) reported, ${online} connected`,
      );
      this.lastError = null;
    } catch (error) {
      // Only log when the message changes - a persistent outage generates one
      // line, not a flood every beat.
      const message = describeError(error);
      if (message !== this.lastError) {
        console.error(`[HeartbeatWorker] Failed: ${message}`);
        this.lastError = message;
      }
    } finally {
      this.running = false;
    }
  }
}
