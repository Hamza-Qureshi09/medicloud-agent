import type { SWRConfiguration } from "swr"

export const swrConfig: SWRConfiguration = {
  // fetcher: apiFetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateIfStale: true,
  keepPreviousData: true,
  dedupingInterval: 5_000,
  refreshInterval: 30_000,
  errorRetryCount: 2,
  errorRetryInterval: 3_000,
  shouldRetryOnError: false,
  // shouldRetryOnError: (error: unknown) =>
  //   !(error instanceof ApiError && error.status >= 400 && error.status < 500),
}