
import type { Driver } from "@/types/api"
import { Badge } from "@/components/ui/badge"
import type { ParsedProfileConfig, TConfig } from "@/lib/profile-config"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlobeIcon, HardDriveIcon, SlidersIcon } from "@phosphor-icons/react"
import { useProfileConfig } from "@/hooks/use-profile-config"
import { cn } from "@/lib/utils"
import React from "react"


export interface ProfileConfigProps {
    config?: TConfig
    driver?: Driver
    className?: string
}
// export function ProfileConfigCard({
//     config,
//     driver,
//     className,
//     title = "SDK Connection & Interface Settings",
//     description = "Runtime parameters and protocol framing specifications",
// }: ProfileConfigProps & { title?: string; description?: string }) {
//     return (
//         <Card className={`border-border bg-card ${className}`}>
//             <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
//                 <div className="space-y-1">
//                     <CardTitle className="text-base font-normal">{title}</CardTitle>
//                     <CardDescription className="text-xs font-normal">{description}</CardDescription>
//                 </div>
//                 <ProfileInterfaceBadge config={config} driver={driver} />
//             </CardHeader>

//             <CardContent className="flex flex-col gap-5">
//                 <ProfileConfigGrid config={config} driver={driver} columns={3} />

//                 {/* Raw Config Payload Dropdown / Inspector */}
//                 <details className="group rounded-2xl border border-border/60 bg-muted/20 text-xs">
//                     <summary className="cursor-pointer font-normal p-3 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between">
//                         <span>View Raw Config JSON</span>
//                         <span className="text-[10px] font-mono group-open:rotate-180 transition-transform">▼</span>
//                     </summary>
//                     <div className="p-3 pt-0 border-t border-border/40">
//                         <pre className="max-h-48 overflow-auto rounded-xl bg-muted p-3 font-mono text-[11px] text-foreground leading-relaxed">
//                             {JSON.stringify(config, null, 2)}
//                         </pre>
//                     </div>
//                 </details>
//             </CardContent>
//         </Card>
//     )
// }




/** Icon matching the interface type */
export function ProfileInterfaceIcon({
    interfaceType,
    className = "h-3.5 w-3.5",
}: {
    interfaceType: ParsedProfileConfig["interfaceType"]
    className?: string
}) {
    if (interfaceType === "serial") {
        return <HardDriveIcon className={className} />
    }
    if (interfaceType === "tcp") {
        return <GlobeIcon className={className} />
    }
    return <SlidersIcon className={className} />
}

/** Badge indicating TCP vs Serial interface type */
export function ProfileInterfaceBadge({
    config,
    driver,
    className
}: ProfileConfigProps) {
    const { interfaceType, interfaceLabel } = useProfileConfig(config, driver)
    const variant = interfaceType === "serial" ? "secondary" : "outline"

    return (
        <Badge
            variant={variant}
            className={cn("gap-1 font-normal text-xs", className)}>
            <ProfileInterfaceIcon interfaceType={interfaceType} className="size-3" />
            {interfaceLabel}
        </Badge>
    )
}

/** Compact inline endpoint display (ideal for cards, tables, header summaries) */
/** Compact inline endpoint display (ideal for cards, tables, header summaries) */
export function ProfileEndpointBadge({
    config,
    driver,
    className = "",
}: ProfileConfigProps) {
    const { interfaceType, endpointDisplay } = useProfileConfig(config, driver);

    return (
        <span
            className={cn(
                "flex min-w-0 max-w-full items-center gap-1 text-xs font-normal text-foreground",
                className
            )}
        >
            <ProfileInterfaceIcon
                interfaceType={interfaceType}
                className="size-3.5 shrink-0 text-muted-foreground"
            />

            <span className="min-w-0 truncate font-mono text-xs">
                {endpointDisplay}
            </span>
        </span>
    );
}

/** Minimalist key-value summary for main profile cards (limits fields to prevent clutter) */
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

        return (filtered?.length > 0 ? filtered : fields)?.slice(0, maxFields)
    }, [fields, maxFields])

    if (summaryFields?.length === 0) {
        return null
    }

    return <div className={cn("grid grid-cols-2 gap-2", className)}>
        {summaryFields.map((field) => (
            <div
                key={field.key}
                className="rounded-xl border border-border/50 bg-muted/40 p-2 flex flex-col justify-between"
            >
                <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider truncate block">
                    {field.label}
                </span>
                <span className="font-mono text-xs text-foreground font-normal truncate block mt-0.5">
                    {field.formattedValue}
                </span>
            </div>
        ))}
    </div>

}

/** Dynamic grid displaying all configuration parameters formatted cleanly (for detail view) */
export function ProfileConfigGrid({
    config,
    driver,
    columns = 3,
    className = "",
}: ProfileConfigProps & { columns?: 2 | 3 | 4 }) {
    const { fields } = useProfileConfig(config, driver)

    if (fields.length === 0) {
        return (
            <div className="text-xs text-muted-foreground font-normal py-2">
                No connection parameters configured.
            </div>
        )
    }

    const gridColClass =
        columns === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : columns === 4
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"

    return (
        <div className={cn("grid gap-3", gridColClass, className)}>
            {fields.map((field) => {
                const isBoolean = typeof field.rawValue === "boolean"
                const isEnabled = field.rawValue === true

                return (
                    <div
                        key={field.key}
                        className="rounded-2xl border border-border/60 bg-muted/30 p-3.5 flex flex-col justify-between transition-colors hover:bg-muted/50"
                    >
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider block">
                                {field.label}
                            </span>

                            {isBoolean ? (
                                <Badge
                                    variant={isEnabled ? "secondary" : "outline"}
                                    className="text-xs font-normal w-fit mt-0.5"
                                >
                                    {field.formattedValue}
                                </Badge>
                            ) : (
                                <span className="font-normal text-xs text-foreground font-mono block break-all">
                                    {field.formattedValue}
                                </span>
                            )}
                        </div>

                        {field.hint ? (
                            <span className="text-[10px] text-muted-foreground font-normal block pt-2 line-clamp-2">
                                {field.hint}
                            </span>
                        ) : null}
                    </div>
                )
            })}
        </div>
    )
}

/** Comprehensive card container for full profile detail specification views */
export function ProfileConfigDetailCard({
    config,
    driver,
    title = "SDK Connection & Interface Settings",
    description = "Runtime parameters and protocol framing specifications for LIS driver",
    className,
}: ProfileConfigProps & { title?: string; description?: string }) {

    return <Card className={cn("border-border bg-card", className)}>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
            <div className="flex flex-col gap-1">
                <CardTitle className="text-base font-normal">{title}</CardTitle>
                <CardDescription className="text-xs font-normal">{description}</CardDescription>
            </div>
            <ProfileInterfaceBadge config={config} driver={driver} />
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <span className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider block">
                    Configured Parameters
                </span>
                <ProfileConfigGrid config={config} driver={driver} columns={3} />
            </div>

            {/* Raw Config Payload Inspector */}
            <details className="group rounded-2xl border border-border/60 bg-muted/20 text-xs">
                <summary className="cursor-pointer font-normal p-3 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between">
                    <span>View Raw Config JSON Payload</span>
                    <span className="text-[10px] font-mono group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-3 pt-0 border-t border-border/40">
                    <pre className="max-h-56 overflow-auto rounded-xl bg-muted p-3.5 font-mono text-[11px] text-foreground leading-relaxed">
                        {JSON.stringify(config, null, 2)}
                    </pre>
                </div>
            </details>
        </CardContent>
    </Card>
}