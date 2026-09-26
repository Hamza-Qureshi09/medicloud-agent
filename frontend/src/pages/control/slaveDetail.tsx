import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import useSWR from "swr"
import { api, type ExternalQuery } from "@/lib/api"
import { useAsyncAction } from "@/hooks/use-async-action"
import { PageSection } from "@/components/common/pageSection"
import { PageLoading, ResourceError, ResourceEmpty } from "@/components/common/resourceState"
import { AgentOrderStatusBadge, ConnectionBadge, ResultDeliveryStatusBadge } from "@/components/common/statusBadge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmAction } from "@/components/common/confirmAction"
import { CopyButton } from "@/components/common/copyButton"
import { Pagination } from "@/components/common/pagination"
import { Container } from "@/components/common/container"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    ArrowLeftIcon,
    StopIcon,
    TrashIcon,
    CalendarIcon,
    GlobeIcon,
    IdentificationCardIcon
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { extractApiError, slaveLiveness } from "@/lib/helpers"
import { slaveStatusLabel, slaveStatusVariant } from "@/types/api"
import { ITEMS_PER_PAGE, pageCount } from "@/lib/global"
import { SlaveResultDetail } from "./resultDetails"


export function SlaveDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const slaveId = id!

    const { data, error, mutate } = useSWR(
        slaveId ? api.agent.slaveDetailKey(slaveId) : null,
        () => api.agent.getSlave(slaveId),
        { refreshInterval: 10_000 },
    )

    const slaveAction = useAsyncAction("Slave action failed.")

    const slave = data?.slave
    const liveness = slave ? slaveLiveness(slave) : "never"

    const machines = React.useMemo(() => {
        try { return slave?.machinesJson ? JSON.parse(slave.machinesJson) : [] }
        catch { return [] }
    }, [slave?.machinesJson])

    const connectedMachines = React.useMemo(
        () => machines.filter((m: any) => m.connected).length,
        [machines],
    )

    // Loading / error
    if (!data && !error) return <PageLoading />
    if (error || !slave) {
        return (
            <ResourceError
                error={error || new Error("Slave not found")}
                onRetry={() => mutate()}
            />
        )
    }

    async function handleAction(actionFn: () => Promise<unknown>) {
        await slaveAction.execute(async () => {
            await actionFn()
            await mutate()
        }).catch((err) => {
            toast.error(extractApiError(err, "Slave action failed."))
        })
    }

    // Connection status block
    // const statusBlock = liveness === "online"
    //     ? {
    //         icon: <HeartbeatIcon weight="fill" className="size-4 shrink-0 text-primary" />,
    //         label: "Online",
    //         detail: `Last heartbeat ${new Date(slave.lastPingAt).toLocaleString()}.`,
    //     }
    //     : liveness === "stale"
    //         ? {
    //             icon: <HeartbeatIcon className="size-4 shrink-0 text-muted-foreground" />,
    //             label: "Unreachable",
    //             detail: `Last seen ${new Date(slave.lastPingAt).toLocaleString()}. Heartbeat is stale.`,
    //         }
    //         : {
    //             icon: <HeartbeatIcon className="size-4 shrink-0 text-muted-foreground" />,
    //             label: "Never Connected",
    //             detail: "This slave has never sent a heartbeat to the master.",
    //         }

    return (
        <Container className="w-full">

            {/* Back navigation */}
            <Button
                variant="ghost"
                size="sm"
                className="w-fit px-2 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-transparent font-normal"
                onClick={() => navigate("/dashboard/control")}
            >
                <ArrowLeftIcon className="size-4" />
                <span>Back to Manage Slaves</span>
            </Button>

            {/* Page header with actions */}
            <PageSection
                eyebrow="Slave Node"
                title={slave?.instanceId || slave?.slaveId?.split('-')[1] || slave?.slaveId || "Unknown"}
                description={`Registered slave agent ID · ${machines.length} delegated machine${machines.length !== 1 ? "s" : ""}`}
                actions={
                    <div className="flex flex-wrap items-center gap-2">

                        {slave.isActive && (
                            <ConfirmAction
                            trigger={
                                <Button variant="outline" size="sm" className="font-normal" disabled={slaveAction.pending}>
                                    <StopIcon data-icon="inline-start" />
                                    Mark Inactive
                                </Button>
                            }
                            title="Mark Slave Inactive"
                            description={`Are you sure you want to mark ${slave?.instanceId} as inactive? It will stop receiving orders.`}
                            actionLabel="Mark Inactive"
                            onConfirm={() => handleAction(() => api.agent.markInactive(slaveId))}
                        />)}

                        <ConfirmAction
                            trigger={
                                <Button variant="destructive" size="sm" className="font-normal" disabled={slaveAction.pending}>
                                    <TrashIcon data-icon="inline-start" />
                                    Delete
                                </Button>
                            }
                            title="Delete Slave"
                            description={`Are you sure you want to permanently delete ${slave?.instanceId}? This action cannot be undone.`}
                            actionLabel="Delete slave"
                            onConfirm={async () => {
                                try {
                                    await api.agent.deleteSlave(slaveId)
                                    navigate("/dashboard/control")
                                } catch (err) {
                                    toast.error(extractApiError(err, "Could not delete slave."))
                                }
                            }}
                        />
                    </div>
                }
            />

            {/* Page body - 2-column layout */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 items-start">

                {/* Left sidebar: Overview */}
                <Card className="lg:col-span-1 rounded-3xl overflow-hidden shadow-none">
                    
                    <CardHeader className="px-3.5">
                        <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Overview</CardTitle>
                         <Badge variant={slaveStatusVariant[liveness]}>
                            {slaveStatusLabel[liveness]}
                        </Badge>
                        </div>
                        <CardDescription className="text-xs font-normal">
                            Identity, network & connection health
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-3 px-2">
                        {/* Identity grid */}
                        <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-2">
                            <div className="col-span-2">
                                <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider flex items-center gap-1">
                                    <IdentificationCardIcon className="size-3" />
                                    Slave ID
                                </dt>
                                <dd className="font-mono tabular-nums text-xs text-foreground font-normal mt-0.5 flex items-center gap-1">
                                    <span className="truncate">{slave.slaveId}</span>
                                    <CopyButton value={slave.slaveId} />
                                </dd>
                            </div>

                            {slave.instanceId && (
                                <div>
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Instance
                                    </dt>
                                    <dd className="font-normal text-xs text-foreground mt-0.5 truncate">
                                        {slave.instanceId}
                                    </dd>
                                </div>
                            )}

                            <div>
                                <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                    Active
                                </dt>
                                <dd className="text-xs text-foreground mt-0.5">
                                    <Badge variant={slave.isActive ? "default" : "outline"} className="text-[10px]">
                                        {slave.isActive ? "Yes" : "No"}
                                    </Badge>
                                </dd>
                            </div>

                            {slave.host && (
                                <div className="col-span-2">
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider flex items-center gap-1">
                                        <GlobeIcon className="size-3" />
                                        Network
                                    </dt>
                                    <dd className="font-mono text-xs text-foreground font-normal mt-0.5">
                                        {slave.host}{slave.port ? `:${slave.port}` : ""}
                                    </dd>
                                </div>
                            )}

                            <div>
                                <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider flex items-center gap-1">
                                    <CalendarIcon className="size-3" />
                                    Registered
                                </dt>
                                <dd className="font-mono text-[11px] text-foreground font-normal mt-0.5">
                                    {new Date(slave.createdAt).toLocaleString()}
                                </dd>
                            </div>

                            <div>
                                <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider flex items-center gap-1">
                                    <CalendarIcon className="size-3" />
                                    Updated
                                </dt>
                                <dd className="font-mono text-[11px] text-foreground font-normal mt-0.5">
                                    {new Date(slave.updatedAt).toLocaleString()}
                                </dd>
                            </div>
                        </dl>

                        {/* Connection status indicator */}
                        {/* <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-start gap-2.5">
                            {statusBlock.icon}
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-normal text-foreground">{statusBlock.label}</span>
                                <span className="text-[11px] font-normal text-muted-foreground leading-relaxed">
                                    {statusBlock.detail}
                                </span>
                            </div>
                        </div> */}

                        {/* Quick machine stats */}
                        <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-center justify-between gap-2">
                            <div className="flex flex-col">
                                <span className="text-xs text-foreground font-normal">
                                    Delegated Machines
                                </span>
                                <span className="text-[11px] font-normal text-muted-foreground leading-relaxed">
                                    {connectedMachines} of {machines.length} connected
                                </span>
                            </div>
                            <Badge variant="outline" className="shrink-0">
                                {machines.length}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Right side: Tabbed content */}
                <div className="lg:col-span-2">
                    <Tabs defaultValue="machines">
                        <TabsList>
                            <TabsTrigger value="machines">Machines</TabsTrigger>
                            <TabsTrigger value="orders">Orders</TabsTrigger>
                            <TabsTrigger value="results">Results</TabsTrigger>
                        </TabsList>

                        <TabsContent value="machines">
                            <MachinesTab machines={machines} />
                        </TabsContent>
                        <TabsContent value="orders">
                            <SlaveOrdersTab slaveId={slaveId} />
                        </TabsContent>
                        <TabsContent value="results">
                            <SlaveResultsTab slaveId={slaveId} />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </Container>
    )
}


function MachinesTab({ machines }: { machines: any[] }) {
    if (!machines.length) {
        return (
            <ResourceEmpty
                title="No delegated machines"
                description="This slave has not reported any machine capabilities yet."
            />
        )
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-normal">Profile</TableHead>
                        <TableHead className="font-normal">Driver</TableHead>
                        <TableHead className="font-normal">Status</TableHead>
                        <TableHead className="font-normal">Tests</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {machines.map((machine: any, i: number) => (
                        <TableRow key={i}>
                            <TableCell className="font-medium">
                                {machine.name || machine.profileKey}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {machine.driverId}
                            </TableCell>
                            <TableCell>
                                <ConnectionBadge
                                    connected={machine.connected ?? false}
                                    running={machine.running ?? false}
                                />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                                {Array.isArray(machine.catalogTests)
                                    ? machine.catalogTests.slice(0, 5).join(", ") +
                                      (machine.catalogTests.length > 5
                                          ? ` +${machine.catalogTests.length - 5} more`
                                          : "")
                                    : "—"}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}


// ─── Orders Tab ──────────────────────────────────────────────────────────────

function SlaveOrdersTab({ slaveId }: { slaveId: string }) {
    const [page, setPage] = React.useState(1)

    const query = React.useMemo<ExternalQuery>(() => ({
        search: slaveId,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [slaveId, page])

    const { data, error, mutate } = useSWR(
        api.slaveOrders.listKey(query),
        () => api.slaveOrders.list(query),
        { refreshInterval: 10_000 },
    )

    const totalPages = pageCount({ page, rows: 0, total: data?.count ?? 0 })
    const refresh = React.useCallback(() => void mutate(), [mutate])
    
    const orders = data?.orders;

    if (error) return <ResourceError error={error} onRetry={refresh} />
    if (!orders) return <PageLoading />
    if (!orders.length) {
        return (
            <ResourceEmpty
                title="No orders"
                description="No orders have been routed to this slave yet."
            />
        )
    }

    return (
        <>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-normal">Dispatch ID</TableHead>
                            <TableHead className="font-normal">Profile Key</TableHead>
                            <TableHead className="font-normal">Driver</TableHead>
                            <TableHead className="font-normal">Status</TableHead>
                            <TableHead className="font-normal">Received At</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => (
                            <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                                <TableCell className="font-mono text-xs font-normal">
                                    {order.dispatchId}
                                </TableCell>
                                <TableCell className="font-normal">
                                    {order.profileKey}
                                </TableCell>
                                <TableCell className="font-normal text-muted-foreground">
                                    {order.driverId}
                                </TableCell>
                                <TableCell className="font-normal">
                                    <AgentOrderStatusBadge status={order.status} />
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                    {new Date(order.receivedAt).toLocaleString()}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {totalPages > 1 && (
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            )}
        </>
    )
}


// Results Tab
function SlaveResultsTab({ slaveId }: { slaveId: string }) {
    const [page, setPage] = React.useState(1)

    const query = React.useMemo<ExternalQuery>(() => ({
        search: slaveId,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [slaveId, page])

    const { data, error, mutate } = useSWR(
        api.slaveResults.listKey(query),
        () => api.slaveResults.list(query),
        { refreshInterval: 10_000 },
    )

    const totalPages = pageCount({ page, rows: 0, total: data?.count ?? 0 })
    const refresh = React.useCallback(() => void mutate(), [mutate])

    const rows = React.useMemo(
        () => (data?.results ?? []).map((result) => ({ result, payload: JSON.parse(result.payloadJson) })),
        [data?.results],
    )

    if (error) return <ResourceError error={error} onRetry={refresh} />
    if (!data?.results) return <PageLoading />
    if (!rows.length) {
        return (
            <ResourceEmpty
                title="No results"
                description="No results have been produced by this slave yet."
            />
        )
    }

    return (
        <>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-normal">Dispatch ID</TableHead>
                            <TableHead className="font-normal">Sample ID</TableHead>
                            <TableHead className="font-normal">MediCloud Order</TableHead>
                            <TableHead className="font-normal">Delivery</TableHead>
                            <TableHead className="font-normal">Retries</TableHead>
                            <TableHead className="font-normal">Created At</TableHead>
                            <TableHead className="font-normal w-10" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(({ result, payload }) => (
                            <TableRow key={result.id} className="hover:bg-muted/50 transition-colors">
                                <TableCell className="font-mono text-xs font-normal">
                                    {result.medicloudDispatchId}
                                </TableCell>
                                <TableCell className="font-normal">
                                    {payload.sampleId || "—"}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground font-normal">
                                    {result.medicloudOrderId}
                                </TableCell>
                                <TableCell className="font-normal">
                                    <ResultDeliveryStatusBadge status={result.deliveryStatus} />
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground font-normal">
                                    {result.retryCount}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                    {new Date(result.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <SlaveResultDetail result={result} payload={payload} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {totalPages > 1 && (
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            )}
        </>
    )
}
