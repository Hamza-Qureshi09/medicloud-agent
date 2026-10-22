import { z } from "@zod/zod";
import { DEFAULT_AGENT_PORT } from "../lib/constants.ts";

// Validates saved slave settings and supports older files without a name.
export const SlaveConnectionSchema = z.object({
  slaveName: z.string().trim().max(100).default(""),
  masterHost: z.string().trim().min(1).regex(
    /^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])$/,
    "Enter a hostname or IP without a protocol or path",
  ),
  masterPort: z.coerce.number().int().min(1).max(65535).default(
    DEFAULT_AGENT_PORT,
  ),
  slaveId: z.string().trim().min(1),
  slaveSecret: z.string().trim().min(1),
}).strict();

// Validates a named slave connection submitted through the dashboard.
export const SlaveConnectionUpdateSchema = SlaveConnectionSchema.extend({
  slaveName: z.string().trim().min(1).max(100),
});

// Identifies the owner of retained synchronized work without keeping credentials.
export const SlaveConnectionIdentitySchema = SlaveConnectionSchema.pick({
  masterHost: true,
  masterPort: true,
  slaveId: true,
});

// Keeps explicit disconnection across restarts without restoring compiled environment credentials.
export const SlaveConnectionFileSchema = z.union([
  SlaveConnectionSchema,
  z.object({
    disconnected: z.literal(true),
    previousIdentity: SlaveConnectionIdentitySchema.nullable(),
  }).strict(),
]);

// Validates an optional name supplied when the master creates a slave slot.
export const SlaveRegistrationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
}).strict();

export type SlaveConnectionSettings = z.infer<typeof SlaveConnectionSchema>;
export type SlaveConnectionUpdate = z.infer<typeof SlaveConnectionUpdateSchema>;
export type SlaveConnectionIdentity = z.infer<
  typeof SlaveConnectionIdentitySchema
>;
