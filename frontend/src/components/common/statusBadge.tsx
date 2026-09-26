import { Badge } from "@/components/ui/badge"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
    AgentOrderSource,
    AgentOrderStatus,
    OrderStatus,
    ResultDeliveryStatus,
} from "@/types/api"

/**
 * Three different status vocabularies meet on this dashboard, and they are easy
 * to confuse because several of them reuse the same words:
 *
 *   - MACHINE order status  - owned by the machine SDK. Where the sample is on
 *     the analyzer.
 *   - AGENT order status    - owned by this agent. Where a MediCloud dispatch
 *     is in the sync handshake, or how far an order created here has got.
 *   - DELIVERY status       - owned by this agent's outbox. Whether a finished
 *     result actually reached MediCloud.
 *
 * "Completed" means something different in each. Rather than expect an operator
 * to hold that distinction in their head, every badge explains itself on hover.
 */

type StatusMeta = { label: string; hint: string }

const machineStatusMeta: Record<OrderStatus, StatusMeta> = {
    pending: {
        label: "Pending",
        hint: "Staged on the analyzer, waiting for it to pick the sample up. Set by the machine SDK.",
    },
    testing: {
        label: "Testing",
        hint: "The analyzer is running this sample now. Set by the machine SDK.",
    },
    completed: {
        label: "Completed",
        hint: "The analyzer returned a result. This says nothing about whether MediCloud received it - see the delivery status on the Results page.",
    },
    failed: {
        label: "Failed",
        hint: "The analyzer rejected the order or errored while running it. Set by the machine SDK.",
    },
}

const agentOrderStatusMeta: Record<AgentOrderStatus, StatusMeta> = {
    received: {
        label: "Received",
        hint: "Pulled from MediCloud and stored locally, but not yet confirmed back. It is not on an analyzer yet.",
    },
    acknowledged: {
        label: "Acknowledged",
        hint: "Receipt confirmed to MediCloud. Next step is handing it to the machine SDK.",
    },
    processing: {
        label: "Processing",
        hint: "Submitted to the local machine SDK. Track the analyzer itself under Machine Orders.",
    },
    leased_to_slave: {
        label: "Leased to Slave",
        hint: "Forwarded to a slave agent that owns the target analyzer, awaiting its confirmation.",
    },
    acknowledged_by_slave: {
        label: "Ack by Slave",
        hint: "The slave agent confirmed receipt and is now running the order on its own analyzer.",
    },
    completed: {
        label: "Completed",
        hint: "The result was delivered to MediCloud successfully. This is the only status that means the round trip finished.",
    },
    failed: {
        label: "Failed",
        hint: "Processing or delivery failed permanently. The dispatch can be re-queued from MediCloud.",
    },
}

const deliveryStatusMeta: Record<ResultDeliveryStatus, StatusMeta> = {
    0: {
        label: "Pending",
        hint: "Queued in this agent's outbox, not yet sent to MediCloud.",
    },
    1: {
        label: "Delivered",
        hint: "MediCloud accepted this result batch. Retries stop here.",
    },
    2: {
        label: "Retrying",
        hint: "Delivery failed but the cause looks temporary, so it is being retried automatically.",
    },
    3: {
        label: "Failed",
        hint: "Gave up after the retry limit, or MediCloud rejected it permanently. Needs a person to look.",
    },
}

function ExplainedBadge({
    meta,
    variant,
    fallback,
}: {
    meta: StatusMeta | undefined
    variant: "default" | "secondary" | "destructive" | "outline"
    fallback: string
}) {
    if (!meta) return <Badge variant="outline">{fallback}</Badge>

    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Badge variant={variant} className="cursor-help">
                        {meta.label}
                    </Badge>
                }
            />
            <TooltipContent className="max-w-64 text-pretty">
                {meta.hint}
            </TooltipContent>
        </Tooltip>
    )
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

    return (
        <ExplainedBadge
            meta={machineStatusMeta[status]}
            variant={variant}
            fallback={status}
        />
    )
}

export function AgentOrderStatusBadge({ status }: { status: AgentOrderStatus }) {
    const variant =
        status === "failed"
            ? "destructive"
            : status === "completed"
                ? "default"
                : status === "processing" || status === "leased_to_slave"
                    ? "secondary"
                    : "outline"

    return (
        <ExplainedBadge
            meta={agentOrderStatusMeta[status]}
            variant={variant}
            fallback={status}
        />
    )
}

const orderSourceLabels: Record<AgentOrderSource, string> = {
    local: "Owned",
    upstream: "Upstream",
}

export function OrderSourceBadge({ source }: { source: AgentOrderSource }) {
    return (
        <Badge variant={source === "local" ? "secondary" : "outline"}>
            {orderSourceLabels[source] ?? source}
        </Badge>
    )
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

    return (
        <ExplainedBadge
            meta={deliveryStatusMeta[status]}
            variant={variant}
            fallback={`Status ${status}`}
        />
    )
}

export function ConnectionBadge({
    connected,
    running,
}: {
    connected: boolean
    running: boolean
}) {
    // "Running" and "connected" are separate facts and both matter: a started
    // driver stages orders with nothing attached, which is what lets work wait
    // for an analyzer to be switched on.
    const meta: StatusMeta = connected
        ? {
            label: "Connected",
            hint: "Driver started and the analyzer is on the other end. Orders can run and results can come back.",
        }
        : running
            ? {
                label: "Listening",
                hint: "Driver started but no analyzer is connected yet. Orders still queue and will run once it comes online.",
            }
            : {
                label: "Stopped",
                hint: "Driver is not running. Orders sent to this profile are rejected until it is started.",
            }

    return (
        <ExplainedBadge
            meta={meta}
            variant={connected ? "default" : running ? "secondary" : "outline"}
            fallback={meta.label}
        />
    )
}
