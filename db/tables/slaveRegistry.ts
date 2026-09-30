import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Registry of slave agents connected/known to the master.
 * Stores each slave's identity, authentication information,
 * network information, available machines, and heartbeat state.
 */
export const slaveRegistry = sqliteTable(
  "slaveRegistry",
  {
    // Internal unique ID for this slave registry record.
    id: int().primaryKey({ autoIncrement: true }),

    // Unique identifier of the slave agent.
    slaveId: text().notNull().unique(),

    // Unique ID of the currently running slave instance.
    instanceId: text().unique(),

    // Hash of the secret used to authenticate communication with this slave.
    secretHash: text(),

    // Where the slave can be reached, recorded for operator visibility only.
    // Nullable because slaves always call the master (pull model), so the
    // master never dials back and slaves do not report an address.
    host: text(),

    // Network port on which the slave agent is listening.
    port: int(),

    // Slave's available machines/capabilities stored as serialized JSON.
    machinesJson: text().notNull(),

    // Time when the master last successfully received a heartbeat/ping from the slave.
    lastPingAt: text(),

    // Whether the slave is currently considered active/available by the master.
    isActive: int({ mode: "boolean" })
      .notNull()
      .default(true),

    // Time when this slave was first added to the registry.
    createdAt: text().notNull(),

    // Time when this slave registry record was last updated.
    updatedAt: text().notNull(),
  },
);
