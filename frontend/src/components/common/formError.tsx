import React from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { WarningCircleIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"

interface FormErrorListProps {
    title?: string
    errorMessage?: string | null
}

/**
 * Bulleted Form Error Component for Dialog Modals
 * Splits tokenized or multi-line error strings into a clean list.
 */
export function FormErrorList({ 
    title = "Action Failed", 
    errorMessage 
}: FormErrorListProps) {
    const formattedErrors = React.useMemo(() => {
        if (!errorMessage) return []
        return errorMessage
            .split(/✖|×|\n/)
            .map((err) => err.trim())
            .filter((err) => err.length > 0)
    }, [errorMessage])

    if (formattedErrors.length === 0) return null

    return (
        <Alert variant="destructive" className="mt-3 rounded-2xl border border-destructive/30">
            <WarningCircleIcon className="h-4 w-4 shrink-0" />
            <div className="flex flex-col gap-1 w-full">
                <AlertTitle className="font-normal text-xs">{title}</AlertTitle>
                <AlertDescription className="text-xs font-normal">
                    <ul className="list-disc pl-4 space-y-1">
                        {formattedErrors.map((errItem, idx) => (
                            <li key={idx} className="font-normal text-[11px] leading-relaxed">
                                {errItem}
                            </li>
                        ))}
                    </ul>
                </AlertDescription>
            </div>
        </Alert>
    )
}

interface ToastNotificationProps {
    title?: string
    message: string | null
    onClose: () => void
}

/**
 * Modern Interactive Toast Popup Component
 * Displayed for page-level action errors.
 */
export function ToastNotification({ 
    title = "Action Failed", 
    message, 
    onClose 
}: ToastNotificationProps) {
    if (!message) return null

    const formattedList = React.useMemo(() => {
        return message
            .split(/✖|×|\n/)
            .map((err) => err.trim())
            .filter((err) => err.length > 0)
    }, [message])

    return (
        <div className="fixed bottom-5 right-5 z-50 flex items-start gap-3 rounded-3xl border border-border bg-card p-4 text-foreground shadow-xl transition-all animate-in fade-in slide-in-from-bottom-5 max-w-md w-full">
            <WarningCircleIcon className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <div className="flex-1 space-y-1 text-xs font-normal">
                <p className="font-normal text-foreground text-xs">{title}</p>
                <div className="max-h-32 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {formattedList.length > 1 ? (
                        <ul className="list-disc pl-4 space-y-1 text-[11px] text-muted-foreground font-normal">
                            {formattedList.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted-foreground text-[11px] leading-relaxed font-normal">
                            {message}
                        </p>
                    )}
                </div>
            </div>
            <Button
                variant="ghost"
                size="xs"
                className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0 rounded-lg p-0 cursor-pointer"
                onClick={onClose}
            >
                <XIcon className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}