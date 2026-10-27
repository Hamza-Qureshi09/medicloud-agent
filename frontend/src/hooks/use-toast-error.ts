import { useEffect } from "react";
import { toast } from "sonner";
import { extractApiError } from "@/lib/helpers";

export function useToastError(error: unknown, fallback = "The request failed.") {
    const message = error ? extractApiError(error, fallback) : null;
    useEffect(() => {
        if (message) toast.error(message, { id: message });
    }, [message]);
}
