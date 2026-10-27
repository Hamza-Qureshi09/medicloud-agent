import { z } from "zod";

// Validates the single master connection created by a named slave.
export const slaveConnectionFormSchema = z.object({
    slaveName: z.string().trim().min(1, "Slave name is required").max(100),
    masterHost: z.string().trim().min(1, "Master host is required").regex(
        /^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])$/,
        "Enter a hostname or IP without a protocol or path",
    ),
    masterPort: z.coerce.number().int().min(1).max(65535),
    slaveId: z.string().trim().min(1, "Slave ID is required"),
    slaveSecret: z.string().trim().min(1, "Slave secret is required"),
});

// Validates redacted status returned by the local connection service.
export const slaveConnectionStatusSchema = z.object({
    configured: z.boolean(),
    slaveName: z.string(),
    masterHost: z.string(),
    masterPort: z.number().int(),
    slaveId: z.string(),
    hasSecret: z.boolean(),
    status: z.enum(["unconfigured", "connecting", "connected", "disconnected"]),
    lastHeartbeatAt: z.string().nullable(),
    error: z.string().nullable(),
});

// Validates the optional name entered when a master issues slave credentials.
export const slaveRegistrationFormSchema = z.object({
    name: z.string().trim().max(100, "Slave name must be at most 100 characters"),
});

export type SlaveConnectionValues = z.infer<typeof slaveConnectionFormSchema>;
export type SlaveConnectionStatus = z.infer<typeof slaveConnectionStatusSchema>;
export type SlaveRegistrationValues = z.infer<typeof slaveRegistrationFormSchema>;
