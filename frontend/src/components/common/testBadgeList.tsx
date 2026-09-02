import { Badge } from "@/components/ui/badge"
import { FlaskIcon } from "@phosphor-icons/react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface TestBadgeListProps {
    tests: string[]
    maxVisible?: number
    className?: string
}

export function TestBadgeList({
    tests,
    maxVisible = 2,
    className = "",
}: TestBadgeListProps) {
    if (!tests || tests.length === 0) {
        return <span className="text-muted-foreground font-normal text-xs">—</span>
    }

    const visible = tests.slice(0, maxVisible)
    const remaining = tests.slice(maxVisible)
    const remainingCount = remaining.length

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
            {visible.map((test) => (
                <Badge
                    key={test}
                    variant="secondary"
                    className="gap-1 font-normal h-6 text-xs px-2 rounded-md"
                >
                    <FlaskIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="max-w-28 truncate">{test}</span>
                </Badge>
            ))}

            {remainingCount > 0 && (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 font-normal h-6 text-xs px-2 rounded-md border border-border bg-background hover:bg-muted/80 text-foreground transition-colors cursor-pointer outline-none"
                            />
                        }
                    >
                        <span>+{remainingCount} more</span>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="start" className="w-56 p-2">
                        <div className="text-xs font-normal text-muted-foreground px-2 py-1 flex items-center justify-between">
                            <span>All ordered tests</span>
                            <Badge variant="secondary" className="text-[10px] font-normal h-4 px-1.5">
                                {tests.length} total
                            </Badge>
                        </div>
                        <DropdownMenuSeparator className="my-1" />
                        <ScrollArea className="max-h-48 overflow-y-auto">
                            <div className="flex flex-col gap-1 p-0.5">
                                {tests.map((test, index) => (
                                    <DropdownMenuItem
                                        key={test + index}
                                        className="font-normal text-xs gap-2 py-1.5 cursor-default focus:bg-muted"
                                    >
                                        <FlaskIcon className="size-3.5 text-primary shrink-0" />
                                        <span className="truncate flex-1">{test}</span>
                                    </DropdownMenuItem>
                                ))}
                            </div>
                        </ScrollArea>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
}
