import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { ResourceEmpty } from "@/components/common/resourceState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShareNetworkIcon, PlugsConnectedIcon, DesktopIcon } from "@phosphor-icons/react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { ConfirmAction } from "@/components/common/confirmAction";
import { RefreshButton, ResourceError, PageLoading } from "@/components/common/resourceState";
import { Button } from "@/components/ui/button";
import { StopIcon } from "@phosphor-icons/react";
import type { SlaveRecord } from "../../types/api.ts";


export function ControlPage() {
    const { data, error, mutate } = useSWR(api.agent.slavesKey, api.agent.slaves, {
        revalidateOnFocus: false,
        refreshInterval: 25000,
    });
    
    // Get slaves from API
    const slaves = data?.slaves as SlaveRecord[] || [];

    const totalSlaves = slaves.length;
    const activeSlaves = slaves.filter(s => s.isActive).length;

    // Machine totals are computed by the agent, not derived here.
    const totalMachines = data?.totalMachines ?? 0;

    // Early returns must be after all hooks!
    if (!data && !error) return <PageLoading />;
    
    if (error) {
        return <ResourceError error={error} onRetry={() => mutate()} />;
    }

    return (
        <Container>
            <PageSection
                eyebrow="Slave Network"
                title="Agent Control Center"
                description="Monitor connected slave agents, their connection status, and delegated machine capabilities."
                actions={
                    <RefreshButton onRefresh={() => mutate()} />
                }
            />

            {/* Stat Cards */}
            <div className="grid gap-3 grid-cols-3">
                <StatCard
                    title="Total slaves"
                    value={totalSlaves}
                    detail="Registered in the network"
                    icon={ShareNetworkIcon}
                />
                <StatCard
                    title="Active slaves"
                    value={activeSlaves}
                    detail="Pinged recently"
                    icon={PlugsConnectedIcon}
                />
                <StatCard
                    title="Delegated machines"
                    value={totalMachines}
                    detail="Managed across all slaves"
                    icon={DesktopIcon}
                />
            </div>

            {/* Slave List */}
            {slaves.length > 0 ? (
                <Accordion className="w-full">
                    {slaves.map((slave) => {
                        let machines = [];
                        try {
                            machines = JSON.parse(slave.machinesJson);
                        } catch {
                            // ignore
                        }

                        return (
                            <AccordionItem key={slave.id} value={slave.slaveId}>
                                <AccordionTrigger className="hover:no-underline">
                                    <div className="flex flex-1 items-start justify-between mr-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <div className="flex items-center gap-2 text-base font-semibold">
                                                Slave: {slave.slaveId.split('-')[1] || slave.slaveId}
                                                <Badge variant={slave.isActive ? "default" : "secondary"} className="ml-2">
                                                    {slave.isActive ? "Active" : "Inactive"}
                                                </Badge>
                                                
                                                <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} onPointerDown={(e) => e.stopPropagation()}>
                                                    <ConfirmAction
                                                        trigger={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10 -ml-1"
                                                            >
                                                                <StopIcon />
                                                            </Button>
                                                        }
                                                        title="Mark Slave Inactive"
                                                        description={`Are you sure you want to mark slave ${slave.slaveId.split('-')[1] || slave.slaveId} as inactive?`}
                                                        actionLabel="Mark Inactive"
                                                        onConfirm={async () => {
                                                            await api.agent.markInactive(slave.slaveId);
                                                            await mutate();
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground text-left font-normal mt-1">
                                                Host: {slave.host}:{slave.port} • Last ping: {new Date(slave.lastPingAt).toLocaleString()}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center">
                                            <Badge variant="outline" className="shrink-0 mt-1">
                                                {machines.length} Machine{machines.length !== 1 && 's'}
                                            </Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    {machines.length > 0 ? (
                                        <div className="rounded-md border mt-2">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Machine Profile</TableHead>
                                                        <TableHead>Driver</TableHead>
                                                        <TableHead>Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {machines.map((machine: any, i: number) => (
                                                        <TableRow key={i}>
                                                            <TableCell className="font-medium">
                                                                {machine.name || machine.profileKey}
                                                            </TableCell>
                                                            <TableCell>{machine.driverId}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={machine.connected ? "default" : machine.running ? "secondary" : "outline"}>
                                                                    {machine.connected ? "Connected" : machine.running ? "Listening" : "Stopped"}
                                                                </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground mt-2">No machines delegated to this slave.</p>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            ) : (
                <ResourceEmpty
                    title="No slaves connected"
                    description="When slave agents register to this master, they will appear here."
                />
            )}
        </Container>
    );
}

function StatCard({
    title,
    value,
    detail,
    icon: Icon,
}: {
    title: string
    value: string | number
    detail: string
    icon: typeof ShareNetworkIcon
}) {
    return (
        <Card size="sm">
            <CardHeader>
                <CardDescription>{title}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
                <CardAction>
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted text-primary">
                        <Icon />
                    </span>
                </CardAction>
            </CardHeader>
            <CardContent>
                <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent>
        </Card>
    )
}
