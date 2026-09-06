import { ApiErrorBody } from "../types.ts";

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

/**
 * Turns any thrown value into one readable line for a worker log.
 *
 * The common failure by far is "upstream is not running", which arrives as a
 * `TypeError: fetch failed` wrapping an OS-level connect error. Printing that
 * raw dumps two stack traces per cycle into the console every ten seconds and
 * buries anything that actually needs attention, so connectivity problems are
 * collapsed to a single sentence naming the host that would not answer.
 * Everything else keeps its message, and genuinely unknown values keep their
 * stack - those are the ones worth reading.
 */
export function describeError(error: unknown): string {
    if (error instanceof ApiError) {
        return `HTTP ${error.status} - ${error.message}`;
    }

    if (error instanceof TypeError && error.message === "fetch failed") {
        const cause = (error as { cause?: unknown }).cause;
        const detail = cause instanceof Error ? cause.message : "";
        // "error sending request for url (http://host/path): ..." - keep the url.
        const url = detail.match(/\(([^)]+)\)/)?.[1];
        return url
            ? `cannot reach upstream at ${url} (is MediCloud running?)`
            : "cannot reach upstream (is MediCloud running?)";
    }

    if (error instanceof Error) return error.message;
    return String(error);
}

/**
 * Whether a failure is the network's fault rather than the payload's.
 *
 * This distinction decides whether a delivery attempt burns the retry budget.
 * A result that MediCloud actively refused is worth giving up on eventually —
 * retrying a malformed payload forever helps nobody. But "could not reach the
 * server" says nothing about the result, and a lab whose link drops for ten
 * minutes must not lose patient results that the analyzer already produced.
 *
 * Treated as transient:
 *  - no HTTP response at all (DNS, refused connection, TLS, timeout)
 *  - 408 / 429 — the server asked us to come back later
 *  - any 5xx — the server is broken, not the request
 */
export function isTransientFailure(error: unknown): boolean {
    if (error instanceof ApiError) {
        return error.status === 0 ||
            error.status === 408 ||
            error.status === 429 ||
            error.status >= 500;
    }

    // fetch() rejects with a TypeError when the request never reached a server.
    return error instanceof TypeError || error instanceof DOMException;
}
