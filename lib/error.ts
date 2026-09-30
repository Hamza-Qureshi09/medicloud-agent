import { ApiErrorBody } from "../types.ts";

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

/**
 * Turns any thrown value into a single readable line for worker logs.
 *
 * The most common failure is "upstream is down", which arrives as a
 * `TypeError: fetch failed` wrapping an OS-level connect error. Printing
 * the full stack every 10 seconds buries everything else, so connectivity
 * problems collapse to one sentence. Everything else keeps its message.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return `HTTP ${error.status} - ${error.message}`;
  }

  if (error instanceof TypeError && error.message === "fetch failed") {
    const cause = (error as { cause?: unknown }).cause;
    const detail = cause instanceof Error ? cause.message : "";
    // Keep the URL from fetch error details when available.
    const url = detail.match(/\(([^)]+)\)/)?.[1];
    return url
      ? `cannot reach upstream at ${url} (is MediCloud running?)`
      : "cannot reach upstream (is MediCloud running?)";
  }

  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Returns true when a failure is the network's fault, not the payload's.
 *
 * Transient failures do not burn the retry budget. A lab whose link drops
 * for an hour must not lose patient results the analyzer already produced.
 *
 * Treated as transient:
 *   - No HTTP response at all (DNS, refused connection, TLS, timeout)
 *   - 408 / 429 when the server asks us to back off
 *   - Any 5xx server error
 */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.status === 0 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500
    );
  }
  // fetch() rejects with TypeError/DOMException when the request never reached a server.
  return error instanceof TypeError || error instanceof DOMException;
}
