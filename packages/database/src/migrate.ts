import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "./client";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(currentDir, "..", "migrations", "001_initial.sql");
const db = new Database();

try {
  await db.query(await readFile(migrationPath, "utf8"));
  console.log(JSON.stringify({ event: "database_migration_complete", migration: "001_initial.sql" }));
} finally {
  await db.close();
}
