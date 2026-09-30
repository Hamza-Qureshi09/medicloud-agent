import { z } from "@zod/zod";
import { CatalogTestSchema } from "./sync.ts";
import {
  AGENT_ORDER_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  RESULT_DELIVERY_STATUSES,
} from "../lib/constants.ts";
import { PositiveIdSchema } from "./shared.ts";

// Used by local order bodies to validate optional text fields.
const optionalText = z.string().trim().min(1).optional();
// Used by local order bodies to normalize expiration timestamps.
const dateText = z.iso.datetime({ offset: true }).transform((value) =>
  new Date(value).toISOString()
);

// Validates POST /agent-orders bodies for local orders.
export const LocalOrderCreateSchema = z.strictObject({
  machineId: z.coerce.number().int().positive(),
  sampleId: z.string().trim().min(1),
  tests: z.array(z.string().trim().min(1)).optional(),
  patientId: optionalText,
  patientName: optionalText,
  sampleType: optionalText,
  rackPosition: optionalText,
  expiresAt: dateText.optional(),
});

// Validates PATCH /agent-orders/:id bodies for local order updates.
export const LocalOrderUpdateSchema = LocalOrderCreateSchema.omit({
  machineId: true,
}).partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

// Defines pagination fields shared by dashboard list queries.
export const ListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(
    DEFAULT_PAGE_SIZE,
  ),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Validates dashboard order list filters and pagination.
export const OrderListQuerySchema = ListQuerySchema.extend({
  status: z.enum(AGENT_ORDER_STATUSES).optional(),
});

// Validates dashboard result list filters and pagination.
export const ResultListQuerySchema = ListQuerySchema.extend({
  status: z.coerce.number().int().refine(
    (value) => RESULT_DELIVERY_STATUSES.includes(value),
    "Invalid delivery status",
  ).optional(),
});
// Validates order IDs in dashboard route parameters.
export const OrderIdParamSchema = z.coerce.number().int().positive();

// Validates machine profiles returned by the local SDK.
export const LocalProfileSchema = z.object({
  id: z.number().int().positive(),
  driverId: z.string(),
  name: z.string().optional(),
  enabled: z.boolean(),
}).loose();

// Validates error responses from local machine order calls.
export const ApiErrorResponseSchema = z.object({ error: z.string().optional() })
  .loose();

// Validates the local SDK GET /profiles response.
export const ProfilesResponseSchema = z.object({
  profiles: z.array(LocalProfileSchema),
}).loose();

// Validates the local SDK GET /health response.
export const MachineHealthResponseSchema = z.object({
  registered_drivers: z.array(z.looseObject({ id: z.string() })),
  running_machines: z.array(
    z.object({
      profile: z.looseObject({ id: z.number().int().positive() }),
      machine: z.object({
        id: z.string(),
        connected: z.boolean(),
        running: z.boolean(),
      }).loose(),
    }).loose(),
  ),
}).loose();

// Validates the local SDK GET /catalogs response.
export const CatalogResponseSchema = z.object({
  tests: z.array(CatalogTestSchema).optional(),
}).loose();

// Validates the local SDK POST /orders response.
export const CreatedOrderResponseSchema = z.object({
  order: z.object({ id: z.number().int().positive() }).nullable(),
}).loose();

// Validates the local SDK GET /orders/:id response.
export const MachineOrderResponseSchema = z.object({
  order: z.object({
    id: z.number().int().positive(),
    status: z.string().optional(),
  }).nullable(),
}).loose();

// Defines the order body sent to the local SDK by lib/api.ts.
export const MachineOrderInputSchema = z.object({
  machineId: PositiveIdSchema,
  sampleId: z.string().min(1),
  sampleType: z.string().optional(),
  rackPosition: z.string().optional(),
  tests: z.array(z.string()),
  patientName: z.string().optional(),
  patientId: z.string().optional(),
  dob: z.string().optional(),
  sex: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

// Defines the PATCH /orders/:id body sent to the local SDK.
export const MachineOrderPatchSchema = MachineOrderInputSchema.omit({
  machineId: true,
  createdAt: true,
}).partial();

export type LocalOrderCreate = z.infer<typeof LocalOrderCreateSchema>;
export type LocalOrderUpdate = z.infer<typeof LocalOrderUpdateSchema>;
export type LocalProfile = z.infer<typeof LocalProfileSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;
export type ResultListQuery = z.infer<typeof ResultListQuerySchema>;
export type MachineOrderInput = z.infer<typeof MachineOrderInputSchema>;
export type MachineOrderPatch = z.infer<typeof MachineOrderPatchSchema>;
export type MachineOrder = NonNullable<
  z.infer<typeof MachineOrderResponseSchema>["order"]
>;
