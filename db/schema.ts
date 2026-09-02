import {
    index,
    int,
    sqliteTable,
    text,
} from "drizzle-orm/sqlite-core";


/**
 * Inbox of MediCloud orders received by this agent through the sync/pull flow.
 * One row tracks an order from receipt until it is submitted/completed locally
 * or forwarded to a slave agent.
 */
export const syncOrderInbox = sqliteTable(
    "syncOrderInbox",
    {
        // Internal unique ID for this inbox record.
        id: int().primaryKey({ autoIncrement: true }),

        // Unique MediCloud dispatch ID used to prevent processing the same dispatch twice. WHAT work/delivery is this?
        dispatchId: text().notNull().unique(),

        // Lease ID assigned by MediCloud for this order delivery. WHO currently has permission to process it?
        leaseId: text().notNull(),

        // Profile/configuration key associated with this order.
        profileKey: text().notNull(),

        // Driver ID responsible for processing this order.
        driverId: text().notNull(),

        // Slave agent selected to process this order, null when handled locally.
        targetSlaveId: text(),

        // Complete order payload stored as a serialized JSON string.
        payloadJson: text().notNull(),

        // Local machine order ID created after the order is submitted.
        agentOrderId: int().unique(),

        /**
         * Current processing state of the inbox order.
         *
         * Local order lifecycle:
         *   received           -> acknowledged -> processing -> completed
         *                                                  ↘ failed
         *
         * Slave-forwarded order lifecycle (master only):
         *   received           -> acknowledged -> leased_to_slave -> acknowledged_by_slave -> completed
         *                                                                               ↘ failed
         *
         * - received            : Order received and stored locally.
         * - acknowledged         : Receipt confirmed back to upstream (MediCloud or master).
         * - processing           : Submitted to local machine SDK - currently being processed.
         * - leased_to_slave      : Leased to a slave agent, awaiting slave acknowledgment.
         * - acknowledged_by_slave: Slave confirmed receipt and is now processing the order.
         * - completed            : Result delivered to upstream successfully.
         * - failed               : Processing or delivery failed permanently.
         */
        status: text().notNull().default("received"),

        // Error details from the latest failed processing attempt.
        errorText: text(),

        // Time when this agent received the order.
        receivedAt: text().notNull(),

        // Time when receipt of this order was acknowledged.
        acknowledgedAt: text(),

        // Time when the order was submitted for processing.
        submittedAt: text(),

        // Time when processing of the order was completed.
        completedAt: text(),

        // Lease ID assigned when this order is forwarded to a downstream slave.
        downstreamLeaseId: text(),

        // Expiration time of the downstream slave lease.
        downstreamLeaseExpiresAt: text(),

        // Time when this inbox record was created.
        createdAt: text().notNull(),

        // Time when this inbox record was last updated.
        updatedAt: text().notNull(),

    }, (table) => [
        // Speeds up lookup of upstream orders by status and receive time.
        index("idx_sync_inbox_upstream").on(
            table.status,
            table.receivedAt,
        ),

        // Speeds up slave lease/order lookup and lease-expiration processing.
        index("idx_sync_inbox_slave").on(
            table.targetSlaveId,
            table.status,
            table.downstreamLeaseExpiresAt,
        ),
    ]
)


/**
 * Tracks result delivery from this agent to MediCloud.
 * One row represents the delivery state and retry information
 * for one machine result.
 */
export const medicloudResultDispatch = sqliteTable(
    "medicloudResultDispatch",
    {
        // Internal unique ID for this result dispatch record.
        id: int().primaryKey({ autoIncrement: true }),

        // ID of the corresponding machine result (machine_results.id). Null for slave-forwarded results.
        agentResultId: int().unique(),

        // ID of the machine order that produced this result.
        agentOrderId: int().notNull(),

        // Original MediCloud order ID associated with this result.
        medicloudOrderId: text().notNull(),

        // MediCloud dispatch ID associated with the original order.
        medicloudDispatchId: text().notNull(),

        // Idempotency key used to prevent duplicate result delivery.
        idempotencyKey: text().notNull().unique(),

        // Complete result payload stored as a serialized JSON string.
        payloadJson: text().notNull(),

        /**
        * Current delivery state.
        * - 0 : Pending - not yet attempted.
        * - 1 : Delivered - successfully accepted by upstream.
        * - 2 : Retryable failure - upstream rejected with a transient error.
        * - 3 : Permanent failure - max retries exceeded or upstream rejected permanently.
        */
        deliveryStatus: int().notNull().default(0),

        // Time when the result was successfully sent to MediCloud.
        sentAt: text(),

        // Error details from the latest failed delivery attempt.
        errorText: text(),

        // Number of times result delivery has been retried.
        retryCount: int().notNull().default(0),

        // Time when this result dispatch record was created.
        createdAt: text().notNull(),
    }, (table) => [
        // Drives the flush query: pending/retryable rows still under the cap.
        index("idx_result_dispatch_delivery").on(
            table.deliveryStatus,
            table.retryCount,
        ),
    ]
)


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
        lastPingAt: text().notNull(),

        // Whether the slave is currently considered active/available by the master.
        isActive: int({ mode: "boolean" })
            .notNull()
            .default(true),

        // Time when this slave was first added to the registry.
        createdAt: text().notNull(),

        // Time when this slave registry record was last updated.
        updatedAt: text().notNull(),
    }
)