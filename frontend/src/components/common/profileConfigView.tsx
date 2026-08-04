
import type { Driver } from "@/types/api"
import { Badge } from "@/components/ui/badge"
import type { ParsedProfileConfig, TConfig } from "@/lib/profile-config"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlobeIcon, HardDriveIcon, SlidersIcon } from "@phosphor-icons/react"
import { useProfileConfig } from "@/hooks/use-profile-config"


export interface ProfileConfigProps {
    config?: TConfig
    driver?: Driver
    className?: string
}
export function ProfileConfigCard({
    config,
    driver,
    className,
    title = "SDK Connection & Interface Settings",
    description = "Runtime parameters and protocol framing specifications",
}: ProfileConfigProps & { title?: string; description?: string }) {
    return (
        <Card className={`border-border bg-card ${className}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                <div className="space-y-1">
                    <CardTitle className="text-base font-normal">{title}</CardTitle>
                    <CardDescription className="text-xs font-normal">{description}</CardDescription>
                </div>
                <ProfileInterfaceBadge config={config} driver={driver} />
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
                <ProfileConfigGrid config={config} driver={driver} columns={3} />

                {/* Raw Config Payload Dropdown / Inspector */}
                <details className="group rounded-2xl border border-border/60 bg-muted/20 text-xs">
                    <summary className="cursor-pointer font-normal p-3 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between">
                        <span>View Raw Config JSON</span>
                        <span className="text-[10px] font-mono group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="p-3 pt-0 border-t border-border/40">
                        <pre className="max-h-48 overflow-auto rounded-xl bg-muted p-3 font-mono text-[11px] text-foreground leading-relaxed">
                            {JSON.stringify(config, null, 2)}
                        </pre>
                    </div>
                </details>
            </CardContent>
        </Card>
    )
}




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
}: ProfileConfigProps) {
    const { interfaceType, interfaceLabel } = useProfileConfig(config, driver)
    const variant = interfaceType === "serial" ? "secondary" : "outline"

    return (
        <Badge variant={variant} className="gap-1 font-normal text-xs">
            <ProfileInterfaceIcon interfaceType={interfaceType} className="h-3 w-3" />
            {interfaceLabel}
        </Badge>
    )
}

/** Compact inline endpoint display (ideal for cards, tables, header summaries) */
export function ProfileEndpointBadge({
    config,
    driver,
    className = "",
}: ProfileConfigProps) {
    const { interfaceType, endpointDisplay } = useProfileConfig(config, driver)

    return (
        <span className={`inline-flex items-center gap-1 font-normal text-xs text-foreground truncate ${className}`}>
            <ProfileInterfaceIcon interfaceType={interfaceType} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-mono text-xs">{endpointDisplay}</span>
        </span>
    )
}

/** Dynamic grid displaying all configuration parameters formatted cleanly */
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
        <div className={`grid gap-3 ${gridColClass} ${className}`}>
            {fields.map((field) => {
                const isBoolean = typeof field.rawValue === "boolean"
                const isEnabled = field.rawValue === true

                return (
                    <div
                        key={field.key}
                        className="rounded-2xl border border-border/60 bg-muted/30 p-3 flex flex-col justify-between transition-colors hover:bg-muted/50"
                    >
                        <div className="space-y-1">
                            <span className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider block">
                                {field.label}
                            </span>

                            {isBoolean ? (
                                <Badge
                                    variant={isEnabled ? "secondary" : "outline"}
                                    className="text-xs font-normal mt-0.5"
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
                            <span className="text-[10px] text-muted-foreground font-normal block pt-1.5 line-clamp-2">
                                {field.hint}
                            </span>
                        ) : null}
                    </div>
                )
            })}
        </div>
    )
}
