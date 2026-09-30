import { assert, assertEquals } from "@std/assert";
import { MAX_CAPACITY, MAX_PAGE_SIZE } from "../lib/constants.ts";
import { toUploadAnalyte } from "../lib/utils.ts";
import {
  LocalOrderCreateSchema,
  MachineHealthResponseSchema,
  OrderListQuerySchema,
  ResultListQuerySchema,
} from "../schemas/local.ts";
import {
  AckRequestSchema,
  HeartbeatRequestSchema,
  PullRequestSchema,
  ResultUploadItemSchema,
} from "../schemas/sync.ts";

Deno.test("slave requests share the sync schemas", () => {
  assertEquals(HeartbeatRequestSchema.parse({}).machines, []);
  assertEquals(PullRequestSchema.parse({}).capacity, MAX_CAPACITY);
  assert(!PullRequestSchema.safeParse({ capacity: MAX_PAGE_SIZE + 1 }).success);
  assertEquals(AckRequestSchema.parse({ leaseId: "lease" }).accepted, []);
});

Deno.test("dashboard status filters reject invalid values", () => {
  assertEquals(
    OrderListQuerySchema.parse({ status: "processing" }).status,
    "processing",
  );
  assert(!OrderListQuerySchema.safeParse({ status: "unknown" }).success);
  assertEquals(ResultListQuerySchema.parse({ status: "0" }).status, 0);
  assert(!ResultListQuerySchema.safeParse({ status: "4" }).success);
});

Deno.test("strict requests and loose SDK responses keep their behavior", () => {
  assert(
    !LocalOrderCreateSchema.safeParse({
      machineId: 1,
      sampleId: "sample",
      unexpected: true,
    }).success,
  );

  const health = MachineHealthResponseSchema.parse({
    registered_drivers: [{ id: "driver", description: "kept" }],
    running_machines: [],
  });
  assertEquals(health.registered_drivers[0].description, "kept");
});

Deno.test("SDK analytes are projected to the validated upload shape", () => {
  const analyte = toUploadAnalyte({ assayNo: 123, value: 4.2, unit: null });
  assertEquals(analyte, { assayNo: "123", value: "4.2" });
  const result = ResultUploadItemSchema.safeParse({
    idempotencyKey: "key",
    dispatchId: "dispatch",
    localOrderId: 1,
    localResultId: 2,
    sampleId: "sample",
    receivedAt: new Date().toISOString(),
    analytes: [analyte],
  });
  assert(result.success);
});
