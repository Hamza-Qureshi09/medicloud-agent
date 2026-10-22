import { useState } from "react";
import useSWR from "swr";
import { FlaskIcon, PlusIcon } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import {
    PageLoading,
    RefreshButton,
    ResourceEmpty,
    ResourceError,
} from "@/components/common/resourceState";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CatalogDetailDialog } from "./catalogs/catalogDetail";
import { CreateCatalogDialog } from "./catalogs/forms";

type CatalogView = { kind: "closed" } | { kind: "create" } | {
    kind: "detail";
    driverId: string;
};

export function CatalogsPage() {
    const { data, error, isValidating, mutate } = useSWR(
        api.catalogs.listKey,
        api.catalogs.list,
    );
    const { data: drivers } = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list(),
    );
    const [view, setView] = useState<CatalogView>({ kind: "closed" });
    const availableDrivers = (drivers?.drivers ?? []).filter((driver) =>
        !(data?.catalogs ?? []).some((catalog) =>
            catalog.driverId === driver.id
        )
    );
    const close = () => setView({ kind: "closed" });

    if (!data && !error) return <PageLoading />;
    if (error) {
        return (
            <ResourceError
                error={error}
                onRetry={() => void mutate()}
            />
        );
    }

    return (
        <Container>
            <PageSection
                eyebrow="Assay capability"
                title="Analyzer test catalogs"
                description="Analyzer catalogs are stored in this agent's machine database and can be managed here."
                actions={
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            onClick={() => setView({ kind: "create" })}
                        >
                            <PlusIcon data-icon="inline-start" />Create catalog
                        </Button>
                        <RefreshButton
                            isLoading={isValidating}
                            onRefresh={() => void mutate()}
                        />
                    </div>
                }
            />
            {data?.catalogs.length
                ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {data.catalogs.map((catalog) => (
                            <Card key={catalog.id}>
                                <CardHeader>
                                    <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-primary">
                                        <FlaskIcon />
                                    </span>
                                    <CardTitle>{catalog.machine}</CardTitle>
                                    <CardDescription>
                                        {catalog.driverId}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex items-center justify-between gap-3">
                                    <div className="flex gap-2">
                                        <Badge variant="secondary">
                                            {catalog.catalogCount} tests
                                        </Badge>
                                        <Badge variant="outline">
                                            {catalog.source === "database"
                                                ? "Managed"
                                                : "Static"}
                                        </Badge>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setView({
                                                kind: "detail",
                                                driverId: catalog.driverId,
                                            })}
                                    >
                                        Open
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )
                : (
                    <ResourceEmpty
                        title="No test catalogs"
                        description="Create a catalog for a registered driver."
                    />
                )}
            {view.kind === "create" && (
                <CreateCatalogDialog
                    drivers={availableDrivers}
                    onClose={close}
                    onCreated={async (driverId) => {
                        await mutate();
                        setView({ kind: "detail", driverId });
                    }}
                />
            )}
            {view.kind === "detail" && (
                <CatalogDetailDialog
                    key={view.driverId}
                    driverId={view.driverId}
                    onClose={close}
                    onSaved={() => mutate()}
                />
            )}
        </Container>
    );
}
