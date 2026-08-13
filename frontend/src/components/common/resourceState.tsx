import {
    ArrowClockwiseIcon,
    CloudSlashIcon,
    DatabaseIcon,
    WarningCircleIcon,
} from "@phosphor-icons/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"


export function PageLoading({ rows = 5 }: { rows?: number }) {
    return (
        <div className="flex flex-col gap-4" aria-label="Loading data">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton className="h-28 rounded-4xl" key={index} />
                ))}
            </div>
            <Skeleton className="h-72 rounded-4xl" />
            <div className="flex flex-col gap-2">
                {Array.from({ length: rows }).map((_, index) => (
                    <Skeleton className="h-12 rounded-xl" key={index} />
                ))}
            </div>
        </div>
    )
}

export function InlineLoading({ label = "Working" }: { label?: string }) {
    return (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Spinner />
            {label}
        </span>
    )
}

export function ResourceError({
    error,
    onRetry,
}: {
    error: unknown
    onRetry?: () => void
}) {
    const message = error instanceof Error ? error.message : "The request failed."
    return (
        <Alert variant="destructive">
            <WarningCircleIcon />
            <div className="flex flex-row justify-between items-center">
                <div className={""}>
                    <AlertTitle>Data could not be loaded</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                </div>
                {onRetry ? (
                    <Button variant="outline" size="sm" onClick={onRetry} >
                        <ArrowClockwiseIcon data-icon="inline-start" />
                        Try again
                    </Button>
                ) : null}
            </div>
        </Alert>
    )
}

export function ResourceEmpty({
    title,
    description,
    action,
    disconnected = false,
}: {
    title: string
    description: string
    action?: React.ReactNode
    disconnected?: boolean
}) {
    const Icon = disconnected ? CloudSlashIcon : DatabaseIcon
    return (
        <Empty>
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Icon />
                </EmptyMedia>
                <EmptyTitle>{title}</EmptyTitle>
                <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
            {action ? <EmptyContent>{action}</EmptyContent> : null}
        </Empty>
    )
}

export function RefreshButton({
    isLoading,
    onRefresh,
}: {
    isLoading?: boolean
    onRefresh: () => void
}) {
    return (
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? (
                <Spinner data-icon="inline-start" />
            ) : (
                <ArrowClockwiseIcon data-icon="inline-start" />
            )}
            Refresh
        </Button>
    )
}