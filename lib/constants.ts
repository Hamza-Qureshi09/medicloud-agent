

export const AGENT_PROTOCOL_VERSION = "1.0"
export const AGENT_SOFTWARE_VERSION = "1.0.0"


// How quickly to pull again right after a batch of orders was received.
export const ON_ORDERS_RECEIVED_DELAY_MS = 250;

// How long to wait before retrying after a pull cycle error.
export const ON_ERROR_DELAY_MS = 15_000;

// Random jitter added to each delay to prevent multiple agents hitting upstream at the same time.
export const JITTER_MS = 2_000; // 2sec delay

// Maximum number of orders this agent holds at any one time.
// Actual capacity sent to upstream is dynamic: MAX_CAPACITY - currently_in_flight_orders.
export const MAX_CAPACITY = 50;

// Statuses that count as "in-flight" - order is in agent's care, no result yet.
// Includes slave-owned statuses so master capacity accounting stays correct.
export const IN_FLIGHT_STATUSES = [
    "received",
    "acknowledged",
    "processing",
    "leased_to_slave",
    "acknowledged_by_slave",
] as const;

// How many results to upload to upstream in a single batch.
export const RESULT_UPLOAD_BATCH_SIZE = 100;

// Maximum delivery attempts before a result is permanently marked as failed.
export const RESULT_MAX_RETRY_ATTEMPTS = 20;

// How long to wait between result flush cycles.
export const RESULT_RETRY_INTERVAL_MS = 10_000;
