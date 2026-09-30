import {
  fetchDriverCatalog,
  fetchMachineHealth,
  fetchMachineProfiles,
} from "../../lib/api.ts";
import type { SlaveRegistry } from "../master/slaveRegistry.ts";
import type { SyncMachineCapability } from "../../schemas/sync.ts";
import { MachineCapabilitySchema } from "../../schemas/sync.ts";
import { z } from "@zod/zod";

/**
 * Builds the list of machine capabilities this agent can handle locally.
 *
 * For each registered profile:
 *  1. Checks whether the machine is currently running/connected (via /health).
 *  2. Fetches the driver's test catalog to know which tests it supports.
 *
 * Profiles whose catalog fetch fails are silently skipped - one broken
 * driver must not prevent the rest from being reported.
 */
export async function getLocalMachineCapabilities(): Promise<
  SyncMachineCapability[]
> {
  // Fetch profiles and health concurrently.
  const [profiles, health] = await Promise.all([
    fetchMachineProfiles(),
    fetchMachineHealth(),
  ]);

  const results = await Promise.allSettled(
    profiles.map(async (profile): Promise<SyncMachineCapability> => {
      // Match profile to a running machine (undefined if the machine is not started).
      const active = health.running_machines.find((item) =>
        item.profile.id === profile.id
      );

      const catalogTests = await fetchDriverCatalog(profile.driverId);

      // Only carry tests whose analytes this SDK build actually knows -
      // an empty list upstream would read as "answers with nothing".
      const catalog = catalogTests
        .filter((test) => test.analytes?.length)
        .map((test) => ({
          testCode: test.code,
          testName: test.name,
          analytes: test.analytes as NonNullable<typeof test.analytes>,
        }));

      return {
        profileKey: `${profile.driverId}:${profile.id}`,
        localProfileId: profile.id,
        driverId: profile.driverId,
        name: profile.name ?? `${profile.driverId} #${profile.id}`,
        catalogTests: catalogTests.map((t) => t.code),
        ...(catalog.length ? { catalog } : {}),
        running: active?.machine.running ?? false,
        connected: active?.machine.connected ?? false,
        isSlaveOwned: false,
      };
    }),
  );

  return results.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    console.warn("[capabilities] Skipped a profile:", result.reason);
    return [];
  });
}

/**
 * Returns all machine capabilities this agent is responsible for reporting upstream.
 *
 * - slave / direct mode → only local machines.
 * - master mode         → local machines + every active slave's machines.
 *
 * Slave machine profile keys are namespaced so the master can route orders
 * back to the correct slave later:
 *   `slave:<slaveId>:<originalProfileKey>`
 */
export async function getUpstreamCapabilities(
  slaveRegistry: SlaveRegistry | null,
): Promise<SyncMachineCapability[]> {
  const local = await getLocalMachineCapabilities();

  // Not in master mode - return local machines only.
  if (!slaveRegistry) return local;

  const activeSlaves = await slaveRegistry.listActive();

  const slaveMachines: SyncMachineCapability[] = activeSlaves.flatMap(
    (slave) => {
      try {
        const machines = z.array(MachineCapabilitySchema).parse(
          JSON.parse(slave.machinesJson),
        );
        return machines.map((machine) => ({
          ...machine,
          profileKey: `slave:${slave.slaveId}:${machine.profileKey}`,
          isSlaveOwned: true,
          slaveId: slave.slaveId,
        }));
      } catch (error) {
        console.warn(
          `[capabilities] Skipped invalid slave ${slave.slaveId}:`,
          error,
        );
        return [];
      }
    },
  );

  return [...local, ...slaveMachines];
}
