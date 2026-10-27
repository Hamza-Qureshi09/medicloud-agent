import { z } from "zod";

const requiredText = z.string().trim().min(1, "This field is required.");
const optionalText = z.string().trim();

// Validates the managed catalog creation form.
export const createCatalogSchema = z.object({ driverId: requiredText, machine: requiredText });

// Validates the catalog display name form.
export const renameCatalogSchema = z.object({ machine: requiredText });

// Validates test fields and result analytes before catalog submission.
export const catalogTestSchema = z.object({
    code: requiredText,
    name: requiredText,
    analytes: z.array(z.object({
        code: requiredText,
        name: requiredText,
        unit: optionalText,
        category: optionalText,
        decimals: z.string().trim().refine(
            (value) =>
                value === "" || (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 8),
            "Decimals must be a whole number from 0 to 8.",
        ),
    })).min(1, "Add at least one analyte."),
    aliases: optionalText,
    deviceCode: optionalText,
    unit: optionalText,
    normalRange: optionalText,
    category: optionalText,
    slot: z.string().trim().refine(
        (value) => value === "" || (Number.isSafeInteger(Number(value)) && Number(value) > 0),
        "Slot must be a positive whole number.",
    ),
    enabled: z.boolean(),
}).superRefine((test, context) => {
    const seen = new Set<string>();
    test.analytes.forEach((analyte, index) => {
        const code = analyte.code.toLowerCase();
        if (seen.has(code)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["analytes", index, "code"],
                message: "Analyte codes must be unique within a test.",
            });
        }
        seen.add(code);
    });
});

export type CreateCatalogValues = z.infer<typeof createCatalogSchema>;
export type RenameCatalogValues = z.infer<typeof renameCatalogSchema>;
export type CatalogTestValues = z.infer<typeof catalogTestSchema>;
