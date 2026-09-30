import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { RESULT_DELIVERY_STATUS } from "../../lib/constants.ts";

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
    deliveryStatus: int().notNull().default(RESULT_DELIVERY_STATUS.pending),

    // Time when the result was successfully sent to MediCloud.
    sentAt: text(),

    // Error details from the latest failed delivery attempt.
    errorText: text(),

    // Number of times result delivery has been retried.
    retryCount: int().notNull().default(0),

    // Time when this result dispatch record was created.
    createdAt: text().notNull(),
  },
  (table) => [
    // Drives the flush query: pending/retryable rows still under the cap.
    index("idx_result_dispatch_delivery").on(
      table.deliveryStatus,
      table.retryCount,
    ),
  ],
);
