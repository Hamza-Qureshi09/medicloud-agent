import { PageSection } from "@/components/common/pageSection"
import { PageLoading, RefreshButton, ResourceError, ResourceEmpty } from "@/components/common/resourceState"
import { useHealth } from "@/contexts/health-context"
import { api } from "@/lib/api"
import { CheckCircleIcon, ClockCountdownIcon, MicroscopeIcon, WarningCircleIcon } from "@phosphor-icons/react"
import React from "react"
import useSWR from "swr"
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { OrderStatusBadge } from "@/components/common/statusBadge"
import { Container } from "@/components/common/container"
import { TestBadgeList } from "@/components/common/testBadgeList"



const chartConfig = {
    average: { label: "Average minutes", color: "var(--chart-2)" },
    latest: { label: "Latest minutes", color: "var(--chart-4)" },
} satisfies ChartConfig

export function DashboardPage() {
    const {
        connected,
        data: healthData,
        error: healthError,
        isLoading,
        mutate: healthMutate,
        isValidating: healthIsValidating
    } = useHealth()

    // Rqst #1 (order)
    const orderQuery = React.useMemo(() => ({ limit: 100 }), [])
    const {
        data: ordersData,
        isValidating: orderIsValidating,
        mutate: orderMutate,
        error: orderErrors
    } = useSWR(
        api.orders.listKey(orderQuery),
        () => api.orders.list(orderQuery),
        {} // swr config for this rqst
    )

    // Rqst #2 (test stats)
    const statisticQuery = React.useMemo(() => ({ limit: 12 }), [])
    const {
        data: statisticsData,
        isValidating: statisticsIsValidating,
        mutate: statisticsMutate
    } = useSWR(
        api.statistics.listKey(statisticQuery),
        () => api.statistics.list(statisticQuery),
        {} // swr config for this rqst
    )

    // order data
    const { orderRows, pending, testing, failed, completed, } = React.useMemo(() => {
        const rows = ordersData?.orders ?? []

        let pending = 0
        let testing = 0
        let failed = 0
        let completed = 0

        for (const order of rows) {
            switch (order.status) {
                case "pending":
                    pending++
                    break
                case "testing":
                    testing++
                    break
                case "failed":
                    failed++
                    break
                case "completed":
                    completed++
                    break
            }
        }

        return {
            orderRows: rows,
            pending,
            testing,
            failed,
            completed,
        }
    }, [ordersData])

    // chart data
    const chartData = React.useMemo(() =>
        (statisticsData?.statistics ?? []).map((statistic) => ({
            test: statistic.testId,
            average: Math.round(statistic.averageDurationMs / 60_000),
            latest: Math.round(statistic.lastDurationMs / 60_000),
        })),
        [statisticsData])

    // loading / error checking
    if (isLoading) return <PageLoading />
    if (healthError) {
        return <ResourceError error={healthError} onRetry={() => healthMutate()} />
    }


    return <Container>
        {/* top page details */}
        <PageSection
            eyebrow="Live workspace"
            title="Clinical throughput at a glance"
            description="A single view of connected analyzers, staged work, active tests, and learned turnaround performance."
            actions={
                <RefreshButton
                    isLoading={healthIsValidating || orderIsValidating || statisticsIsValidating}
                    onRefresh={() => {
                        void healthMutate()
                        void orderMutate()
                        void statisticsMutate()
                    }}
                />
            }
        />

        {/* statCards/chips */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
                title="Connected analyzers"
                value={connected}
                detail={`${healthData?.running_machines.length ?? 0} profiles running`}
                icon={MicroscopeIcon}
            />
            <StatCard
                title="Waiting to send"
                value={pending}
                detail="Orders staged for analyzer query"
                icon={ClockCountdownIcon}
            />
            <StatCard
                title="In testing"
                value={testing}
                detail="Samples currently being processed"
                icon={CheckCircleIcon}
            />
            <StatCard
                title="Orders Needs attention"
                value={failed}
                detail={`${completed} completed in the current view`}
                icon={WarningCircleIcon}
            />
        </div>

        {/* dashboard main content / charts */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">

            {/* test statistics chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Turnaround performance</CardTitle>
                    <CardDescription>
                        Learned average versus the latest observed duration per test.
                    </CardDescription>
                    <CardAction>
                        <Badge variant="secondary">Minutes</Badge>
                    </CardAction>
                </CardHeader>
                <CardContent>
                    {chartData?.length ? (
                        <ChartContainer
                            config={chartConfig}
                            className="h-72 w-full">
                            <ResponsiveContainer>
                                <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="test" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} width={30} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Line
                                        dataKey="average"
                                        type="monotone"
                                        stroke="var(--color-average)"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                    <Line
                                        dataKey="latest"
                                        type="monotone"
                                        stroke="var(--color-latest)"
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    ) : (
                        <ResourceEmpty
                            title="No timing history yet"
                            description="Turnaround trends appear after analyzers complete test orders."
                        />)}
                </CardContent>
            </Card>


            {/* analyzer details (running_machines)*/}
            <Card>
                <CardHeader>
                    <CardTitle>Analyzer pulse</CardTitle>
                    <CardDescription>
                        Runtime state reported by each active profile.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    {healthData?.running_machines.length ? (
                        healthData.running_machines.map(({ profile, machine }) => (
                            <div
                                key={profile.id}
                                className="flex items-center justify-between gap-3 rounded-2xl border p-3"
                            >
                                <div className="min-w-0">
                                    <p className="truncate font-medium">
                                        {profile.name || machine.model}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {machine.brand} · {machine.model}
                                    </p>
                                </div>
                                <Badge variant={machine.connected ? "default" : "secondary"}>
                                    {machine.connected ? "Connected" : "Listening"}
                                </Badge>
                            </div>
                        ))
                    ) : (
                        <ResourceEmpty
                            title="No analyzers running"
                            description="Start an enabled analyzer profile to see its live connection state."
                            action={
                                <Button
                                    variant="outline"
                                    nativeButton={false}
                                    render={<Link to="/dashboard/profiles" />}
                                >
                                    Open analyzers
                                </Button>
                            }
                        />
                    )}
                </CardContent>
            </Card>

            {/* recent orders */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent orders</CardTitle>
                    <CardDescription>
                        Latest staged and completed samples from all analyzers.
                    </CardDescription>
                    <CardAction>
                        <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<Link to="/dashboard/orders" />}
                        >
                            View all
                        </Button>
                    </CardAction>
                </CardHeader>
                <CardContent>
                    {orderErrors ? (
                        <ResourceError error={orderErrors} onRetry={() => orderMutate()} />
                    ) : orderRows.length ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Sample</TableHead>
                                    <TableHead>Patient</TableHead>
                                    <TableHead>Tests</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orderRows.slice(0, 6).map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-medium">{order.sampleId}</TableCell>
                                        <TableCell>{order.patientName || "Not provided"}</TableCell>
                                        <TableCell><TestBadgeList tests={order.tests} maxVisible={2} /></TableCell>

                                        <TableCell>
                                            <OrderStatusBadge status={order.status} />
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {new Date(order.createdAt).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <ResourceEmpty
                            title="No orders yet"
                            description="Create the first order after an analyzer profile is running."
                            action={
                                <Button
                                    nativeButton={false}
                                    render={<Link to="/orders" />}
                                >
                                    Create an order
                                </Button>
                            }
                        />
                    )}
                </CardContent>
            </Card>
        </div>

    </Container>
}

// chip / stat card
function StatCard({
    title,
    value,
    detail,
    icon: Icon,
}: {
    title: string
    value: string | number
    detail: string
    icon: typeof MicroscopeIcon
}) {
    return (
        <Card size="sm">
            <CardHeader>
                <CardDescription>{title}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
                <CardAction>
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted text-primary">
                        <Icon />
                    </span>
                </CardAction>
            </CardHeader>
            <CardContent>
                <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent>
        </Card>
    )
}