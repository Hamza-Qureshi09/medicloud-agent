import type { ApiErrorBody, SlaveLiveness, SlaveRecord } from "@/types/api";
import { SLAVE_ONLINE_WINDOW_MS } from "./global";

/** How fresh a heartbeat must be for a slave to count as online. */


export function slaveLiveness(slave: SlaveRecord): SlaveLiveness {
    const lastSeen = slave.lastPingAt ? new Date(slave.lastPingAt) : undefined;

    // No heartbeat, or epoch placeholder from preRegister → never connected.
    if (!lastSeen || Number.isNaN(lastSeen.getTime()) || lastSeen.getTime() === 0) {
        return "never";
    }

    return slave.isActive && Date.now() - lastSeen.getTime() < SLAVE_ONLINE_WINDOW_MS
        ? "online"
        : "stale";
}

// api error handler
export class ApiError extends Error {
    readonly status: number;
    readonly body?: ApiErrorBody;

    constructor(message: string, status: number, body?: ApiErrorBody) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

// body stringify
export function json(method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit {
    return { method, body: JSON.stringify(body) };
}

// Extracts a clean, human-readable error message from any thrown value.
export function extractApiError(
    error: unknown,
    fallback = "The action failed.",
): string {
    if (error instanceof ApiError && error.body) {
        const raw = error.body.detail || error.body.error;
        if (raw) return parseErrorString(raw);
    }
    if (
        error && typeof error === "object" &&
        "detail" in error
    ) {
        const raw = error.detail as unknown as string;
        if (raw) return parseErrorString(raw);
    }
    if (error instanceof Error && error.message) {
        return parseErrorString(error.message);
    }

    return fallback;
}

// Normalises zod-serialised multi-error strings like
function parseErrorString(raw: string): string {
    // If it looks like a structured multi-error (contains ✖ or →), flatten it
    if (/[✖×\u2716]/.test(raw) || raw.includes(" → ")) {
        const lines = raw
            .split(/\n/)
            .map((l) => l.replace(/^[✖️×\u2716\s→]+/, "").trim())
            .filter(Boolean);

        // Merge pairs: "Invalid input" + "at dataBits" → "Invalid input at dataBits"
        const merged: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (i < lines.length - 1 && lines[i + 1].startsWith("at ")) {
                merged.push(`${lines[i]} ${lines[i + 1]}`);
                i++;
            } else {
                merged.push(lines[i]);
            }
        }
        return merged.join("; ").trim() || raw.trim();
    }

    return raw.trim();
}
