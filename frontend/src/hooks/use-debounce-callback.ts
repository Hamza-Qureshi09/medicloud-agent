import React from "react";

export function useDebounceCallback<T extends (...args: never[]) => void>(
    callback: T,
    delay = 400,
) {
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancel = React.useCallback(() => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
    }, []);

    const debouncedCallback = React.useCallback((...args: Parameters<T>) => {
        cancel();
        timer.current = setTimeout(() => {
            timer.current = null;
            callback(...args);
        }, delay);
    }, [callback, delay, cancel]);

    // A callback belongs to its current tab/filter context.
    React.useEffect(() => cancel, [callback, delay, cancel]);

    return Object.assign(debouncedCallback, { cancel });
}
