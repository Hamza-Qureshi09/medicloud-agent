import { requireDashboardOrigin } from "../middleware/dashboardOrigin.ts";
import { Hono } from "@hono/hono";
import { validator } from "@hono/hono/validator";
import type { SlaveConnection } from "../../flow/slave/connection.ts";
import { verifySlaveConnection } from "../../flow/slave/verify.ts";
import { SlaveConnectionUpdateSchema } from "../../schemas/slaveConnection.ts";
import { ApiError } from "../../lib/error.ts";
import { ZodError } from "@zod/zod";

export function registerSlaveConnectionRoutes(
  app: Hono,
  connection: SlaveConnection,
  instanceId: string,
): void {
  app.get(
    "/slave-connection",
    (context) => context.json(connection.getStatus()),
  );

  app.delete("/slave-connection", requireDashboardOrigin, async (context) => {
    try {
      await connection.remove();
      return context.json(connection.getStatus());
    } catch (error) {
      return context.json({
        error: error instanceof ApiError
          ? error.message
          : "Could not remove the saved connection",
      }, error instanceof ApiError && error.status === 409 ? 409 : 500);
    }
  });

  app.put(
    "/slave-connection",
    requireDashboardOrigin,
    // middleware to validate the request body against the SlaveConnectionUpdateSchema and save the new settings
    validator("json", (value, context) => {
      const parsed = SlaveConnectionUpdateSchema.safeParse(value);
      return parsed.success ? parsed.data : context.json({
        error: "Invalid connection settings",
        issues: parsed.error.issues,
      }, 400);
    }),
    async (context) => {
      try {
        await connection.save(
          context.req.valid("json"),
          (settings) => verifySlaveConnection(settings, instanceId),
        );
        return context.json(connection.getStatus());
      } catch (error) {
        if (error instanceof ZodError) {
          return context.json({
            error: "Enter all master connection fields and a slave secret",
          }, 400);
        }
        if (error instanceof ApiError && error.status === 409) {
          return context.json({ error: error.message }, 409);
        }
        return context.json({
          error:
            "Could not save and connect. Check the master address, credentials, and local storage access.",
        }, 502);
      }
    },
  );
}
