import { z } from "@zod/zod";
import {
  DEFAULT_AGENT_PORT,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_ORDER_PULL_INTERVAL_MS,
} from "../lib/constants.ts";

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const envNumber = (fallback: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(fallback),
  );

const envBoolean = (fallback: boolean) =>
  z.preprocess((value) => {
    const raw = emptyToUndefined(value);
    if (raw === undefined) return undefined;
    if (typeof raw === "string") {
      const normalized = raw.toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
    return raw;
  }, z.boolean().default(fallback));

const envString = (fallback = "") =>
  z.preprocess(emptyToUndefined, z.string().default(fallback));

// Used by lib/env.ts to validate agent settings at startup.
export const EnvSchema = z.object({
  MEDICLOUD_MACHINES_SDK_DB_PATH: envString("./data/machines.db"),
  MEDICLOUD_MACHINES_INTERNAL_HTTP_ENABLED: envBoolean(false),
  MEDICLOUD_AGENT_HTTP_HOST: envString("0.0.0.0"),
  MEDICLOUD_AGENT_HTTP_PORT: envNumber(DEFAULT_AGENT_PORT),
  SERIAL_TRACE: envBoolean(false),
  AGENT_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(["direct", "master", "slave"]).default("direct"),
  ),
  MEDICLOUD_AGENT_ID: envString(),
  MEDICLOUD_AGENT_SECRET: envString(),
  MEDICLOUD_ACCOUNT_ID: envString(),
  MEDICLOUD_API_URL: envString(),
  MEDICLOUD_PING_INTERVAL_MS: envNumber(DEFAULT_HEARTBEAT_INTERVAL_MS),
  DEFAULT_ORDER_PULL_INTERVAL_MS: envNumber(DEFAULT_ORDER_PULL_INTERVAL_MS),
  MASTER_HOST: envString(),
  MASTER_PORT: envNumber(DEFAULT_AGENT_PORT),
  SLAVE_ID: envString(),
  SLAVE_SECRET: envString(),
  MEDICLOUD_AGENT_DB_PATH: envString("./data/agent.db"),
});

export type AgentEnvironment = z.infer<typeof EnvSchema>;
