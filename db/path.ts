import { resolve } from "node:path";
import { env } from "../lib/env.ts";

export const DB_FILE_PATH = resolve(env.MEDICLOUD_AGENT_DB_PATH);
export const DB_PATH = `file:${DB_FILE_PATH.replaceAll("\\", "/")}`;
