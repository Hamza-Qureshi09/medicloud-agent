import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { env } from "../lib/env.ts";

import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";

export function registerDashboardRoutes(app: Hono, slaveRegistry?: SlaveRegistry): void {

    // Health check - used by load balancers, monitoring, and slave-sync clients.
    app.get("/healthy", (c) =>
        c.json({ status: "ok", mode: env.AGENT_MODE, version: "1.0.0" })
);

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
