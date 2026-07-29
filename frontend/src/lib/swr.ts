import type { SWRConfiguration } from "swr"

import { ApiError, apiFetcher } from "@/lib/api"

export const swrConfig: SWRConfiguration = {
  fetcher: apiFetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  dedupingInterval: 2_000,
  errorRetryCount: 2,
  errorRetryInterval: 1_500,
  shouldRetryOnError: (error: unknown) =>
    !(error instanceof ApiError && error.status >= 400 && error.status < 500),
}

