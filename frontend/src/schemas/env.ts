import { z } from "zod";

// Validates frontend polling intervals supplied by Vite environment settings.
export const frontendEnvSchema = z.object({
    VITE_MASTER_CONNECTION_POLL_INTERVAL_MS: z.coerce.number().int().min(1000),
    VITE_LIVE_RESOURCE_POLL_INTERVAL_MS: z.coerce.number().int().min(1000),
});

export type FrontendEnv = z.infer<typeof frontendEnvSchema>;
