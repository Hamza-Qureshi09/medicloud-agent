import type { Driver, DriverTransportType } from "@/types/api"
import { formatFieldValue, formatKeyLabel } from "./utils"


export type TConfig = Record<string, unknown> | null | undefined
export interface FormattedConfigField {
    key: string
    label: string
    formattedValue: string
    rawValue: unknown
    type?: string
    hint?: string
}

export interface ParsedProfileConfig {
    interfaceType: DriverTransportType
    interfaceLabel: string
    endpointDisplay: string
    fields: FormattedConfigField[]
}

export function parseProfileConfig(
    config: TConfig,
    driver?: Driver
) {
    const safeConfig = config && typeof config === "object" ? config : {}
    const keys = Object.keys(safeConfig)

    // 1. Type resolution from backend driver metadata
    let interfaceType: DriverTransportType = driver?.transportType ?? "custom"

    // 2. Fallback heuristic only if driver transportType is omitted or 'custom'
    if (!driver?.transportType || driver.transportType === "custom") {
        const isSerial =
            "serialPort" in safeConfig ||
            "portName" in safeConfig ||
            "comPort" in safeConfig ||
            "baud" in safeConfig ||
            "baudRate" in safeConfig ||
            "parity" in safeConfig

        const isTcp = "host" in safeConfig || "port" in safeConfig || "ip" in safeConfig

        if (isSerial) interfaceType = "serial"
        else if (isTcp) interfaceType = "tcp"
    }

    const interfaceLabel =
        interfaceType === "serial"
            ? "Serial RS-232"
            : interfaceType === "tcp"
                ? "TCP/IP Network"
                : "Custom Interface"

    // 1. Endpoint display calculation driven by authoritative interfaceType
    let endpointDisplay = "Not configured"
    if (interfaceType === "tcp") {
        const host = safeConfig.host ?? safeConfig.ip ?? "0.0.0.0"
        const port = safeConfig.port ?? "7001"
        endpointDisplay = `${host}:${port}`
    } else if (interfaceType === "serial") {
        const portVal =
            safeConfig.serialPort ??
            safeConfig.portName ??
            safeConfig.comPort ??
            safeConfig.path ??
            safeConfig.device ??
            Object.entries(safeConfig).find(([k]) => k.toLowerCase().includes("port") || k.toLowerCase().includes("com"))?.[1] ??
            "COM1"

        const baud = safeConfig.baud ?? safeConfig.baudRate
        endpointDisplay = baud ? `${portVal} @ ${baud} baud` : String(portVal)
    } else if (keys.length > 0) {
        const firstKey = keys[0]
        const firstVal = safeConfig[firstKey]
        endpointDisplay = `${formatKeyLabel(firstKey)}: ${String(firstVal)}`
    }

    // Build ordered formatted fields
    const fields: FormattedConfigField[] = []
    const processedKeys = new Set<string>()

    // Using driver.configFields as primary blueprint
    if (driver?.configFields && driver.configFields?.length > 0) {
        for (const fieldDef of driver.configFields) {
            const rawVal = safeConfig[fieldDef.key]
            fields.push({
                key: fieldDef.key,
                label: fieldDef.label,
                formattedValue: formatFieldValue(rawVal, fieldDef),
                rawValue: rawVal,
                type: fieldDef.type,
                hint: fieldDef.hint,
            })
            processedKeys.add(fieldDef.key)
        }
    }

    // Add any extra keys present in profile.config
    for (const [key, rawVal] of Object.entries(safeConfig)) {
        if (processedKeys.has(key)) continue
        fields.push({
            key,
            label: formatKeyLabel(key),
            formattedValue: formatFieldValue(rawVal),
            rawValue: rawVal,
        })
    }

    return {
        interfaceType,
        interfaceLabel,
        endpointDisplay,
        fields,
    }
}