import { Database } from "./client";

const db = new Database();
try {
  const result = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('shops', 'sale_schedules', 'sale_schedule_items', 'sale_jobs', 'audit_logs') ORDER BY table_name");
  console.log(JSON.stringify({ event: "database_check", tables: result.rows.map((row) => row.table_name) }));
} finally {
  await db.close();
}
