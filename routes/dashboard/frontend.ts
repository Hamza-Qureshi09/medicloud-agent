import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../../frontend/build/", import.meta.url));


export function registerDashboardFrontendRoutes(app: Hono): void {
  // Serve pre-built frontend assets under /dashboard/*.
  app.use(
    "/dashboard/*",
    serveStatic({
      root: frontendRoot,
      rewriteRequestPath: (path) => path.replace(/^\/dashboard/, ""),
    }),
  );

  // SPA fallback - any /dashboard route not matching a static file
  // returns index.html so the frontend router handles it.
  app.get(
    "/dashboard",
    (c, next) => serveStatic({ root: frontendRoot, path: "index.html" })(c, next),
  );
  app.get(
    "/dashboard/*",
    (c, next) => serveStatic({ root: frontendRoot, path: "index.html" })(c, next),
  );
}
