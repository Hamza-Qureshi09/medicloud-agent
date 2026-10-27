import type { CatalogTest, MachineOrder, MachineProfile } from "@/types/api"
import type { OrderFormValues } from "@/lib/schema"

// helpers
// default form values setup
function toLocalDateTimeInputValue(date: Date): string {
    const offset = date.getTimezoneOffset() * 60_000

    return new Date(date.getTime() - offset)
        .toISOString()
        .slice(0, 16)
}

export function getOrderFormDefaults(
    profiles: MachineProfile[],
    order?: MachineOrder,
): OrderFormValues {
    const expiresAt = order
        ? new Date(order.expiresAt)
        : new Date(Date.now() + 86_400_000) // 24 hours = 1 day

    return {
        machineId: String(order?.machineId ?? profiles[0]?.id ?? ""),
        sampleId: order?.sampleId ?? "",
        tests: order?.tests?.join(", ") ?? "",
        patientId: order?.patientId ?? "",
        patientName: order?.patientName ?? "",
        sampleType: order?.sampleType ?? "",
        rackPosition: order?.rackPosition ?? "",
        expiresAt: toLocalDateTimeInputValue(expiresAt)
    }
}

export function resolveTestCode(test: CatalogTest): string | undefined {
    const code = test.code?.trim()
    return code !== undefined && code.length > 0 ? code : test.name
}

