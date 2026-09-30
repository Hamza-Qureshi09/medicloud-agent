import { z } from "@zod/zod";

// Used by sync schemas to validate nonempty identifiers.
export const NonEmptyIdSchema = z.string().trim().min(1);
// Used by sync and machine order schemas to validate numeric IDs.
export const PositiveIdSchema = z.number().int().positive();
// Used by sync responses to validate retry delays.
export const NonNegativeDelaySchema = z.number().int().nonnegative();
