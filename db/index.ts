import { DB_FILE_PATH, DB_PATH } from "./path.ts";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

Deno.mkdirSync(dirname(DB_FILE_PATH), { recursive: true });
const client = createClient({ url: DB_PATH });

export const db = drizzle({ client });

/**
 * Initializes the MediCloud Agent database.
 * Enables WAL mode for better concurrency and applies any pending Drizzle migrations.
 */
export async function initDB(): Promise<void> {
  const result = await client.execute("PRAGMA journal_mode = WAL;");
  console.log("SQLite journal mode:", result.rows);

  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)),
  });
}
