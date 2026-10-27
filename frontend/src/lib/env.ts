import { frontendEnvSchema } from "@/schemas/env";

export const env = frontendEnvSchema.parse(import.meta.env);
