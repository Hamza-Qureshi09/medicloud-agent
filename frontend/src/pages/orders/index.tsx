import React, { useState } from "react";
import type { OrderStatus } from "@/types/api";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { useSearchParams, Link } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import { Input } from "@/components/ui/input";
import { OrderStatusBadge } from "@/components/common/statusBadge";
import { ConfirmAction } from "@/components/common/confirmAction";
import { useDebounceCallback } from "@/hooks/use-debounce-callback";
import { OrderForm } from "./orderForm";
import { ITEMS_PER_PAGE } from "@/lib/global";
import { Pagination } from "@/components/common/pagination";
import { TestBadgeList } from "@/components/common/testBadgeList";

export function OrdersPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const [params, setParams] = useSearchParams();

    const status = (params.get("status") || "") as OrderStatus | "";
    const sampleId = params.get("sampleId") || "";

    // local search state just for input
    const [search, setSearch] = React.useState(sampleId);

    const profileQuery = React.useMemo(() => ({ enabled: true }), []);
    const {
        data: profilesData,
        mutate: profilesMutate,
    } = useSWR(
        api.profiles.listKey(profileQuery),
        () => api.profiles.list(profileQuery),
        {}
    );

    // Count for pagination
    const { data: orderCount, mutate: orderCountMutate } = useSWR(
        api.orders.countKey,
        () => api.orders.count(),
    );

    const totalCount = orderCount?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

    // Query state memoization using explicit React.useMemo
    const orderQuery = React.useMemo(() => ({
        status: status || undefined,
        sampleId: sampleId || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
    }), [status, sampleId, currentPage]);

    const {
        data: ordersData,
        isValidating: orderIsValidating,
        mutate: orderMutate,
        error: orderErrors,
    } = useSWR(
        api.orders.listKey(orderQuery),
        () => api.orders.list(orderQuery),
    );

    const orderAction = useAsyncAction("Order action failed.");

    // handle filters
    const updateFilter = React.useCallback(
        (key: string, value: string) => {
            const next = new URLSearchParams(params);

            if (value) next.set(key, value);
            else next.delete(key);

            setParams(next, { replace: true });
            setCurrentPage(1); // reset to first page on filter change
        },
        [params, setParams],
    );

    const debouncedUpdateFilter = useDebounceCallback(updateFilter, 400);

    // Refresh handler: resets URL parameters, resets search state, and mutates data
    const hardRefresh = React.useCallback(async () => {
        await Promise.all([orderMutate(), orderCountMutate(), profilesMutate()]);
    }, [orderCountMutate, orderMutate, profilesMutate])

    const handleRefresh = React.useCallback(async () => {
        setSearch("");
        setParams({}, { replace: true });
        setCurrentPage(1);

        // hard refresh
        void hardRefresh()
    }, [setParams, hardRefresh]);

    if (!ordersData && !orderErrors) return <PageLoading />;
    if (orderErrors) {
        return <ResourceError error={orderErrors} onRetry={() => orderMutate()} />;
    }

    // actions
    async function runOrderMutation(action: () => Promise<unknown>) {
        await orderAction.execute(async () => {
            await action();
            await hardRefresh();
        }).catch(() => undefined);
    }

    return (
        <Container>

            {/* Page header */}
            <PageSection
                eyebrow="Worklist"
                title="Orders in motion"
                description="Search and filter state is stored in the URL — views can be bookmarked and shared."
                actions={
                    <>
                        <RefreshButton isLoading={orderIsValidating} onRefresh={handleRefresh} />
                        <OrderForm
                            profiles={profilesData?.profiles.filter((p) => p.enabled) ?? []}
                            onSaved={hardRefresh}
                        />
                    </>
                }
            />

            {/* Filters */}
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                    aria-label="Search by sample ID"
                    placeholder="Search sample ID"
                    className="font-normal"
                    value={search}
                    onChange={(event) => {
                        const value = event.target.value;
                        setSearch(value);
                        debouncedUpdateFilter("sampleId", value);
                    }}
                />
                <Select
                    value={status || "all"}
                    onValueChange={(value) =>
                        updateFilter("status", value === "all" ? "" : String(value))
                    }
                >
                    <SelectTrigger className="w-full font-normal" aria-label="Filter by status">
                        <SelectValue className="font-normal">
                            {status ? status.charAt(0).toUpperCase() + status.slice(1) : "All statuses"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="all" className="font-normal">All statuses</SelectItem>
                            <SelectItem value="pending" className="font-normal">Pending</SelectItem>
                            <SelectItem value="testing" className="font-normal">Testing</SelectItem>
                            <SelectItem value="completed" className="font-normal">Completed</SelectItem>
                            <SelectItem value="failed" className="font-normal">Failed</SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {/* Action-level error */}
            {orderAction.error ? (
                <Alert variant="destructive">
                    <WarningCircleIcon className="size-4" />
                    <AlertTitle className="font-normal">Order action failed</AlertTitle>
                    <AlertDescription className="font-normal">{orderAction.error}</AlertDescription>
                </Alert>
            ) : null}

            {/* order table */}
            {ordersData?.orders.length ? (
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
                                {ordersData.orders.map((order) => (
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
                                                        profiles={profilesData?.profiles ?? []}
                                                        order={order}
                                                        onSaved={hardRefresh}
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
                                page={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
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
                            profiles={profilesData?.profiles.filter((p) => p.enabled) ?? []}
                            onSaved={hardRefresh}
                        />
                    }
                />
            )}
        </Container>
    );
}
