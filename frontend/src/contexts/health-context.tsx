import React from "react"
import type { AgentMode, HealthResponse } from "@/types/api"
import useSWR, { type KeyedMutator } from "swr"
import { api } from "@/lib/api"


type HealthContextType = {
    data: HealthResponse | undefined
    error: unknown
    isLoading: boolean
    connected: number
    activeSlaves: number
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
        api.info.detailKey,
        api.info.get,
        {
            // refreshInterval: 5000, // optional
        }
    )

    const mode = (data?.mode as AgentMode) ?? undefined

    // Fetch slaves if we are in master mode
    const { data: slavesData } = useSWR(
        mode === "master" ? api.agent.slavesKey : null,
        api.agent.slaves,
        { refreshInterval: 25000 }
    )

    const connected = React.useMemo(() => {
        return data?.running_machines?.filter(
            (item: any) => item.machine.connected
        ).length ?? 0
    }, [data])

    const activeSlaves = React.useMemo(() => {
        return slavesData?.slaves?.filter((item: any) => {
            const lastSeen = item.lastPingAt ? new Date(item.lastPingAt) : undefined;
            if (!lastSeen || Number.isNaN(lastSeen.getTime()) || lastSeen.getTime() === 0) return false;
            return Date.now() - lastSeen.getTime() <= 2 * 60 * 1000;
        }).length ?? 0;
    }, [slavesData])

    return (
        <HealthContext.Provider
            value={{
                data,
                error,
                isLoading,
                connected,
                activeSlaves,
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