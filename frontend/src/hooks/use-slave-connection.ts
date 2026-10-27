import { useRef } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/helpers";
import { env } from "@/lib/env";
import { liveResourceConfig } from "@/lib/swr";

export function useSlaveConnection(enabled = true) {
    const previousError = useRef<string | null>(null);
    return useSWR(enabled ? api.slaveConnection.key : null, api.slaveConnection.get, {
        ...liveResourceConfig,
        refreshInterval: (data) =>
            data?.configured ? env.VITE_MASTER_CONNECTION_POLL_INTERVAL_MS : 0,

        errorRetryCount: 3,
        onSuccess: (data) => {
            if (data.error && data.error !== previousError.current) {
                toast.error(data.error, { id: data.error });
            }
            previousError.current = data.error;
        },
        onError: (error) => {
            const message = extractApiError(error, "Could not read master connection");
            if (message !== previousError.current) {
                toast.error(message, { id: message });
            }
            previousError.current = message;
        },
    });
}
