import { Hono, type Context } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { listExternalOrders, listExternalResults } from "../db/queries/external.ts";
import { env } from "../lib/env.ts";
import {MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE} from "../lib/constants.ts";


/** Reads the search/status/limit/offset query shared by both external lists. */
function listQuery(c: Context) {
    const limit = Number(c.req.query("limit"));
    const offset = Number(c.req.query("offset"));

    return {
        search: c.req.query("search")?.trim() || undefined,
        status: c.req.query("status")?.trim() || undefined,
        limit: Number.isFinite(limit)
            ? Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)
            : DEFAULT_PAGE_SIZE,
        offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    };
}

/**
 * Runs a read and reports failures as JSON.
 */
async function readJson(c: Context, read: () => Promise<unknown>) {
    try {
        return c.json(await read());
    } catch (error) {
        console.error("[dashboard] query failed:", error);
        return c.json({
            error: "Query failed",
            detail: error instanceof Error ? error.message : String(error),
        }, 500);
    }
}


export function registerDashboardRoutes(app: Hono): void {

    // Health check - used by load balancers, monitoring, and slave-sync clients.
    app.get("/healthy", (c) =>
        c.json({ status: "ok", mode: env.AGENT_MODE, version: "1.0.0" })
    );

    // External orders - paged view of the agent's syncOrderInbox table.
    app.get("/external-orders", (c) =>
        readJson(c, async () => {
            const { rows, count } = await listExternalOrders(listQuery(c));
            return { orders: rows, count };
        })
    );

    // External results - paged view of the agent's medicloudResultDispatch table.
    app.get("/external-results", (c) =>
        readJson(c, async () => {
            const { rows, count } = await listExternalResults(listQuery(c));
            return { results: rows, count };
        })
    );

    // Serve pre-built frontend assets under /dashboard/*
    app.use(
        "/dashboard/*",
        serveStatic({
            root: "./frontend/build",
            rewriteRequestPath: (path) => path.replace(/^\/dashboard/, ""),
        }),
    );

    // SPA fallback - any /dashboard route that doesn't match a static file
    // returns index.html so the frontend router handles it.
    app.get("/dashboard", (c, next) =>
        serveStatic({ path: "./frontend/build/index.html" })(c, next)
    );
    app.get("/dashboard/*", (c, next) =>
        serveStatic({ path: "./frontend/build/index.html" })(c, next)
    );
}
