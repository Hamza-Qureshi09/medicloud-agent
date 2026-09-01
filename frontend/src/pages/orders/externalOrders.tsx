import type { ExternalOrder } from "@/types/api";
import { Link } from "react-router-dom";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { ExternalOrderStatusBadge } from "@/components/common/statusBadge";
import { Pagination } from "@/components/common/pagination";


interface ExternalOrdersProps {
    orders: ExternalOrder[] | undefined;
    error: unknown;
    onRetry: () => void;
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function ExternalOrders({
    orders,
    error,
    onRetry,
    page,
    totalPages,
    onPageChange,
}: ExternalOrdersProps) {

    if (error) return <ResourceError error={error} onRetry={onRetry} />;
    if (!orders) return <PageLoading />;

    if (!orders.length) {
        return (
            <ResourceEmpty
                title="No external orders"
                description="No orders have been received from MediCloud yet. Orders will appear here once the sync flow delivers them."
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-2xl border border-border bg-card relative">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-normal">Dispatch ID</TableHead>
                            <TableHead className="font-normal">Profile Key</TableHead>
                            <TableHead className="font-normal">Driver</TableHead>
                            <TableHead className="font-normal">Status</TableHead>
                            <TableHead className="font-normal">Agent Order</TableHead>
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
                                    <ExternalOrderStatusBadge status={order.status} />
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
                            </TableRow>
                        ))}
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

