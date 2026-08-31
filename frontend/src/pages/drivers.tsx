import { Container } from "@/components/common/container"
import { PageSection } from "@/components/common/pageSection"
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState"
import { api } from "@/lib/api"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { CpuIcon } from "@phosphor-icons/react"


export function DriversPage() {
    const drivers = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list(),
    )

    if (!drivers.data && !drivers.error) return <PageLoading />
    if (drivers.error) {
        return <ResourceError error={drivers.error} onRetry={() => drivers.mutate()} />
    }

    return <Container>

        {/* top page details */}
        <PageSection
            eyebrow="SDK registry"
            title="Registered machine drivers"
            description="Drivers define validated configuration, analyzer protocol behavior, and supported models."
            actions={
                <RefreshButton
                    isLoading={drivers.isValidating}
                    onRefresh={() => drivers.mutate()}
                />
            }
        />

        {/* driver cards */}
        {drivers.data?.drivers.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {drivers.data.drivers.map((driver) => (
                    <Card key={driver.id}>
                        <CardHeader>
                            <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-primary">
                                <CpuIcon />
                            </span>
                            <CardTitle>{driver.brand || driver.id}</CardTitle>
                            <CardDescription>{driver.id}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                                {driver.protocol.name} · {driver.protocol.version}
                            </Badge>
                            {driver.models.length ? (
                                driver.models.map((model) => (
                                    <Badge key={model} variant="secondary">
                                        {model}
                                    </Badge>
                                ))
                            ) : (
                                <Badge variant="outline">Model not specified</Badge>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        ) : (
            <ResourceEmpty
                title="No registered drivers"
                description="The SDK must register machine drivers during startup."
            />
        )}
    </Container>
}