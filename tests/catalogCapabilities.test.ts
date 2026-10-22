import { assertEquals } from "@std/assert";
import {
  getLocalMachineCapabilities,
  getUpstreamCapabilities,
} from "../flow/sync/capabilities.ts";
import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";

Deno.test("direct, slave, and master capability paths use active catalog tests", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request) => {
    const url = new URL(String(_input));
    let payload: unknown;
    if (url.pathname === "/profiles") {
      payload = { profiles: [
        { id: 7, driverId: "iflash3000", name: "Lab iFlash", enabled: true },
        { id: 8, driverId: "bonavera-200", name: "Lab Bonavera", enabled: true },
      ] };
    } else if (url.pathname === "/health") {
      payload = {
        registered_drivers: [{ id: "iflash3000" }],
        running_machines: [
          { profile: { id: 7 }, machine: { id: "iflash3000", running: true, connected: true } },
          { profile: { id: 8 }, machine: { id: "bonavera-200", running: true, connected: true } },
        ],
      };
    } else if (url.pathname === "/catalogs") {
      payload = url.searchParams.get("driver") === "bonavera-200"
        ? { tests: [{ code: "0", name: "Calcium", analytes: [{ code: "0", name: "Calcium" }], enabled: true }] }
        : {
          tests: [
            { code: "FT4_1", name: "FT4", analytes: [{ code: "339", name: "FT4" }], enabled: true },
            { code: "OLD", name: "Old assay", analytes: [{ code: "99", name: "Old assay" }], enabled: false },
          ],
        };
    } else {
      throw new Error("Unexpected SDK request " + url.pathname);
    }
    return Promise.resolve(Response.json(payload));
  }) as typeof fetch;
  try {
    const directOrSlave = await getLocalMachineCapabilities();
    assertEquals(directOrSlave.length, 2);
    assertEquals(directOrSlave[0].catalogTests, ["FT4_1"]);
    assertEquals(directOrSlave[0].catalog?.[0].analytes[0].code, "339");
    assertEquals(directOrSlave[1].catalogTests, ["0"]);
    assertEquals(directOrSlave[1].catalog?.[0].analytes[0].code, "0");
    const slaveMachine = { ...directOrSlave[1], localProfileId: 9, profileKey: "bonavera-200:9" };
    const fakeRegistry = {
      listActive: () => Promise.resolve([{
        slaveId: "slave-1",
        machinesJson: JSON.stringify([slaveMachine]),
      }]),
    } as unknown as SlaveRegistry;
    const master = await getUpstreamCapabilities(fakeRegistry);
    assertEquals(master.length, 3);
    assertEquals(master[0].catalogTests, ["FT4_1"]);
    assertEquals(master[1].catalogTests, ["0"]);
    assertEquals(master[2].profileKey, "slave:slave-1:bonavera-200:9");
    assertEquals(master[2].catalogTests, ["0"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});