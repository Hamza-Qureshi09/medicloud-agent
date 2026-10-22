import {
    slaveConnectionStatusSchema,
    type SlaveConnectionValues,
} from "@/schemas/slaveConnection";
import type {
    AgentOrder,
    CatalogDetail,
    CatalogSummary,
    CatalogTest,
    Driver,
    ExternalResult,
    MachineOrder,
    MachineProfile,
    MachineResponse,
    MachineResult,
    OrderStatus,
    SlaveCredentials,
    SlaveRecord,
    TestStatistic,
    TProfileQuery,
} from "@/types/api";
import { json } from "./helpers";
import type { OrderPayload, ProfilePayload } from "./schema";

import { type Query, request } from "./http";

// order query
export interface OrderQuery extends Query {
    machineId?: number;
    sampleId?: string;
    status?: OrderStatus;
    limit?: number;
    offset?: number;
}
export interface ResultQuery extends Query {
    orderId?: number;
    machineId?: number;
    sampleId?: string;
    limit?: number;
    offset?: number;
}
export interface ExternalQuery extends Query {
    search?: string;
    status?: string | number;
    limit?: number;
    offset?: number;
}
export interface StatisticQuery extends Query {
    machineId?: number;
    testId?: string;
    limit?: number;
    offset?: number;
}

// api registry for all requests
export const api = {
    slaveConnection: {
        remove: async () =>
            slaveConnectionStatusSchema.parse(
                await request<unknown>("/slave-connection", {
                    method: "DELETE",
                }),
            ),
        key: "slave.connection",
        get: async () =>
            slaveConnectionStatusSchema.parse(
                await request<unknown>("/slave-connection"),
            ),
        save: async (values: SlaveConnectionValues) =>
            slaveConnectionStatusSchema.parse(
                await request<unknown>(
                    "/slave-connection",
                    json("PUT", values),
                ),
            ),
    },
    agent: {
        slavesKey: "agent.slaves",
        slaves: () =>
            request<{ slaves: SlaveRecord[]; totalMachines: number }>(
                "/slaves",
            ),
        slaveDetailKey: (slaveId: string) => ["agent.slave", slaveId] as const,
        getSlave: (slaveId: string) =>
            request<{ slave: SlaveRecord }>(`/slaves/${slaveId}`),
        markInactive: (slaveId: string) =>
            request<{ success: boolean }>(`/slaves/${slaveId}/inactive`, {
                method: "POST",
            }),
        deleteSlave: (slaveId: string) =>
            request<{ success: boolean }>(`/slaves/${slaveId}/delete`, {
                method: "POST",
            }),
        registerSlave: (name?: string) =>
            request<SlaveCredentials>(
                "/slaves/register",
                json("POST", name ? { name } : {}),
            ),
    },

    info: {
        detailKey: "info",
        get: () => request<MachineResponse>("/info"),
    },

    drivers: {
        listKey: (query: { id?: string; brand?: string } = {}) =>
            ["drivers", query] as const,
        list: (query: { id?: string; brand?: string } = {}) =>
            request<{ drivers: Driver[] }>("/drivers", { query }),
    },

    catalogs: {
        listKey: "catalogs.list",
        list: () => request<{ catalogs: CatalogSummary[] }>("/catalogs"),

        detailKey: (driverId: string) => ["catalogs.detail", driverId] as const,
        get: (query: { driver: string }) =>
            request<CatalogDetail>("/catalogs", { query }),
        create: (input: { driverId: string; machine: string }) =>
            request<CatalogDetail>("/catalogs", json("POST", input)),
        rename: (driverId: string, machine: string) =>
            request<CatalogDetail>(
                `/catalogs/${encodeURIComponent(driverId)}`,
                json("PATCH", { machine }),
            ),
        addTest: (driverId: string, test: object) =>
            request<{ test: CatalogTest }>(
                `/catalogs/${encodeURIComponent(driverId)}/tests`,
                json("POST", test),
            ),
        updateTest: (driverId: string, code: string, test: object) =>
            request<{ test: CatalogTest }>(
                `/catalogs/${encodeURIComponent(driverId)}/tests/${
                    encodeURIComponent(code)
                }`,
                json("PUT", test),
            ),
        removeTest: (driverId: string, code: string) =>
            request<{ success: boolean }>(
                `/catalogs/${encodeURIComponent(driverId)}/tests/${
                    encodeURIComponent(code)
                }`,
                { method: "DELETE" },
            ),
    },

    profiles: {
        listKey: (query?: TProfileQuery) => ["profiles.list", query] as const,
        list: (query?: TProfileQuery) =>
            request<{ profiles: MachineProfile[] }>("/profiles", { query }),

        countKey: "profiles.count",
        count: () => request<{ count: number }>("/profiles/count"),

        detailKey: (machineId: number) =>
            ["profiles.detail", machineId] as const,
        get: (machineId: number) =>
            request<{ profile: MachineProfile }>(`/profiles/${machineId}`),

        create: (input: ProfilePayload) =>
            request<{ profile: MachineProfile }>(
                "/profiles",
                json("POST", input),
            ),

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
        list: (query: OrderQuery = {}) =>
            request<{ orders: MachineOrder[] }>("/orders", { query }),

        countKey: "orders.count",
        count: () => request<{ count: number }>("/orders/count"),

        detailKey: (orderId: number) => ["orders.detail", orderId] as const,
        get: (orderId: number) =>
            request<{ order: MachineOrder }>(`/orders/${orderId}`),

        create: (input: OrderPayload) =>
            request<{ order: MachineOrder }>("/orders", json("POST", input)),

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
        list: (query: ResultQuery = {}) =>
            request<{ results: MachineResult[] }>("/results", { query }),

        countKey: "results.count",
        count: () => request<{ count: number }>("/results/count"),

        detailKey: (resultId: number) => ["results.detail", resultId] as const,
        get: (resultId: number) =>
            request<{ result: MachineResult }>(`/results/${resultId}`),
    },

    statistics: {
        listKey: (query: StatisticQuery = {}) =>
            ["statistics.list", query] as const,
        list: (query: StatisticQuery = {}) =>
            request<{ statistics: TestStatistic[] }>("/test-statistics", {
                query,
            }),

        countKey: "statistics.count",
        count: () => request<{ count: number }>("/test-statistics/count"),

        detailKey: (statisticId: number) =>
            ["statistics.detail", statisticId] as const,
        get: (statisticId: number) =>
            request<{ statistic: TestStatistic }>(
                `/test-statistics/${statisticId}`,
            ),

        remove: (statisticId: number) =>
            request<void>(`/test-statistics/${statisticId}`, {
                method: "DELETE",
            }),
    },

    agentOrders: {
        listKey: (query: ExternalQuery = {}) =>
            ["agentOrders.list", query] as const,
        list: (query: ExternalQuery = {}) =>
            request<{ orders: AgentOrder[]; count: number }>("/agent-orders", {
                query,
            }),
        reject: (id: number) =>
            request<{ success: boolean }>(`/agent-orders/${id}/reject`, {
                method: "POST",
            }),

        create: (input: OrderPayload) =>
            request<{ order: AgentOrder }>(
                "/agent-orders",
                json("POST", input),
            ),

        update: (id: number, input: OrderPayload) =>
            request<{ order: AgentOrder }>(
                `/agent-orders/${id}`,
                json("PATCH", input),
            ),

        remove: (id: number) =>
            request<{ success: true; id: number }>(`/agent-orders/${id}`, {
                method: "DELETE",
            }),
    },

    externalResults: {
        listKey: (query: ExternalQuery = {}) =>
            ["externalResults.list", query] as const,
        list: (query: ExternalQuery = {}) =>
            request<{ results: ExternalResult[]; count: number }>(
                "/external-results",
                { query },
            ),
        reconcile: () =>
            request<{ scanned: number; queued: number }>(
                "/external-results/reconcile",
                { method: "POST" },
            ),
        retry: (id: number) =>
            request<{ queued: boolean }>("/external-results/" + id + "/retry", {
                method: "POST",
            }),
    },

    slaveOrders: {
        listKey: (query: ExternalQuery = {}) =>
            ["slaveOrders.list", query] as const,
        list: (query: ExternalQuery = {}) =>
            request<{ orders: AgentOrder[]; count: number }>("/slave-orders", {
                query,
            }),
    },

    slaveResults: {
        listKey: (query: ExternalQuery = {}) =>
            ["slaveResults.list", query] as const,
        list: (query: ExternalQuery = {}) =>
            request<{ results: ExternalResult[]; count: number }>(
                "/slave-results",
                { query },
            ),
    },
};
