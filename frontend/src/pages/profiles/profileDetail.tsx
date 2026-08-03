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
    SlidersIcon,
    QueueIcon,
    ArrowRightIcon
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

    // Fetch associated staged orders for this specific analyzer machine
    const { data: ordersData } = useSWR(
        machineId ? api.orders.listKey({ machineId }) : null,
        () => api.orders.list({ machineId })
    )

    const profileAction = useAsyncAction("Lifecycle action failed.")

    // Explicit React.useMemo for running machine health match
    const machine = React.useMemo(() => {
        return (healthData?.running_machines ?? []).find(
            (m) => m.profile.id === machineId
        )?.machine
    }, [healthData, machineId])

    // Explicit React.useMemo for staged orders count
    const activeOrdersCount = React.useMemo(() => {
        return ordersData?.orders.length ?? 0
    }, [ordersData?.orders])

    // Explicit React.useMemo for recent sample ID
    const recentSampleId = React.useMemo(() => {
        return ordersData?.orders[0]?.sampleId
    }, [ordersData?.orders])

    // Explicit React.useMemo for matched driver
    const matchedDriver = React.useMemo(() => {
        if (!profileData?.profile || !driversData?.drivers) return undefined
        return driversData.drivers.find((d) => d.id === profileData.profile.driverId)
    }, [driversData, profileData])

    // Explicit React.useMemo for dynamic connection configuration parsing
    const configParsed = React.useMemo(() => {
        const configObj = (profileData?.profile?.config && typeof profileData.profile.config === 'object') 
            ? profileData.profile.config as Record<string, unknown> 
            : {}
            
        const isSerial = 'comPort' in configObj || 'baudRate' in configObj || 'path' in configObj
        const host = configObj.host ? String(configObj.host) : "0.0.0.0"
        const port = configObj.port ? String(configObj.port) : "7001"
        const comPort = configObj.comPort ? String(configObj.comPort) : (configObj.path ? String(configObj.path) : "COM1")
        const baudRate = configObj.baudRate ? String(configObj.baudRate) : "9600"

        return { isSerial, host, port, comPort, baudRate }
    }, [profileData?.profile?.config])

    // Explicit React.useMemo for derived status logic
    const serviceStatus = React.useMemo(() => {
        const isRunning = machine?.running ?? profileData?.profile?.enabled ?? false
        const isConnected = isRunning && (machine?.connected ?? false)
        const endpointDisplay = configParsed.isSerial 
            ? `${configParsed.comPort}:${configParsed.baudRate}` 
            : `${configParsed.host}:${configParsed.port}`

        return { isRunning, isConnected, endpointDisplay }
    }, [machine, profileData?.profile?.enabled, configParsed])

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
                        className="w-fit gap-1.5 text-muted-foreground hover:text-foreground p-0 hover:bg-transparent font-normal"
                        onClick={() => navigate("/dashboard/profiles")}
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        <span className="font-normal">Back to Analyzer Profiles</span>
                    </Button>

                    <PageSection
                        eyebrow={`PROFILE ID: #${profile.id}`}
                        title={profile.name || `Analyzer ${profile.id}`}
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
                                        className="font-normal"
                                        onClick={() => handleLifecycleAction(() => api.profiles.stop(profile.id))}
                                    >
                                        <StopIcon data-icon="inline-start" />
                                        <span className="font-normal">Stop analyzer</span>
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="font-normal"
                                        onClick={() => handleLifecycleAction(() => api.profiles.start(profile.id))}
                                    >
                                        <PlayIcon data-icon="inline-start" />
                                        <span className="font-normal">Start analyzer</span>
                                    </Button>
                                )}

                                <ConfirmAction
                                    trigger={
                                        <Button variant="destructive" size="sm" className="font-normal">
                                            <TrashIcon data-icon="inline-start" />
                                            <span className="font-normal">Delete</span>
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
                        <AlertTitle className="font-normal">Action Failed</AlertTitle>
                        <AlertDescription className="font-normal">{profileAction.error}</AlertDescription>
                    </Alert>
                )}

                {/* Clean 2-Card Layout (Left Vertical, Right Horizontal) */}
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">

                    {/* Left Card: Vertical Overview, Linked Worklist Card & Status Banner */}
                    <Card className="lg:col-span-1 flex flex-col justify-between border-border bg-card">
                        <div>
                            <CardHeader>
                                <CardTitle className="text-base font-normal">Analyzer Overview</CardTitle>
                                <CardDescription className="text-xs font-normal">Machine hardware specs & driver identity</CardDescription>
                            </CardHeader>

                            <CardContent className="flex flex-col gap-4">
                                <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Profile ID</dt>
                                        <dd className="font-normal tabular-nums text-sm">#{profile.id}</dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Driver Brand</dt>
                                        <dd className="font-normal text-sm">{matchedDriver?.brand || "SNIBE"}</dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Driver ID</dt>
                                        <dd className="font-mono text-xs font-normal flex items-center gap-1">
                                            <CpuIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            {profile.driverId}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt className="text-xs text-muted-foreground font-normal">Last Updated</dt>
                                        <dd className="font-normal text-xs flex items-center gap-1">
                                            <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                            {new Date(profile.updatedAt || profile.createdAt).toLocaleDateString()}
                                        </dd>
                                    </div>
                                </dl>

                                {/* Direct Staged Worklist Card Container */}
                                <Card className="border-border bg-muted/50 shadow-none">
                                    <CardContent className="p-3.5 flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <span className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                                                <QueueIcon className="h-4 w-4 text-primary" />
                                                Staged Worklist Orders
                                            </span>
                                            <p className="text-xs text-foreground font-normal">
                                                {activeOrdersCount > 0 
                                                    ? `${activeOrdersCount} order(s) routed` 
                                                    : "No active queued orders"}
                                            </p>
                                        </div>

                                        <Link 
                                            to={recentSampleId ? `/dashboard/orders?sampleId=${recentSampleId}` : "/dashboard/orders"}
                                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-normal"
                                        >
                                            <span>View</span>
                                            <ArrowRightIcon className="h-3.5 w-3.5" />
                                        </Link>
                                    </CardContent>
                                </Card>

                                <div className="space-y-2">
                                    <Card className="border-none bg-muted/50 shadow-none">
                                        <CardContent className="p-3 flex items-center justify-between text-xs font-normal">
                                            <span className="text-muted-foreground flex items-center gap-1.5 font-normal">
                                                {configParsed.isSerial ? <HardDriveIcon className="h-3.5 w-3.5" /> : <GlobeIcon className="h-3.5 w-3.5" />}
                                                Interface
                                            </span>
                                            <span className="text-foreground font-normal">{configParsed.isSerial ? "Serial RS-232" : "TCP/IP Network"}</span>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-none bg-muted/50 shadow-none">
                                        <CardContent className="p-3 flex items-center justify-between text-xs font-normal">
                                            <span className="text-muted-foreground flex items-center gap-1.5 font-normal">
                                                <GlobeIcon className="h-3.5 w-3.5" />
                                                Endpoint
                                            </span>
                                            <span className="font-mono text-foreground font-normal">
                                                {serviceStatus.endpointDisplay}
                                            </span>
                                        </CardContent>
                                    </Card>
                                </div>
                            </CardContent>
                        </div>

                        {/* Accurate Status Card Banner based on Service State & Connection Link */}
                        <CardContent className="pt-2">
                            {!serviceStatus.isRunning ? (
                                <Card className="border-border bg-muted/40 shadow-none">
                                    <CardContent className="p-3.5 flex items-start gap-3">
                                        <XCircleIcon weight="fill" className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                                        <div className="space-y-0.5 text-xs font-normal">
                                            <p className="font-normal text-foreground">Service Stopped</p>
                                            <p className="text-muted-foreground leading-normal font-normal">
                                                Analyzer listener is offline. Click "Start analyzer" to enable port listening and data exchange.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : serviceStatus.isConnected ? (
                                <Card className="border-border bg-muted/50 shadow-none">
                                    <CardContent className="p-3.5 flex items-start gap-3">
                                        <CheckCircleIcon weight="fill" className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                        <div className="space-y-0.5 text-xs font-normal">
                                            <p className="font-normal text-foreground">Active & Connected</p>
                                            <p className="text-muted-foreground leading-normal font-normal">
                                                Physical analyzer is linked and actively transmitting frames on {serviceStatus.endpointDisplay}.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="border-border bg-muted/50 shadow-none">
                                    <CardContent className="p-3.5 flex items-start gap-3">
                                        <RadioIcon className="h-5 w-5 text-primary animate-pulse shrink-0 mt-0.5" />
                                        <div className="space-y-0.5 text-xs font-normal">
                                            <p className="font-normal text-foreground">Listening for Analyzer</p>
                                            <p className="text-muted-foreground leading-normal font-normal">
                                                Service is listening on {serviceStatus.endpointDisplay}. Awaiting physical hardware handshake.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </CardContent>
                    </Card>

                    {/* Right Card: Horizontal Runtime Settings & Payload */}
                    <Card className="lg:col-span-2 border-border bg-card">
                        <CardHeader>
                            <CardTitle className="text-base font-normal">SDK Connection & Interface Settings</CardTitle>
                            <CardDescription className="text-xs font-normal">Runtime parameters and protocol framing specifications for LIS driver</CardDescription>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-5">
                            {/* Clear distinction between Service State and Physical Link State */}
                            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
                                <div>
                                    <dt className="text-xs text-muted-foreground flex items-center gap-1.5 font-normal">
                                        <RadioIcon className={`h-3.5 w-3.5 ${serviceStatus.isRunning ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                                        Listener Service
                                    </dt>
                                    <dd className="text-xs mt-1 font-normal">{serviceStatus.isRunning ? "Running" : "Stopped"}</dd>
                                </div>

                                <div>
                                    <dt className="text-xs text-muted-foreground flex items-center gap-1.5 font-normal">
                                        <PlugsConnectedIcon className={`h-3.5 w-3.5 ${serviceStatus.isConnected ? "text-primary" : "text-muted-foreground"}`} />
                                        Hardware Connection
                                    </dt>
                                    <dd className="text-xs mt-1 font-normal">{serviceStatus.isConnected ? "Connected" : "Disconnected"}</dd>
                                </div>
                            </div>

                            {/* Additional Technical Specifications */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Card className="border-border bg-muted/30 shadow-none">
                                    <CardContent className="p-3.5 space-y-1">
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 font-normal">
                                            <FileCodeIcon className="h-3.5 w-3.5 text-primary" />
                                            Protocol Standard
                                        </span>
                                        <p className="text-xs text-foreground font-normal">ASTM E1394 / HL7 v2.x</p>
                                    </CardContent>
                                </Card>

                                <Card className="border-border bg-muted/30 shadow-none">
                                    <CardContent className="p-3.5 space-y-1">
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 font-normal">
                                            <LightningIcon className="h-3.5 w-3.5 text-primary" />
                                            Communication Mode
                                        </span>
                                        <p className="text-xs text-foreground font-normal">Bi-directional Query</p>
                                    </CardContent>
                                </Card>

                                <Card className="border-border bg-muted/30 shadow-none">
                                    <CardContent className="p-3.5 space-y-1">
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 font-normal">
                                            <SlidersIcon className="h-3.5 w-3.5 text-primary" />
                                            Frame Delimiters
                                        </span>
                                        <p className="font-mono text-xs text-foreground font-normal">&lt;STX&gt; ... &lt;ETX&gt; &lt;CR&gt;&lt;LF&gt;</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Raw Config JSON Container */}
                            <div className="space-y-1.5">
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wider block font-normal">
                                    Configuration Payload
                                </span>
                                <pre className="max-h-60 overflow-auto rounded-2xl bg-muted p-4 text-xs font-mono text-foreground leading-relaxed font-normal border border-border">
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