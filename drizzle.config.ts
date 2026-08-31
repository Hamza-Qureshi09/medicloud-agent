import { defineConfig } from "drizzle-kit";
import { env } from "./lib/env.ts";

export const path = env.MEDICLOUD_DB_PATH;
if (!path) {
    throw new Error(
        "MEDICLOUD_DB_PATH is not defined!",
    );
}

export const DB_PATH = `file:${Deno.cwd()}/${path}`;

export default defineConfig({
    schema: "./db/schema.ts",

    out: "./drizzle",

    dialect: "sqlite",

    dbCredentials: {
        url: DB_PATH,
    },
});