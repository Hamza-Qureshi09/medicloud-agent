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
    CalendarCheckIcon,
    TestTubeIcon,
    UserIcon,
    PencilSimpleIcon,
    DotsThreeVerticalIcon
} from "@phosphor-icons/react";
import { OrderForm } from "./orderForm";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
                        className="w-fit gap-1.5 text-muted-foreground hover:text-foreground hover:bg-transparent font-normal"
                        onClick={() => navigate("/dashboard/orders")}
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        <span className="font-normal">Back to Orders</span>
                    </Button>

                    <PageSection
                        eyebrow={`SAMPLE BARCODE: ${order.sampleId}`}
                        title={`Order Details #${order.id}`}
                        description="Staged laboratory test order specification, patient identity mapping, and analyzer routing status."
                        actions={
                            <div className="flex flex-wrap items-center gap-2">
                                <OrderStatusBadge status={order.status} />

                                {/* Desktop action buttons */}
                                <div className="hidden sm:flex items-center gap-2">

                                    {(order.status === "failed" || order.status === "pending") && (
                                        <Button
                                            size="sm"
                                            className="font-normal"
                                            onClick={() => handleOrderMutation(() => api.orders.resend(order.id))}
                                        >
                                            <ArrowCounterClockwiseIcon data-icon="inline-start" />
                                            <span className="font-normal">Resend Order</span>
                                        </Button>
                                    )}

                                    <OrderForm
                                        profiles={profilesData?.profiles ?? []}
                                        order={order}
                                        onSaved={async () => { await orderMutate() }}
                                        trigger={
                                            <Button variant="outline" size="sm" className="font-normal">
                                                <PencilSimpleIcon data-icon="inline-start" />
                                                <span className="font-normal">Edit Order</span>
                                            </Button>
                                        }
                                    />

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
                                                await api.orders.remove(order.id)
                                                navigate("/dashboard/orders")
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Mobile action buttons with Dropdown menu for extra/destructive actions */}
                                <div className="sm:hidden flex items-center gap-2">
                                    {(order.status === "failed" || order.status === "pending") && (
                                        <Button
                                            size="sm"
                                            className="font-normal"
                                            onClick={() => handleOrderMutation(() => api.orders.resend(order.id))}
                                        >
                                            <ArrowCounterClockwiseIcon data-icon="inline-start" />
                                            <span className="font-normal">Resend</span>
                                        </Button>
                                    )}

                                    <OrderForm
                                        profiles={profilesData?.profiles ?? []}
                                        order={order}
                                        onSaved={async () => { await orderMutate() }}
                                        trigger={
                                            <Button variant="outline" size="sm" className="font-normal">
                                                <PencilSimpleIcon data-icon="inline-start" />
                                                <span className="font-normal">Edit</span>
                                            </Button>
                                        }
                                    />

                                    {order.status !== "completed" && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger
                                                render={
                                                    <Button variant="outline" size="icon-sm" aria-label="Order actions">
                                                        <DotsThreeVerticalIcon weight="bold" />
                                                    </Button>
                                                }
                                            />

                                            <DropdownMenuContent align="end" className="min-w-44">
                                                <DropdownMenuGroup>
                                                    <ConfirmAction
                                                        trigger={
                                                            <DropdownMenuItem
                                                                className="font-normal text-destructive focus:text-destructive"
                                                                onSelect={(e) => e.preventDefault()}
                                                            >
                                                                <TrashIcon />
                                                                Delete order
                                                            </DropdownMenuItem>
                                                        }
                                                        title="Delete this order?"
                                                        description="Active orders are removed from the analyzer staging map before deletion."
                                                        actionLabel="Delete order"
                                                        onConfirm={async () => {
                                                            await api.orders.remove(order.id)
                                                            navigate("/dashboard/orders")
                                                        }}
                                                    />
                                                </DropdownMenuGroup>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
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
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 items-start">

                    {/* Left Column: Sample & Patient Identity */}
                    <Card className="lg:col-span-1 rounded-3xl overflow-hidden shadow-none">
                        <CardHeader className="">
                            <CardTitle className="text-sm font-normal">Sample & Patient Identity</CardTitle>
                            <CardDescription className="text-xs font-normal">
                                Specimen barcode & patient demographics
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3 pt-0">
                            {/* Identity Spec List */}
                            <Card className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/30 p-3 shadow-none">
                                <div className="col-span-2">
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Sample Barcode
                                    </dt>
                                    <dd className="font-mono text-sm flex items-center gap-1.5 mt-0.5 font-normal text-foreground">
                                        <BarcodeIcon className="h-4 w-4 text-primary shrink-0" />
                                        <span>{order.sampleId}</span>
                                    </dd>
                                </div>

                                <div>
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Sample Type
                                    </dt>
                                    <dd className="text-xs mt-0.5 font-normal text-foreground">
                                        <Badge variant="outline" className="text-[10px] font-normal gap-1">
                                            <TestTubeIcon className="size-3 text-muted-foreground" />
                                            {order.sampleType || "SERUM"}
                                        </Badge>
                                    </dd>
                                </div>

                                <div>
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Patient ID
                                    </dt>
                                    <dd className="font-mono text-xs mt-0.5 font-normal text-foreground">
                                        {order.patientId || "—"}
                                    </dd>
                                </div>

                                <div className="col-span-2">
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Patient Name
                                    </dt>
                                    <dd className="text-xs mt-0.5 font-normal text-foreground flex items-center gap-1.5">
                                        <UserIcon className="size-3.5 text-muted-foreground shrink-0" />
                                        <span>{order.patientName || "—"}</span>
                                    </dd>
                                </div>
                            </Card>

                            {/* Expiry Timestamp info */}
                            <Card className="bg-muted/30 p-3 flex-row items-center justify-between gap-1 text-xs font-normal shadow-none">
                                <span className="text-muted-foreground flex items-center gap-1.5 font-normal">
                                    <ClockIcon className="h-3.5 w-3.5" />
                                    Expires At
                                </span>
                                <span className="font-mono text-foreground font-normal">
                                    {order.expiresAt ? new Date(order.expiresAt).toLocaleString() : "—"}
                                </span>
                            </Card>
                        </CardContent>
                    </Card>

                    {/* Right Column: Analyzer Routing & Requested Test Panel */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        {/* Target Analyzer Details */}
                        <Card className="rounded-3xl overflow-hidden shadow-none">
                            <CardHeader className="">
                                <CardTitle className="text-sm font-normal">Target Analyzer & Routing</CardTitle>
                                <CardDescription className="text-xs font-normal">
                                    Assigned machine profile & rack staging position
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-border/50 bg-muted/30 p-3 flex flex-col gap-1">
                                        <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider flex items-center gap-1">
                                            <CpuIcon className="h-3.5 w-3.5 text-primary" />
                                            Assigned Analyzer Profile
                                        </dt>
                                        <dd className="text-xs mt-0.5 font-normal">
                                            <Link
                                                to={`/dashboard/profiles/${order.machineId}`}
                                                className="hover:underline text-primary transition-colors font-mono font-medium text-xs"
                                            >
                                                {matchedProfile?.name || `Profile #${order.machineId}`}
                                            </Link>
                                            {matchedProfile?.driverId && (
                                                <span className="text-[11px] text-muted-foreground font-normal block mt-0.5">
                                                    Driver: {matchedProfile.driverId}
                                                </span>
                                            )}
                                        </dd>
                                    </div>

                                    <div className="rounded-2xl border border-border/50 bg-muted/30 p-3 flex flex-col gap-1">
                                        <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider flex items-center gap-1">
                                            <CalendarCheckIcon className="h-3.5 w-3.5 text-primary" />
                                            Rack Staging Position
                                        </dt>
                                        <dd className="font-mono text-xs mt-0.5 font-normal text-foreground">
                                            {order.rackPosition || "Auto Staged"}
                                        </dd>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Requested Test Panel */}
                        <Card className="rounded-3xl overflow-hidden shadow-none">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="flex flex-col gap-0.5">
                                    <CardTitle className="text-sm font-normal">Requested Test Panel</CardTitle>
                                    <CardDescription className="text-xs font-normal">
                                        Test codes staged for query by the analyzer
                                    </CardDescription>
                                </div>
                                <Badge variant="secondary" className="font-normal text-xs gap-1">
                                    <FlaskIcon className="size-3" />
                                    {order.tests.length} tests
                                </Badge>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="flex flex-wrap gap-2 p-3 rounded-2xl border border-border/50 bg-muted/20 min-h-14 max-h-fit items-start">
                                    {order.tests.length === 0 ? (
                                        <span className="text-xs text-muted-foreground font-normal">No tests requested.</span>
                                    ) : (
                                        order.tests.map((test, idx) => (
                                            <Badge
                                                key={idx}
                                                variant="outline"
                                                className="gap-1.5 px-3 py-1 text-xs font-mono font-normal bg-background border-border/80 text-foreground"
                                            >
                                                <FlaskIcon className="size-3.5 text-primary shrink-0" />
                                                <span>{test}</span>
                                            </Badge>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                </div>
            </div>
        </Container>
    );
}