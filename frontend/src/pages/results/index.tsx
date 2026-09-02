import React from "react";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { RefreshButton } from "@/components/common/resourceState";
import useSWR from "swr";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabbedFilters } from "@/hooks/use-tabbed-filters";
import { ITEMS_PER_PAGE, pageCount } from "@/lib/global";
import { MachineResults } from "./machineResults";
import { ExternalResults } from "./externalResults";

const TABS = ["machine", "external"] as const;
const SEARCH_KEYS = { machine: "sampleId", external: "search" } as const;

export function ResultsPage() {
    const { tab, search, input, page, setPage, onSearch, onTab, onReset } =
        useTabbedFilters(TABS, SEARCH_KEYS);
    const isMachine = tab === "machine";

    // Each list is fetched only while its own tab is open.
    const resultQuery = React.useMemo(() => ({
        sampleId: search || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [search, page]);

    const machineResults = useSWR(
        isMachine ? api.results.listKey(resultQuery) : null,
        () => api.results.list(resultQuery),
    );
    const resultCount = useSWR(
        isMachine ? api.results.countKey : null,
        () => api.results.count(),
    );

    const externalQuery = React.useMemo(() => ({
        search: search || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [search, page]);

    const externalResults = useSWR(
        isMachine ? null : api.externalResults.listKey(externalQuery),
        () => api.externalResults.list(externalQuery),
    );

    const refresh = React.useCallback(async () => {
        await Promise.all([
            machineResults.mutate(),
            resultCount.mutate(),
            externalResults.mutate(),
        ]);
    }, [machineResults.mutate, resultCount.mutate, externalResults.mutate]);

    // /results/count ignores filters, so a filtered machine list can only estimate.
    const totalPages = isMachine
        ? pageCount({
            page,
            rows: machineResults.data?.results.length ?? 0,
            total: resultCount.data?.count ?? 0,
            estimate: Boolean(search),
        })
        : pageCount({ page, rows: 0, total: externalResults.data?.count ?? 0 });

    const searchPlaceholder = isMachine
        ? "Filter by sample ID"
        : "Search external result";
    const isRefreshing = isMachine ? machineResults.isValidating : externalResults.isValidating;

    return (
        <Container>
            {/* Top page details */}
            <PageSection
                eyebrow="Immutable audit"
                title="Reported analyzer results"
                description="Result records are read-only. Open a record to inspect analytes, reference ranges, units, and abnormal flags."
                actions={
                    <RefreshButton
                        isLoading={isRefreshing}
                        onRefresh={() => {
                            onReset();
                            void refresh();
                        }}
                    />
                }
            />

            {/* Search */}
            <Input
                className="max-w-md"
                value={input}
                onChange={(event) => onSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
            />

            {/* Tabbed result lists below the filter */}
            <Tabs value={tab} onValueChange={onTab}>
                <TabsList>
                    <TabsTrigger value="machine">Machine Results</TabsTrigger>
                    <TabsTrigger value="external">External Results</TabsTrigger>
                </TabsList>

                <TabsContent value="machine">
                    <MachineResults
                        results={machineResults.data?.results}
                        error={machineResults.error}
                        onRetry={() => void machineResults.mutate()}
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                </TabsContent>

                <TabsContent value="external">
                    <ExternalResults
                        results={externalResults.data?.results}
                        error={externalResults.error}
                        onRetry={() => void externalResults.mutate()}
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                </TabsContent>
            </Tabs>
        </Container>
    );
}
