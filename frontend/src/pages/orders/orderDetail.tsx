import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useAsyncAction } from "@/hooks/use-async-action";
import { PageSection } from "@/components/common/pageSection";
import { PageLoading, ResourceError } from "@/components/common/resourceState";
import { OrderStatusBadge } from "@/components/common/statusBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/common/confirmAction";
import { Container } from "@/components/common/container";
import { 
    ArrowLeftIcon, 
    ArrowCounterClockwiseIcon, 
    BarcodeIcon, 
    CpuIcon, 
    ClockIcon, 
    TrashIcon,
    FlaskIcon,
    CalendarCheckIcon
} from "@phosphor-icons/react";

export function OrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const orderId = Number(id);

    // Fetch detail specifications for specific machine order
    const {
        data: orderData,
        error: orderError,
        mutate: orderMutate,
    } = useSWR(
        orderId ? api.orders.detailKey(orderId) : null,
        () => api.orders.get(orderId)
    );

    // Fetch registered machine profiles to map analyzer metadata
    const { data: profilesData } = useSWR(
        api.profiles.listKey(),
        () => api.profiles.list()
    );

    const orderAction = useAsyncAction("Order action failed.");

    // Explicit React.useMemo for order object memoization
    const order = React.useMemo(() => orderData?.order, [orderData]);

    // Explicit React.useMemo to find matched target analyzer profile
    const matchedProfile = React.useMemo(() => {
        if (!order || !profilesData?.profiles) return undefined;
        return profilesData.profiles.find((p) => p.id === order.machineId);
    }, [profilesData, order]);

    if (!orderData && !orderError) return <PageLoading />;
    if (orderError || !order) {
        return (
            <ResourceError
                error={orderError || new Error("Order not found")}
                onRetry={() => orderMutate()}
            />
        );
    }

    // Action mutation handler for resend or delete lifecycle calls
    async function handleOrderMutation(action: () => Promise<unknown>) {
        await orderAction.execute(async () => {
            await action();
            await orderMutate();
        }).catch(() => undefined);
    }

    return (
        <Container>
            <div className="flex flex-col gap-6 w-full">
                
                {/* Navigation header and action toolbar */}
                <div className="flex flex-col gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit gap-1.5 text-muted-foreground hover:text-foreground p-0 hover:bg-transparent font-normal"
                        onClick={() => navigate("/dashboard/orders")}
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        <span className="font-normal">Back to Worklist Orders</span>
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
                                        className="font-normal"
                                        onClick={() => handleOrderMutation(() => api.orders.resend(order.id))}
                                    >
                                        <ArrowCounterClockwiseIcon data-icon="inline-start" />
                                        <span className="font-normal">Resend Order</span>
                                    </Button>
                                )}

                                {order.status !== "completed" && (
                                    <ConfirmAction
                                        trigger={
                                            <Button variant="destructive" size="sm" className="font-normal">
                                                <TrashIcon data-icon="inline-start" />
                                                <span className="font-normal">Delete Order</span>
                                            </Button>
                                        }
                                        title="Delete this order?"
                                        description="Active orders are removed from the analyzer staging map before deletion."
                                        actionLabel="Delete order"
                                        onConfirm={async () => {
                                            await api.orders.remove(order.id);
                                            navigate("/dashboard/orders");
                                        }}
                                    />
                                )}
                            </div>
                        }
                    />
                </div>

                {/* Error Banner */}
                {orderAction.error && (
                    <Alert variant="destructive">
                        <AlertTitle className="font-normal">Action Failed</AlertTitle>
                        <AlertDescription className="font-normal">{orderAction.error}</AlertDescription>
                    </Alert>
                )}

                {/* 2-Card responsive grid specification layout */}
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">
                    
                    {/* Left Column: Sample identity card */}
                    <Card className="lg:col-span-1 border-border bg-card">
                        <CardHeader>
                            <CardTitle className="text-base font-normal">Sample & Patient Identity</CardTitle>
                            <CardDescription className="text-xs font-normal">Specimen barcode and patient demographics</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <Card className="border-none bg-muted/50 shadow-none">
                                <CardContent className="grid grid-cols-2 gap-3 p-3.5 text-sm">
                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Sample ID</dt>
                                        <dd className="font-mono text-xs flex items-center gap-1 mt-0.5 font-normal text-foreground">
                                            <BarcodeIcon className="h-3.5 w-3.5 text-primary" />
                                            {order.sampleId}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Sample Type</dt>
                                        <dd className="text-xs mt-0.5 font-normal text-foreground">{order.sampleType || "SERUM"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Patient Name</dt>
                                        <dd className="text-xs mt-0.5 font-normal text-foreground">{order.patientName || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Patient ID</dt>
                                        <dd className="font-mono text-xs mt-0.5 font-normal text-foreground">{order.patientId || "—"}</dd>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-none bg-muted/50 shadow-none">
                                <CardContent className="p-3 flex items-center justify-between text-xs font-normal">
                                    <span className="text-muted-foreground flex items-center gap-1.5 font-normal">
                                        <ClockIcon className="h-3.5 w-3.5" />
                                        Expires At
                                    </span>
                                    <span className="font-mono text-foreground font-normal">
                                        {new Date(order.expiresAt).toLocaleString()}
                                    </span>
                                </CardContent>
                            </Card>
                        </CardContent>
                    </Card>

                    {/* Right Column: Target analyzer & test panel card */}
                    <Card className="lg:col-span-2 border-border bg-card">
                        <CardHeader>
                            <CardTitle className="text-base font-normal">Target Analyzer & Requested Test Panel</CardTitle>
                            <CardDescription className="text-xs font-normal">Assigned machine profile and requested test codes</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-5">
                            <Card className="border-none bg-muted/50 shadow-none">
                                <CardContent className="grid grid-cols-2 gap-3 p-3.5 text-sm">
                                    <div>
                                        <dt className="text-xs text-muted-foreground flex items-center gap-1.5 font-normal">
                                            <CpuIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            Assigned Machine
                                        </dt>
                                        <dd className="text-xs mt-1 font-normal">
                                            <Link 
                                                to={`/dashboard/profiles/${order.machineId}`}
                                                className="hover:underline hover:text-primary transition-colors font-mono font-normal text-foreground"
                                            >
                                                {matchedProfile?.name || `Analyzer Profile #${order.machineId}`}
                                            </Link>
                                        </dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs text-muted-foreground flex items-center gap-1.5 font-normal">
                                            <CalendarCheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            Rack Position
                                        </dt>
                                        <dd className="font-mono text-xs mt-1 font-normal text-foreground">{order.rackPosition || "Auto Staged"}</dd>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="space-y-2">
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-normal">
                                    <FlaskIcon className="h-3.5 w-3.5 text-primary" />
                                    Requested Test Codes ({order.tests.length})
                                </span>
                                <Card className="border-border bg-muted/50 shadow-none">
                                    <CardContent className="flex flex-wrap gap-2 p-4">
                                        {order.tests.map((test, idx) => (
                                            <span 
                                                key={idx}
                                                className="font-mono text-xs px-2.5 py-1 rounded-lg bg-background border border-border text-foreground shadow-2xs font-normal"
                                            >
                                                {test}
                                            </span>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </Container>
    );
}