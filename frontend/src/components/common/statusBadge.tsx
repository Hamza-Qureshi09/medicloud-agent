import { Badge } from "@/components/ui/badge"
import type { OrderStatus } from "@/types/api"

const labels: Record<OrderStatus, string> = {
    pending: "Pending",
    testing: "Testing",
    completed: "Completed",
    failed: "Failed",
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
    const variant =
        status === "failed"
            ? "destructive"
            : status === "completed"
                ? "default"
                : status === "testing"
                    ? "secondary"
                    : "outline"

    return <Badge variant={variant}>{labels[status]}</Badge>
}

export function ConnectionBadge({
    connected,
    running,
}: {
    connected: boolean
    running: boolean
}) {
    return (
        <Badge variant={connected ? "default" : running ? "secondary" : "outline"}>
            {connected ? "Connected" : running ? "Listening" : "Stopped"}
        </Badge>
    )
}

