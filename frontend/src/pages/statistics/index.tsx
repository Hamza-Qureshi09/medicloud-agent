import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { api } from "@/lib/api";
import { ITEMS_PER_PAGE } from "@/lib/global";
import React from "react";
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { duration } from "@/lib/utils";
import { ConfirmAction } from "@/components/common/confirmAction";
import { TrashIcon } from "@phosphor-icons/react";

export function StatisticsPage() {
    const [currentPage] = React.useState(1);

    const statisticQuery = React.useMemo(() => ({
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
    }), [currentPage]);

    const statistics = useSWR(
        api.statistics.listKey(statisticQuery),
        () => api.statistics.list(statisticQuery),
    )

    if (!statistics.data && !statistics.error) return <PageLoading />
    if (statistics.error) {
        return (
            <ResourceError
                error={statistics.error}
                onRetry={() => statistics.mutate()}
            />
        )
    }

    async function remove(id: number) {
        const testStatistics = await api.statistics.get(id)
        if (!testStatistics.statistic) {
            throw new Error("This test statistics not found")
        }
        await api.statistics.remove(id)
        await statistics.mutate()
    }

    return <Container>

        {/* top page details */}
        <PageSection
            eyebrow="Learned estimates"
            title="Test turnaround intelligence"
            description="The registry uses the slowest learned test duration to estimate completion for multi-test orders."
            actions={
                <RefreshButton
                    isLoading={statistics.isValidating}
                    onRefresh={() => statistics.mutate()}
                />
            }
        />

        {/*  */}
        {statistics.data?.statistics.length ? (
            <div className="overflow-hidden rounded-3xl border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Test</TableHead>
                            <TableHead>Analyzer</TableHead>
                            <TableHead>Average</TableHead>
                            <TableHead>Latest</TableHead>
                            <TableHead>Observations</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead className="text-right">Reset</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {statistics.data.statistics.map((statistic) => (
                            <TableRow key={statistic.id}>
                                <TableCell className="font-medium">{statistic.testId}</TableCell>
                                <TableCell>#{statistic.machineId}</TableCell>
                                <TableCell className="tabular-nums">
                                    {duration(statistic.averageDurationMs)}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                    {duration(statistic.lastDurationMs)}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{statistic.orderCount}</Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {new Date(
                                        statistic.updatedAt || statistic.createdAt,
                                    ).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <ConfirmAction
                                        trigger={
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                aria-label={`Reset ${statistic.testId} statistic`}
                                            >
                                                <TrashIcon />
                                            </Button>
                                        }
                                        title="Reset learned duration?"
                                        description="Future completed orders will build a fresh turnaround average for this test."
                                        actionLabel="Reset statistic"
                                        onConfirm={() => remove(statistic.id)}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        ) : (
            <ResourceEmpty
                title="No learned durations"
                description="Statistics are created automatically as analyzer orders complete."
            />
        )}
    </Container>
}