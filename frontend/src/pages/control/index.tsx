import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { ResourceEmpty } from "@/components/common/resourceState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShareNetworkIcon, PlugsConnectedIcon, DesktopIcon } from "@phosphor-icons/react";
import type { SlaveRecord } from "@/types/api";
import useSWR from "swr";
import { api } from "@/lib/api";

// Static mock data for slave agents
const STATIC_SLAVES: SlaveRecord[] = [
    {
        id: 1,
        slaveId: "slv-a1b2c3d4e5f6",
        instanceId: "inst-11112222",
        host: "192.168.1.105",
        port: 5001,
        machinesJson: JSON.stringify([
            {
                profileKey: "sysmex-x1",
                localProfileId: 10,
                driverId: "sysmex",
                name: "Sysmex XN-1000",
                catalogTests: ["WBC", "RBC", "HGB"],
                running: true,
                connected: true,
                isSlaveOwned: true
            }
        ]),
        lastPingAt: new Date(Date.now() - 30 * 1000).toISOString(), // 30s ago
        isActive: true,
        createdAt: "2026-08-30T10:00:00.000Z"
    },
    {
        id: 2,
        slaveId: "slv-9z8y7x6w5v4u",
        instanceId: "inst-33334444",
        host: "192.168.1.106",
        port: 5001,
        machinesJson: JSON.stringify([
            {
                profileKey: "roche-c1",
                localProfileId: 11,
                driverId: "roche",
                name: "Roche Cobas 6000",
                catalogTests: ["GLU", "ALT", "AST"],
                running: true,
                connected: false,
                isSlaveOwned: true
            },
            {
                profileKey: "abbott-i1",
                localProfileId: 12,
                driverId: "abbott",
                name: "Abbott Architect i1000sr",
                catalogTests: ["TSH", "FT4"],
                running: false,
                connected: false,
                isSlaveOwned: true
            }
        ]),
        lastPingAt: new Date(Date.now() - 45 * 1000).toISOString(), // 45s ago
        isActive: true,
        createdAt: "2026-08-30T11:00:00.000Z"
    },
    {
        id: 3,
        slaveId: "slv-m1n2o3p4q5r6",
        instanceId: "inst-55556666",
        host: "192.168.1.107",
        port: 5001,
        machinesJson: JSON.stringify([]),
        lastPingAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5m ago
        isActive: false,
        createdAt: "2026-08-29T09:00:00.000Z"
    }
];

export function ControlPage() {
    const { data, error } = useSWR(api.agent.slavesKey, api.agent.slaves, {
        revalidateOnFocus: false,
    });

    // If API fails, fallback to static data. Otherwise use fetched data (or static while loading initially).
    const slaves = error ? STATIC_SLAVES : (data?.slaves ?? STATIC_SLAVES);

    const totalSlaves = slaves.length;
    const activeSlaves = slaves.filter(s => s.isActive).length;
    
    // Calculate total machines across all slaves
    const totalMachines = slaves.reduce((acc, slave) => {
        try {
            const machines = JSON.parse(slave.machinesJson);
            return acc + machines.length;
        } catch {
            return acc;
        }
    }, 0);

    return (
        <Container>
            <PageSection
                eyebrow="Slave Network"
                title="Agent Control Center"
                description="Monitor connected slave agents, their connection status, and delegated machine capabilities."
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
                                            </div>
                                            <div className="text-xs text-muted-foreground text-left font-normal mt-1">
                                                Host: {slave.host}:{slave.port} • Last ping: {new Date(slave.lastPingAt).toLocaleString()}
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="shrink-0 mt-1">
                                            {machines.length} Machine{machines.length !== 1 && 's'}
                                        </Badge>
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
