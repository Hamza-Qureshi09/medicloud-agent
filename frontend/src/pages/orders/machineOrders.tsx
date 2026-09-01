import type { MachineOrder, MachineProfile } from "@/types/api";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowCounterClockwiseIcon, TrashIcon, ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrderStatusBadge } from "@/components/common/statusBadge";
import { ConfirmAction } from "@/components/common/confirmAction";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { OrderForm } from "./orderForm";
import { Pagination } from "@/components/common/pagination";
import { TestBadgeList } from "@/components/common/testBadgeList";


interface MachineOrdersProps {
    orders: MachineOrder[] | undefined;
    error: unknown;
    onRetry: () => void;
    profiles: MachineProfile[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onRefresh: () => Promise<void>;
}

export function MachineOrders({
    orders,
    error,
    onRetry,
    profiles,
    page,
    totalPages,
    onPageChange,
    onRefresh,
}: MachineOrdersProps) {

    const orderAction = useAsyncAction("Order action failed.");

    async function runOrderMutation(action: () => Promise<unknown>) {
        await orderAction.execute(async () => {
            await action();
            await onRefresh();
        }).catch(() => undefined);
    }

    // This tab owns its own loading and error state so a failure here cannot
    // hide the sibling tab, which reads from a different database.
    if (error) return <ResourceError error={error} onRetry={onRetry} />;
    if (!orders) return <PageLoading />;

    return (
        <>
            {/* Action-level error */}
            {orderAction.error ? (
                <Alert variant="destructive">
                    <WarningCircleIcon className="size-4" />
                    <AlertTitle className="font-normal">Order action failed</AlertTitle>
                    <AlertDescription className="font-normal">{orderAction.error}</AlertDescription>
                </Alert>
            ) : null}

            {orders.length ? (
                <div className="flex flex-col gap-4">
                    <div className="overflow-x-auto rounded-2xl border border-border bg-card relative">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="font-normal">Sample ID</TableHead>
                                    <TableHead className="font-normal">Patient</TableHead>
                                    <TableHead className="font-normal">Analyzer</TableHead>
                                    <TableHead className="font-normal">Tests</TableHead>
                                    <TableHead className="font-normal">Status</TableHead>
                                    <TableHead className="font-normal">Expiry</TableHead>
                                    {/* Sticky right column for actions on smaller viewports */}
                                    <TableHead className="text-center font-normal sticky right-0 bg-card z-10 shadow-[-12px_0_12px_-4px_rgba(0,0,0,0.05)] border-l border-border/40">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map((order) => (
                                    <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-normal">
                                            <Link
                                                to={`/dashboard/orders/${order.id}`}
                                                className="hover:underline hover:text-primary transition-colors inline-flex items-center gap-1 font-normal text-foreground"
                                            >
                                                {order.sampleId}
                                                <ArrowRightIcon className="size-3.5 opacity-40 hover:opacity-100" />
                                            </Link>
                                        </TableCell>

                                        <TableCell className="font-normal">
                                            {order.patientName || order.patientId || "—"}
                                        </TableCell>

                                        <TableCell className="tabular-nums font-mono text-xs font-normal">
                                            <Link
                                                to={`/dashboard/profiles/${order.machineId}`}
                                                className="hover:underline hover:text-primary text-muted-foreground transition-colors font-normal"
                                            >
                                                #{order.machineId}
                                            </Link>
                                        </TableCell>

                                        <TableCell className="max-w-56 truncate font-normal">
                                            <TestBadgeList tests={order.tests} maxVisible={2} /> 
                                        </TableCell>

                                        <TableCell className="font-normal">
                                            <OrderStatusBadge status={order.status} />
                                        </TableCell>

                                        <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                            {new Date(order.expiresAt).toLocaleString()}
                                        </TableCell>

                                        {/* Sticky action cell */}
                                        <TableCell className="sticky right-0 bg-card z-10 shadow-[-12px_0_12px_-4px_rgba(0,0,0,0.05)] border-l border-border/40">
                                            <div className="flex items-center justify-end gap-1">
                                                {order.status !== "completed" ? (
                                                    <OrderForm
                                                        profiles={profiles}
                                                        order={order}
                                                        onSaved={onRefresh}
                                                    />
                                                ) : null}

                                                {(order.status === "failed" || order.status === "pending") && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        aria-label={`Resend ${order.sampleId}`}
                                                        onClick={() =>
                                                            void runOrderMutation(() => api.orders.resend(order.id))
                                                        }
                                                    >
                                                        <ArrowCounterClockwiseIcon />
                                                    </Button>
                                                )}

                                                {order.status !== "completed" ? (
                                                    <ConfirmAction
                                                        trigger={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-xs"
                                                                aria-label={`Delete ${order.sampleId}`}
                                                            >
                                                                <TrashIcon />
                                                            </Button>
                                                        }
                                                        title="Delete this order?"
                                                        description="Active orders are removed from the analyzer staging map before deletion. Completed orders remain immutable."
                                                        actionLabel="Delete order"
                                                        onConfirm={() =>
                                                            runOrderMutation(() => api.orders.remove(order.id))
                                                        }
                                                    />
                                                ) : null}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center pt-2">
                            <Pagination
                                page={page}
                                totalPages={totalPages}
                                onPageChange={onPageChange}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <ResourceEmpty
                    title="No matching orders"
                    description="Adjust the filters or create a new order for a running analyzer."
                    action={
                        <OrderForm
                            profiles={profiles}
                            onSaved={onRefresh}
                        />
                    }
                />
            )}
        </>
    );
}

