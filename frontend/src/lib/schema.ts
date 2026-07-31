import { z } from "zod"

const optionalText = z.string().trim().optional()

// profile schema
export const profileFormSchema = z.object({
    name: optionalText,
    driverId: z.string().trim().min(1, "Choose a machine driver."),
    enabled: z.boolean(),
    config: z
        .string()
        .trim()
        .min(1, "Configuration is required.")
        .refine((value) => {
            try {
                const parsed: unknown = JSON.parse(value)
                return Boolean(
                    parsed &&
                    typeof parsed === "object" &&
                    !Array.isArray(parsed),
                )
            } catch {
                return false
            }
        }, "Enter a valid JSON object."),
})
export type ProfileFormValues = z.input<typeof profileFormSchema>

// profile payload
export function profilePayload(values: ProfileFormValues) {
    return {
        name: values.name?.trim() || undefined,
        driverId: values.driverId,
        enabled: values.enabled,
        config: JSON.parse(values.config) as Record<string, unknown>,
    }
}
export type ProfilePayload = ReturnType<typeof profilePayload>


// order schema
export const orderFormSchema = z.object({
    machineId: z.string().trim().min(1, "Choose a running analyzer."),
    sampleId: z.string().trim().min(1, "Sample ID is required."),
    tests: z
        .string()
        .trim()
        .min(1, "Enter at least one test.")
        .refine(
            (value) =>
                value
                    .split(",")
                    .map((test) => test.trim())
                    .filter(Boolean).length > 0,
            "Enter at least one valid test code.",
        ),
    patientId: optionalText,
    patientName: optionalText,
    sampleType: optionalText,
    rackPosition: optionalText,
    expiresAt: z
        .string()
        .min(1, "Expiry date and time are required.")
        .refine(
            (value) => !Number.isNaN(new Date(value).getTime()),
            "Enter a valid expiry date and time.",
        ),
})
export type OrderFormValues = z.input<typeof orderFormSchema>

// order payload
export function orderPayload(values: OrderFormValues, editing: boolean) {
    return {
        ...(!editing ? { machineId: Number(values.machineId) } : {}),
        sampleId: values.sampleId.trim(),
        tests: [
            ...new Set(
                values.tests
                    .split(",")
                    .map((test) => test.trim())
                    .filter(Boolean),
            ),
        ],
        patientId: values.patientId?.trim() || undefined,
        patientName: values.patientName?.trim() || undefined,
        sampleType: values.sampleType?.trim() || undefined,
        rackPosition: values.rackPosition?.trim() || undefined,
        expiresAt: new Date(values.expiresAt).toISOString(),
    }
}
export type OrderPayload = ReturnType<typeof orderPayload>

// type OrderFormValues = {
//     machineId: string;
//     sampleId: string;
//     tests: string;
//     expiresAt: string;
//     patientId?: string | undefined;
//     patientName?: string | undefined;
//     sampleType?: string | undefined;
//     rackPosition?: string | undefined;
// }