import { Hono } from "@hono/hono";
import type { SlaveRegistry } from "../../flow/master/slaveRegistry.ts";

export function registerSlaveManagementRoutes(
  app: Hono,
  slaveRegistry: SlaveRegistry | undefined,
): void {
  // Lists every slave (active, inactive, or pre-registered).
  app.get("/slaves", async (c) => {
    if (!slaveRegistry) return c.json({ slaves: [], totalMachines: 0 });
    const [slaves, totalMachines] = await Promise.all([
      slaveRegistry.listAll(),
      slaveRegistry.countMachines(),
    ]);
    return c.json({ slaves, totalMachines });
  });

  // Creates a new slave slot and returns one-time credentials.
  app.post("/slaves/register", async (c) => {
    if (!slaveRegistry) {
      return c.json({
        error: "Slave registration is only available in master mode",
      }, 400);
    }
    const { slaveId, slaveSecret } = await slaveRegistry.register();
    return c.json({ slaveId, slaveSecret });
  });

  // Gets a single slave by its ID.
  app.get("/slaves/:slaveId", async (c) => {
    if (!slaveRegistry) return c.json({ error: "Not in master mode" }, 400);

    const slave = await slaveRegistry.getBySlaveId(c.req.param("slaveId"));
    if (!slave) return c.json({ error: "Slave not found" }, 404);

    return c.json({ slave });
  });

  // Marks a slave as inactive.
  app.post("/slaves/:slaveId/inactive", async (c) => {
    if (!slaveRegistry) return c.json({ success: false }, 400);
    const found = await slaveRegistry.markInactive(c.req.param("slaveId"));
    return c.json({ success: found });
  });

  // Permanently deletes a slave from the registry.
  app.post("/slaves/:slaveId/delete", async (c) => {
    if (!slaveRegistry) return c.json({ success: false }, 400);
    const found = await slaveRegistry.delete(c.req.param("slaveId"));
    if (!found) return c.json({ error: "Slave not found" }, 404);
    return c.json({ success: true });
  });
}
