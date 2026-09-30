import { EnvSchema } from "../schemas/env.ts";

const parsedEnv = EnvSchema.parse(Deno.env.toObject());
const host = ["0.0.0.0", "::"].includes(parsedEnv.MEDICLOUD_AGENT_HTTP_HOST)
  ? "127.0.0.1"
  : parsedEnv.MEDICLOUD_AGENT_HTTP_HOST;

export const env = {
  ...parsedEnv,
  AGENT_LOCAL_URL: `http://${host}:${parsedEnv.MEDICLOUD_AGENT_HTTP_PORT}`,
};

export function validateEnvironment(): void {
  const required = env.AGENT_MODE === "slave"
    ? (["MASTER_HOST", "SLAVE_ID", "SLAVE_SECRET"] as const)
    : ([
      "MEDICLOUD_AGENT_ID",
      "MEDICLOUD_AGENT_SECRET",
      "MEDICLOUD_ACCOUNT_ID",
      "MEDICLOUD_API_URL",
    ] as const);
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`${missing.join(", ")} required in ${env.AGENT_MODE} mode`);
  }
}
