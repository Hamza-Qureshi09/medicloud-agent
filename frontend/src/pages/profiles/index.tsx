import { PageSection } from "@/components/common/pageSection";
import {
    PageLoading,
    RefreshButton,
    ResourceEmpty,
    ResourceError,
} from "@/components/common/resourceState";
import { useHealth } from "@/contexts/health-context";
import { useAsyncAction } from "@/hooks/use-async-action";
import { api } from "@/lib/api";
import React, { useState } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
    ArrowRightIcon,
    CpuIcon,
    DotsThreeIcon,
    PlayIcon,
    StopIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { ConnectionBadge } from "@/components/common/statusBadge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/common/confirmAction";
import { Container } from "@/components/common/container";
import { ITEMS_PER_PAGE } from "@/lib/global";
import { Pagination } from "@/components/common/pagination";
import { ProfileForm } from "./profleForm";
import {
    ProfileEndpointBadge,
    ProfileInterfaceBadge,
} from "@/pages/profiles/profileConfigView";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";


export function ProfilesPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const { data: healthData, mutate: healthMutate } = useHealth();

    const {
        data: profileCount,
        error: countError,
        mutate: profileCountMutate
    } = useSWR(
        api.profiles.countKey,
        () => api.profiles.count(),
        {}
    )

    const count = profileCount?.count ?? 0;
    const totalPages = Math.max(
        1,
        Math.ceil(count / ITEMS_PER_PAGE)
    );

    const profileQuery = React.useMemo(() => ({
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
    }), [currentPage]);

    const {
        data: profilesData,
        isValidating: profileIsValidating,
        mutate: profilesMutate,
    } = useSWR(
        api.profiles.listKey(profileQuery),
        () => api.profiles.list(profileQuery),
        {},
    );

    const {
        data: driversData,
        error: profilesError,
        mutate: driversMutate,
    } = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list(),
    );

    const running = React.useMemo(() => {
        return new Map(
            (healthData?.running_machines ?? []).map((item) => [
                item.profile.id,
                item.machine,
            ]),
        );
    }, [healthData]);

    const driversById = React.useMemo(
        () =>
            new Map(
                (driversData?.drivers ?? []).map(driver => [
                    driver.id,
                    driver,
                ])
            ),
        [driversData]
    );

    const profileAction = useAsyncAction("Analyzer action failed.");
    async function runHardRefresh() {
        await Promise.all([
            healthMutate(),
            driversMutate(),
            profileCountMutate(),
            profilesMutate(),
        ]);
    }
    async function runProfileLifecycleAction(
        action: () => Promise<unknown>,
    ) {
        await profileAction.execute(async () => {
            await action();
            await runHardRefresh();
        }).catch(() => undefined);
    }


    if (!profilesData && !profilesError) return <PageLoading />;
    if (profilesError || countError) {
        return (
            <ResourceError
                error={profilesError ?? countError}
                onRetry={runHardRefresh}
            />
        );
    }


    return (
        <Container>
            <PageSection
                eyebrow="Configuration"
                title="Analyzer profiles"
                description="Each profile connects one stored machine configuration to a registered SDK driver."
                actions={
                    <>
                        <RefreshButton
                            isLoading={profileIsValidating}
                            onRefresh={runHardRefresh}
                        />
                        <ProfileForm
                            drivers={driversData?.drivers ?? []}
                            onCreated={runHardRefresh}
                        />
                    </>
                }
            />

            {profileAction.error ? (
                <Alert variant="destructive">
                    <AlertTitle className="font-normal">Analyzer action failed</AlertTitle>
                    <AlertDescription className="font-normal">
                        {profileAction.error}
                    </AlertDescription>
                </Alert>
            ) : null}

            {profilesData?.profiles.length ? (
                <div className="flex flex-col gap-6">
                    <div className="grid items-start gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                        {profilesData?.profiles.map((profile) => {
                            const machine = running.get(profile.id);
                            const matchedDriver = driversById.get(profile.driverId);

                            return (
                                <Card
                                    key={profile.id}
                                    className="group flex flex-col overflow-hidden border-border bg-card"
                                >
                                    <CardHeader>
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                                            {/* left side */}
                                            <CardTitle className="flex min-w-0 flex-col gap-0.5">
                                                <Link
                                                    to={`/dashboard/profiles/${profile.id}`}
                                                    className="flex min-w-0 items-center gap-1.5 text-base font-normal text-foreground hover:text-primary hover:underline"
                                                >
                                                    <span className="min-w-0 truncate">
                                                        {profile.name || `Analyzer ${profile.id}`}
                                                    </span>
                                                    <ArrowRightIcon className="h-4 w-4 shrink-0 opacity-50 group-hover:opacity-100" />
                                                </Link>
                                                <p className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                                                    <CpuIcon className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="min-w-0 truncate">{profile.driverId}</span>
                                                </p>
                                            </CardTitle>

                                            {/* right side */}
                                            <div className="flex flex-col">
                                                {/* First Row */}
                                                <div className="flex items-center justify-end">
                                                    <ConnectionBadge
                                                        connected={machine?.connected ?? false}
                                                        running={machine?.running ?? profile.enabled}
                                                    />

                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            render={
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon-sm"
                                                                    aria-label={`Actions for ${profile.name || profile.id}`}
                                                                />
                                                            }
                                                        >
                                                            <DotsThreeIcon weight="bold" />
                                                        </DropdownMenuTrigger>

                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuGroup>
                                                                <DropdownMenuItem
                                                                    className="font-normal"
                                                                    onClick={() =>
                                                                        void runProfileLifecycleAction(() =>
                                                                            api.profiles.start(profile.id)
                                                                        )
                                                                    }
                                                                >
                                                                    <PlayIcon />
                                                                    Start
                                                                </DropdownMenuItem>

                                                                <DropdownMenuItem
                                                                    className="font-normal"
                                                                    onClick={() =>
                                                                        void runProfileLifecycleAction(() =>
                                                                            api.profiles.stop(profile.id)
                                                                        )
                                                                    }
                                                                >
                                                                    <StopIcon />
                                                                    Stop
                                                                </DropdownMenuItem>
                                                            </DropdownMenuGroup>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>

                                                {/* Second Row */}
                                                <div className="flex items-center">
                                                    <ProfileInterfaceBadge
                                                        config={profile.config}
                                                        driver={matchedDriver}
                                                    />
                                                </div>
                                            </div>

                                        </div>


                                    </CardHeader>

                                    <CardContent className="flex flex-1 flex-col gap-4">
                                        {/* 2 cards  */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <InfoCard
                                                topLabel="Profile ID"
                                                topValue={
                                                    <span className="tabular-nums">
                                                        #{profile.id}
                                                    </span>
                                                }
                                                bottomLabel="Driver Brand"
                                                bottomValue={
                                                    <span className="truncate">
                                                        {matchedDriver?.brand ?? "Generic"}
                                                    </span>
                                                }
                                            />

                                            <InfoCard
                                                topLabel="Endpoint"
                                                topValue={
                                                    <ProfileEndpointBadge
                                                        config={profile.config}
                                                        driver={matchedDriver}
                                                    />
                                                }
                                                bottomLabel="Updated"
                                                bottomValue={new Date(
                                                    profile.updatedAt ?? profile.createdAt
                                                ).toLocaleDateString()}
                                            />
                                        </div>

                                        {/* config */}
                                        <Accordion className="rounded-2xl border border-border bg-muted/30 px-1">
                                            <AccordionItem value="connection-settings" className="border-none">
                                                <AccordionTrigger className="px-2 py-2.5 text-xs font-normal text-muted-foreground hover:no-underline">
                                                    Connection settings
                                                </AccordionTrigger>
                                                <AccordionContent className="px-2 pb-2">
                                                    <pre className="rounded-xl bg-muted p-3 text-xs font-normal text-foreground">
                                                        <ScrollArea className="h-22">
                                                            {JSON.stringify(profile.config, null, 2)}
                                                        </ScrollArea>
                                                    </pre>
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>

                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            {profile.enabled ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full sm:w-fit"
                                                    onClick={() =>
                                                        void runProfileLifecycleAction(
                                                            () => api.profiles.stop(profile.id)
                                                        )
                                                    }
                                                >
                                                    <StopIcon data-icon="inline-start" />
                                                    Stop analyzer
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="w-full sm:w-fit"
                                                    onClick={() =>
                                                        void runProfileLifecycleAction(
                                                            () => api.profiles.start(profile.id)
                                                        )
                                                    }
                                                >
                                                    <PlayIcon data-icon="inline-start" />
                                                    Start analyzer
                                                </Button>
                                            )}
                                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-fit">
                                                <ProfileForm
                                                    drivers={driversData?.drivers ?? []}
                                                    profile={profile}
                                                    onCreated={runHardRefresh}
                                                />

                                                <ConfirmAction
                                                    trigger={
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            className="w-full sm:flex-1"
                                                        >
                                                            <TrashIcon data-icon="inline-start" />
                                                            Delete
                                                        </Button>
                                                    }
                                                    title="Delete analyzer profile?"
                                                    description="Profiles referenced by orders, results, or statistics cannot be deleted."
                                                    actionLabel="Delete profile"
                                                    onConfirm={() =>
                                                        runProfileLifecycleAction(
                                                            () => api.profiles.remove(profile.id)
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="pt-2 flex justify-center">

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
                    title="No analyzer profiles"
                    description="Add a profile to connect one of the registered machine drivers."
                    action={
                        <ProfileForm
                            drivers={driversData?.drivers ?? []}
                            onCreated={runHardRefresh}
                        />
                    }
                />
            )}
        </Container>
    );
}



interface InfoCardProps {
    topLabel: string;
    topValue: React.ReactNode;
    bottomLabel: string;
    bottomValue: React.ReactNode;
    className?: string;
}

function InfoCard({
    topLabel,
    topValue,
    bottomLabel,
    bottomValue,
    className,
}: InfoCardProps) {
    return (
        <div
            className={cn(
                "flex min-w-0 flex-col justify-between rounded-2xl bg-muted/50 p-3 text-xs! font-normal!",
                className
            )}
        >
            <div className="mb-2 min-w-0">
                <p className="text-muted-foreground">{topLabel}</p>
                <div className="min-w-0 max-w-full text-foreground">
                    {topValue}
                </div>
            </div>

            <div className="min-w-0">
                <p className="text-muted-foreground">{bottomLabel}</p>
                <div className="min-w-0 max-w-full text-foreground">
                    {bottomValue}
                </div>
            </div>
        </div>
    );
}