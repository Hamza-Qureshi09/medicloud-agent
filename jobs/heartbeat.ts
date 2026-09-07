import { describeError } from "../lib/error.ts";
import type { SyncClient } from "../flow/sync/client.ts";
import type { SyncMachineCapability } from "../types.ts";


/**
 * Periodically sends a heartbeat to the upstream server (MediCloud or Master).
 *
 * Each heartbeat reports:
 *   - The agent's current mode ("direct", "master", or "slave")
 *   - All machine capabilities this agent is responsible for
 *
 * Mode behaviour:
 *   - "direct" / "master" -> reports to MediCloud.
 *   - "slave"             -> reports to master (not MediCloud).
 *
 * Failures are logged but do not stop the loop.
 */
export class HeartbeatWorker {

    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    /** Last failure printed, so a persistent outage is not logged every beat. */
    private lastError: string | null = null;

    constructor(
        private readonly syncClient: SyncClient,
        private readonly getCapabilities: () => Promise<SyncMachineCapability[]>,
        private readonly mode: "direct" | "master" | "slave",
        private readonly intervalMs: number,
    ) { }


    /**
     * Starts the heartbeat loop.
     * Sends one heartbeat immediately, then repeats every `intervalMs`.
     */
    start(): void {
        if (this.timer !== null) return;
        void this.beat(); // fire & forget pattern
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


    // sends a single heartbeat, errors are caught and logged
    private async beat(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const machines = await this.getCapabilities();
            await this.syncClient.heartbeat(this.mode, machines);
            // Count the ones actually reachable too - "4 machines" reads as
            // healthy even when every analyzer is unplugged.
            const online = machines.filter((m) => m.running && m.connected).length;
            console.log(
                `[HeartbeatWorker] OK - ${machines.length} machine(s) reported, ${online} connected`,
            );
            this.lastError = null;
        } catch (error) {
            // The same outage repeats every interval; say it once, not forever.
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
