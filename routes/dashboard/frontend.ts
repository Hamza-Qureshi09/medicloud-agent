import { Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";

export function registerDashboardFrontendRoutes(app: Hono): void {
  // Serve pre-built frontend assets under /dashboard/*.
  app.use(
    "/dashboard/*",
    serveStatic({
      root: "./frontend/build",
      rewriteRequestPath: (path) => path.replace(/^\/dashboard/, ""),
    }),
  );

  // SPA fallback - any /dashboard route not matching a static file
  // returns index.html so the frontend router handles it.
  app.get(
    "/dashboard",
    (c, next) => serveStatic({ path: "./frontend/build/index.html" })(c, next),
  );
  app.get(
    "/dashboard/*",
    (c, next) => serveStatic({ path: "./frontend/build/index.html" })(c, next),
  );
}
