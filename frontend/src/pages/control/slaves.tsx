import { ResourceEmpty } from "@/components/common/resourceState";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAsyncAction } from "@/hooks/use-async-action";
import { api } from "@/lib/api";
import { slaveLiveness } from "@/lib/helpers";
import { slaveStatusLabel, slaveStatusVariant, type SlaveRecord } from "@/types/api";
import { DotsThreeIcon, RecycleIcon, StopCircleIcon } from "@phosphor-icons/react";
import React from "react";
import { Link } from "react-router-dom";
import { type KeyedMutator } from "swr";



export function RegisteredSlaves({ slaves, mutate }: { slaves: SlaveRecord[], mutate: KeyedMutator<any> }) {
    const actions = useAsyncAction("Action failed.");

    async function runHardRefresh() {
        await mutate();
    }
    async function slavesAction(
        action: () => Promise<unknown>,
    ) {
        await actions.execute(async () => {
            await action();
            await runHardRefresh();
        }).catch(() => undefined);
    }
    return (
        <React.Fragment>
            {/* Slave List */}
            {slaves.length > 0 ? (
                <Accordion className="w-full">
                    {slaves.map((slave: SlaveRecord) => {
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
                                                <Link
                                                    to={`/dashboard/control/slaves/${slave.slaveId}`}
                                                    className="hover:underline text-primary"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    Slave: {slave.instanceId || slave.slaveId.split('-')[1] || slave.slaveId}
                                                </Link>
                                                <Badge variant={slaveStatusVariant[slaveLiveness(slave)]} className="ml-2">
                                                    {slaveStatusLabel[slaveLiveness(slave)]}
                                                </Badge>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        render={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                aria-label={`Actions for ${slave.id}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                }}
                                                            />
                                                        }
                                                    >
                                                        <DotsThreeIcon weight="bold" />
                                                    </DropdownMenuTrigger>

                                                    <DropdownMenuContent
                                                        align="end"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                        }}
                                                    >
                                                        <DropdownMenuGroup>
                                                            <DropdownMenuItem
                                                                className="font-normal"
                                                                onSelect={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();

                                                                    void slavesAction(() =>
                                                                        api.agent.markInactive(slave.slaveId)
                                                                    );
                                                                }}
                                                            >
                                                                <StopCircleIcon/>
                                                                Mark Inactive
                                                            </DropdownMenuItem>

                                                            <DropdownMenuItem
                                                                className="font-normal"
                                                                onSelect={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();

                                                                    void slavesAction(() =>
                                                                        api.agent.deleteSlave(slave.slaveId)
                                                                    );
                                                                }}
                                                            >
                                                                <RecycleIcon />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuGroup>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                            <div className="text-xs text-muted-foreground text-left font-normal mt-1">
                                                {slaveLiveness(slave) === "never"
                                                    ? "Never connected"
                                                    : <>Last ping: {new Date(slave.lastPingAt).toLocaleString()}</>
                                                }
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
        </React.Fragment>
    )
}