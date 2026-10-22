import type { SlaveConnectionSettings } from "../../schemas/slaveConnection.ts";
import { createSlaveSyncConnection } from "../../lib/utils.ts";
import { SyncClient } from "../sync/client.ts";
import { getLocalMachineCapabilities } from "../sync/capabilities.ts";

export async function verifySlaveConnection(
  settings: SlaveConnectionSettings,
  instanceId: string,
): Promise<void> {
  const connection = createSlaveSyncConnection(settings, instanceId);
  const client = new SyncClient(
    connection.baseUrl,
    connection.auth.clientId,
    connection.auth.secret,
    instanceId,
    "slave",
    "/slave-sync",
    undefined,
    () => connection,
  );
  await client.heartbeat("slave", await getLocalMachineCapabilities());
}
