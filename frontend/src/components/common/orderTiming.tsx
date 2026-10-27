import type { MachineOrder } from "@/types/api";

export function OrderTiming({ order }: { order: MachineOrder }) {
    const duration = order.estimatedDurationMinutes;
    if (duration === undefined || duration === null || duration <= 0) {
        return <span className="text-xs text-muted-foreground">Learning timing</span>;
    }
    const finish = order.estimatedCompletionAt ? new Date(order.estimatedCompletionAt) : undefined;
    const active = order.status === "testing";
    return (
        <div className="grid gap-1 text-xs">
            <span>
                Estimated run: {duration < 1
                    ? `${Math.max(1, Math.round(duration * 60))} sec`
                    : `${Math.round(duration * 10) / 10} min`}
            </span>
            {active && finish && Number.isFinite(finish.getTime())
                ? (
                    <span className="text-muted-foreground">
                        {finish.getTime() < Date.now()
                            ? "Past estimate"
                            : `Expected finish: ${finish.toLocaleTimeString()}`}
                    </span>
                )
                : order.status === "pending"
                ? <span className="text-muted-foreground">Starts when the analyzer accepts it</span>
                : null}
        </div>
    );
}
