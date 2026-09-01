import { fetchDriverCatalog, fetchMachineHealth, fetchMachineProfiles } from "../../lib/endpoints.ts";
import type { SlaveRegistry } from "../master/slaveRegistry.ts";
import type { SyncMachineCapability } from "../../types.ts";


/**
 * List of machine capabilities this agent can handle locally.
 *
 * For each registered profile it:
 *  1. Checks whether the machine is currently running/connected (from health).
 *  2. Fetches the driver's test catalog to know which tests it supports.
 *
 * Profiles whose catalog fetch fails are silently skipped so one broken
 * driver does not prevent the rest from being reported.
 */
export async function getLocalMachineCapabilities(): Promise<SyncMachineCapability[]> {

    // Fetch profiles and running-machine health concurrently.
    const [profiles, runningMachines] = await Promise.all([
        fetchMachineProfiles(),
        fetchMachineHealth(),
    ]);

    // Build a capability entry for every profile concurrently.
    const results = await Promise.allSettled(
        profiles.map(async (profile): Promise<SyncMachineCapability> => {

            // Match the profile to a running machine (may be undefined if not started).
            const active = runningMachines.running_machines.find((item) => item.profile.id === profile.id);

            // Fetch the tests this driver supports.
            const catalogTests = await fetchDriverCatalog(profile.driverId);

            return {
                profileKey: `${profile.driverId}:${profile.id}`,
                localProfileId: profile.id,
                driverId: profile.driverId,
                name: profile.name ?? `${profile.driverId} #${profile.id}`,
                catalogTests: catalogTests.map((test) => test.code),
                running: active?.machine.running ?? false,
                connected: active?.machine.connected ?? false,
                isSlaveOwned: false,
            };
        }),
    );

    // Drop any profiles that failed (e.g. catalog unavailable) - log them for visibility.
    return results
        .filter((result) => {
            if (result.status === "rejected") {
                console.warn(`[capabilities] Skipped a profile:`, result.reason);
            }
            return result.status === "fulfilled";
        })
        .map((result) => (result as PromiseFulfilledResult<SyncMachineCapability>).value);
}


/**
 * Returns all machine capabilities this agent is responsible for reporting upstream.
 *
 * - "direct" / "slave" mode  ->  only local machines.
 * - "master" mode            ->  local machines  +  every active slave's machines.
 *
 * Slave machine profile keys are namespaced so the master can route orders
 * back to the correct slave later:
 *   `slave:<slaveId>:<originalProfileKey>`
 */
export async function getUpstreamCapabilities(
    slaveRegistry: SlaveRegistry | null,
): Promise<SyncMachineCapability[]> {

    const local = await getLocalMachineCapabilities();

    // no slave registry means we are not in master mode, return local only
    if (!slaveRegistry) return local;

    // list last 2 min active slaves machines list from db for this agent whois ("master","direct")
    const activeSlaves = await slaveRegistry.listActive();

    const slaveMachines: SyncMachineCapability[] = activeSlaves.flatMap((slave) => {
        const machines = JSON.parse(slave.machinesJson) as SyncMachineCapability[];

        return machines.map((machine) => ({
            ...machine,
            // namespace the profileKey so master can identify which slave owns it
            profileKey: `slave:${slave.slaveId}:${machine.profileKey}`,
            isSlaveOwned: true,
            slaveId: slave.slaveId,
        }));
    });

    return [...local, ...slaveMachines];
}
