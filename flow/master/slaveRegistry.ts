import { and, count, eq, getColumns, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { slaveRegistry } from "../../db/tables/slaveRegistry.ts";
import type { SyncMachineCapability } from "../../schemas/sync.ts";
import { SLAVE_ACTIVE_WINDOW_MS } from "../../lib/constants.ts";

const { secretHash: _secretHash, ...publicSlaveColumns } = getColumns(
  slaveRegistry,
);

/**
 * In-memory registry facade for slave agents.
 * All state is persisted in the `slaveRegistry` SQLite table.
 * Only instantiated on "master" mode agents.
 */

export class SlaveRegistry {
  /**
   * Registers a new slave slot with a fresh secret.
   *
   * The slave starts inactive with no heartbeat timestamp so the dashboard
   * shows "never connected". Once the slave boots with these credentials it
   * begins heartbeating and its instanceId is set.
   *
   * Returns the one-time credentials - the secret cannot be retrieved again.
   */
  async register(): Promise<{ slaveId: string; slaveSecret: string }> {
    const slaveSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const secretHash = await this.hash(slaveSecret);
    const slaveId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(slaveRegistry).values({
      slaveId,
      secretHash,
      machinesJson: JSON.stringify([]),
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });

    return { slaveId, slaveSecret };
  }

  /** Verifies a slave's credentials against the stored hash. */
  async authenticate(slaveId: string, secret: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(slaveRegistry)
      .where(eq(slaveRegistry.slaveId, slaveId))
      .limit(1);

    return Boolean(row?.secretHash) &&
      row.secretHash === await this.hash(secret);
  }

  /** Updates a slave's machine list, instance ID, and last-seen timestamp. */
  async ping(
    slaveId: string,
    machines: SyncMachineCapability[],
    instanceId: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(slaveRegistry)
      .set({
        instanceId,
        machinesJson: JSON.stringify(machines),
        lastPingAt: now,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(slaveRegistry.slaveId, slaveId));
  }

  /** Returns all slaves that have pinged within the last 2 minutes. */
  async listActive() {
    const twoMinutesAgo = new Date(Date.now() - SLAVE_ACTIVE_WINDOW_MS)
      .toISOString();
    const all = await db
      .select()
      .from(slaveRegistry)
      .where(eq(slaveRegistry.isActive, true));

    return all.filter((s) =>
      s.lastPingAt != null && s.lastPingAt > twoMinutesAgo
    );
  }

  /** Returns every registered slave regardless of activity or ping recency. */
  listAll() {
    return db
      .select(publicSlaveColumns)
      .from(slaveRegistry);
  }

  /** Returns a single slave by its unique slaveId, or undefined if not found. */
  async getBySlaveId(slaveId: string) {
    const [row] = await db
      .select(publicSlaveColumns)
      .from(slaveRegistry)
      .where(eq(slaveRegistry.slaveId, slaveId))
      .limit(1);

    return row;
  }

  /**
   * Counts the total number of machines reported by all active slaves
   * (those that have pinged in the last 2 minutes).
   */
  async countMachines(): Promise<number> {
    const twoMinutesAgo = new Date(Date.now() - SLAVE_ACTIVE_WINDOW_MS)
      .toISOString();

    const [totals] = await db
      .select({ total: count() })
      .from(sql`${slaveRegistry}, json_each(${slaveRegistry.machinesJson})`)
      .where(and(
        eq(slaveRegistry.isActive, true),
        gt(slaveRegistry.lastPingAt, twoMinutesAgo),
      ));

    return totals?.total ?? 0;
  }

  /**
   * Marks a slave as inactive.
   * Returns false when no row matches slaveId.
   */
  async markInactive(slaveId: string): Promise<boolean> {
    const updated = await db
      .update(slaveRegistry)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(slaveRegistry.slaveId, slaveId))
      .returning({ slaveId: slaveRegistry.slaveId });

    return updated.length > 0;
  }

  /**
   * Permanently removes a slave from the registry.
   * Returns false when no row matches slaveId.
   */
  async delete(slaveId: string): Promise<boolean> {
    const deleted = await db
      .delete(slaveRegistry)
      .where(eq(slaveRegistry.slaveId, slaveId))
      .returning({ slaveId: slaveRegistry.slaveId });

    return deleted.length > 0;
  }

  private async hash(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
