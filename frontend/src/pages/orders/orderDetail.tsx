import React from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import useSWR from "swr"
import { api } from "@/lib/api"
import { useAsyncAction } from "@/hooks/use-async-action"
import { PageSection } from "@/components/common/pageSection"
import { PageLoading, ResourceError } from "@/components/common/resourceState"
import { OrderStatusBadge } from "@/components/common/statusBadge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { ConfirmAction } from "@/components/common/confirmAction"
import { Container } from "@/components/common/container"
import { 
    ArrowLeftIcon, 
    ArrowCounterClockwiseIcon, 
    BarcodeIcon, 
    UserIcon, 
    CpuIcon, 
    ClockIcon, 
    TrashIcon,
    FlaskIcon,
    CalendarCheckIcon
} from "@phosphor-icons/react"

export function OrderDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const orderId = Number(id)

    const {
        data: orderData,
        error: orderError,
        mutate: orderMutate,
    } = useSWR(
        orderId ? api.orders.detailKey(orderId) : null,
        () => api.orders.get(orderId)
    )

    const { data: profilesData } = useSWR(
        api.profiles.listKey(),
        () => api.profiles.list()
    )

    const orderAction = useAsyncAction("Order action failed.")

    if (!orderData && !orderError) return <PageLoading />
    if (orderError || !orderData?.order) {
        return (
            <ResourceError
                error={orderError || new Error("Order not found")}
                onRetry={() => orderMutate()}
            />
        )
    }

    const order = orderData.order
    const matchedProfile = profilesData?.profiles.find((p) => p.id === order.machineId)

    async function handleOrderMutation(action: () => Promise<unknown>) {
        await orderAction.execute(async () => {
            await action()
            await orderMutate()
        }).catch(() => undefined)
    }

    return (
        <Container>
            <div className="flex flex-col gap-6 w-full">
                
                {/* Top Back Navigation */}
                <div className="flex flex-col gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit gap-1.5 text-muted-foreground hover:text-foreground p-0 hover:bg-transparent"
                        onClick={() => navigate("/dashboard/orders")}
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        <span>Back to Worklist Orders</span>
                    </Button>

                    <PageSection
                        eyebrow={`SAMPLE BARCODE: ${order.sampleId}`}
                        title={`Order Details - #${order.id}`}
                        description="Staged laboratory test order specification, patient identity mapping, and analyzer routing status."
                        actions={
                            <div className="flex flex-wrap items-center gap-2">
                                <OrderStatusBadge status={order.status} />

                                {(order.status === "failed" || order.status === "pending") && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOrderMutation(() => api.orders.resend(order.id))}
                                    >
                                        <ArrowCounterClockwiseIcon data-icon="inline-start" />
                                        <span>Resend Order</span>
                                    </Button>
                                )}

                                {order.status !== "completed" && (
                                    <ConfirmAction
                                        trigger={
                                            <Button variant="destructive" size="sm">
                                                <TrashIcon data-icon="inline-start" />
                                                <span>Delete Order</span>
                                            </Button>
                                        }
                                        title="Delete this order?"
                                        description="Active orders are removed from the analyzer staging map before deletion."
                                        actionLabel="Delete order"
                                        onConfirm={async () => {
                                            await api.orders.remove(order.id)
                                            navigate("/dashboard/orders")
                                        }}
                                    />
                                )}
                            </div>
                        }
                    />
                </div>

                {orderAction.error && (
                    <Alert variant="destructive">
                        <AlertTitle>Action Failed</AlertTitle>
                        <AlertDescription>{orderAction.error}</AlertDescription>
                    </Alert>
                )}

                {/* 2-Card Layout */}
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">
                    
                    {/* Left Overview Card */}
                    <Card className="lg:col-span-1 border-border bg-card">
                        <CardHeader>
                            <CardTitle className="text-base font-bold">Sample & Patient Identity</CardTitle>
                            <CardDescription className="text-xs">Specimen barcode and patient demographics</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium">Sample ID</dt>
                                    <dd className="font-semibold font-mono text-xs flex items-center gap-1 mt-0.5">
                                        <BarcodeIcon className="h-3.5 w-3.5 text-primary" />
                                        {order.sampleId}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium">Sample Type</dt>
                                    <dd className="font-semibold text-xs mt-0.5">{order.sampleType || "SERUM"}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium">Patient Name</dt>
                                    <dd className="font-medium text-xs mt-0.5">{order.patientName || "—"}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium">Patient ID</dt>
                                    <dd className="font-mono text-xs font-medium mt-0.5">{order.patientId || "—"}</dd>
                                </div>
                            </dl>

                            <div className="p-3 rounded-2xl bg-muted/50 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <ClockIcon className="h-3.5 w-3.5" />
                                    Expires At
                                </span>
                                <span className="font-mono font-medium text-foreground">
                                    {new Date(order.expiresAt).toLocaleString()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right Details Card */}
                    <Card className="lg:col-span-2 border-border bg-card">
                        <CardHeader>
                            <CardTitle className="text-base font-bold">Target Analyzer & Requested Test Panel</CardTitle>
                            <CardDescription className="text-xs">Assigned machine profile and requested test codes</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-5">
                            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                                        <CpuIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        Assigned Machine
                                    </dt>
                                    <dd className="font-semibold text-xs mt-1">
                                        <Link 
                                            to={`/dashboard/profiles/${order.machineId}`}
                                            className="hover:underline hover:text-primary transition-colors font-mono"
                                        >
                                            {matchedProfile?.name || `Analyzer Profile #${order.machineId}`}
                                        </Link>
                                    </dd>
                                </div>

                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                                        <CalendarCheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        Rack Position
                                    </dt>
                                    <dd className="font-mono text-xs font-semibold mt-1">{order.rackPosition || "Auto Staged"}</dd>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <FlaskIcon className="h-3.5 w-3.5 text-primary" />
                                    Requested Test Codes ({order.tests.length})
                                </span>
                                <div className="flex flex-wrap gap-2 p-4 rounded-2xl bg-muted/50 border border-border/40">
                                    {order.tests.map((test, idx) => (
                                        <span 
                                            key={idx}
                                            className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-background border border-border text-foreground shadow-2xs"
                                        >
                                            {test}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </Container>
    )
}