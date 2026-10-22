import { assert, assertEquals } from "@std/assert";
import { resolve } from "node:path";
import { Hono } from "@hono/hono";
import { SlaveConnection } from "../flow/slave/connection.ts";
import { registerSlaveConnectionRoutes } from "../routes/dashboard/slaveConnection.ts";
import { getSiblingFilePath } from "../lib/utils.ts";

Deno.test("slave settings path is beside relative and absolute database paths", () => {
  assertEquals(
    getSiblingFilePath("./data/agent.db", "slave-connection.json"),
    resolve("./data/slave-connection.json"),
  );
  assertEquals(
    getSiblingFilePath(resolve("./custom/agent.db"), "slave-connection.json"),
    resolve("./custom/slave-connection.json"),
  );
});

Deno.test("slave setup routes verify master credentials and preserve redacted state", async () => {
  const directory = await Deno.makeTempDir();
  const originalFetch = globalThis.fetch;
  let verified = 0;
  globalThis.fetch = ((input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/profiles") {
      return Promise.resolve(Response.json({ profiles: [] }));
    }
    if (url.pathname === "/health") {
      return Promise.resolve(
        Response.json({ registered_drivers: [], running_machines: [] }),
      );
    }
    if (url.pathname === "/slave-sync/heartbeat") {
      if (
        new Headers(options?.headers).get("x-slave-secret") !== "test-secret"
      ) {
        return Promise.resolve(
          Response.json({ error: "Invalid credentials" }, { status: 401 }),
        );
      }
      const payload = JSON.parse(String(options?.body));
      assertEquals(payload.slaveName, "Chemistry room");
      verified++;
      return Promise.resolve(
        Response.json({
          serverTime: new Date().toISOString(),
          heartbeatAfterMs: 30000,
          pullAfterMs: 10000,
          maxOrderBatchSize: 100,
          maxResultBatchSize: 100,
        }),
      );
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  }) as typeof fetch;
  try {
    const connection = new SlaveConnection(
      `${directory}/slave-connection.json`,
      "instance",
      5001,
    );
    await connection.load({});
    const app = new Hono();
    registerSlaveConnectionRoutes(app, connection, "instance");
    const settings = {
      slaveName: "Chemistry room",
      masterHost: "localhost",
      masterPort: 5001,
      slaveId: "test-slave",
      slaveSecret: "test-secret",
    };
    const save = (secret: string, origin = "http://localhost") =>
      app.request("http://localhost/slave-connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ ...settings, slaveSecret: secret }),
      });
    assertEquals(
      (await save(settings.slaveSecret, "http://elsewhere.example")).status,
      403,
    );
    assertEquals((await save("wrong-secret")).status, 502);
    assertEquals(connection.configured, false);
    const saved = await save(settings.slaveSecret);
    assertEquals(saved.status, 200);
    assertEquals(verified, 1);
    assertEquals((await save(settings.slaveSecret)).status, 409);
    const status = await saved.json();
    assertEquals(status.configured, true);
    assert(!JSON.stringify(status).includes(settings.slaveSecret));
    const restarted = new SlaveConnection(
      `${directory}/slave-connection.json`,
      "next-instance",
      5001,
    );
    await restarted.load({});
    assertEquals(restarted.getConnection().auth.secret, settings.slaveSecret);
    const removed = await app.request("http://localhost/slave-connection", {
      method: "DELETE",
      headers: { Origin: "http://localhost" },
    });
    assertEquals(removed.status, 200);
    assertEquals((await removed.json()).configured, false);
    const afterDelete = new SlaveConnection(
      `${directory}/slave-connection.json`,
      "after-delete",
      5001,
    );
    await afterDelete.load(settings);
    assertEquals(afterDelete.configured, false);
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(directory, { recursive: true });
  }
});
