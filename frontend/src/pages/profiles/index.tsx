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
    CardDescription,
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
} from "@/components/common/profileConfigView";

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
    );

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
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                        {profilesData?.profiles.map((profile) => {
                            const machine = running.get(profile.id);
                            const matchedDriver = driversById.get(profile.driverId);

                            return (
                                <Card
                                    key={profile.id}
                                    className="group transition-all duration-200 hover:border-foreground/20 flex flex-col justify-between border-border bg-card rounded-3xl shadow-sm overflow-hidden"
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1.5 min-w-0 flex-1">
                                                <CardTitle>
                                                    <Link
                                                        to={`/dashboard/profiles/${profile.id}`}
                                                        className="hover:underline hover:text-primary transition-colors inline-flex items-center gap-1.5 font-normal text-base text-foreground truncate"
                                                    >
                                                        {profile.name || `Analyzer ${profile.id}`}
                                                        <ArrowRightIcon className="h-4 w-4 opacity-50 transition-opacity group-hover:opacity-100 shrink-0" />
                                                    </Link>
                                                </CardTitle>

                                                <CardDescription className="flex items-center gap-1.5 font-normal text-xs text-muted-foreground truncate">
                                                    <CpuIcon className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{profile.driverId}</span>
                                                </CardDescription>
                                            </div>

                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <div className="flex items-center gap-2">
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
                                                                    className="font-normal cursor-pointer"
                                                                    onClick={() =>
                                                                        void runProfileLifecycleAction(
                                                                            () => api.profiles.start(profile.id)
                                                                        )
                                                                    }
                                                                >
                                                                    <PlayIcon className="h-4 w-4 mr-2" />
                                                                    Start
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="font-normal cursor-pointer"
                                                                    onClick={() =>
                                                                        void runProfileLifecycleAction(
                                                                            () => api.profiles.stop(profile.id)
                                                                        )
                                                                    }
                                                                >
                                                                    <StopIcon className="h-4 w-4 mr-2" />
                                                                    Stop
                                                                </DropdownMenuItem>
                                                            </DropdownMenuGroup>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                                <ProfileInterfaceBadge
                                                    config={profile.config}
                                                    driver={matchedDriver}
                                                />
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="flex flex-col gap-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-2xl bg-muted/50 p-3 flex flex-col justify-between">
                                                <div className="mb-2">
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Profile ID
                                                    </span>
                                                    <span className="font-normal tabular-nums text-sm text-foreground">
                                                        #{profile.id}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Driver Brand
                                                    </span>
                                                    <span className="font-normal text-sm truncate block text-foreground">
                                                        {matchedDriver?.brand || "Generic"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="rounded-2xl bg-muted/50 p-3 flex flex-col justify-between">
                                                <div className="mb-2">
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Endpoint
                                                    </span>
                                                    <ProfileEndpointBadge
                                                        config={profile.config}
                                                        driver={matchedDriver}
                                                        className="mt-0.5"
                                                    />
                                                </div>
                                                <div>
                                                    <span className="text-xs text-muted-foreground font-normal block">
                                                        Updated
                                                    </span>
                                                    <span className="font-normal text-xs block text-foreground font-mono">
                                                        {new Date(profile.updatedAt || profile.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Configuration Payload Inspector Box */}
                                        <div className="space-y-1.5 rounded-2xl bg-muted/30 border border-border/50 p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider block">
                                                    Configuration Payload
                                                </span>
                                                <Link 
                                                    to={`/dashboard/profiles/${profile.id}`}
                                                    className="text-[11px] text-primary hover:underline font-normal inline-flex items-center gap-1"
                                                >
                                                    <span>View details</span>
                                                    <ArrowRightIcon className="h-3 w-3" />
                                                </Link>
                                            </div>
                                            <div className="max-h-28 overflow-y-auto rounded-xl bg-muted/50 p-2.5 font-mono text-[11px] text-foreground leading-relaxed [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                                <pre className="whitespace-pre-wrap break-all">
                                                    {JSON.stringify(profile.config, null, 2)}
                                                </pre>
                                            </div>
                                        </div>

                                        {/* Fully aligned action buttons container */}
                                        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-border/30 mt-1">
                                            <div className="w-full sm:flex-1">
                                                <ProfileForm
                                                    drivers={driversData?.drivers ?? []}
                                                    profile={profile}
                                                    onCreated={runHardRefresh}
                                                />
                                            </div>

                                            {profile.enabled ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full sm:flex-1 font-normal"
                                                    onClick={() =>
                                                        void runProfileLifecycleAction(
                                                            () => api.profiles.stop(profile.id)
                                                        )
                                                    }
                                                >
                                                    <StopIcon className="h-4 w-4 mr-1.5" />
                                                    Stop analyzer
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="w-full sm:flex-1 font-normal"
                                                    onClick={() =>
                                                        void runProfileLifecycleAction(
                                                            () => api.profiles.start(profile.id)
                                                        )
                                                    }
                                                >
                                                    <PlayIcon className="h-4 w-4 mr-1.5" />
                                                    Start analyzer
                                                </Button>
                                            )}

                                            <ConfirmAction
                                                trigger={
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="w-full sm:flex-1 font-normal"
                                                    >
                                                        <TrashIcon className="h-4 w-4 mr-1.5" />
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