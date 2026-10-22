import { assert, assertEquals, assertRejects } from "@std/assert";
import { SlaveConnection } from "../flow/slave/connection.ts";
import { SlaveConnectionSchema } from "../schemas/slaveConnection.ts";
import { createSlaveSyncClient } from "../flow/sync/client.ts";

const settings = {
  slaveName: "Chemistry room",
  masterHost: "127.0.0.1",
  masterPort: 5001,
  slaveId: "test-slave",
  slaveSecret: "test-secret",
};

Deno.test("slave connection validates hosts and port boundaries", () => {
  for (
    const masterHost of [
      "http://localhost",
      "localhost/path",
      "user@localhost",
      "",
    ]
  ) {
    assert(
      !SlaveConnectionSchema.safeParse({ ...settings, masterHost }).success,
    );
  }
  for (const masterPort of [0, 65536, 1.5]) {
    assert(
      !SlaveConnectionSchema.safeParse({ ...settings, masterPort }).success,
    );
  }
  assert(
    SlaveConnectionSchema.safeParse({ ...settings, masterHost: "[::1]" })
      .success,
  );
});

Deno.test("saved slave configuration survives restart and never reveals its secret", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const path = `${directory}/slave-connection.json`;
    const connection = new SlaveConnection(path, "instance", 5001);
    await connection.load({});
    assertEquals(connection.configured, false);
    let resumed = 0;
    connection.setWorkerControl({
      pause: () => Promise.resolve(),
      resume: () => {
        resumed++;
      },
      validateChange: () => Promise.resolve(),
    });
    await assertRejects(() =>
      connection.save(settings, () => Promise.reject(new Error("offline")))
    );
    assertEquals(connection.configured, false);
    assertEquals(resumed, 1);
    await connection.save(settings, () => Promise.resolve());
    assert(
      !JSON.stringify(connection.getStatus()).includes(settings.slaveSecret),
    );
    const restored = new SlaveConnection(path, "next-instance", 5001);
    await restored.load({ ...settings, slaveSecret: "stale-env-secret" });
    assertEquals(restored.getConnection().auth.secret, settings.slaveSecret);
    assertEquals(restored.getConnection().auth.instanceId, "next-instance");
    await assertRejects(() =>
      restored.save(
        { ...settings, slaveSecret: "" },
        () => Promise.resolve(),
      )
    );
    assertEquals(restored.getConnection().auth.secret, settings.slaveSecret);
    await assertRejects(() =>
      restored.save(
        { ...settings, slaveSecret: "wrong" },
        () => Promise.reject(new Error("denied")),
      )
    );
    assertEquals(restored.getConnection().auth.secret, settings.slaveSecret);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("slave configuration supports legacy env fallback and rejects concurrent saves", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const connection = new SlaveConnection(
      `${directory}/connection.json`,
      "instance",
      5001,
    );
    await connection.load(settings);
    assertEquals(connection.configured, true);
    await connection.remove();
    let complete!: () => void;
    const pending = connection.save(
      settings,
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await assertRejects(() =>
      connection.save(settings, () => Promise.resolve())
    );
    complete();
    await pending;
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("slave sync client reads a fresh endpoint and credential snapshot per request", async () => {
  const originalFetch = globalThis.fetch;
  let current = {
    baseUrl: "http://first-master:5001",
    auth: {
      clientId: "one",
      secret: "first",
      instanceId: "instance",
      headerPrefix: "slave" as const,
    },
  };
  const sent: Array<{ url: string; secret: string | null }> = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      secret: new Headers(init?.headers).get("x-slave-secret"),
    });
    return Promise.resolve(
      Response.json({
        serverTime: new Date().toISOString(),
        heartbeatAfterMs: 30000,
        pullAfterMs: 10000,
        maxOrderBatchSize: 100,
        maxResultBatchSize: 100,
      }),
    );
  }) as typeof fetch;
  try {
    const client = createSlaveSyncClient("instance", {
      connectionProvider: () => current,
    });
    await client.heartbeat("slave", []);
    current = {
      baseUrl: "http://second-master:5002",
      auth: { ...current.auth, secret: "second" },
    };
    await client.heartbeat("slave", []);
    assertEquals(sent, [{
      url: "http://first-master:5001/slave-sync/heartbeat",
      secret: "first",
    }, {
      url: "http://second-master:5002/slave-sync/heartbeat",
      secret: "second",
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
