import type { ApiErrorBody } from "@/types/api";


// dashboard header metadata
export const pageMeta: Record<string, { title: string; description: string }> = {
    "/": {
        title: "Laboratory operations",
        description: "Live analyzer activity, order flow, and turnaround performance.",
    },
    "/profiles": {
        title: "Analyzer profiles",
        description: "Configure, start, stop, and monitor connected instruments.",
    },
    "/orders": {
        title: "Test orders",
        description: "Stage worklists, track progress, and resolve failed submissions.",
    },
    "/results": {
        title: "Result audit",
        description: "Review immutable analyzer results and reported analytes.",
    },
    "/statistics": {
        title: "Turnaround intelligence",
        description: "Inspect learned test durations used for completion estimates.",
    },
    "/catalogs": {
        title: "Test catalogs",
        description: "Browse assays supported by each registered analyzer driver.",
    },
     "/control": {
        title: "Control Center",
        description: "Monitor and manage connected slave agents and their capabilities.",
    },
    "/drivers": {
        title: "Machine drivers",
        description: "Review the analyzer integrations available to this service.",
    }
   
}



// api error handler
export class ApiError extends Error {
    readonly status: number
    readonly body?: ApiErrorBody

    constructor(message: string, status: number, body?: ApiErrorBody) {
        super(message)
        this.name = "ApiError"
        this.status = status
        this.body = body
    }
}


// body stringify
export function json(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, body: JSON.stringify(body) }
}


// Extracts a clean, human-readable error message from any thrown value.
export function extractApiError(error: unknown, fallback = "The action failed."): string {

    if (error instanceof ApiError && error.body) {
        const raw = error.body.detail || error.body.error
        if (raw) return parseErrorString(raw)
    }
    if (error instanceof Error && error.message) {
        return parseErrorString(error.message)
    }

    return fallback
}

// Normalises zod-serialised multi-error strings like
function parseErrorString(raw: string): string {

    // If it looks like a structured multi-error (contains ✖ or →), flatten it
    if (/[✖×\u2716]/.test(raw) || raw.includes(" → ")) {
        const lines = raw
            .split(/\n/)
            .map((l) => l.replace(/^[✖️×\u2716\s→]+/, "").trim())
            .filter(Boolean)

        // Merge pairs: "Invalid input" + "at dataBits" → "Invalid input at dataBits"
        const merged: string[] = []
        for (let i = 0; i < lines.length; i++) {
            if (i < lines.length - 1 && lines[i + 1].startsWith("at ")) {
                merged.push(`${lines[i]} ${lines[i + 1]}`)
                i++
            } else {
                merged.push(lines[i])
            }
        }
        return merged.join("; ").trim() || raw.trim()
    }

    return raw.trim()
}