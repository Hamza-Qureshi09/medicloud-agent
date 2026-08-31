import { z } from "zod"

const optionalText = z.string().trim().optional()

export interface ProfilePayload {
    name?: string
    driverId: string
    enabled: boolean
    config: Record<string, unknown>
}
export function buildProfilePayload(
    name: string,
    driverId: string,
    enabled: boolean,
    rawValues: Record<string, string>,
    configFields: Array<{ key: string; type: string }>,
): ProfilePayload {
    const config: Record<string, unknown> = {}

    for (const field of configFields) {
        const raw = rawValues[field.key]
        if (raw === undefined || raw === "") continue

        if (field.type === "number") {
            config[field.key] = Number(raw)
        } else if (field.type === "boolean") {
            config[field.key] = raw === "true"
        } else {
            config[field.key] = raw
        }
    }

    return {
        name: name.trim() || undefined,
        driverId,
        enabled,
        config,
    }
}


// order schema
export const orderFormSchema = z.object({
    machineId: z.string().trim().min(1, "Choose a running analyzer."),
    sampleId: z.string().trim().min(1, "Sample ID is required."),
    // Fixed-panel analyzers may leave this blank. the form validates the
    // selected driver's metadata before submission.
    tests: z.string().trim(),
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
    const tests = [
        ...new Set(
            values.tests
                .split(",")
                .map((test) => test.trim())
                .filter(Boolean),
        ),
    ]
    return {
        ...(!editing ? { machineId: Number(values.machineId) } : {}),
        sampleId: values.sampleId.trim(),
        ...(tests.length > 0 ? { tests } : {}),
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

// type OrderPayload = {
//  sampleId: string;
//  tests: string[];
//  patientId: string | undefined;
//  patientName: string | undefined;
//  sampleType: string | undefined;
//  rackPosition: string | undefined;
//  expiresAt: string;
//  machineId?: number | undefined;
// }
