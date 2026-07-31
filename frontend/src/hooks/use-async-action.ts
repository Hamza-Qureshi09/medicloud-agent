import { useCallback, useReducer } from "react";

type AsyncActionState =
    | { status: "idle"; error: null }
    | { status: "pending"; error: null }
    | { status: "success"; error: null }
    | { status: "error"; error: string }


type AsyncActionEvent =
    | { type: "start" }
    | { type: "success" }
    | { type: "error"; error: string }
    | { type: "reset" }

const initialState: AsyncActionState = { status: "idle", error: null }


function reducer(
    _state: AsyncActionState,
    action: AsyncActionEvent
): AsyncActionState {
    switch (action.type) {
        case "start":
            return { status: "pending", error: null }
        case "success":
            return { status: "success", error: null }
        case "error":
            return { status: "error", error: action.error }
        case "reset":
            return initialState
    }
}

export function useAsyncAction(defaultError = "The action failed.") {
    const [state, dispatch] = useReducer(reducer, initialState)

    const execute = useCallback(async <T,>(action: () => Promise<T>) => {
        dispatch({ type: "start" })

        try {
            const result = await action()
            dispatch({ type: "success" })
            return result
        } catch (error) {
            dispatch({
                type: "error",
                error: errorMessage(error, defaultError)
            })
            throw error
        }
    }, [defaultError])

    const reset = useCallback(() => dispatch({ type: "reset" }), [])

    return {
        status: state.status,
        pending: state.status === "pending",
        error: state.error,
        execute,
        reset
    }
}

// helpers
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}