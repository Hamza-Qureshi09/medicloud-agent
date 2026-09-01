import { Badge } from "@/components/ui/badge"
import type { ExternalOrderStatus, OrderStatus, ResultDeliveryStatus } from "@/types/api"

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

const externalLabels: Record<ExternalOrderStatus, string> = {
    received: "Received",
    acknowledged: "Acknowledged",
    processing: "Processing",
    leased_to_slave: "Leased to Slave",
    acknowledged_by_slave: "Ack by Slave",
    completed: "Completed",
    failed: "Failed",
}

export function ExternalOrderStatusBadge({ status }: { status: ExternalOrderStatus }) {
    const variant =
        status === "failed"
            ? "destructive"
            : status === "completed"
                ? "default"
                : status === "processing" || status === "leased_to_slave"
                    ? "secondary"
                    : "outline"

    return <Badge variant={variant}>{externalLabels[status] ?? status}</Badge>
}

const deliveryStatusLabels: Record<ResultDeliveryStatus, string> = {
    0: "Pending",
    1: "Delivered",
    2: "Retrying",
    3: "Failed",
}

export function ResultDeliveryStatusBadge({ status }: { status: ResultDeliveryStatus }) {
    const variant =
        status === 3
            ? "destructive"
            : status === 1
                ? "default"
                : status === 2
                    ? "secondary"
                    : "outline"

    return <Badge variant={variant}>{deliveryStatusLabels[status] ?? `Status ${status}`}</Badge>
}

