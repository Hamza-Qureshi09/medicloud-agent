import type { ReactNode } from "react"

export function PageSection({
    eyebrow,
    title,
    description,
    actions,
}: {
    eyebrow?: string
    title: string
    description: string
    actions?: ReactNode
}) {
    return (
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex max-w-2xl flex-col gap-1">
                {eyebrow ? (
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                        {eyebrow}
                    </p>
                ) : null}
                <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
                    {title}
                </h2>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
        </div>
    )
}

