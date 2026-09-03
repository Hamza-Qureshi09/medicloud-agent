import { useState, type ReactNode } from "react"
import { WarningIcon } from "@phosphor-icons/react"
import { useAsyncAction } from "@/hooks/use-async-action"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"


export function ConfirmAction({
    trigger,
    title,
    description,
    actionLabel,
    onConfirm,
}: {
    trigger: ReactNode
    title: string
    description: string
    actionLabel: string
    onConfirm: () => Promise<void>
}) {
    const [open, setOpen] = useState(false)
    const action = useAsyncAction()

    async function confirm() {
        await action.execute(async () => {
            await onConfirm()
            setOpen(false)
        }).catch(() => undefined)
    }


    return (
        <AlertDialog
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen)
                if (nextOpen) action.reset()
            }}
        >
            <AlertDialogTrigger render={trigger as React.ReactElement} />
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogMedia>
                        <WarningIcon className="text-destructive"/>
                    </AlertDialogMedia>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                    {action.error ? (
                        <p className="text-sm text-destructive">{action.error}</p>
                    ) : null}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={action.pending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant={"destructive"} onClick={confirm} disabled={action.pending}>
                        {action.pending ? <Spinner data-icon="inline-start" /> : null}
                        {actionLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )

}