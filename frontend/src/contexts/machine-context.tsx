import React from "react";
import useSWR, { type KeyedMutator } from "swr";
import { api } from "@/lib/api";
import { liveResourceConfig } from "@/lib/swr";
import { slaveLiveness } from "@/lib/helpers";
import { useSlaveConnection } from "@/hooks/use-slave-connection";
import type { AgentMode, MachineResponse, SlaveRecord } from "@/types/api";

type MachineContextType = {
    data: MachineResponse | undefined;
    slavesData: { slaves: SlaveRecord[]; totalMachines: number } | undefined;
    error: unknown;
    slavesError: unknown;
    isLoading: boolean;
    connected: number;
    activeSlaves: number;
    mutate: KeyedMutator<MachineResponse>;
    mutateSlaves: KeyedMutator<{ slaves: SlaveRecord[]; totalMachines: number }>;
    isValidating: boolean;
    mode: AgentMode | undefined;
    slaveConnection: ReturnType<typeof useSlaveConnection>;
};

const MachineContext = React.createContext<MachineContextType | null>(null);

export function MachineProvider({ children }: { children: React.ReactNode }) {
    const info = useSWR(api.info.detailKey, api.info.get, liveResourceConfig);
    const mode = info.data?.mode;
    const registry = useSWR(
        mode === "master" ? api.agent.slavesKey : null,
        api.agent.slaves,
        liveResourceConfig,
    );
    const slaveConnection = useSlaveConnection(mode === "slave");

    return (
        <MachineContext.Provider
            value={{
                data: info.data,
                slavesData: registry.data,
                error: info.error,
                slavesError: registry.error,
                isLoading: info.isLoading,
                connected: info.data?.running_machines.filter(({ machine }) =>
                    machine.running && machine.connected
                ).length ?? 0,
                activeSlaves:
                    registry.data?.slaves.filter((slave) => slaveLiveness(slave) === "online")
                        .length ?? 0,
                mutate: info.mutate,
                mutateSlaves: registry.mutate,
                isValidating: info.isValidating,
                mode,
                slaveConnection,
            }}
        >
            {children}
        </MachineContext.Provider>
    );
}

export function useMachineContext() {
    const context = React.useContext(MachineContext);
    if (!context) throw new Error("useMachineContext must be used inside MachineProvider");
    return context;
}
