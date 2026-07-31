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
    "/drivers": {
        title: "Machine drivers",
        description: "Review the analyzer integrations available to this service.",
    },
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