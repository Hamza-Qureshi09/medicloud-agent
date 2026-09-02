export const ITEMS_PER_PAGE = 20;

/**
 * Total pages for a list.
 *
 * Pass `estimate` when `total` cannot honour the active filters — the machine
 * SDK's /count endpoints ignore query filters, so a filtered list can only
 * infer that a full page implies at least one more.
 */
export function pageCount({
    page,
    rows,
    total,
    estimate = false,
}: {
    page: number;
    rows: number;
    total: number;
    estimate?: boolean;
}): number {
    if (estimate) return rows < ITEMS_PER_PAGE ? page : page + 1;
    return Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
}
