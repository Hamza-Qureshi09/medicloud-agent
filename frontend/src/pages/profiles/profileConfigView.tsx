import React from "react"
import { cn } from "@/lib/utils"
import type { Driver } from "@/types/api"
import { Badge } from "@/components/ui/badge"
import type { ParsedProfileConfig, TConfig } from "@/lib/profile-config"
import { Card, CardContent } from "@/components/ui/card"
import {
    GlobeIcon,
    HardDriveIcon,
    SlidersIcon,
    CpuIcon,
    BroadcastIcon,
    BinaryIcon,
    HashIcon,
    LightningIcon,
    PlugsIcon
} from "@phosphor-icons/react"
import { useProfileConfig } from "@/hooks/use-profile-config"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"


export interface ProfileConfigProps {
    config?: TConfig
    driver?: Driver
    className?: string
}

/** Icon matching the interface type */
export function ProfileInterfaceIcon({
    interfaceType,
    className = "size-3.5",
}: {
    interfaceType: ParsedProfileConfig["interfaceType"]
    className?: string
}) {
    if (interfaceType === "serial") return <HardDriveIcon className={className} />
    if (interfaceType === "tcp") return <GlobeIcon className={className} />
    return <SlidersIcon className={className} />
}

/** Badge indicating TCP / Serial / Custom interface type */
export function ProfileInterfaceBadge({
    config,
    driver,
    className
}: ProfileConfigProps) {
    const { interfaceType, interfaceLabel } = useProfileConfig(config, driver)
    const variant = "secondary"

    return (
        <Badge variant={variant} className={cn("gap-1 font-normal text-xs shrink-0", className)}>
            <ProfileInterfaceIcon interfaceType={interfaceType} className="size-3" />
            {interfaceLabel}
        </Badge>
    )
}

/** Compact monospace endpoint string with leading interface icon */
export function ProfileEndpointBadge({ config, driver, className = "" }: ProfileConfigProps) {
    const { interfaceType, endpointDisplay } = useProfileConfig(config, driver)

    return (
        <span className={cn("flex min-w-0 max-w-full items-center gap-1 text-xs font-normal text-foreground", className)}>
            <ProfileInterfaceIcon interfaceType={interfaceType} className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-mono text-xs">{endpointDisplay}</span>
        </span>
    )
}

/** Minimalist summary for list/card views */
export function ProfileConfigMinimal({
    config,
    driver,
    maxFields = 2,
    className,
}: ProfileConfigProps & { maxFields?: number }) {
    const { fields } = useProfileConfig(config, driver)

    const summaryFields = React.useMemo(() => {
        if (!fields.length) return []
        const primaryKeys = new Set(["host", "port", "ip", "serialPort", "comPort", "portName", "path"])
        const filtered = fields.filter((f) => !primaryKeys.has(f.key))
        return (filtered.length > 0 ? filtered : fields).slice(0, maxFields)
    }, [fields, maxFields])

    if (summaryFields.length === 0) return null

    return (
        <div className={cn("grid grid-cols-2 gap-2", className)}>
            {summaryFields.map((field) => (
                <div key={field.key} className="rounded-xl border border-border/50 bg-muted/40 p-2 flex flex-col justify-between">
                    <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider truncate block">
                        {field.label}
                    </span>
                    <span className="font-mono text-xs text-foreground font-normal truncate block mt-0.5">
                        {field.formattedValue}
                    </span>
                </div>
            ))}
        </div>
    )
}

// Helper to provide rich descriptions and icons for parameter cards
function getFieldMeta(key: string, label: string) {
    const k = key.toLowerCase()
    if (k.includes("serial") || k.includes("com") || k.includes("path")) {
        return {
            icon: <HardDriveIcon className="size-4 text-primary shrink-0" />,
            description: "System port (e.g. COM1 on Windows, /dev/ttyS0 on Linux)."
        }
    }
    if (k.includes("baud")) {
        return {
            icon: <BroadcastIcon className="size-4 text-primary shrink-0" />,
            description: "Data transmission rate in bits per second (bps)."
        }
    }
    if (k.includes("databits") || k.includes("data")) {
        return {
            icon: <BinaryIcon className="size-4 text-primary shrink-0" />,
            description: "Character data frame bit length (standard: 8 bits)."
        }
    }
    if (k.includes("stopbits") || k.includes("stop")) {
        return {
            icon: <HashIcon className="size-4 text-primary shrink-0" />,
            description: "Transmission stop frame bit count (standard: 1 bit)."
        }
    }
    if (k.includes("parity")) {
        return {
            icon: <LightningIcon className="size-4 text-primary shrink-0" />,
            description: "Error checking parity scheme (None, Even, Odd)."
        }
    }
    if (k.includes("host") || k.includes("ip")) {
        return {
            icon: <GlobeIcon className="size-4 text-primary shrink-0" />,
            description: "Remote analyzer network address or IP."
        }
    }
    if (k.includes("port")) {
        return {
            icon: <PlugsIcon className="size-4 text-primary shrink-0" />,
            description: "Listening TCP socket port number."
        }
    }

    return {
        icon: <CpuIcon className="size-4 text-primary shrink-0" />,
        description: `Configured ${label.toLowerCase()} parameter value.`
    }
}

/** Dynamic grid displaying configuration parameters as rich metric cards */
export function ProfileConfigGrid({
    config,
    driver,
    className = "",
    limit = 4,
}: ProfileConfigProps & { limit?: number }) {
    const { fields } = useProfileConfig(config, driver)

    const displayFields = React.useMemo(() => {
        return limit ? fields.slice(0, limit) : fields
    }, [fields, limit])

    if (displayFields.length === 0) {
        return (
            <p className="text-xs text-muted-foreground font-normal py-2">
                No connection parameters configured.
            </p>
        )
    }

    return (
        <div className={cn("flex flex-wrap gap-3", className)}>
            {displayFields.map((field) => {
                const meta = getFieldMeta(field.key, field.label)
                const descriptionText = field.hint || meta.description

                return (
                    <Card key={field.key} className="flex-1 min-w-50 rounded-3xl p-4 bg-card border-border flex flex-col justify-between gap-2 shadow-none hover:border-border/80 transition-colors">
                        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                                {field.label}
                            </span>
                            {meta.icon}
                        </div>

                        <div className="flex flex-col gap-1 my-0.5">
                            {typeof field.rawValue === "boolean" ? (
                                <Badge
                                    variant={field.formattedValue === "Enabled" ? "secondary" : "outline"}
                                    className="text-xs font-normal w-fit"
                                >
                                    {field.formattedValue}
                                </Badge>
                            ) : (
                                <span className="font-mono text-sm font-normal text-foreground tracking-tight truncate">
                                    {field.formattedValue || "-"}
                                </span>
                            )}
                            <p className="text-[11px] text-muted-foreground font-normal leading-relaxed line-clamp-2">
                                {descriptionText}
                            </p>
                        </div>
                    </Card>
                )
            })}
        </div>
    )
}

/**
 * Modern Profile Configuration View for Profile Details (Right Side).
 * Directly displays rich dashboard-style metric cards for primary parameters, followed by a sleek collapsible JSON config payload card.
 */
export function ProfileConfigDetailCard({
    config,
    driver,
    className,
}: ProfileConfigProps) {
    return (
        <div className={cn("flex flex-col gap-3 lg:col-span-2", className)}>
            {/* Top parameter cards - flex-wrap evenly fills available width */}
            <ProfileConfigGrid config={config} driver={driver} limit={4} />

            {/* Tight Accordion card for Full JSON Config */}
            <Card className="rounded-2xl border-border bg-card overflow-hidden shadow-none">
                <CardContent className="p-0 px-4">
                    <Accordion defaultValue={["raw-json"]}>
                        <AccordionItem value="raw-json" className="border-none">
                            <AccordionTrigger className="text-xs font-normal text-muted-foreground hover:no-underline py-2.5">
                                View full JSON payload & configuration
                            </AccordionTrigger>
                            <AccordionContent className="pb-3">
                                <pre className="max-h-80 overflow-auto rounded-xl bg-muted/50 p-3.5 font-mono text-[11px] text-foreground leading-relaxed border border-border/40">
                                    {JSON.stringify(config, null, 2)}
                                </pre>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </CardContent>
            </Card>
        </div>
    )
}