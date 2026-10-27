import type { ApiErrorBody } from "@/types/api"
import { ApiError } from "./helpers"
import { createApiUrl } from "./utils.ts"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""

type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>

// fetch request executor
export async function request<T>(
    path: string,
    {
        query,
        ...init
    }: RequestInit & { query?: Query } = {}
): Promise<T> {
    const url = createApiUrl(path, API_BASE_URL, window.location.origin)

    if (query) {
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, String(value))
            }
        })
    }

    const response = await fetch(url, {
        ...init,
        headers: {
            accept: "application/json",
            ...(init?.body ? { "content-type": "application/json" } : {}),
            ...init?.headers,
        },
    })

    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody

        throw new ApiError(
            body.detail || body.error || `Request failed with status ${response.status}`,
            response.status,
            body,
        )
    }

    // 204 No Content
    if (response.status === 204) return undefined as T

    // header validation
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) {
        throw new ApiError(
            "The API returned a non-JSON response. Check VITE_API_BASE_URL.",
            response.status,
        )
    }

    // response
    return response.json() as Promise<T>
}
