import { env } from "../../lib/env.ts";
import { ApiError } from "../../lib/error.ts";
import { SLAVE_CONNECTION_FILE_NAME } from "../../lib/constants.ts";
import { getSiblingFilePath } from "../../lib/utils.ts";
import { hasSynchronizedWork } from "../../db/repositories/slaveConnection.ts";
import type { SlaveConnectionIdentity } from "../../schemas/slaveConnection.ts";
import { SlaveConnection } from "./connection.ts";

// load slave connection from the file path, or create a new one with the provided fallback settings from env.
export async function loadSlaveConnection(
  instanceId: string,
): Promise<SlaveConnection | undefined> {
  if (env.AGENT_MODE !== "slave") return undefined;

  const settingsFilePath = getSiblingFilePath(
    env.MEDICLOUD_AGENT_DB_PATH,
    SLAVE_CONNECTION_FILE_NAME,
  );

  const connection = new SlaveConnection(
    settingsFilePath,
    instanceId,
    env.MASTER_PORT,
  );
  await connection.load({
    masterHost: env.MASTER_HOST,
    masterPort: env.MASTER_PORT,
    slaveId: env.SLAVE_ID,
    slaveSecret: env.SLAVE_SECRET,
  });
  return connection;
}

export async function validateSlaveConnectionChange(
  previous: SlaveConnectionIdentity,
  next: SlaveConnectionIdentity,
): Promise<void> {
  const sameIdentity = previous.masterHost === next.masterHost &&
    previous.masterPort === next.masterPort &&
    previous.slaveId === next.slaveId;

  if (sameIdentity) return;
  if (await hasSynchronizedWork()) {
    throw new ApiError(
      "This data directory contains synchronized work for the previous master or slave identity. Keep that connection or use a separate data directory",
      409,
    );
  }
}
