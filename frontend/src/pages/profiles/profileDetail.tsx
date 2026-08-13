import React from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import useSWR from "swr"
import { api } from "@/lib/api"
import { useHealth } from "@/contexts/health-context"
import { useAsyncAction } from "@/hooks/use-async-action"
import { PageSection } from "@/components/common/pageSection"
import { PageLoading, ResourceError } from "@/components/common/resourceState"
import { ConnectionBadge } from "@/components/common/statusBadge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/common/confirmAction"
import { Container } from "@/components/common/container"
import {
    ArrowLeftIcon,
    CpuIcon,
    PlayIcon,
    StopIcon,
    TrashIcon,
    CheckCircleIcon,
    XCircleIcon,
    RadioIcon,
    QueueIcon,
    ArrowRightIcon,
    CalendarIcon,
    DotsThreeVerticalIcon
} from "@phosphor-icons/react"
import { ProfileConfigDetailCard } from "@/pages/profiles/profileConfigView"
import { parseProfileConfig } from "@/lib/profile-config"
import { ProfileForm } from "./profleForm"
import { toast } from "sonner"
import { extractApiError } from "@/lib/helpers"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ProfileDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const machineId = Number(id)

    const { data: healthData, mutate: healthMutate } = useHealth()

    // Fetch Profile Detail
    const {
        data: profileData,
        error: profileError,
        mutate: profileMutate,
    } = useSWR(
        machineId ? api.profiles.detailKey(machineId) : null,
        () => api.profiles.get(machineId)
    )

    // Match registered drivers list
    const registeredDriversData = React.useMemo(() => healthData?.registered_drivers ?? [], [healthData?.registered_drivers])
    const driversById = React.useMemo(() => {
        return new Map(
            registeredDriversData.map((driver) => [driver.id, driver])
        );
    }, [registeredDriversData])

    // Fetch associated staged orders for worklist link
    const { data: ordersData } = useSWR(
        machineId ? api.orders.listKey({ machineId, status: "pending" }) : null,
        () => api.orders.list({ machineId, status: "pending" })
    )

    const profileAction = useAsyncAction("Lifecycle action failed.")

    // Match running machine health state
    const runningMachine = React.useMemo(() => {
        return (healthData?.running_machines ?? []).find(
            (m) => m.profile.id === machineId
        )?.machine
    }, [healthData, machineId])

    // Active orders calculations
    const activeOrdersCount = ordersData?.orders?.length ?? 0
    const recentSampleId = ordersData?.orders[0]?.sampleId
    const driverId = profileData?.profile?.driverId;

    // Match driver metadata
    const matchedDriver = React.useMemo(() => {
        if (driverId === null || driverId === undefined) return undefined;
        return driversById.get(driverId);
    }, [driversById, driverId]);

    // Authoritative config parsing
    const parsedConfig = React.useMemo(() => {
        return parseProfileConfig(profileData?.profile?.config, matchedDriver)
    }, [profileData?.profile?.config, matchedDriver])

    // Derived service status logic
    const serviceStatus = React.useMemo(() => {
        const isRunning = runningMachine?.running ?? profileData?.profile?.enabled ?? false
        const isConnected = isRunning && (runningMachine?.connected ?? false)
        return { isRunning, isConnected, endpointDisplay: parsedConfig.endpointDisplay }
    }, [runningMachine, profileData?.profile?.enabled, parsedConfig.endpointDisplay])


    if (!profileData && !profileError) return <PageLoading />
    if (profileError || !profileData?.profile) {
        return (
            <ResourceError
                error={profileError || new Error("Analyzer profile not found")}
                onRetry={() => profileMutate()}
            />
        )
    }

    const profileRecord = profileData.profile
    async function handleLifecycleAction(action: () => Promise<unknown>) {
        await profileAction.execute(async () => {
            await action()
            await Promise.all([healthMutate(), profileMutate()])
        }).catch((err) => {
            toast.error(extractApiError(err, "Analyzer action failed."))
        })
    }

    // status block
    const statusBlock = !serviceStatus.isRunning
        ? {
            icon: <XCircleIcon weight="fill" className="size-4 shrink-0 text-muted-foreground" />,
            label: "Service offline",
            detail: 'Listener is stopped. Click "Start analyzer" to begin.',
        } : serviceStatus.isConnected ? {
            icon: <CheckCircleIcon weight="fill" className="size-4 shrink-0 text-primary" />,
            label: "Active & connected",
            detail: `Analyzer is live on ${serviceStatus.endpointDisplay}.`,
        } : {
            icon: <RadioIcon className="size-4 shrink-0 text-primary animate-pulse" />,
            label: "Listening",
            detail: `Waiting for analyzer on ${serviceStatus.endpointDisplay}.`,
        }

    return (
        <Container className="w-full">

            {/* Back navigation */}
            <Button
                variant="ghost"
                size="sm"
                className="w-fit px-2 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-transparent font-normal"
                onClick={() => navigate("/dashboard/profiles")}
            >
                <ArrowLeftIcon className="size-4" />
                <span>Back to Profiles</span>
            </Button>

            {/* Page header with actions */}
            <PageSection
                eyebrow={`Profile #${profileRecord.id}`}
                title={profileRecord.name || matchedDriver?.brand || `Analyzer ${profileRecord.id}`}
                description={`${matchedDriver?.brand ?? profileRecord.driverId} · ${parsedConfig.interfaceLabel}`}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {/* running or stopped badges */}
                        <ConnectionBadge
                            connected={serviceStatus.isConnected}
                            running={serviceStatus.isRunning}
                        />

                        {/* desktop action btns */}
                        <div className="hidden sm:flex items-center gap-2">
                            {/* 1. Start/Stop analyzer first */}
                            {serviceStatus.isRunning ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="font-normal"
                                    disabled={profileAction.pending}
                                    onClick={() => handleLifecycleAction(() => api.profiles.stop(profileRecord.id))}
                                >
                                    <StopIcon data-icon="inline-start" />
                                    Stop analyzer
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className="font-normal"
                                    disabled={profileAction.pending}
                                    onClick={() => handleLifecycleAction(() => api.profiles.start(profileRecord.id))}
                                >
                                    <PlayIcon data-icon="inline-start" />
                                    Start analyzer
                                </Button>
                            )}

                            {/* 2. Edit profile second */}
                            <ProfileForm
                                drivers={registeredDriversData}
                                profile={profileRecord}
                                onCreated={async () => { await profileMutate() }}
                            />

                            {/* 3. Delete profile last */}
                            <ConfirmAction
                                trigger={
                                    <Button variant="destructive" size="sm" className="font-normal">
                                        <TrashIcon data-icon="inline-start" />
                                        Delete
                                    </Button>
                                }
                                title="Delete analyzer profile?"
                                description="Profiles referenced by orders, results, or statistics cannot be deleted."
                                actionLabel="Delete profile"
                                onConfirm={async () => {
                                    try {
                                        await api.profiles.remove(profileRecord.id)
                                        navigate("/dashboard/profiles")
                                    } catch (err) {
                                        toast.error(extractApiError(err, "Could not delete profile."))
                                    }
                                }}
                            />
                        </div>

                        {/* mobile only actions */}
                        <div className="sm:hidden flex items-center gap-2">
                            {/* Mobile Start/Stop */}
                            {serviceStatus.isRunning ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="font-normal"
                                    disabled={profileAction.pending}
                                    onClick={() => handleLifecycleAction(() => api.profiles.stop(profileRecord.id))}
                                >
                                    <StopIcon data-icon="inline-start" />
                                    Stop
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className="font-normal"
                                    disabled={profileAction.pending}
                                    onClick={() => handleLifecycleAction(() => api.profiles.start(profileRecord.id))}
                                >
                                    <PlayIcon data-icon="inline-start" />
                                    Start
                                </Button>
                            )}

                            {/* Mobile Edit */}
                            <ProfileForm
                                drivers={registeredDriversData}
                                profile={profileRecord}
                                onCreated={async () => { await profileMutate() }}
                            />

                            {/* Mobile Dropdown for additional/destructive actions */}
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            variant="outline"
                                            size="icon-sm"
                                            aria-label="Profile actions"
                                            disabled={profileAction.pending}
                                        />
                                    }
                                >
                                    <DotsThreeVerticalIcon weight="bold" />
                                </DropdownMenuTrigger>

                                <DropdownMenuContent align="end" className="min-w-44">
                                    <DropdownMenuGroup>
                                        <ConfirmAction
                                            trigger={
                                                <DropdownMenuItem
                                                    className="font-normal text-destructive focus:text-destructive"
                                                    onSelect={(e) => e.preventDefault()}
                                                >
                                                    <TrashIcon />
                                                    Delete profile
                                                </DropdownMenuItem>
                                            }
                                            title="Delete analyzer profile?"
                                            description="Profiles referenced by orders, results, or statistics cannot be deleted."
                                            actionLabel="Delete profile"
                                            onConfirm={async () => {
                                                try {
                                                    await api.profiles.remove(profileRecord.id)
                                                    navigate("/dashboard/profiles")
                                                } catch (err) {
                                                    toast.error(extractApiError(err, "Could not delete profile."))
                                                }
                                            }}
                                        />
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                    </div>
                }
            />

            {/* Page body - 2-column on large, stacked on mobile */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 items-start">

                {/* left sidebar card */}
                <Card className="lg:col-span-1 rounded-3xl overflow-hidden shadow-none">
                    <CardHeader className="">
                        <CardTitle className="text-sm font-semibold">Overview</CardTitle>
                        <CardDescription className="text-xs font-normal">
                            Identity, status & staged worklist
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-3">
                        {/* Identity grid */}
                        <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-3">
                            <div>
                                <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                    Profile ID
                                </dt>
                                <dd className="font-mono tabular-nums text-xs text-foreground font-normal mt-0.5">
                                    #{profileRecord.id}
                                </dd>
                            </div>

                            <div>
                                <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                    Driver
                                </dt>
                                <dd className="font-normal text-xs text-foreground mt-0.5 flex items-center gap-1">
                                    <CpuIcon className="size-3 text-muted-foreground shrink-0" />
                                    <span className="truncate">{profileRecord.driverId}</span>
                                </dd>
                            </div>

                            {matchedDriver?.brand && (
                                <div>
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Brand
                                    </dt>
                                    <dd className="font-normal text-xs text-foreground mt-0.5">
                                        {matchedDriver.brand}
                                    </dd>
                                </div>
                            )}

                            {matchedDriver?.models?.length ? (
                                <div>
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Models
                                    </dt>
                                    <dd className="font-normal text-xs text-foreground mt-0.5 truncate">
                                        {matchedDriver.models.join(", ")}
                                    </dd>
                                </div>
                            ) : null}

                            {matchedDriver?.protocol && (
                                <div className="col-span-2">
                                    <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">
                                        Protocol
                                    </dt>
                                    <dd className="font-normal text-xs text-foreground mt-0.5">
                                        {matchedDriver.protocol.name} · {matchedDriver.protocol.version}
                                    </dd>
                                </div>
                            )}

                            <div className="col-span-2">
                                <dt className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider flex items-center gap-1">
                                    <CalendarIcon className="size-3" />
                                    Last updated
                                </dt>
                                <dd className="font-mono text-[11px] text-foreground font-normal mt-0.5">
                                    {profileRecord.updatedAt
                                        ? new Date(String(profileRecord.updatedAt)).toLocaleString()
                                        : "—"}
                                </dd>
                            </div>
                        </dl>

                        {/* Live status indicator */}
                        <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-start gap-2.5">
                            {statusBlock.icon}
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-normal text-foreground">{statusBlock.label}</span>
                                <span className="text-[11px] font-normal text-muted-foreground leading-relaxed">
                                    {statusBlock.detail}
                                </span>
                            </div>
                        </div>

                        {/* Staged orders quick-link */}
                        <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <QueueIcon className="size-3.5 text-primary shrink-0" />
                                <span className="text-xs text-foreground font-normal">
                                    {activeOrdersCount > 0
                                        ? `${activeOrdersCount} order${activeOrdersCount > 1 ? "s" : ""} staged`
                                        : "No queued orders"}
                                </span>
                            </div>
                            <Link
                                to={
                                    recentSampleId
                                        ? `/dashboard/orders?sampleId=${recentSampleId}`
                                        : "/dashboard/orders"
                                }
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-normal shrink-0"
                            >
                                View
                                <ArrowRightIcon className="size-3" />
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                {/* right side full config cards */}
                <div className="lg:col-span-2">
                    <ProfileConfigDetailCard
                        config={profileRecord.config}
                        driver={matchedDriver}
                        className="rounded-3xl"
                    />
                </div>
            </div>

        </Container>
    )
}