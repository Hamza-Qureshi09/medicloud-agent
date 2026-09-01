import { Hono, type Context } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { listExternalOrders, listExternalResults } from "../db/queries/external.ts";
import { env } from "../lib/env.ts";
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../lib/constants.ts";
import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";
import { fetchMachineHealth } from "../lib/endpoints.ts";


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

export function registerDashboardRoutes(app: Hono, slaveRegistry: SlaveRegistry | undefined): void {

    // System info - intercepts the SDK's /health to inject agent mode and version.
    app.get("/info", async (c) => {
        // Forward the request to the SDK's internal health handler
        const { running_machines, registered_drivers } = await fetchMachineHealth();

        // Merge the agent's properties with the SDK's properties
        return c.json({
            running_machines,
            registered_drivers,
            mode: env.AGENT_MODE,
            version: "1.0.0"
        });
    });

    // List all registered slaves (master mode only)
    app.get("/slaves", async (c) => {
        if (!slaveRegistry) {
            return c.json({ slaves: [] });
        }
        const slaves = await slaveRegistry.listActive();
        return c.json({ slaves });
    });

    // Mark a slave as inactive
    app.post("/slaves/:slaveId/inactive", async (c) => {
        if (!slaveRegistry) return c.json({ success: false }, 400);
        const slaveId = c.req.param("slaveId");
        const found = await slaveRegistry.markInactive(slaveId);

        if (!found) {
            return c.json({ error: "Slave not found" }, 404);
        }

        return c.json({ success: true });
    });

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
