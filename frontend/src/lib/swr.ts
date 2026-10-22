import type { SWRConfiguration } from "swr";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/helpers";

export const swrConfig = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: true,
    keepPreviousData: false,
    refreshInterval: 0,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    dedupingInterval: 5_000,
    errorRetryCount: 2,
    errorRetryInterval: 3_000,
    shouldRetryOnError: (error: unknown) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500),
} satisfies SWRConfiguration;

export const liveResourceConfig = {
    refreshInterval: env.VITE_LIVE_RESOURCE_POLL_INTERVAL_MS,
} satisfies SWRConfiguration;

export const liveListConfig = {
    ...liveResourceConfig,
    keepPreviousData: true,
} satisfies SWRConfiguration;
