import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { slaveRegistry } from "../../db/schema.ts";
import type { SyncMachineCapability } from "../../types.ts";


export class SlaveRegistry {

    // when "slave" agent registers itself to the "master"
    async register(
        instanceId: string,
        machines: SyncMachineCapability[],
    ): Promise<{ slaveId: string; slaveSecret: string }> {

        const slaveSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
        const secretHash = await this.hash(slaveSecret);
        const now = new Date().toISOString();

        // if this slave instance already has a record, refresh its credentials and machines
        const existing = await db.select().from(slaveRegistry)
            .where(eq(slaveRegistry.instanceId, instanceId));

        if (existing.length > 0) {
            await db.update(slaveRegistry).set({
                secretHash,
                machinesJson: JSON.stringify(machines),
                lastPingAt: now,
                isActive: true,
                updatedAt: now,
            }).where(eq(slaveRegistry.id, existing[0].id));

            return { slaveId: existing[0].slaveId, slaveSecret };
        }

        // new slave - create a fresh registry record
        const slaveId = crypto.randomUUID();
        await db.insert(slaveRegistry).values({
            slaveId,
            instanceId,
            secretHash,
            machinesJson: JSON.stringify(machines),
            lastPingAt: now,
            createdAt: now,
            updatedAt: now,
        });
        return { slaveId, slaveSecret };
    }


    /**
     * Pre-register a slave from the master UI.
     *
     * Unlike `register()` (called by the slave itself), this creates a slot
     * that has never actually connected. The slave is marked inactive with
     * no heartbeat timestamp so the UI shows "never connected" — exactly
     */
    async preRegister(
        instanceId: string,
    ): Promise<{ slaveId: string; slaveSecret: string }> {

        const slaveSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
        const secretHash = await this.hash(slaveSecret);
        const now = new Date().toISOString();

        // If this instanceId already exists, refresh credentials only.
        const existing = await db.select().from(slaveRegistry)
            .where(eq(slaveRegistry.instanceId, instanceId));

        if (existing.length > 0) {
            await db.update(slaveRegistry).set({
                secretHash,
                updatedAt: now,
            }).where(eq(slaveRegistry.id, existing[0].id));

            return { slaveId: existing[0].slaveId, slaveSecret };
        }

        // New slave — inactive with epoch lastPingAt so it reads as "never connected".
        const slaveId = crypto.randomUUID();
        const epoch = new Date(0).toISOString();

        await db.insert(slaveRegistry).values({
            slaveId,
            instanceId,
            secretHash,
            machinesJson: JSON.stringify([]),
            lastPingAt: epoch,
            isActive: false,
            createdAt: now,
            updatedAt: now,
        });

        return { slaveId, slaveSecret };
    }

    /** Verifies a slave's slaveId + secret against the stored hash. */
    async authenticate(slaveId: string, secret: string): Promise<boolean> {
        const rows = await db.select().from(slaveRegistry)
            .where(eq(slaveRegistry.slaveId, slaveId));

        return rows.length === 1 &&
            Boolean(rows[0].secretHash) &&
            rows[0].secretHash === await this.hash(secret);
    }


    /** Updates a slave's machine list and last-seen timestamp. */
    async ping(slaveId: string, machines: SyncMachineCapability[]): Promise<void> {
        const now = new Date().toISOString();
        await db.update(slaveRegistry)
            .set({
                machinesJson: JSON.stringify(machines),
                lastPingAt: now,
                isActive: true,
                updatedAt: now,
            })
            .where(eq(slaveRegistry.slaveId, slaveId));
    }

    /** Returns all slaves that have pinged within the last 2 minutes. */
    async listActive() {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1_000).toISOString();
        const all = await db.select().from(slaveRegistry)
            .where(eq(slaveRegistry.isActive, true));
        return all.filter((s) => s.lastPingAt > twoMinutesAgo);
    }

    /** Returns every registered slave regardless of activity or ping recency. */
    async listAll() {
        return db.select({
            id: slaveRegistry.id,
            slaveId: slaveRegistry.slaveId,
            instanceId: slaveRegistry.instanceId,
            host: slaveRegistry.host,
            port: slaveRegistry.port,
            machinesJson: slaveRegistry.machinesJson,
            lastPingAt: slaveRegistry.lastPingAt,
            isActive: slaveRegistry.isActive,
            createdAt: slaveRegistry.createdAt,
            updatedAt: slaveRegistry.updatedAt,
        }).from(slaveRegistry);
    }
    
    async countMachines(): Promise<number> {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1_000).toISOString();

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
     * Marks a slave as inactive (e.g. after a failed heartbeat or explicit
     * disconnect).
     *
     * Returns false when no row matches `slaveId`, so callers can tell an
     * unknown slave apart from one that was actually updated.
     */
    async markInactive(slaveId: string): Promise<boolean> {
        const updated = await db.update(slaveRegistry)
            .set({ isActive: false, updatedAt: new Date().toISOString() })
            .where(eq(slaveRegistry.slaveId, slaveId))
            .returning({ slaveId: slaveRegistry.slaveId });

        return updated.length > 0;
    }

    /**
     * Permanently removes a slave from the registry.
     *
     * Returns false when no row matches `slaveId`.
     */
    async delete(slaveId: string): Promise<boolean> {
        const deleted = await db.delete(slaveRegistry)
            .where(eq(slaveRegistry.slaveId, slaveId))
            .returning({ slaveId: slaveRegistry.slaveId });

        return deleted.length > 0;
    }

    // private helpers
    private async hash(value: string): Promise<string> {
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(value),
        );
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }
}