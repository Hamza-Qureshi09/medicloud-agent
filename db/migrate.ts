import { initDB } from "./index.ts";

await initDB();
console.info("Agent database migrations applied.");
