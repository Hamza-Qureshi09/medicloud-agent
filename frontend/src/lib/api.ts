import type {AgentHealthyResponse, ApiErrorBody, CatalogDetail, SlaveRecord, CatalogSummary, Driver, ExternalOrder, ExternalResult, HealthResponse, MachineOrder, MachineProfile, MachineResult, OrderStatus, TestStatistic, TProfileQuery } from "@/types/api"
import { ApiError, json } from "./helpers"
import type { OrderPayload, ProfilePayload } from "./schema"

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "")

type QueryValue = string | number | boolean | null | undefined
type Query = Record<string, QueryValue>

// order query
export interface OrderQuery extends Query {
    machineId?: number
    sampleId?: string
    status?: OrderStatus
    limit?: number
    offset?: number
}
export interface ResultQuery extends Query {
    orderId?: number
    machineId?: number
    sampleId?: string
    limit?: number
    offset?: number
}
export interface ExternalQuery extends Query {
    search?: string
    status?: string | number
    limit?: number
    offset?: number
}
export interface StatisticQuery extends Query {
    machineId?: number
    testId?: string
    limit?: number
    offset?: number
}


// api registry for all requests
export const api = {
     agent: {
        healthyKey: "agent.healthy",
        healthy: () => request<AgentHealthyResponse>("/healthy"),
        
        slavesKey: "agent.slaves",
        slaves: () => request<{ slaves: SlaveRecord[] }>("/slaves"),
        markInactive: (slaveId: string) => request<{ success: boolean }>(`/slaves/${slaveId}/inactive`, { method: "POST" }),
    },

    health: {
        detailKey: "health",
        get: () => request<HealthResponse>("/health"),
    },

    drivers: {
        listKey: (query: { id?: string; brand?: string } = {}) => ["drivers", query] as const,
        list: (query: { id?: string; brand?: string } = {}) => request<{ drivers: Driver[] }>("/drivers", { query })
    },

    catalogs: {
        listKey: "catalogs.list",
        list: () => request<{ catalogs: CatalogSummary[] }>("/catalogs"),

        detailKey: (driverId: string) => ["catalogs.detail", driverId] as const,
        get: (query: { driver: string }) => request<CatalogDetail>("/catalogs", { query })
    },

    profiles: {
        listKey: (query?: TProfileQuery) => ["profiles.list", query] as const,
        list: (query?: TProfileQuery) => request<{ profiles: MachineProfile[] }>("/profiles", { query }),

        countKey: "profiles.count",
        count: () => request<{ count: number }>("/profiles/count"),

        detailKey: (machineId: number) => ["profiles.detail", machineId] as const,
        get: (machineId: number) => request<{ profile: MachineProfile }>(`/profiles/${machineId}`),

        create: (input: ProfilePayload) =>
            request<{ profile: MachineProfile }>("/profiles", json("POST", input)),

        update: (machineId: number, input: ProfilePayload) =>
            request<{ profile: MachineProfile }>(
                `/profiles/${machineId}`,
                json("PATCH", input),
            ),

        remove: (machineId: number) =>
            request<{ success: true; id: number }>(`/profiles/${machineId}`, {
                method: "DELETE",
            }),

        start: (machineId: number) =>
            request<{ started: boolean; profile: MachineProfile }>(
                `/profiles/${machineId}/start`,
                { method: "POST" },
            ),

        stop: (machineId: number) =>
            request<{ stopped: boolean; profile: MachineProfile }>(
                `/profiles/${machineId}/stop`,
                { method: "POST" },
            ),
    },

    orders: {
        listKey: (query: OrderQuery = {}) => ["orders.list", query] as const,
        list: (query: OrderQuery = {}) => request<{ orders: MachineOrder[] }>("/orders", { query }),

        countKey: "orders.count",
        count: () => request<{ count: number }>("/orders/count"),

        detailKey: (orderId: number) => ["orders.detail", orderId] as const,
        get: (orderId: number) => request<{ order: MachineOrder }>(`/orders/${orderId}`),

        create: (input: OrderPayload) => request<{ order: MachineOrder }>("/orders", json("POST", input)),

        update: (orderId: number, input: OrderPayload) =>
            request<{ order: MachineOrder }>(
                `/orders/${orderId}`,
                json("PATCH", input),
            ),

        resend: (orderId: number) =>
            request<{ order: MachineOrder }>(`/orders/${orderId}/resend`, {
                method: "POST",
            }),

        remove: (orderId: number) =>
            request<{ success: true; id: number }>(`/orders/${orderId}`, {
                method: "DELETE",
            }),
    },

    results: {
        listKey: (query: ResultQuery = {}) => ["results.list", query] as const,
        list: (query: ResultQuery = {}) => request<{ results: MachineResult[] }>("/results", { query }),

        countKey: "results.count",
        count: () => request<{ count: number }>("/results/count"),

        detailKey: (resultId: number) => ["results.detail", resultId] as const,
        get: (resultId: number) => request<{ result: MachineResult }>(`/results/${resultId}`),
    },

    statistics: {
        listKey: (query: StatisticQuery = {}) => ["statistics.list", query] as const,
        list: (query: StatisticQuery = {}) => request<{ statistics: TestStatistic[] }>("/test-statistics", { query }),

        countKey: "statistics.count",
        count: () => request<{ count: number }>("/test-statistics/count"),

        detailKey: (statisticId: number) => ["statistics.detail", statisticId] as const,
        get: (statisticId: number) => request<{ statistic: TestStatistic }>(`/test-statistics/${statisticId}`),

        remove: (statisticId: number) => request<void>(`/test-statistics/${statisticId}`, { method: "DELETE" }),
    },

    externalOrders: {
        listKey: (query: ExternalQuery = {}) => ["externalOrders.list", query] as const,
        list: (query: ExternalQuery = {}) =>
            request<{ orders: ExternalOrder[]; count: number }>("/external-orders", { query }),
    },

    externalResults: {
        listKey: (query: ExternalQuery = {}) => ["externalResults.list", query] as const,
        list: (query: ExternalQuery = {}) =>
            request<{ results: ExternalResult[]; count: number }>("/external-results", { query }),
    },
}


// fetch request executor
async function request<T>(
    path: string,
    {
        query,
        ...init
    }: RequestInit & { query?: Query } = {}
): Promise<T> {
    const url = new URL(`${API_BASE_URL}${path}`)

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
