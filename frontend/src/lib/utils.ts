import type { DriverConfigField } from "@/types/api"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}



export function duration(ms: number) {
  const minutes = ms / 60_000 // 60 sec = 1 min
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`
}

/** Converts camelCase/snake_case keys to Title Case labels if driver field definition is missing */
export function formatKeyLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}


/** Formats primitive values into clean, user-friendly strings */
export function formatFieldValue(
    value: unknown,
    fieldDef?: DriverConfigField
): string {
    if (value === undefined || value === null || value === "") {
        return "N/A"
    }

    if (typeof value === "boolean") {
        return value ? "Enabled" : "Disabled"
    }

    if (fieldDef?.type === "select" && fieldDef.options) {
        const option = fieldDef.options.find((opt) => String(opt.value) === String(value))
        if (option) return option.label
    }

    return String(value)
}