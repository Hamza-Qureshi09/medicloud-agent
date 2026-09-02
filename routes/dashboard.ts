import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { env } from "../lib/env.ts";


export function registerDashboardRoutes(app: Hono): void {

    // Health check - used by load balancers, monitoring, and slave-sync clients.
    app.get("/healthy", (c) =>
        c.json({ status: "ok", mode: env.AGENT_MODE, version: "1.0.0" })
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
