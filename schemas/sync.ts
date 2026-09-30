import { z } from "@zod/zod";
import {
  NonEmptyIdSchema as id,
  NonNegativeDelaySchema as nonNegativeDelay,
  PositiveIdSchema as positiveId,
} from "./shared.ts";
import { MAX_CAPACITY, MAX_PAGE_SIZE } from "../lib/constants.ts";

// Validates analytes in machine catalogs shared with upstream.
export const CatalogAnalyteSchema = z.object({
  code: id,
  name: z.string(),
  unit: z.string().optional(),
}).loose();

// Validates tests in machine catalogs shared with upstream.
export const CatalogTestSchema = z.object({
  code: id,
  name: z.string(),
  analytes: z.array(CatalogAnalyteSchema).optional(),
}).loose();

// Validates machine capabilities in heartbeat data.
export const MachineCapabilitySchema = z.object({
  profileKey: id,
  localProfileId: positiveId,
  driverId: id,
  name: z.string(),
  running: z.boolean(),
  connected: z.boolean(),
  isSlaveOwned: z.boolean(),
  slaveId: id.optional(),
  catalogTests: z.array(id),
  catalog: z.array(z.object({
    testCode: id,
    testName: z.string().optional(),
    analytes: z.array(CatalogAnalyteSchema),
  })).optional(),
}).loose();

// Validates orders received from upstream or stored in the inbox.
export const PulledOrderSchema = z.object({
  dispatchId: id,
  orderId: id,
  profileKey: id,
  targetSlaveId: id.optional(),
  driverId: id,
  sampleId: id,
  patient: z.object({
    id: z.string().optional(),
    name: z.string(),
    dob: z.string().optional(),
    sex: z.string().optional(),
  }),
  tests: z.array(id),
  payloadVersion: z.number().int().positive(),
  sampleType: z.string().optional(),
  rackPosition: z.string().optional(),
}).loose();

// Validates the upstream orders/pull response.
export const PullResponseSchema = z.object({
  leaseId: id.nullable(),
  leaseExpiresAt: z.string().nullable(),
  pullAfterMs: nonNegativeDelay,
  orders: z.array(PulledOrderSchema),
}).loose();

// Validates analytes included in result uploads.
export const UploadAnalyteSchema = z.object({
  assayNo: id,
  assayName: z.string().optional(),
  resultType: z.string().optional(),
  value: z.string().optional(),
  qualitative: z.string().optional(),
  unit: z.string().optional(),
  lowReference: z.string().optional(),
  highReference: z.string().optional(),
  abnormalFlag: z.string().optional(),
  status: z.string().optional(),
  completedAt: z.string().optional(),
});

// Validates one result sent upstream or stored in the outbox.
export const ResultUploadItemSchema = z.object({
  idempotencyKey: id,
  dispatchId: id,
  localOrderId: positiveId,
  localResultId: positiveId,
  sampleId: id,
  receivedAt: id,
  analytes: z.array(UploadAnalyteSchema),
});

// Validates the upstream results upload response.
export const ResultUploadResponseSchema = z.object({
  accepted: z.array(id),
  duplicates: z.array(id),
  rejected: z.array(z.object({
    idempotencyKey: id,
    code: id,
    retryable: z.boolean(),
    message: z.string(),
  })),
}).loose();

// Validates timing hints returned by the upstream heartbeat.
export const HeartbeatResponseSchema = z.object({
  serverTime: z.string(),
  heartbeatAfterMs: nonNegativeDelay,
  pullAfterMs: nonNegativeDelay,
  maxOrderBatchSize: z.number().int().nonnegative(),
  maxResultBatchSize: z.number().int().nonnegative(),
}).loose();

// Validates the upstream orders/ack response.
export const AckResponseSchema = z.object({
  acknowledged: z.array(id),
  conflicts: z.array(id),
}).loose();

// Validates the upstream orders/status response.
export const StatusResponseSchema = z.object({
  updated: z.array(id),
}).loose();

// Validates heartbeat bodies received by slave sync routes.
export const HeartbeatRequestSchema = z.object({
  mode: z.enum(["direct", "master", "slave"]).optional(),
  protocolVersion: id.optional(),
  softwareVersion: z.string().optional(),
  machines: z.array(MachineCapabilitySchema).default([]),
});
// Defines heartbeat payloads sent by the sync client.
export const SyncHeartbeatPayloadSchema = HeartbeatRequestSchema.required({
  mode: true,
  protocolVersion: true,
});

// Validates orders/pull bodies received by slave sync routes.
export const PullRequestSchema = z.object({
  capacity: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(
    MAX_CAPACITY,
  ),
  availableProfileKeys: z.array(id).optional(),
});
// Defines orders/pull payloads sent by the sync client.
export const SyncPullPayloadSchema = PullRequestSchema.required({
  availableProfileKeys: true,
});

// Validates orders/ack bodies received or sent by the agent.
export const AckRequestSchema = z.object({
  leaseId: id,
  accepted: z.array(
    z.object({ dispatchId: id, localOrderId: positiveId.optional() }),
  ).default([]),
  rejected: z.array(
    z.object({ dispatchId: id, code: id, message: z.string().optional() }),
  ).default([]),
});

// Validates orders/status bodies received or sent by the agent.
export const StatusRequestSchema = z.object({
  updates: z.array(z.object({
    dispatchId: id,
    status: z.enum(["processing", "failed"]),
    message: z.string().optional(),
  })).default([]),
});

// Validates result bodies received by slave sync routes.
export const ResultRequestSchema = z.object({
  batchId: id.optional(),
  results: z.array(ResultUploadItemSchema).default([]),
});
// Defines result upload payloads sent by the sync client.
export const SyncResultPayloadSchema = ResultRequestSchema.required({
  batchId: true,
});

export type CatalogAnalyte = z.infer<typeof CatalogAnalyteSchema>;
export type CatalogTest = z.infer<typeof CatalogTestSchema>;
export type SyncMachineCapability = z.infer<typeof MachineCapabilitySchema>;
export type PulledOrder = z.infer<typeof PulledOrderSchema>;
export type PullResponse = z.infer<typeof PullResponseSchema>;
export type UploadAnalyte = z.infer<typeof UploadAnalyteSchema>;
export type ResultUploadItem = z.infer<typeof ResultUploadItemSchema>;
export type ResultUploadResponse = z.infer<typeof ResultUploadResponseSchema>;
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;
export type PullRequest = z.infer<typeof PullRequestSchema>;
export type AckRequest = z.infer<typeof AckRequestSchema>;
export type StatusRequest = z.infer<typeof StatusRequestSchema>;
export type ResultRequest = z.infer<typeof ResultRequestSchema>;
export type SyncHeartbeatPayload = z.infer<typeof SyncHeartbeatPayloadSchema>;
export type SyncPullPayload = z.infer<typeof SyncPullPayloadSchema>;
export type SyncResultPayload = z.infer<typeof SyncResultPayloadSchema>;
