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
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { ConfirmAction } from "@/components/common/confirmAction"
import { Container } from "@/components/common/container"
import { ToastNotification } from "@/components/common/formError"
import {
    ArrowLeftIcon,
    CpuIcon,
    PlayIcon,
    StopIcon,
    TrashIcon,
    ClockIcon,
    CheckCircleIcon,
    XCircleIcon,
    RadioIcon,
    FileCodeIcon,
    QueueIcon,
    ArrowRightIcon
} from "@phosphor-icons/react"

import { ProfileConfigCard } from "@/components/common/profileConfigView"
import { parseProfileConfig } from "@/lib/profile-config"
import { ProfileForm } from "./profleForm"

export function ProfileDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const machineId = Number(id)
    const [toastError, setToastError] = React.useState<string | null>(null)

    const { data: healthData, mutate: healthMutate } = useHealth()

    // Fetch Profile Detail
    const {
        data: profileData,
        error: profileError,
        mutate: profileMutate,
    } = useSWR(
        machineId && !isNaN(machineId) ? api.profiles.detailKey(machineId) : null,
        () => api.profiles.get(machineId)
    )

    // Fetch Drivers Registry
    const { data: driversData } = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list()
    )

    const driversList = React.useMemo(() => driversData?.drivers ?? healthData?.registered_drivers ?? [], [driversData, healthData])
    
    const getRegisteredDriver = React.useMemo(() => {
        return new Map(driversList.map((driver) => [driver.id, driver]))
    }, [driversList])

    // Fetch associated staged orders for this specific analyzer machine
    const { data: ordersData } = useSWR(
        machineId && !isNaN(machineId) ? api.orders.listKey({ machineId }) : null,
        () => api.orders.list({ machineId })
    )

    const profileAction = useAsyncAction("Lifecycle action failed.")

    // Running machine health match
    const runningMachine = React.useMemo(() => {
        return (healthData?.running_machines ?? []).find(
            (m) => Number(m.profile.id) === machineId
        )?.machine
    }, [healthData, machineId])

    const profileRecord = profileData?.profile

    // Matched driver lookup
    const matchedDriver = React.useMemo(() => {
        if (!profileRecord?.driverId || !getRegisteredDriver.size) return undefined
        return getRegisteredDriver.get(profileRecord.driverId)
    }, [getRegisteredDriver, profileRecord?.driverId])

    // Parse configuration dynamically using parseProfileConfig helper
    const parsedConfig = React.useMemo(() => {
        return parseProfileConfig(profileRecord?.config, matchedDriver)
    }, [profileRecord?.config, matchedDriver])

    // Derived service status logic
    const serviceStatus = React.useMemo(() => {
        const isRunning = runningMachine?.running ?? profileRecord?.enabled ?? false
        const isConnected = isRunning && (runningMachine?.connected ?? false)
        return { isRunning, isConnected, endpointDisplay: parsedConfig.endpointDisplay }
    }, [runningMachine, profileRecord?.enabled, parsedConfig.endpointDisplay])

    const activeOrdersCount = ordersData?.orders?.length ?? 0
    const recentSampleId = ordersData?.orders?.[0]?.sampleId

    if (!profileData && !profileError) return <PageLoading />
    if (profileError || !profileRecord) {
        return (
            <Container>
                <ResourceError
                    error={profileError || new Error("Profile not found")}
                    onRetry={() => profileMutate()}
                />
            </Container>
        )
    }

    async function handleLifecycleAction(action: () => Promise<unknown>) {
        setToastError(null)
        try {
            await profileAction.execute(async () => {
                await action()
                await Promise.all([healthMutate(), profileMutate()])
            })
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Lifecycle action failed."
            setToastError(errorMsg)
        }
    }

    return (
        <Container>
            <div className="flex flex-col gap-6 w-full">
                
                {/* Navigation and Header Section */}
                <div className="flex flex-col gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit gap-1.5 text-muted-foreground hover:text-foreground p-0 hover:bg-transparent font-normal cursor-pointer"
                        onClick={() => navigate("/dashboard/profiles")}
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        <span className="font-normal">Back to Analyzer Profiles</span>
                    </Button>

                    <PageSection
                        eyebrow={`PROFILE ID: #${profileRecord.id}`}
                        title={profileRecord.name || `Analyzer ${profileRecord.id}`}
                        description="Detailed connection specifications, live machine health, and driver runtime configuration."
                        actions={
                            <div className="flex flex-wrap items-center gap-2">
                                <ConnectionBadge
                                    connected={serviceStatus.isConnected}
                                    running={serviceStatus.isRunning}
                                />

                                {serviceStatus.isRunning ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="font-normal text-sm cursor-pointer"
                                        onClick={() => handleLifecycleAction(() => api.profiles.stop(Number(profileRecord.id)))}
                                    >
                                        <StopIcon className="h-4 w-4 mr-1.5" />
                                        <span>Stop analyzer</span>
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="font-normal text-sm cursor-pointer"
                                        onClick={() => handleLifecycleAction(() => api.profiles.start(Number(profileRecord.id)))}
                                    >
                                        <PlayIcon className="h-4 w-4 mr-1.5" />
                                        <span>Start analyzer</span>
                                    </Button>
                                )}

                                <ProfileForm
                                    drivers={driversList}
                                    profile={profileRecord}
                                    onCreated={async () => {
                                        await profileMutate()
                                    }}
                                />

                                <ConfirmAction
                                    trigger={
                                        <Button variant="destructive" size="sm" className="font-normal text-sm cursor-pointer">
                                            <TrashIcon className="h-4 w-4 mr-1.5" />
                                            <span>Delete</span>
                                        </Button>
                                    }
                                    title="Delete analyzer profile?"
                                    description="Profiles referenced by orders, results, or statistics cannot be deleted."
                                    actionLabel="Delete profile"
                                    onConfirm={async () => {
                                        await api.profiles.remove(Number(profileRecord.id))
                                        navigate("/dashboard/profiles")
                                    }}
                                />
                            </div>
                        }
                    />
                </div>

                <ToastNotification title="Analyzer Action Failed" message={toastError} onClose={() => setToastError(null)} />

                {profileAction.error && (
                    <Alert variant="destructive">
                        <AlertTitle className="font-normal">Action Failed</AlertTitle>
                        <AlertDescription className="font-normal">{profileAction.error}</AlertDescription>
                    </Alert>
                )}

                {/* Content Layout Cards */}
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">
                    
                    {/* Left Overview Card */}
                    <Card className="lg:col-span-1 border-border bg-card rounded-3xl shadow-sm overflow-hidden">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-normal">Analyzer Overview</CardTitle>
                            <CardDescription className="text-xs font-normal">Machine hardware specs & driver identity</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-3">
                            <dl className="grid grid-cols-2 gap-2.5 rounded-2xl bg-muted/50 p-3 text-sm">
                                <div>
                                    <dt className="text-[11px] text-muted-foreground font-normal">Profile ID</dt>
                                    <dd className="font-normal tabular-nums text-xs text-foreground mt-0.5">#{profileRecord.id}</dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] text-muted-foreground font-normal">Driver Brand</dt>
                                    <dd className="font-normal text-xs text-foreground mt-0.5">{matchedDriver?.brand || "—"}</dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] text-muted-foreground font-normal">Driver ID</dt>
                                    <dd className="font-mono text-xs font-normal flex items-center gap-1 text-foreground mt-0.5">
                                        <CpuIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <span className="truncate">{profileRecord.driverId}</span>
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] text-muted-foreground font-normal">Last Updated</dt>
                                    <dd className="font-normal text-[11px] flex items-center gap-1 text-foreground mt-0.5 font-mono">
                                        <ClockIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                                        {profileRecord.updatedAt ? new Date(String(profileRecord.updatedAt)).toLocaleDateString() : "—"}
                                    </dd>
                                </div>
                            </dl>

                            <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                                        <QueueIcon className="h-3.5 w-3.5 text-primary" />
                                        Staged Orders
                                    </span>
                                    <p className="text-xs text-foreground font-normal">
                                        {activeOrdersCount > 0 ? `${activeOrdersCount} order(s) routed` : "No queued orders"}
                                    </p>
                                </div>
                                <Link 
                                    to={recentSampleId ? `/dashboard/orders?sampleId=${recentSampleId}` : "/dashboard/orders"}
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-normal"
                                >
                                    <span>View</span>
                                    <ArrowRightIcon className="h-3 w-3" />
                                </Link>
                            </div>

                            <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                                        <FileCodeIcon className="h-3.5 w-3.5 text-primary" />
                                        Protocol Standard
                                    </span>
                                    <p className="text-xs text-foreground font-normal">{matchedDriver?.protocol || "ASTM E1394"}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-muted/40 p-3 flex items-start gap-2.5">
                                {!serviceStatus.isRunning ? (
                                    <>
                                        <XCircleIcon weight="fill" className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                        <div className="space-y-0.5 text-xs font-normal">
                                            <p className="font-normal text-foreground">Service Stopped</p>
                                            <p className="text-muted-foreground leading-normal font-normal text-[11px]">Analyzer listener is offline. Click "Start analyzer" to begin data exchange.</p>
                                        </div>
                                    </>
                                ) : serviceStatus.isConnected ? (
                                    <>
                                        <CheckCircleIcon weight="fill" className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                        <div className="space-y-0.5 text-xs font-normal">
                                            <p className="font-normal text-foreground">Active & Connected</p>
                                            <p className="text-muted-foreground leading-normal font-normal text-[11px]">Physical analyzer is linked and transmitting frames on {serviceStatus.endpointDisplay}.</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <RadioIcon className="h-4 w-4 text-primary animate-pulse shrink-0 mt-0.5" />
                                        <div className="space-y-0.5 text-xs font-normal">
                                            <p className="font-normal text-foreground">Listening for Analyzer</p>
                                            <p className="text-muted-foreground leading-normal font-normal text-[11px]">Service is listening on {serviceStatus.endpointDisplay}. Awaiting hardware link.</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right Connection Settings Card using ProfileConfigCard */}
                    <div className="lg:col-span-2">
                        <ProfileConfigCard 
                            config={profileRecord.config} 
                            driver={matchedDriver} 
                            className="rounded-3xl shadow-sm overflow-hidden" 
                        />
                    </div>

                </div>
            </div>
        </Container>
    )
}