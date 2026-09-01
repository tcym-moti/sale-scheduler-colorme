import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "./client";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationPaths = ["001_initial.sql", "002_verification_statuses.sql"].map((name) => join(currentDir, "..", "migrations", name));
const db = new Database();

try {
  for (const migrationPath of migrationPaths) await db.query(await readFile(migrationPath, "utf8"));
  console.log(JSON.stringify({ event: "database_migration_complete", migrations: migrationPaths.map((path) => path.split(/[\\/]/).pop()) }));
} finally {
  await db.close();
}
