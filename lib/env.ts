import { z } from "@zod/zod";

// Convert empty environment values to undefined so Zod defaults can apply.
const emptyToUndefined = (value: unknown) => {
	if (typeof value !== "string") return value;

	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
};

// Parse numeric environment values safely.
const envNumber = (fallback: number) =>
	z.preprocess(
		(value) => {
			const raw = emptyToUndefined(value);

			if (raw === undefined) return undefined;

			const parsed = Number(raw);
			return Number.isFinite(parsed) ? parsed : undefined;
		},
		z.number().default(fallback),
	);

// Parse boolean environment values.
const envBoolean = (fallback: boolean) =>
	z.preprocess(
		(value) => {
			const raw = emptyToUndefined(value);

			if (raw === undefined) return undefined;

			if (typeof raw === "string") {
				const normalized = raw.toLowerCase();

				if (["true", "1", "yes"].includes(normalized)) return true;
				if (["false", "0", "no"].includes(normalized)) return false;
			}

			return undefined;
		},
		z.boolean().default(fallback),
	);

// Parse and trim string environment values.
const envString = (fallback = "") =>
	z.preprocess(
		emptyToUndefined,
		z.string().default(fallback),
	);

const EnvSchema = z.object({
	// Machine SDK settings.
	MEDICLOUD_MACHINES_SDK_DB_PATH: envString("./data/machines.db"),
	MEDICLOUD_MACHINES_INTERNAL_HTTP_ENABLED: envBoolean(false),
	MEDICLOUD_AGENT_HTTP_HOST: envString("0.0.0.0"),
	MEDICLOUD_AGENT_HTTP_PORT: envNumber(5001),
	SERIAL_TRACE: envBoolean(false),

	// Agent mode.
	AGENT_MODE: z.preprocess(
		emptyToUndefined,
		z.enum(["direct", "master", "slave"]).default("direct"),
	),

	// MediCloud connection.
	MEDICLOUD_AGENT_ID: envString(),
	MEDICLOUD_AGENT_SECRET: envString(),
	MEDICLOUD_ACCOUNT_ID: envString(),
	MEDICLOUD_API_URL: envString(),

  // MediCloud Ping/Heartbeat/order/results pull/ping settings
	MEDICLOUD_PING_INTERVAL_MS: envNumber(30_000),
	DEFAULT_ORDER_PULL_INTERVAL_MS: envNumber(10_000),

	// Slave mode only settings.
	MASTER_HOST: envString(),
	MASTER_PORT: envNumber(5001),
	SLAVE_BOOTSTRAP_SECRET: envString(),

	// Agent MediCloud database.
	MEDICLOUD_DB_PATH: envString("./data/medicloud.db"),
});

const parsedEnv = EnvSchema.parse(Deno.env.toObject());

// Wildcard addresses can be used for binding,
// but not for connecting to the local machine SDK.
const LOOPBACK_HOST =
	parsedEnv.MEDICLOUD_AGENT_HTTP_HOST === "0.0.0.0" ||
	parsedEnv.MEDICLOUD_AGENT_HTTP_HOST === "::"
		? "127.0.0.1"
		: parsedEnv.MEDICLOUD_AGENT_HTTP_HOST;

export const env = {
	...parsedEnv,

	// Local URL used by the agent to access its own machine SDK.
	AGENT_LOCAL_URL:
		`http://${LOOPBACK_HOST}:${parsedEnv.MEDICLOUD_AGENT_HTTP_PORT}`,
};