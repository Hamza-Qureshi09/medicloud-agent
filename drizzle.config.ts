import { defineConfig } from "drizzle-kit";
import { DB_PATH } from "./db/path.ts";

export default defineConfig({
  schema: "./db/tables/*.ts",

  out: "./drizzle",

  dialect: "sqlite",

  dbCredentials: {
    url: DB_PATH,
  },
});
