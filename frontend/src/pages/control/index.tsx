import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { ResourceEmpty } from "@/components/common/resourceState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShareNetworkIcon, PlugsConnectedIcon, DesktopIcon, CopyIcon, CheckIcon, WarningIcon, TrashIcon } from "@phosphor-icons/react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { ConfirmAction } from "@/components/common/confirmAction";
import { RefreshButton, ResourceError, PageLoading } from "@/components/common/resourceState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StopIcon } from "@phosphor-icons/react";
import { FormErrorList } from "@/components/common/formError";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SlaveRecord, SlaveCredentials } from "../../types/api.ts";
import { slaveLiveness, type SlaveLiveness } from "@/lib/helpers";

const slaveStatusLabel: Record<SlaveLiveness, string> = {
    online: "Online",
    stale: "Unreachable",
    never: "Never Connected",
};

const slaveStatusVariant: Record<SlaveLiveness, "default" | "secondary" | "outline"> = {
    online: "default",
    stale: "secondary",
    never: "outline",
};


export function ControlPage() {
    const { data, error, mutate } = useSWR(api.agent.slavesKey, api.agent.slaves, {
        revalidateOnFocus: false,
        refreshInterval: 25000,
    });
    
    // Get slaves from API
    const slaves = data?.slaves as SlaveRecord[] || [];

    const totalSlaves = slaves.length;
    const activeSlaves = slaves.filter(s => slaveLiveness(s) === "online").length;

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
                    <div className="flex gap-2">
                        <RegisterSlaveButton onRegistered={() => mutate()} />
                        <RefreshButton onRefresh={() => mutate()} />
                    </div>
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
                                                <Badge variant={slaveStatusVariant[slaveLiveness(slave)]} className="ml-2">
                                                    {slaveStatusLabel[slaveLiveness(slave)]}
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
                                                    <ConfirmAction
                                                        trigger={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            >
                                                                <TrashIcon />
                                                            </Button>
                                                        }
                                                        title="Delete Slave"
                                                        description={`Are you sure you want to permanently delete slave ${slave.slaveId.split('-')[1] || slave.slaveId}? This action cannot be undone.`}
                                                        actionLabel="Delete"
                                                        onConfirm={async () => {
                                                            await api.agent.deleteSlave(slave.slaveId);
                                                            await mutate();
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground text-left font-normal mt-1">
                                                {slaveLiveness(slave) === "never"
                                                    ? "Never connected"
                                                    : <>Host: {slave.host}:{slave.port} • Last ping: {new Date(slave.lastPingAt).toLocaleString()}</>
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
        </Container>
    );
}


// ── Register Slave Button + Dialog 

const registerSlaveSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").trim()
});

function RegisterSlaveButton({ onRegistered }: { onRegistered: () => void }) {
    const [open, setOpen] = useState(false);
    const [credentials, setCredentials] = useState<SlaveCredentials | null>(null);
    const action = useAsyncAction("Failed to register slave.");

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(registerSlaveSchema),
        defaultValues: { name: "" }
    });

    const handleOpen = useCallback(() => {
        setOpen(true);
        setCredentials(null);
        reset();
        action.reset();
    }, [action, reset]);

    const handleDismiss = useCallback(() => {
        setOpen(false);
        if (credentials) onRegistered();
    }, [credentials, onRegistered]);

    const onSubmit = handleSubmit(async (values) => {
        const result = await action.execute(() => api.agent.registerSlave({ name: values.name })).catch(() => undefined);
        if (result) setCredentials(result);
    });

    return (
        <>
            <Button variant="secondary" size="sm" onClick={handleOpen}>
                Register New Slave
            </Button>

            <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? handleOpen() : handleDismiss()}>
                <DialogContent>
                    {credentials ? (
                        <SlaveCredentialsReveal credentials={credentials} onDismiss={handleDismiss} />
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Register New Slave</DialogTitle>
                                <DialogDescription>
                                    Create a new slave agent registration. You will receive one-time credentials to configure the slave.
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={onSubmit} className="flex flex-col gap-4">
                                <Field>
                                    <FieldLabel>Name</FieldLabel>
                                    <Input
                                        placeholder='e.g. "Lab B Slave"'
                                        autoFocus
                                        disabled={action.pending}
                                        {...register("name")}
                                    />
                                    {errors.name && <FieldError>{errors.name.message}</FieldError>}
                                </Field>

                                <FormErrorList errorMessage={action.error} />

                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={handleDismiss} disabled={action.pending}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={action.pending}>
                                        {action.pending ? <Spinner data-icon="inline-start" /> : null}
                                        Register
                                    </Button>
                                </DialogFooter>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}


// ── Credentials Reveal (shown once after successful registration) ───────────

function SlaveCredentialsReveal({
    credentials,
    onDismiss,
}: {
    credentials: SlaveCredentials;
    onDismiss: () => void;
}) {
    const fields = [
        { label: "Slave ID", value: credentials.slaveId },
        { label: "Secret Key", value: credentials.slaveSecret },
    ];

    return (
        <>
            <DialogHeader>
                <DialogTitle>Slave Credentials</DialogTitle>
                <DialogDescription>
                    Copy these now. The secret key is shown only once.
                </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
                {/* Warning banner */}
                <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
                    <WarningIcon className="size-4 shrink-0" />
                    <p className="text-xs leading-snug">
                        The secret key cannot be retrieved again. Store it somewhere safe.
                    </p>
                </div>

                {/* Credential fields */}
                {fields.map((field) => (
                    <div key={field.label} className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                            {field.label}
                        </span>
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted border border-muted/50">
                            <span className="font-mono text-xs break-all min-w-0">
                                {field.value || "N/A"}
                            </span>
                            {field.value && <CopyButton value={field.value} />}
                        </div>
                    </div>
                ))}

                <Button type="button" size="lg" onClick={onDismiss}>
                    Done
                </Button>
            </div>
        </>
    );
}


// ── Copy Button (local to this page) ────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback: do nothing
        }
    }, [value]);

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={handleCopy}
        >
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </Button>
    );
}


// ── Stat Card ───────────────────────────────────────────────────────────────

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
