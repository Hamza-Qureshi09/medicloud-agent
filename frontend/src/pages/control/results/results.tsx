// Slave-scoped results table for the Control tab

import { Pagination } from "@/components/common/pagination";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { ResultDeliveryStatusBadge } from "@/components/common/statusBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type ExternalQuery } from "@/lib/api";
import { ITEMS_PER_PAGE, pageCount } from "@/lib/global";
import React, { useCallback, useMemo, useReducer } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { useDebounceCallback } from "@/hooks/use-debounce-callback";
import { SlaveResultDetail } from "./resultDetails";

const deliveryStatuses: { value: string; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "0", label: "Pending" },
    { value: "1", label: "Delivered" },
    { value: "2", label: "Retrying" },
    { value: "3", label: "Failed" },
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

export function ControlSlaveResults() {
    const [state, dispatch] = useReducer(filterReducer, initialState);
    const { search, committed, status, page } = state;

    const query = useMemo<ExternalQuery>(() => ({
        search: committed || undefined,
        status: status || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [committed, status, page]);

    const { data, error, mutate } = useSWR(
        api.slaveResults.listKey(query),
        () => api.slaveResults.list(query),
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

    const rows = React.useMemo(
        () => (data?.results ?? []).map((result) => ({ result, payload: JSON.parse(result.payloadJson) })),
        [data?.results],
    );

    return (
        <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                    aria-label="Search result"
                    placeholder="Search dispatch, order, or slave name/ID"
                    className="font-normal"
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                />
                <Select
                    value={status || "all"}
                    onValueChange={handleStatus}
                >
                    <SelectTrigger className="w-full font-normal" aria-label="Filter by delivery status">
                        <SelectValue className="font-normal">
                            {deliveryStatuses.find((o) => o.value === status)?.label ?? "All statuses"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {deliveryStatuses.map((o) => (
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
            ) : !data?.results ? (
                <PageLoading />
            ) : !rows.length ? (
                <ResourceEmpty
                    title="No slave results"
                    description="No results have been received from slave agents yet. Results from slave-processed orders will appear here."
                />
            ) : (
                <>
                    <div className="overflow-x-auto rounded-2xl border border-border bg-card relative">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="font-normal">Dispatch ID</TableHead>
                                    <TableHead className="font-normal">Sample ID</TableHead>
                                    <TableHead className="font-normal">MediCloud Order</TableHead>
                                    <TableHead className="font-normal">Agent Order</TableHead>
                                    <TableHead className="font-normal">Delivery Status</TableHead>
                                    <TableHead className="font-normal">Retries</TableHead>
                                    <TableHead className="font-normal">Created</TableHead>
                                    <TableHead className="text-right font-normal">Detail</TableHead>
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
                                        <TableCell className="font-normal text-muted-foreground">
                                            {result.medicloudOrderId}
                                        </TableCell>
                                        <TableCell className="tabular-nums font-mono text-xs font-normal">
                                            {result.agentOrderId != null ? (
                                                <Link
                                                    to={`/dashboard/orders/${result.agentOrderId}`}
                                                    className="hover:underline hover:text-primary text-muted-foreground transition-colors font-normal"
                                                >
                                                    #{result.agentOrderId}
                                                </Link>
                                            ) : "—"}
                                        </TableCell>
                                        <TableCell className="font-normal">
                                            <ResultDeliveryStatusBadge status={result.deliveryStatus} />
                                        </TableCell>
                                        <TableCell className="tabular-nums text-xs font-normal">
                                            {result.retryCount}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                            {new Date(result.createdAt).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <SlaveResultDetail result={result} payload={payload} />
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