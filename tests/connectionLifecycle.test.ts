import { assert, assertEquals, assertRejects } from "@std/assert";
import { SlaveConnection } from "../flow/slave/connection.ts";

const settings = {
  slaveName: "Chemistry room",
  masterHost: "localhost",
  masterPort: 5050,
  slaveId: "one",
  slaveSecret: "private-secret",
};

Deno.test("deletion survives env fallback and preserves the previous synchronization identity", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const path = `${directory}/connection.json`;
    const connection = new SlaveConnection(path, "instance", 5050);
    await connection.load({});
    assertEquals(connection.getStatus().masterPort, 5050);
    await connection.save(settings, () => Promise.resolve());
    assertEquals(connection.getConnection().slaveName, settings.slaveName);
    await assertRejects(
      () => connection.save(settings, () => Promise.resolve()),
      Error,
      "already has a master",
    );
    await connection.remove();
    const savedText = await Deno.readTextFile(path);
    assert(!savedText.includes(settings.slaveSecret));
    const restarted = new SlaveConnection(path, "next-instance", 5050);
    await restarted.load(settings);
    assertEquals(restarted.configured, false);
    let resumed = 0;
    restarted.setWorkerControl({
      pause: () => Promise.resolve(),
      resume: () => {
        resumed++;
      },
      validateChange: (previous, next) => {
        assertEquals(previous.slaveId, settings.slaveId);
        if (previous.slaveId !== next.slaveId) {
          throw new Error("previous synchronized work");
        }
        return Promise.resolve();
      },
    });
    await assertRejects(
      () =>
        restarted.save(
          { ...settings, slaveId: "different" },
          () => Promise.resolve(),
        ),
      Error,
      "previous synchronized work",
    );
    assertEquals(restarted.configured, false);
    assertEquals(resumed, 1);
    await restarted.save(
      { ...settings, slaveName: "Renamed room" },
      () => Promise.resolve(),
    );
    assertEquals(restarted.getStatus().slaveName, "Renamed room");
    assertEquals(restarted.getStatus().status, "connected");
    restarted.recordHeartbeat(new Error("offline"));
    assertEquals(restarted.getStatus().status, "disconnected");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
