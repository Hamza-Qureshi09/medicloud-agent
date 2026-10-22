import { fileURLToPath } from "node:url";
import { assert, assertEquals } from "@std/assert";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function freePort() {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return port;
}

Deno.test("master, direct, and unconfigured slave launch separately and UI connection survives deletion and restart", async () => {
  const directory = await Deno.makeTempDir();
  const children: Array<
    {
      child: Deno.ChildProcess;
      output: Promise<Deno.CommandOutput>;
      stopped: boolean;
    }
  > = [];
  const upstream = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/heartbeat")) {
        return Response.json({
          serverTime: new Date().toISOString(),
          heartbeatAfterMs: 1000,
          pullAfterMs: 1000,
          maxOrderBatchSize: 100,
          maxResultBatchSize: 100,
        });
      }
      if (path.endsWith("/orders/pull")) {
        return Response.json({
          orders: [],
          pullAfterMs: 1000,
        });
      }
      return Response.json({ accepted: [], duplicates: [], rejected: [] });
    },
  );
  const masterPort = freePort();
  const slavePort = freePort();
  const directPort = freePort();
  const masterUrl = `http://127.0.0.1:${masterPort}`;
  const slaveUrl = `http://127.0.0.1:${slavePort}`;
  const directUrl = `http://127.0.0.1:${directPort}`;
  const launch = async (
    mode: string,
    port: number,
    credentials: { slaveId: string; slaveSecret: string } | undefined =
      undefined,
  ) => {
    const cwd = join(directory, mode);
    await Deno.mkdir(cwd, { recursive: true });
    const child = new Deno.Command(Deno.execPath(), {
      cwd,
      args: [
        "run",
        "--sloppy-imports",
        "-A",
        "--config",
        join(root, "deno.json"),
        join(root, "main.ts"),
      ],
      env: {
        AGENT_MODE: mode,
        MEDICLOUD_AGENT_HTTP_HOST: "127.0.0.1",
        MEDICLOUD_AGENT_HTTP_PORT: String(port),
        MEDICLOUD_AGENT_DB_PATH: join(cwd, "data", "agent.db"),
        MEDICLOUD_MACHINES_SDK_DB_PATH: join(cwd, "data", "machines.db"),
        MEDICLOUD_AGENT_ID: "integration-agent",
        MEDICLOUD_AGENT_SECRET: "integration-secret",
        MEDICLOUD_ACCOUNT_ID: "integration-account",
        MEDICLOUD_API_URL: `http://127.0.0.1:${upstream.addr.port}`,
        MEDICLOUD_PING_INTERVAL_MS: "1000",
        DEFAULT_ORDER_PULL_INTERVAL_MS: "1000",
        MASTER_HOST: credentials ? "127.0.0.1" : "",
        MASTER_PORT: String(masterPort),
        SLAVE_ID: credentials?.slaveId ?? "",
        SLAVE_SECRET: credentials?.slaveSecret ?? "",
      },
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const entry = { child, output: child.output(), stopped: false };
    children.push(entry);
    const baseUrl = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(baseUrl + "/info");
        const info = await response.json();
        if (response.ok && info.mode === mode) return entry;
      } catch { /* The isolated process is still starting. */ }
      await delay(100);
    }
    throw new Error(`${mode} agent did not become ready`);
  };
  const stop = async (entry: typeof children[number]) => {
    entry.stopped = true;
    try {
      entry.child.kill("SIGTERM");
    } catch { /* Already exited. */ }
    const output = await entry.output;
    assert(
      output.success || output.code === 1 || output.code === 143,
      new TextDecoder().decode(output.stderr),
    );
  };
  const request = (
    baseUrl: string,
    path: string,
    method = "GET",
    body?: unknown,
  ) =>
    fetch(baseUrl + path, {
      method,
      headers: {
        Origin: baseUrl,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    await launch("master", masterPort);
    const slave = await launch("slave", slavePort);
    await launch("direct", directPort);
    assertEquals((await request(masterUrl, "/slave-connection")).status, 404);
    assertEquals((await request(directUrl, "/slave-connection")).status, 404);
    assertEquals(
      (await request(slaveUrl, "/slave-sync/heartbeat", "POST", {})).status,
      404,
    );
    const initial = await (await request(slaveUrl, "/slave-connection")).json();
    assertEquals(initial.configured, false);
    assertEquals(initial.masterPort, masterPort);
    const dashboard = await request(slaveUrl, "/dashboard/master-connection");
    assertEquals(dashboard.status, 200);
    assert((await dashboard.text()).includes('<div id="root">'));
    const register = await request(masterUrl, "/slaves/register", "POST", {
      name: "Slot name",
    });
    assertEquals(register.status, 200);
    const credentials = await register.json();
    const settings = {
      ...credentials,
      slaveName: "Chemistry room",
      masterHost: "127.0.0.1",
      masterPort,
    };
    const added = await request(slaveUrl, "/slave-connection", "PUT", settings);
    assertEquals(added.status, 200);
    assertEquals((await added.json()).status, "connected");
    const slaves = await (await request(masterUrl, "/slaves")).json();
    assertEquals(slaves.slaves[0].name, "Chemistry room");
    assertEquals(slaves.slaves[0].isActive, true);
    assertEquals(
      (await request(slaveUrl, "/slave-connection", "PUT", settings)).status,
      409,
    );
    const removed = await request(slaveUrl, "/slave-connection", "DELETE");
    assertEquals(removed.status, 200);
    assertEquals((await removed.json()).configured, false);
    await stop(slave);
    await launch("slave", slavePort, credentials);
    const restarted = await (await request(slaveUrl, "/slave-connection"))
      .json();
    assertEquals(restarted.configured, false);
    assertEquals(
      (await request(slaveUrl, "/slave-connection", "PUT", {
        ...settings,
        slaveName: "New room name",
      })).status,
      200,
    );
    const renamed = await (await request(masterUrl, "/slaves")).json();
    assertEquals(renamed.slaves[0].name, "New room name");
  } finally {
    for (const entry of children) if (!entry.stopped) await stop(entry);
    await upstream.shutdown();
    await Deno.remove(directory, { recursive: true });
  }
});
