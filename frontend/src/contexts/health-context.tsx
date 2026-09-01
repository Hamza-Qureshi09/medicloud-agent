import React from "react"
import type { AgentMode, HealthResponse } from "@/types/api"
import useSWR, { type KeyedMutator } from "swr"
import { api } from "@/lib/api"


type HealthContextType = {
    data: HealthResponse | undefined
    error: unknown
    isLoading: boolean
    connected: number
    mutate: KeyedMutator<HealthResponse>
    isValidating: boolean
    mode: AgentMode | undefined
}

const HealthContext = React.createContext<HealthContextType | null>(null)

export function HealthProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const { data, error, isLoading, mutate, isValidating } = useSWR(
        api.health.detailKey,
        api.health.get,
        {
            // refreshInterval: 5000, // optional
        }
    )

    // Fetch agent mode from /healthy endpoint
    const { data: agentHealthy } = useSWR(
        api.agent.healthyKey,
        api.agent.healthy,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60_000,
        }
    )

    const connected = React.useMemo(() => {
        return (
            data?.running_machines.filter(
                (item) => item.machine.connected
            ).length ?? 0
        )
    }, [data])

    const mode = agentHealthy?.mode
        ?? (import.meta.env.VITE_AGENT_MODE as AgentMode | undefined)

    return (
        <HealthContext.Provider
            value={{
                data,
                error,
                isLoading,
                connected,
                mutate,
                isValidating,
                mode,
            }}
        >
            {children}
        </HealthContext.Provider>
    )

}

export function useHealth() {
    const context = React.useContext(HealthContext)

    if (!context) {
        throw new Error(
            "useHealth must be used inside HealthProvider"
        )
    }

    return context
}