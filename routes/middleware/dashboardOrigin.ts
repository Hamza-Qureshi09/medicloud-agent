import type { MiddlewareHandler } from "@hono/hono";

export const requireDashboardOrigin: MiddlewareHandler = async (
  context,
  next,
) => {
  const origin = context.req.header("origin");
  if (
    context.req.header("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(context.req.url).origin)
  ) {
    return context.json({
      error: "Manage connection settings from this agent's dashboard",
    }, 403);
  }
  await next();
};
