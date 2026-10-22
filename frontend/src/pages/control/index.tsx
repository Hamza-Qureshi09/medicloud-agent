import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
    slaveRegistrationFormSchema,
    type SlaveRegistrationValues,
} from "@/schemas/slaveConnection";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { useCallback, useState } from "react";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import {
    DesktopIcon,
    PlugsConnectedIcon,
    ShareNetworkIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import { StatCard } from "@/components/common/statCard";
import { api } from "@/lib/api";
import {
    PageLoading,
    RefreshButton,
    ResourceError,
} from "@/components/common/resourceState";
import { Button } from "@/components/ui/button";
import { FormErrorList } from "@/components/common/formError";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import type { SlaveCredentials, SlaveRecord } from "../../types/api.ts";
import { useMachineContext } from "@/contexts/machine-context";
import { ControlSlaveResults } from "./results/results.tsx";
import { ControlSlaveOrders } from "./orders/orders.tsx";
import { CopyButton } from "@/components/common/copyButton";
import { RegisteredSlaves } from "./slaves/slaves.tsx";

export function ControlPage() {
    const { mode, error, mutate } = useMachineContext();
    if (error) {
        return (
            <ResourceError
                error={error}
                onRetry={() => void mutate()}
            />
        );
    }
    if (!mode) return <PageLoading />;
    if (mode === "slave") {
        return <Navigate to="/dashboard/master-connection" replace />;
    }
    if (mode !== "master") {
        return (
            <Container>
                <PageSection
                    title="Agent control"
                    description="Slave management is available on a master agent."
                />
            </Container>
        );
    }
    return <MasterControlPage />;
}

function MasterControlPage() {
    const {
        slavesData: data,
        activeSlaves,
        mutateSlaves: mutate,
        slavesError: error,
    } = useMachineContext();

    // Get slaves from API
    const slaves = data?.slaves as SlaveRecord[] || [];

    const totalSlaves = slaves.length;

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
                title="Manage Slaves"
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
            <Tabs defaultValue="slaves">
                <TabsList>
                    <TabsTrigger value="slaves">Slaves</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                    <TabsTrigger value="results">Results</TabsTrigger>
                </TabsList>
                <TabsContent value="slaves">
                    <RegisteredSlaves slaves={slaves} mutate={mutate} />
                </TabsContent>
                <TabsContent value="orders">
                    <ControlSlaveOrders />
                </TabsContent>
                <TabsContent value="results">
                    <ControlSlaveResults />
                </TabsContent>
            </Tabs>
        </Container>
    );
}

function RegisterSlaveButton({ onRegistered }: { onRegistered: () => void }) {
    const [open, setOpen] = useState(false);
    const [credentials, setCredentials] = useState<SlaveCredentials | null>(
        null,
    );
    const action = useAsyncAction(
        "Failed to register slave.",
        "Slave registered",
    );
    const nameForm = useForm<SlaveRegistrationValues>({
        resolver: zodResolver(slaveRegistrationFormSchema),
        defaultValues: { name: "" },
    });

    const handleOpen = useCallback(() => {
        setOpen(true);
        setCredentials(null);
        nameForm.reset();
        action.reset();
    }, [action]);

    const handleDismiss = useCallback(() => {
        setOpen(false);
        if (credentials) onRegistered();
    }, [credentials, onRegistered]);

    const onSubmit = nameForm.handleSubmit(async ({ name }) => {
        const result = await action.execute(() =>
            api.agent.registerSlave(name || undefined)
        ).catch(
            () => undefined,
        );
        if (result) setCredentials(result);
    }, (errors) => toast.error(errors.name?.message || "Check the slave name"));

    return (
        <>
            <Button variant="default" size="sm" onClick={handleOpen}>
                Register New Slave
            </Button>

            <Dialog
                open={open}
                onOpenChange={(nextOpen) =>
                    nextOpen ? handleOpen() : handleDismiss()}
            >
                <DialogContent>
                    {credentials
                        ? (
                            <SlaveCredentialsReveal
                                credentials={credentials}
                                onDismiss={handleDismiss}
                            />
                        )
                        : (
                            <>
                                <DialogHeader>
                                    <DialogTitle>
                                        Register New Slave
                                    </DialogTitle>
                                    <DialogDescription>
                                        Create a new slave agent registration.
                                        You will receive one-time credentials to
                                        configure the slave. The slave can
                                        supply its own name when it connects.
                                    </DialogDescription>
                                </DialogHeader>

                                <label className="grid gap-1 text-sm">
                                    <span>Slave name (optional)</span>
                                    <Input
                                        {...nameForm.register("name")}
                                        maxLength={100}
                                        placeholder="Chemistry room PC"
                                    />
                                </label>
                                <FormErrorList errorMessage={action.error} />

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleDismiss}
                                        disabled={action.pending}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={onSubmit}
                                        disabled={action.pending}
                                    >
                                        {action.pending
                                            ? (
                                                <Spinner data-icon="inline-start" />
                                            )
                                            : null}
                                        Register
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                </DialogContent>
            </Dialog>
        </>
    );
}

// Credentials Reveal (shown once after successful registration)

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
                        The secret key cannot be retrieved again. Store it
                        somewhere safe.
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
