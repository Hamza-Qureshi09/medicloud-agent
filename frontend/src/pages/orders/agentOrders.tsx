import type { AgentOrder, MachineProfile } from "@/types/api";
import { Link } from "react-router-dom";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { AgentOrderStatusBadge, OrderSourceBadge } from "@/components/common/statusBadge";
import { Pagination } from "@/components/common/pagination";
import { ConfirmAction } from "@/components/common/confirmAction";
import { Button } from "@/components/ui/button";
import { TrashIcon, XCircleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { OrderForm } from "./orderForm";


interface AgentOrdersProps {
    orders: AgentOrder[] | undefined;
    error: unknown;
    onRetry: () => void;
    profiles: MachineProfile[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onRefresh: () => Promise<void>;
}

export function AgentOrders({
    orders,
    error,
    onRetry,
    profiles,
    page,
    totalPages,
    onPageChange,
    onRefresh,
}: AgentOrdersProps) {

    if (error) return <ResourceError error={error} onRetry={onRetry} />;
    if (!orders) return <PageLoading />;

    if (!orders.length) {
        return (
            <ResourceEmpty
                title="No orders"
                description="Nothing here yet. Orders appear once MediCloud dispatches one, or once you create one on this agent."
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-2xl border border-border bg-card relative">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-normal">ID</TableHead>
                            <TableHead className="font-normal">Source</TableHead>
                            <TableHead className="font-normal">Profile Key</TableHead>
                            <TableHead className="font-normal">Driver</TableHead>
                            <TableHead className="font-normal">Status</TableHead>
                            <TableHead className="font-normal">Agent Order</TableHead>
                            <TableHead className="font-normal">Received At</TableHead>
                            <TableHead className="text-right font-normal">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order) => {
                            const isOwned = order.source === "local";

                            const isOpen = isOwned && order.status !== "completed";
                            const canUpdate = isOpen && order.machineStatus === "pending";

                            const canDelete = canUpdate || (isOpen && (
                                order.machineStatus === "failed"
                                || order.machineStatus === null
                            ));

                            return (
                                <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                                    <TableCell>
                                        <Tooltip>
                                            <TooltipTrigger
                                                render={
                                                    <span className="font-mono text-xs font-normal cursor-help">
                                                        {isOwned ? `#${order.id}` : order.dispatchId}
                                                    </span>
                                                }
                                            />
                                            <TooltipContent className="max-w-64 text-pretty">
                                                {isOwned
                                                    ? "ID"
                                                    : "Dispatched ID"}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell className="font-normal">
                                        <OrderSourceBadge source={order.source} />
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
                                    <TableCell className="tabular-nums font-mono text-xs font-normal">
                                        {order.agentOrderId != null ? (
                                            <Link
                                                to={`/dashboard/orders/${order.agentOrderId}`}
                                                className="hover:underline hover:text-primary text-muted-foreground transition-colors font-normal"
                                            >
                                                #{order.agentOrderId}
                                            </Link>
                                        ) : "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                        {new Date(order.receivedAt).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {canDelete ? (
                                            <div className="flex items-center justify-end gap-1">
                                                {canUpdate ? (
                                                    <OrderForm
                                                        profiles={profiles}
                                                        agentOrder={order}
                                                        onSaved={onRefresh}
                                                    />
                                                ) : null}

                                                <ConfirmAction
                                                    trigger={
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            aria-label={`Delete ${order.dispatchId}`}
                                                        >
                                                            <TrashIcon />
                                                        </Button>
                                                    }
                                                    title="Delete this order?"
                                                    description="The order is removed from this agent and from the analyzer it was staged on. Results already returned are kept."
                                                    actionLabel="Delete order"
                                                    onConfirm={async () => {
                                                        await api.agentOrders.remove(order.id);
                                                        toast.success("Order deleted successfully");
                                                        await onRefresh();
                                                    }}
                                                />
                                            </div>
                                        ) : (!isOwned && (order.status === "received" || order.status === "acknowledged")) ? (
                                            <ConfirmAction
                                                trigger={
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    >
                                                        <XCircleIcon />
                                                    </Button>
                                                }
                                                title="Reject Order"
                                                description={`Are you sure you want to reject order ${order.dispatchId}? This will mark it as failed and notify MediCloud.`}
                                                actionLabel="Reject"
                                                onConfirm={async () => {
                                                    await api.agentOrders.reject(order.id);
                                                    toast.success("Order rejected successfully");
                                                    await onRefresh();
                                                }}
                                            />
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

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
    );
}
