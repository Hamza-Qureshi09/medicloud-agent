import { Hono } from "@hono/hono";
import { env } from "../../lib/env.ts";
import { fetchMachineHealth } from "../../lib/api.ts";
import { AGENT_SOFTWARE_VERSION } from "../../lib/constants.ts";

export function registerInfoRoute(app: Hono): void {
  app.get("/info", async (context) => {
    const { running_machines, registered_drivers } = await fetchMachineHealth();

    return context.json({
      running_machines,
      registered_drivers,
      mode: env.AGENT_MODE,
      version: AGENT_SOFTWARE_VERSION,
    });
  });
}
