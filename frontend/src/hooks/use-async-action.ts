import { toast } from "sonner";
import { useCallback, useReducer } from "react";
import { extractApiError } from "@/lib/helpers";

type AsyncActionState =
    | { status: "idle"; error: null }
    | { status: "pending"; error: null }
    | { status: "success"; error: null }
    | { status: "error"; error: string };

type AsyncActionEvent =
    | { type: "start" }
    | { type: "success" }
    | { type: "error"; error: string }
    | { type: "reset" };

const initialState: AsyncActionState = { status: "idle", error: null };

function reducer(
    _state: AsyncActionState,
    action: AsyncActionEvent,
): AsyncActionState {
    switch (action.type) {
        case "start":
            return { status: "pending", error: null };
        case "success":
            return { status: "success", error: null };
        case "error":
            return { status: "error", error: action.error };
        case "reset":
            return initialState;
    }
}

export function useAsyncAction(defaultError = "The action failed.", successMessage?: string) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const execute = useCallback(async <T>(action: () => Promise<T>) => {
        dispatch({ type: "start" });

        try {
            const result = await action();
            dispatch({ type: "success" });
            if (successMessage) toast.success(successMessage);
            return result;
        } catch (error) {
            const message = extractApiError(error, defaultError);
            toast.error(message, { id: message });
            dispatch({
                type: "error",
                error: message,
            });
            throw error;
        }
    }, [defaultError, successMessage]);

    const reset = useCallback(() => dispatch({ type: "reset" }), []);

    return {
        status: state.status,
        pending: state.status === "pending",
        error: state.error,
        execute,
        reset,
    };
}
