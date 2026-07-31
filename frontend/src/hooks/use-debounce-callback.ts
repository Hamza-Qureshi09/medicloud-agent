
import React from "react";


export function useDebounceCallback<T extends (...args: never[]) => void>(
    callback: T,
    delay: 400
) {
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    const debouncedCallback = React.useCallback(
        (...args: Parameters<T>) => {
            if (timer.current) {
                clearTimeout(timer.current);
            }

            timer.current = setTimeout(() => {
                callback(...args);
            }, delay);
        }, [callback, delay]
    )

    React.useEffect(() => {
        return () => {
            if (timer.current) {
                clearTimeout(timer.current)
            }
        }
    }, [])

    return debouncedCallback;

}