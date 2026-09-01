import React from "react";
import { useSearchParams } from "react-router-dom";
import { useDebounceCallback } from "./use-debounce-callback";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Keeps tab, search and status in the URL so a view stays bookmarkable.
 *
 * Every tab owns its own search parameter, so switching tabs cannot leak a
 * filter the other tab is unable to interpret. The first tab is the default and
 * is left out of the URL.
 *
 * `tabs` and `searchKeys` must be stable references — declare them at module scope.
 */
export function useTabbedFilters<T extends string>(
    tabs: readonly T[],
    searchKeys: Readonly<Record<T, string>>,
) {
    const [params, setParams] = useSearchParams();
    const [page, setPage] = React.useState(1);

    const tab = tabs.find((value) => value === params.get("tab")) ?? tabs[0];
    const searchKey = searchKeys[tab];
    const search = params.get(searchKey) ?? "";
    const status = params.get("status") ?? "";

    // Live input value, re-synced whenever the URL changes (tab switch, reset, history).
    const [input, setInput] = React.useState(search);
    React.useEffect(() => setInput(search), [search]);

    // Writes the whole filter state at once; empty values and the default tab are omitted.
    const write = React.useCallback(
        (state: Record<string, string>) => {
            const next = new URLSearchParams();
            for (const [key, value] of Object.entries(state)) {
                if (value && !(key === "tab" && value === tabs[0])) next.set(key, value);
            }
            setParams(next, { replace: true });
            setPage(1);
        },
        [setParams, tabs],
    );

    const commitSearch = React.useCallback(
        (value: string) => write({ tab, [searchKey]: value, status }),
        [write, tab, searchKey, status],
    );
    const debouncedCommitSearch = useDebounceCallback(commitSearch, SEARCH_DEBOUNCE_MS);

    const onSearch = React.useCallback(
        (value: string) => {
            setInput(value);
            debouncedCommitSearch(value);
        },
        [debouncedCommitSearch],
    );

    const onStatus = React.useCallback(
        (value: string) => write({ tab, [searchKey]: search, status: value }),
        [write, tab, searchKey, search],
    );

    // Switching tabs drops the filters; they belong to the tab that set them.
    const onTab = React.useCallback(
        (value: string | number | null) => write({ tab: String(value ?? "") }),
        [write],
    );

    const onReset = React.useCallback(() => write({ tab }), [write, tab]);

    return { tab, search, status, input, page, setPage, onSearch, onStatus, onTab, onReset };
}
