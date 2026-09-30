import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

    // Upstream dispatch identifier, unique to prevent processing a delivery twice.
    dispatchId: text().notNull().unique(),
    // Origin of this order, upstream is the default for existing rows.
    source: text().notNull().default("upstream"),

    // Upstream lease authorizing this agent to process the dispatch.
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
  },
  (table) => [
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
  ],
);
