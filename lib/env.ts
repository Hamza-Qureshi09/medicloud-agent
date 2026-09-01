

export const env = {
  // Machine Agent details
  MEDICLOUD_MACHINES_SDK_DB_PATH: Deno.env.get("MEDICLOUD_MACHINES_SDK_DB_PATH") ?? "./data/machines.db",
  MEDICLOUD_MACHINES_INTERNAL_HTTP_ENABLED: Deno.env.get("MEDICLOUD_MACHINES_INTERNAL_HTTP_ENABLED") ?? "true",
  MEDICLOUD_AGENT_HTTP_HOST: Deno.env.get("MEDICLOUD_AGENT_HTTP_HOST") ?? "0.0.0.0",
  MEDICLOUD_AGENT_HTTP_PORT: Number(Deno.env.get("MEDICLOUD_AGENT_HTTP_PORT") ?? 5001),
  SERIAL_TRACE: Number(Deno.env.get("SERIAL_TRACE") ?? "false"),

  // Agent Mode (direct | master | slave)
  AGENT_MODE: (Deno.env.get("AGENT_MODE") as "direct" | "master" | "slave"),

  // MediCloud connection (direct + master modes only)
  MEDICLOUD_AGENT_ID: Deno.env.get("MEDICLOUD_AGENT_ID") ?? "",
  MEDICLOUD_AGENT_SECRET: Deno.env.get("MEDICLOUD_AGENT_SECRET") ?? "",
  MEDICLOUD_ACCOUNT_ID: Deno.env.get("MEDICLOUD_ACCOUNT_ID") ?? "",
  AGENT_PUBLIC_URL: Deno.env.get("AGENT_PUBLIC_URL") ?? "",
  MEDICLOUD_API_URL: Deno.env.get("MEDICLOUD_API_URL") ?? "",
  MEDICLOUD_PING_INTERVAL_MS: Number(Deno.env.get("MEDICLOUD_PING_INTERVAL_MS") ?? 30000),

  // order/results pull/ping intervals
  DEFAULT_ORDER_PULL_INTERVAL_MS: Number(Deno.env.get("DEFAULT_ORDER_PULL_INTERVAL_MS") ?? 10_000),

  // Slave mode only
  MASTER_HOST: Deno.env.get("MASTER_HOST") ?? "",
  MASTER_PORT: Number(Deno.env.get("MASTER_PORT") ?? 5001),
  SLAVE_BOOTSTRAP_SECRET: Deno.env.get("SLAVE_BOOTSTRAP_SECRET") ?? "",

  // Agent Medicloud DB (separate from machines.db)
  MEDICLOUD_DB_PATH: Deno.env.get("MEDICLOUD_DB_PATH") ?? "./data/agentMedicloud.db",
};
