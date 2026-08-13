import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { PageLoading, RefreshButton, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EyeIcon, FlaskIcon } from "@phosphor-icons/react";


export function CatalogsPage() {
    const {
        data: catalogsData,
        isValidating: catalogIsValidating,
        mutate: catalogsMutate,
        error: catalogErrors
    } = useSWR(
        api.catalogs.listKey,
        () => api.catalogs.list(),
        {} // swr config for this rqst
    )
    const [selectedDriver, setSelectedDriver] = React.useState<string | null>(null)

    const {
        data: catalogDetailsData,
        mutate: catalogDetailsMutate,
        error: catalogDetailsErrors,
        isLoading: catalogDetailsLoading
    } = useSWR(
        selectedDriver ? api.catalogs.detailKey(selectedDriver) : null,
        ([, driverId]) => api.catalogs.get({ driver:driverId }),
        {} // swr config for this rqst
    )

    const catalogFields = React.useMemo(() => {
        return Array.from(
            new Set(
                (catalogDetailsData?.tests ?? []).flatMap((test) => Object.keys(test))
            )
        )
    }, [catalogDetailsData?.tests])

    // convert camelCase, snake_case, or kebab-case into a human-readable label.
    function fieldLabel(field: string) {
        return field
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase())
    }

    function fieldValue(value: unknown) {
        if (Array.isArray(value)) {
            return value.length ? value.map(String).join(", ") : "—"
        }
        if (value && typeof value === "object") {
            return JSON.stringify(value)
        }
        if (value === null || value === undefined || value === "") return "N/A"
        return String(value)
    }



    if (!catalogsData && !catalogErrors) return <PageLoading />
    if (catalogErrors) {
        return (
            <ResourceError error={catalogErrors} onRetry={() => catalogsMutate()} />
        )
    }

    return (
        <Container>

            {/* top page details */}
            <PageSection
                eyebrow="Assay capability"
                title="Analyzer test catalogs"
                description="Catalogs expose the test codes and mappings supported by each machine driver."
                actions={
                    <RefreshButton
                        isLoading={catalogIsValidating}
                        onRefresh={() => catalogsMutate()}
                    />
                }
            />

            {/* data */}
            {catalogsData?.catalogs?.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {catalogsData.catalogs?.map((catalog) => (
                        <Card key={catalog.id}>
                            <CardHeader>
                                <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-primary">
                                    <FlaskIcon />
                                </span>
                                <CardTitle>{catalog.machine}</CardTitle>
                                <CardDescription>{catalog.driverId}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between gap-3">
                                <Badge variant="secondary">{catalog.catalogCount} tests</Badge>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedDriver(catalog.driverId)}
                                >
                                    <EyeIcon data-icon="inline-start" />
                                    Browse tests
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <ResourceEmpty
                    title="No test catalogs"
                    description="Registered analyzer catalogs will appear here."
                />
            )}

            {/* dialog */}
            <Dialog
                open={Boolean(selectedDriver)}
                onOpenChange={(open) => !open && setSelectedDriver(null)}
            >
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{catalogDetailsData?.machine || "Test catalog"}</DialogTitle>
                        <DialogDescription>
                            Test codes exposed by {selectedDriver}.
                        </DialogDescription>
                    </DialogHeader>

                    {catalogDetailsLoading ? (
                        <PageLoading rows={4} />
                    ) : catalogDetailsErrors ? (
                        <ResourceError error={catalogDetailsErrors} onRetry={() => catalogDetailsMutate()} />
                    ) : catalogDetailsData?.tests.length ? (
                        <div className="overflow-hidden rounded-3xl border bg-card">
                            <div className="max-h-[60vh] overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {catalogFields.map((field) => (
                                                <TableHead key={field}>{fieldLabel(field)}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {catalogDetailsData.tests.map((test, index) => (
                                            <TableRow
                                                key={String(
                                                    test.id ||
                                                    test.code ||
                                                    test.hostCode ||
                                                    test.appCode ||
                                                    index,
                                                )}
                                            >
                                                {catalogFields.map((field) => (
                                                    <TableCell
                                                        key={field}
                                                        className="max-w-72 whitespace-normal"
                                                    >
                                                        {fieldValue(test[field])}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    ) : (
                        <ResourceEmpty
                            title="No tests in this catalog"
                            description="The selected driver returned an empty test catalog."
                        />
                    )}

                </DialogContent>
            </Dialog>
        </Container>
    )
}