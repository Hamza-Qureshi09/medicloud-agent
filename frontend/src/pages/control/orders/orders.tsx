import { Pagination } from "@/components/common/pagination";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { AgentOrderStatusBadge } from "@/components/common/statusBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type ExternalQuery } from "@/lib/api";
import { ITEMS_PER_PAGE, pageCount } from "@/lib/global";
import { useCallback, useMemo, useReducer } from "react";
import useSWR from "swr";
import { useDebounceCallback } from "@/hooks/use-debounce-callback";

const orderStatuses: { value: string; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "received", label: "Received" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "processing", label: "Processing" },
    { value: "leased_to_slave", label: "Leased to Slave" },
    { value: "acknowledged_by_slave", label: "Ack by Slave" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
];



type FilterState = {
    search: string;      // raw input value
    committed: string;   // debounced value used in the query
    status: string;
    page: number;
};

type FilterAction =
    | { type: "SET_SEARCH_INPUT"; value: string }   // just typing, no query change
    | { type: "COMMIT_SEARCH"; value: string }       // debounce fired
    | { type: "SET_STATUS"; value: string }
    | { type: "SET_PAGE"; value: number };

const initialState: FilterState = {
    search: "",
    committed: "",
    status: "",
    page: 1,
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
    switch (action.type) {
        case "SET_SEARCH_INPUT":
            return { ...state, search: action.value };
        case "COMMIT_SEARCH":
            return { ...state, committed: action.value, page: 1 };
        case "SET_STATUS":
            return { ...state, status: action.value, page: 1 };
        case "SET_PAGE":
            return { ...state, page: action.value };
        default:
            return state;
    }
}

export function ControlSlaveOrders() {
    const [state, dispatch] = useReducer(filterReducer, initialState);
    const { search, committed, status, page } = state;

    const query = useMemo<ExternalQuery>(() => ({
        search: committed || undefined,
        status: status || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [committed, status, page]);

    const { data, error, mutate } = useSWR(
        api.slaveOrders.listKey(query),
        () => api.slaveOrders.list(query),
        { refreshInterval: 10_000 },
    );

    const totalPages = pageCount({ page, rows: 0, total: data?.count ?? 0 });

    const debouncedCommit = useDebounceCallback((value: string) => {
        dispatch({ type: "COMMIT_SEARCH", value });
    }, 400);

    const handleSearch = useCallback((value: string) => {
        dispatch({ type: "SET_SEARCH_INPUT", value });
        debouncedCommit(value);
    }, [debouncedCommit]);

    const handleStatus = useCallback((value: string | null) => {
        dispatch({ type: "SET_STATUS", value: value === "all" || value === null ? "" : value });
    }, []);

    const setPage = useCallback((value: number) => {
        dispatch({ type: "SET_PAGE", value });
    }, []);

    const refresh = useCallback(() => void mutate(), [mutate]);

    const orders = data?.orders;

    return (
        <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                    aria-label="Search dispatch, slave ID, or name"
                    placeholder="Search dispatch, slave ID, or name"
                    className="font-normal"
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                />
                <Select
                    value={status || "all"}
                    onValueChange={handleStatus}
                >
                    <SelectTrigger className="w-full font-normal" aria-label="Filter by status">
                        <SelectValue className="font-normal">
                            {orderStatuses.find((o) => o.value === status)?.label ?? "All statuses"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {orderStatuses.map((o) => (
                                <SelectItem key={o.value} value={o.value} className="font-normal">
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            {error ? (
                <ResourceError error={error} onRetry={refresh} />
            ) : !orders ? (
                <PageLoading />
            ) : !orders.length ? (
                <ResourceEmpty
                    title="No slave orders"
                    description="No orders have been routed to slave agents yet. Orders dispatched to slave-owned machines will appear here."
                />
            ) : (
                <>
                    <div className="overflow-x-auto rounded-2xl border border-border bg-card relative">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="font-normal">Dispatch ID</TableHead>
                                    <TableHead className="font-normal">Profile Key</TableHead>
                                    <TableHead className="font-normal">Target Slave</TableHead>
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
                                        <TableCell className="font-mono text-xs font-normal text-muted-foreground">
                                            {order.targetSlaveId ? (order.targetSlaveId.split('-')[1] || order.targetSlaveId) : "—"}
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
                        <div className="flex justify-center pt-2">
                            <Pagination
                                page={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
