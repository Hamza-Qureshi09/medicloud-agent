import React from "react"
import type { AgentMode, MachineResponse, SlaveRecord } from "@/types/api"
import useSWR, { type KeyedMutator } from "swr"
import { api } from "@/lib/api"
import { slaveLiveness } from "@/lib/helpers"


type MachineContextType = {
    data: MachineResponse | undefined
    slavesData: { slaves: SlaveRecord[]; totalMachines: number } | undefined
    error: unknown
    isLoading: boolean
    connected: number
    activeSlaves: number
    mutate: KeyedMutator<MachineResponse>
    mutateSlaves: KeyedMutator<any>
    isValidating: boolean
    mode: AgentMode | undefined
}

const MachineContext = React.createContext<MachineContextType | null>(null)

export function MachineProvider({
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
    const { data: slavesData, mutate: mutateSlaves } = useSWR(
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
        return slavesData?.slaves?.filter((item: SlaveRecord) => slaveLiveness(item) === "online").length ?? 0;
    }, [slavesData])

    return (
        <MachineContext.Provider
            value={{
                data,
                slavesData,
                error,
                isLoading,
                connected,
                activeSlaves,
                mutate,
                mutateSlaves,
                isValidating,
                mode,
            }}
        >
            {children}
        </MachineContext.Provider>
    )
}

export function useMachineContext() {
    const context = React.useContext(MachineContext)

    if (!context) {
        throw new Error(
            "useMachineContext must be used inside MachineProvider"
        )
    }

    return context
}