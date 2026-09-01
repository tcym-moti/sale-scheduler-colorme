import { Database, claimDueJob, recoverExpiredJobs } from "@sale-scheduler/database";
import { createWorkerDependencies, processClaimedJob } from "./executor";

const pollIntervalMs = Math.max(250, Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000));
const leaseSeconds = Math.max(30, Number(process.env.WORKER_LEASE_SECONDS ?? 300));
const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;

async function run(): Promise<void> {
  const db = new Database();
  const dependencies = { ...createWorkerDependencies(db, { workerId }), workerId };
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    while (!stopping) {
      await recoverExpiredJobs(db);
      const job = await claimDueJob(db, workerId, leaseSeconds);
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }
      try {
        await processClaimedJob(job, dependencies);
      } catch (error) {
        // The lease makes an unexpected worker crash recoverable. Keep this
        // log deliberately generic so tokens and response bodies are never logged.
        console.error(JSON.stringify({ event: "worker_job_unhandled_error", jobId: job.id, scheduleId: job.scheduleId, error: error instanceof Error ? error.message : "unknown" }));
      }
    }
  } finally {
    await db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error: unknown) => {
    console.error(JSON.stringify({ event: "worker_fatal", error: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 1;
  });
}

export * from "./executor";
