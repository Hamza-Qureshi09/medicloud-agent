import { toast } from "sonner";
import { useMachineContext } from "@/contexts/machine-context";

import { api } from "@/lib/api";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import {
    PageLoading,
    RefreshButton,
    ResourceEmpty,
    ResourceError,
} from "@/components/common/resourceState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/common/confirmAction";
import { AddMasterConnection } from "./connectionForm";

export function MasterConnectionPage() {
    const { mode, error: infoError, mutate: refreshInfo, slaveConnection } =
        useMachineContext();
    const { data, error, isValidating, mutate } = slaveConnection;
    if (!mode && infoError) {
        return (
            <ResourceError
                error={infoError}
                onRetry={() => void refreshInfo()}
            />
        );
    }
    if (!mode) return <PageLoading />;
    if (mode !== "slave") {
        return (
            <ResourceEmpty
                title="Slave mode required"
                description="Master connection setup is available on a slave agent."
            />
        );
    }
    if (!data && !error) return <PageLoading />;
    return (
        <Container>
            <PageSection
                eyebrow="Agent network"
                title="Master connection"
                description="This slave reports its name, machines, and results to one master."
                actions={
                    <div className="flex gap-2">
                        <RefreshButton
                            isLoading={isValidating}
                            onRefresh={() => void mutate()}
                        />
                        <AddMasterConnection
                            defaultMasterPort={data?.masterPort}
                            disabled={!data || data.configured}
                            onSaved={() => mutate()}
                        />
                    </div>
                }
            />
            {error
                ? <ResourceError error={error} onRetry={() => void mutate()} />
                : data?.configured
                ? (
                    <div className="flex flex-col gap-6">
                        <div className="grid items-start gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        {data.slaveName || "Slave agent"}
                                        <Badge
                                            variant={data.status === "connected"
                                                ? "default"
                                                : "secondary"}
                                        >
                                            {data.status === "connected"
                                                ? "Connected"
                                                : data.status === "connecting"
                                                ? "Connecting"
                                                : "Disconnected"}
                                        </Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-4">
                                    <dl className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <dt className="text-sm text-muted-foreground">
                                                Master
                                            </dt>
                                            <dd className="font-mono text-sm">
                                                {data.masterHost}:{data
                                                    .masterPort}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-sm text-muted-foreground">
                                                Slave ID
                                            </dt>
                                            <dd className="break-all font-mono text-sm">
                                                {data.slaveId}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-sm text-muted-foreground">
                                                Last successful heartbeat
                                            </dt>
                                            <dd className="text-sm">
                                                {data.lastHeartbeatAt
                                                    ? new Date(
                                                        data.lastHeartbeatAt,
                                                    ).toLocaleString()
                                                    : "Waiting for heartbeat"}
                                            </dd>
                                        </div>
                                    </dl>
                                    <ConfirmAction
                                        trigger={
                                            <Button variant="destructive">
                                                Delete connection
                                            </Button>
                                        }
                                        title="Delete master connection?"
                                        description="Synchronization stops. Saved credentials are removed, and local orders and results are kept."
                                        actionLabel="Delete connection"
                                        onConfirm={async () => {
                                            await api.slaveConnection.remove();
                                            toast.success(
                                                "Master connection removed. Synchronization stopped.",
                                            );
                                            await mutate().catch(() =>
                                                undefined
                                            );
                                        }}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )
                : (
                    <ResourceEmpty
                        title="No master connection"
                        description="Add the master address and the credentials issued for this slave."
                    />
                )}
        </Container>
    );
}
