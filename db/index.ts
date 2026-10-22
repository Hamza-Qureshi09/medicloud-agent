import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_FILE_PATH } from "./path.ts";

Deno.mkdirSync(dirname(DB_FILE_PATH), { recursive: true });

const sqlite = new DatabaseSync(DB_FILE_PATH);

sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle({
	client: sqlite,
});

/**
 * Initializes the MediCloud Agent database.
 *
 * The SQLite connection is provided by Node's built-in node:sqlite driver.
 * Drizzle is used only for schema/migration management.
 */
export async function initDB(): Promise<void> {
	console.log("SQLite database:", DB_FILE_PATH);

	await migrate(db, {
		migrationsFolder: fileURLToPath(
			new URL("../drizzle/", import.meta.url),
		),
	});
}
