import React from "react"
import { useParams, useNavigate } from "react-router-dom"
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
import { 
    ArrowLeftIcon, 
    CpuIcon, 
    GlobeIcon, 
    PlayIcon, 
    StopIcon, 
    TrashIcon,
    ClockIcon,
    CheckCircleIcon,
    XCircleIcon,
    RadioIcon,
    PlugsConnectedIcon,
    HardDriveIcon,
    FileCodeIcon,
    LightningIcon,
    SlidersIcon
} from "@phosphor-icons/react"

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

    // Fetch Drivers Registry
    const { data: driversData } = useSWR(
        api.drivers.listKey(),
        () => api.drivers.list()
    )

    const profileAction = useAsyncAction("Lifecycle action failed.")

    const machine = React.useMemo(() => {
        return (healthData?.running_machines ?? []).find(
            (m) => m.profile.id === machineId
        )?.machine
    }, [healthData, machineId])

    if (!profileData && !profileError) return <PageLoading />
    if (profileError || !profileData?.profile) {
        return (
            <ResourceError
                error={profileError || new Error("Profile not found")}
                onRetry={() => profileMutate()}
            />
        )
    }

    const profile = profileData.profile
    const matchedDriver = driversData?.drivers.find((d) => d.id === profile.driverId)

    // Dynamic Connection Detection (TCP vs Serial RS232)
    const configObj = (profile.config && typeof profile.config === 'object') ? profile.config as Record<string, unknown> : {}
    const isSerial = 'comPort' in configObj || 'baudRate' in configObj || 'path' in configObj
    
    const host = configObj.host ? String(configObj.host) : "0.0.0.0"
    const port = configObj.port ? String(configObj.port) : "7001"
    const comPort = configObj.comPort ? String(configObj.comPort) : (configObj.path ? String(configObj.path) : "COM1")
    const baudRate = configObj.baudRate ? String(configObj.baudRate) : "9600"

    const isRunning = machine?.running ?? profile.enabled
    const isConnected = machine?.connected ?? false

    async function handleLifecycleAction(action: () => Promise<unknown>) {
        await profileAction.execute(async () => {
            await action()
            await Promise.all([healthMutate(), profileMutate()])
        }).catch(() => undefined)
    }

    return (
        <Container>
            <div className="flex flex-col gap-6 w-full">
                
                {/* Top Navigation & Action Header */}
                <div className="flex flex-col gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit gap-1.5 text-muted-foreground hover:text-foreground p-0 hover:bg-transparent"
                        onClick={() => navigate("/dashboard/profiles")}
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        <span>Back to Analyzer Profiles</span>
                    </Button>

                    <PageSection
                        eyebrow={`PROFILE ID: #${profile.id}`}
                        title={profile.name || `Analyzer ${profile.id}`}
                        description="Detailed connection specifications, live machine health, and driver runtime configuration."
                        actions={
                            <div className="flex flex-wrap items-center gap-2">
                                <ConnectionBadge
                                    connected={isConnected}
                                    running={isRunning}
                                />

                                {isRunning ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleLifecycleAction(() => api.profiles.stop(profile.id))}
                                    >
                                        <StopIcon data-icon="inline-start" />
                                        <span>Stop analyzer</span>
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={() => handleLifecycleAction(() => api.profiles.start(profile.id))}
                                    >
                                        <PlayIcon data-icon="inline-start" />
                                        <span>Start analyzer</span>
                                    </Button>
                                )}

                                <ConfirmAction
                                    trigger={
                                        <Button variant="destructive" size="sm">
                                            <TrashIcon data-icon="inline-start" />
                                            <span>Delete</span>
                                        </Button>
                                    }
                                    title="Delete analyzer profile?"
                                    description="Profiles referenced by orders, results, or statistics cannot be deleted."
                                    actionLabel="Delete profile"
                                    onConfirm={async () => {
                                        await api.profiles.remove(profile.id)
                                        navigate("/dashboard/profiles")
                                    }}
                                />
                            </div>
                        }
                    />
                </div>

                {profileAction.error && (
                    <Alert variant="destructive">
                        <AlertTitle>Action Failed</AlertTitle>
                        <AlertDescription>{profileAction.error}</AlertDescription>
                    </Alert>
                )}

                {/* Clean 2-Card Layout (Left Vertical, Right Horizontal) */}
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">

                    {/* Left Card: Vertical Overview & Real State Status Banner */}
                    <Card className="lg:col-span-1 flex flex-col justify-between border-border bg-card">
                        <div>
                            <CardHeader>
                                <CardTitle className="text-base font-bold">Analyzer Overview</CardTitle>
                                <CardDescription className="text-xs">Machine hardware specs & driver identity</CardDescription>
                            </CardHeader>

                            <CardContent className="flex flex-col gap-4">
                                <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                                    <div>
                                        <dt className="text-xs text-muted-foreground font-medium">Profile ID</dt>
                                        <dd className="font-semibold tabular-nums">#{profile.id}</dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs text-muted-foreground font-medium">Driver Brand</dt>
                                        <dd className="font-medium">{matchedDriver?.brand || "SNIBE"}</dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs text-muted-foreground font-medium">Driver ID</dt>
                                        <dd className="font-mono text-xs font-medium flex items-center gap-1">
                                            <CpuIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            {profile.driverId}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs text-muted-foreground font-medium">Last Updated</dt>
                                        <dd className="font-medium text-xs flex items-center gap-1">
                                            <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            {new Date(profile.updatedAt || profile.createdAt).toLocaleDateString()}
                                        </dd>
                                    </div>
                                </dl>

                                <div className="space-y-2">
                                    <div className="p-3 rounded-2xl bg-muted/50 flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                            {isSerial ? <HardDriveIcon className="h-3.5 w-3.5" /> : <GlobeIcon className="h-3.5 w-3.5" />}
                                            Interface
                                        </span>
                                        <span className="font-medium text-foreground">{isSerial ? "Serial RS-232" : "TCP/IP Network"}</span>
                                    </div>

                                    <div className="p-3 rounded-2xl bg-muted/50 flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                            <GlobeIcon className="h-3.5 w-3.5" />
                                            Endpoint
                                        </span>
                                        <span className="font-mono font-medium text-foreground">{isSerial ? `${comPort}:${baudRate}` : `${host}:${port}`}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </div>

                        {/* Dynamic Status Banner (Correct Status Reflecting Real State) */}
                        <CardContent className="pt-2">
                            {isRunning ? (
                                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-start gap-3">
                                    <CheckCircleIcon weight="fill" className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                                    <div className="space-y-0.5 text-xs">
                                        <p className="font-semibold text-emerald-950 dark:text-emerald-300">Driver Listening</p>
                                        <p className="text-emerald-800/80 dark:text-emerald-400/90 leading-normal">
                                            Active and awaiting incoming data packets on {isSerial ? comPort : `${host}:${port}`}.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-border bg-muted/40 p-3.5 flex items-start gap-3">
                                    <XCircleIcon weight="fill" className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div className="space-y-0.5 text-xs">
                                        <p className="font-semibold text-foreground">Driver Service Offline</p>
                                        <p className="text-muted-foreground leading-normal">
                                            Machine listener is stopped. Click "Start analyzer" to begin receiving lab results.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Right Card: Horizontal Runtime Settings, Protocol Specs & Payload */}
                    <Card className="lg:col-span-2 border-border bg-card">
                        <CardHeader>
                            <CardTitle className="text-base font-bold">SDK Connection & Interface Settings</CardTitle>
                            <CardDescription className="text-xs">Runtime parameters and protocol framing specifications for LIS driver</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-5">
                            {/* Live Socket & Listener State */}
                            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                                        <RadioIcon className={`h-3.5 w-3.5 ${isRunning ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
                                        Listener State
                                    </dt>
                                    <dd className="font-semibold text-xs mt-1">{isRunning ? "Active Listener" : "Idle / Stopped"}</dd>
                                </div>

                                <div>
                                    <dt className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                                        <PlugsConnectedIcon className={`h-3.5 w-3.5 ${isConnected ? "text-emerald-500" : "text-muted-foreground"}`} />
                                        Socket Link
                                    </dt>
                                    <dd className="font-semibold text-xs mt-1">{isConnected ? "Connected to Analyzer" : "Disconnected"}</dd>
                                </div>
                            </div>

                            {/* Additional Technical Specifications filling the empty space */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                                        <FileCodeIcon className="h-3.5 w-3.5 text-primary" />
                                        Protocol Standard
                                    </span>
                                    <p className="font-semibold text-xs text-foreground">ASTM E1394 / HL7 v2.x</p>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                                        <LightningIcon className="h-3.5 w-3.5 text-amber-500" />
                                        Communication Mode
                                    </span>
                                    <p className="font-semibold text-xs text-foreground">Bi-directional Query</p>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                                        <SlidersIcon className="h-3.5 w-3.5 text-blue-500" />
                                        Frame Delimiters
                                    </span>
                                    <p className="font-mono text-xs font-semibold text-foreground">&lt;STX&gt; ... &lt;ETX&gt; &lt;CR&gt;&lt;LF&gt;</p>
                                </div>
                            </div>

                            {/* Raw Config JSON Container */}
                            <div className="space-y-1.5">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                                    Configuration Payload
                                </span>
                                <pre className="max-h-60 overflow-auto rounded-2xl bg-muted p-4 text-xs font-mono text-foreground leading-relaxed">
                                    {JSON.stringify(profile.config, null, 2)}
                                </pre>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </Container>
    )
}