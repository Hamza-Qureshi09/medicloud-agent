import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

interface StatCardProps {
    title: string
    value: string | number
    detail: string
    icon: React.ComponentType
}

export function StatCard({ title, value, detail, icon: Icon }: StatCardProps) {
    return (
        <Card size="sm">
            <CardHeader>
                <CardDescription>{title}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
                <CardAction>
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted text-primary">
                        <Icon />
                    </span>
                </CardAction>
            </CardHeader>
            <CardContent>
                <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent>
        </Card>
    )
}
