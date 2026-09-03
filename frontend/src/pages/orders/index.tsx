import React from "react";
import type { OrderStatus } from "@/types/api";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { RefreshButton } from "@/components/common/resourceState";
import useSWR from "swr";
import { api } from "@/lib/api";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useTabbedFilters } from "@/hooks/use-tabbed-filters";
import { OrderForm } from "./orderForm";
import { ITEMS_PER_PAGE, pageCount } from "@/lib/global";
import { MachineOrders } from "./machineOrders";
import { ExternalOrders } from "./externalOrders";

const TABS = ["machine", "external"] as const;
const SEARCH_KEYS = { machine: "sampleId", external: "search" } as const;
// swrConfig default.
const ORDERS_SWR_OPTIONS = {
    revalidateOnFocus: false,
    refreshInterval: 10_000,
} as const;

const machineStatuses: { value: string; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "testing", label: "Testing" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
];

const externalStatuses: { value: string; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "received", label: "Received" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "processing", label: "Processing" },
    { value: "leased_to_slave", label: "Leased to Slave" },
    { value: "acknowledged_by_slave", label: "Ack by Slave" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
];

export function OrdersPage() {
    const { tab, search, status, input, page, setPage, onSearch, onStatus, onTab, onReset } =
        useTabbedFilters(TABS, SEARCH_KEYS);
    const isMachine = tab === "machine";

    const profileQuery = React.useMemo(() => ({ enabled: true }), []);
    const profiles = useSWR(
        api.profiles.listKey(profileQuery),
        () => api.profiles.list(profileQuery),
    );

    // Each list is fetched only while its own tab is open.
    const orderQuery = React.useMemo(() => ({
        status: (status || undefined) as OrderStatus | undefined,
        sampleId: search || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [status, search, page]);

    const machineOrders = useSWR(
        isMachine ? api.orders.listKey(orderQuery) : null,
        () => api.orders.list(orderQuery),
        ORDERS_SWR_OPTIONS,
    );
    const orderCount = useSWR(
        isMachine ? api.orders.countKey : null,
        () => api.orders.count(),
        ORDERS_SWR_OPTIONS,
    );

    const externalQuery = React.useMemo(() => ({
        search: search || undefined,
        status: status || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [search, status, page]);

    const externalOrders = useSWR(
        isMachine ? null : api.externalOrders.listKey(externalQuery),
        () => api.externalOrders.list(externalQuery),
        ORDERS_SWR_OPTIONS,
    );

    const refresh = React.useCallback(async () => {
        await Promise.all([
            profiles.mutate(),
            machineOrders.mutate(),
            orderCount.mutate(),
            externalOrders.mutate(),
        ]);
    }, [profiles.mutate, machineOrders.mutate, orderCount.mutate, externalOrders.mutate]);

    // /orders/count ignores filters, so a filtered machine list can only estimate.
    const totalPages = isMachine
        ? pageCount({
            page,
            rows: machineOrders.data?.orders.length ?? 0,
            total: orderCount.data?.count ?? 0,
            estimate: Boolean(status || search),
        })
        : pageCount({ page, rows: 0, total: externalOrders.data?.count ?? 0 });

    const statusOptions = isMachine ? machineStatuses : externalStatuses;
    const searchPlaceholder = isMachine ? "Search sample ID" : "Search external order ID";
    const isRefreshing = isMachine ? machineOrders.isValidating : externalOrders.isValidating;

    return (
        <Container>

            {/* Page header */}
            <PageSection
                eyebrow="Worklist"
                title="Orders in motion"
                description="Search and filter state is stored in the URL, views can be bookmarked and shared."
                actions={
                    <>
                        <RefreshButton
                            isLoading={isRefreshing}
                            onRefresh={() => {
                                onReset();
                                void refresh();
                            }}
                        />
                        <OrderForm
                            profiles={profiles.data?.profiles ?? []}
                            onSaved={refresh}
                        />
                    </>
                }
            />

            {/* Filters */}
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                    aria-label={searchPlaceholder}
                    placeholder={searchPlaceholder}
                    className="font-normal"
                    value={input}
                    onChange={(event) => onSearch(event.target.value)}
                />
                <Select
                    value={status || "all"}
                    onValueChange={(value) => onStatus(value === "all" ? "" : String(value))}
                >
                    <SelectTrigger className="w-full font-normal" aria-label="Filter by status">
                        <SelectValue className="font-normal">
                            {statusOptions.find((option) => option.value === status)?.label
                                ?? "All statuses"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {statusOptions.map((option) => (
                                <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    className="font-normal"
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {/* Tabbed order lists */}
            <Tabs value={tab} onValueChange={onTab}>
                <TabsList>
                    <TabsTrigger value="machine">Machine Orders</TabsTrigger>
                    <TabsTrigger value="external">External Orders</TabsTrigger>
                </TabsList>

                <TabsContent value="machine">
                    <MachineOrders
                        orders={machineOrders.data?.orders}
                        error={machineOrders.error}
                        onRetry={() => void machineOrders.mutate()}
                        profiles={profiles.data?.profiles ?? []}
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        onRefresh={refresh}
                    />
                </TabsContent>

                <TabsContent value="external">
                    <ExternalOrders
                        orders={externalOrders.data?.orders}
                        error={externalOrders.error}
                        onRetry={() => void externalOrders.mutate()}
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                </TabsContent>
            </Tabs>
        </Container>
    );
}
