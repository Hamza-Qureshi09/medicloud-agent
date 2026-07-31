import React, { useState } from "react"
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
import { 
    ArrowLeftIcon, 
    CpuIcon, 
    GlobeIcon, 
    PlayIcon, 
    StopIcon, 
    TrashIcon,
    ClockIcon,
    CheckCircleIcon,
    RadioIcon,
    PlugsConnectedIcon,
    HardDriveIcon,
    CopyIcon,
    CheckIcon,
    ActivityIcon,
    BrowsersIcon,
    ShieldCheckIcon,
    SquaresFourIcon
} from "@phosphor-icons/react"

export function ProfileDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const machineId = Number(id)

    const [copied, setCopied] = useState(false)
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

    // Advanced Dynamic Config Parsing (TCP vs Serial RS232 detection)
    const configObj = (profile.config && typeof profile.config === 'object') ? profile.config as Record<string, unknown> : {}
    const isSerial = 'comPort' in configObj || 'baudRate' in configObj || 'path' in configObj
    
    const host = configObj.host ? String(configObj.host) : "0.0.0.0"
    const port = configObj.port ? String(configObj.port) : "7001"
    const comPort = configObj.comPort ? String(configObj.comPort) : (configObj.path ? String(configObj.path) : "COM1")
    const baudRate = configObj.baudRate ? String(configObj.baudRate) : "9600"

    const isRunning = machine?.running ?? profile.enabled

    async function handleLifecycleAction(action: () => Promise<unknown>) {
        await profileAction.execute(async () => {
            await action()
            await Promise.all([healthMutate(), profileMutate()])
        }).catch(() => undefined)
    }

    const handleCopyConfig = () => {
        navigator.clipboard.writeText(JSON.stringify(profile.config, null, 2))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-10">
            
            {/* Top Navigation & Executive Actions */}
            <div className="flex flex-col gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-xl transition-all -ml-2"
                    onClick={() => navigate("/dashboard/profiles")}
                >
                    <ArrowLeftIcon className="h-4 w-4" />
                    <span className="text-xs font-semibold">Back to Analyzer Profiles</span>
                </Button>

                <PageSection
                    eyebrow={`PROFILE SPECIFICATION • #${profile.id}`}
                    title={profile.name || `Analyzer Profile ${profile.id}`}
                    description="Real-time telemetry, interface drivers, hardware socket specs, and system payload validation."
                    actions={
                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Action Control Group */}
                            {isRunning ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 rounded-xl border-amber-500/30 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/30 shadow-sm"
                                    onClick={() => handleLifecycleAction(() => api.profiles.stop(profile.id))}
                                >
                                    <StopIcon weight="fill" className="h-4 w-4" />
                                    <span>Stop Analyzer</span>
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20"
                                    onClick={() => handleLifecycleAction(() => api.profiles.start(profile.id))}
                                >
                                    <PlayIcon weight="fill" className="h-4 w-4" />
                                    <span>Start Analyzer</span>
                                </Button>
                            )}

                            <ConfirmAction
                                trigger={
                                    <Button variant="destructive" size="sm" className="gap-2 rounded-xl shadow-sm">
                                        <TrashIcon className="h-4 w-4" />
                                        <span>Delete Profile</span>
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
                <Alert variant="destructive" className="rounded-2xl border-destructive/50 bg-destructive/5">
                    <AlertTitle className="font-semibold">Execution Exception</AlertTitle>
                    <AlertDescription>{profileAction.error}</AlertDescription>
                </Alert>
            )}

            {/* Dribbble Level 3-Column Responsive Grid */}
            <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">

                {/* Card 1: Machine Identity & Hardware Registry */}
                <Card className="rounded-3xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden">
                    <div>
                        <CardHeader className="border-b border-border/40 pb-4 bg-muted/20">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                    <HardDriveIcon className="h-4 w-4" />
                                    Hardware Specs
                                </span>
                                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-muted border border-border/50 text-muted-foreground">
                                    #{profile.id}
                                </span>
                            </div>
                            <CardTitle className="text-base font-bold pt-1">Analyzer Identity</CardTitle>
                            <CardDescription className="text-xs">Mapped driver signature & brand specs</CardDescription>
                        </CardHeader>

                        <CardContent className="pt-5 flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded-2xl bg-muted/40 border border-border/30 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Brand / Make</span>
                                    <p className="font-bold text-foreground truncate">{matchedDriver?.brand || "SNIBE"}</p>
                                </div>

                                <div className="p-3 rounded-2xl bg-muted/40 border border-border/30 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Driver Signature</span>
                                    <p className="font-mono font-semibold text-foreground truncate flex items-center gap-1">
                                        <CpuIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                                        {profile.driverId}
                                    </p>
                                </div>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground font-medium">Last Modified Date:</span>
                                    <span className="font-medium text-foreground font-mono text-[11px]">
                                        {new Date(profile.updatedAt || profile.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                                    <span className="text-muted-foreground font-medium">Created Timestamp:</span>
                                    <span className="font-medium text-foreground font-mono text-[11px]">
                                        {new Date(profile.createdAt).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </div>

                    {/* Operational Banner */}
                    <div className="p-4 m-4 mt-0 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                        <CheckCircleIcon weight="fill" className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 text-xs">
                            <p className="font-bold text-emerald-950 dark:text-emerald-300">LIS Driver Active</p>
                            <p className="text-emerald-800/80 dark:text-emerald-400/90 text-[11px] leading-relaxed">
                                Driver parsed and ready for ASTM/HL7 incoming data frames.
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Card 2: Live Connection & Interface Telemetry (Relocated Status Badge here) */}
                <Card className="rounded-3xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden">
                    <div>
                        <CardHeader className="border-b border-border/40 pb-4 bg-muted/20">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                    <ActivityIcon className="h-4 w-4" />
                                    Telemetry & Link
                                </span>

                                {/* NEW: Dynamic relocated Status Badge */}
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide border ${
                                        isRunning 
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" 
                                            : "bg-amber-500/10 border-amber-500/30 text-amber-600"
                                    }`}>
                                        <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
                                        {isRunning ? "Running" : "Stopped"}
                                    </span>
                                </div>
                            </div>
                            <CardTitle className="text-base font-bold pt-1">Connection & Socket Interface</CardTitle>
                            <CardDescription className="text-xs">Physical serial or TCP/IP interface states</CardDescription>
                        </CardHeader>

                        <CardContent className="pt-5 flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded-2xl bg-muted/40 border border-border/30 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Interface Mode</span>
                                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                                        {isSerial ? <HardDriveIcon className="h-4 w-4 text-amber-500" /> : <GlobeIcon className="h-4 w-4 text-blue-500" />}
                                        <span>{isSerial ? "Serial RS-232" : "TCP/IP Network"}</span>
                                    </div>
                                </div>

                                <div className="p-3 rounded-2xl bg-muted/40 border border-border/30 space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Endpoint</span>
                                    <p className="font-mono font-bold text-foreground truncate">
                                        {isSerial ? `${comPort}:${baudRate}` : `${host}:${port}`}
                                    </p>
                                </div>
                            </div>

                            {/* Telemetry Metrics */}
                            <div className="space-y-2">
                                <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground font-medium flex items-center gap-2">
                                        <RadioIcon className={`h-4 w-4 ${isRunning ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
                                        Socket Listener
                                    </span>
                                    <span className="font-bold text-foreground">{isRunning ? "Listening" : "Offline"}</span>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground font-medium flex items-center gap-2">
                                        <PlugsConnectedIcon className={`h-4 w-4 ${machine?.connected ? "text-emerald-500" : "text-muted-foreground"}`} />
                                        Machine Link Status
                                    </span>
                                    <ConnectionBadge
                                        connected={machine?.connected ?? false}
                                        running={isRunning}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </div>

                    <div className="p-4 m-4 mt-0 rounded-2xl bg-muted/40 border border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-medium">
                            <ShieldCheckIcon className="h-4 w-4 text-primary" />
                            Security Protocol
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-foreground">RAW / Direct Stream</span>
                    </div>
                </Card>

                {/* Card 3: Syntax Highlighted Driver Config Payload */}
                <Card className="rounded-3xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden">
                    <CardHeader className="border-b border-border/40 pb-4 bg-muted/20">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                <BrowsersIcon className="h-4 w-4" />
                                Runtime Payload
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground rounded-lg"
                                onClick={handleCopyConfig}
                            >
                                {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> : <CopyIcon className="h-3.5 w-3.5" />}
                                <span>{copied ? "Copied" : "Copy JSON"}</span>
                            </Button>
                        </div>
                        <CardTitle className="text-base font-bold pt-1">Driver Settings JSON</CardTitle>
                        <CardDescription className="text-xs">Transmitted runtime parameters</CardDescription>
                    </CardHeader>

                    <CardContent className="pt-5 flex flex-col gap-3">
                        <div className="relative group">
                            <pre className="max-h-[220px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-[11px] text-slate-100 font-mono leading-relaxed shadow-inner">
                                {JSON.stringify(profile.config, null, 2)}
                            </pre>
                        </div>

                        <div className="p-3 rounded-2xl bg-muted/30 border border-border/40 text-[11px] text-muted-foreground leading-normal flex items-start gap-2">
                            <SquaresFourIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <span>This JSON payload is validated by the SDK before establishing TCP socket handshake.</span>
                        </div>
                    </CardContent>

                    <div className="p-4 m-4 mt-0 rounded-2xl bg-muted/20 border border-border/30 text-center">
                        <span className="text-[11px] font-medium text-muted-foreground">
                            Status: <span className="text-foreground font-semibold">Valid Schema</span>
                        </span>
                    </div>
                </Card>

            </div>
        </div>
    )
}