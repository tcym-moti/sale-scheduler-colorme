import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ColormeClient } from "@sale-scheduler/colorme-api";
import { claimDueJob, createSchedule, createShopForOAuth, Database, getScheduleItemsForShop, getScheduleForShop, listAuditForSchedule, requestScheduleEnd, recoverExpiredJobs } from "@sale-scheduler/database";
import { NoopRateLimiter } from "@sale-scheduler/jobs";
import { processClaimedJob, type JobExecutorDependencies } from "../apps/sale-scheduler-worker/src/executor";
import { FakeColormeApi } from "./fake-colorme";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = describe.skipIf(!enabled);
let db: Database;
let fake: FakeColormeApi;
let baseUrl: string;
const shopIds: string[] = [];
const previousVerifyMaxAttempts = process.env.VERIFY_MAX_ATTEMPTS;
const previousVerifyBackoffMs = process.env.VERIFY_BACKOFF_MS;

suite("worker price safety integration", () => {
  beforeAll(async () => {
    db = new Database();
    await db.ping();
    fake = new FakeColormeApi([
      { id: 201, name: "通常商品", sales_price: 1000 },
      { id: 202, name: "Conflict商品", sales_price: 1000 },
      { id: 203, name: "429商品", sales_price: 1000 },
      { id: 204, name: "503商品", sales_price: 1000 },
      { id: 205, name: "Cancel商品", sales_price: 1000 },
      { id: 206, name: "Restart商品", sales_price: 1000 },
      { id: 207, name: "対象外商品", sales_price: 1000, variants: [{ id: 1 }] },
      { id: 208, name: "部分成功商品", sales_price: 1000 },
      { id: 209, name: "遅延開始商品", sales_price: 1000 },
      { id: 210, name: "遅延終了商品", sales_price: 1000 },
      { id: 211, name: "確認不能商品", sales_price: 1000 },
      { id: 212, name: "第三価格商品", sales_price: 1000 }
    ]);
    baseUrl = await fake.start();
    process.env.VERIFY_MAX_ATTEMPTS = "5";
    process.env.VERIFY_BACKOFF_MS = "1";
  });
  afterAll(async () => {
    for (const shopId of shopIds) await db.query("DELETE FROM shops WHERE id = $1", [shopId]);
    await fake.close();
    await db.close();
    if (previousVerifyMaxAttempts === undefined) delete process.env.VERIFY_MAX_ATTEMPTS;
    else process.env.VERIFY_MAX_ATTEMPTS = previousVerifyMaxAttempts;
    if (previousVerifyBackoffMs === undefined) delete process.env.VERIFY_BACKOFF_MS;
    else process.env.VERIFY_BACKOFF_MS = previousVerifyBackoffMs;
  });

  async function shop() {
    const value = await createShopForOAuth(db, `worker-${randomUUID()}`, "Worker Integration Shop");
    shopIds.push(value.id);
    return value;
  }

  function dependencies(): JobExecutorDependencies {
    return { db, limiter: new NoopRateLimiter(), getClient: async () => new ColormeClient("fake-token", { baseUrl }) };
  }

  async function scheduleFor(shopId: string, productId: number, scheduledPrice: number, startAt = new Date(Date.now() - 5_000), endAt = new Date(Date.now() + 120_000)) {
    return createSchedule(db, { id: randomUUID(), shopId, pricingMode: "FIXED", pricingValue: scheduledPrice, startAt, endAt, items: [{ productId, productName: fake.product(productId)?.name ?? "Fake", originalPrice: 1000, scheduledPrice }] });
  }

  async function runStart(shopId: string, productId: number, scheduledPrice: number) {
    const schedule = await scheduleFor(shopId, productId, scheduledPrice);
    const job = await claimDueJob(db, "worker-test", 60);
    expect(job?.operation).toBe("START");
    if (!job) throw new Error("start job was not claimed");
    await processClaimedJob(job, dependencies());
    return schedule;
  }

  async function makeEndDue(scheduleId: string) {
    await db.query("UPDATE sale_jobs SET run_at = NOW() WHERE schedule_id = $1 AND operation = 'END'", [scheduleId]);
    const job = await claimDueJob(db, "worker-test", 60);
    expect(job?.operation).toBe("END");
    if (!job) throw new Error("end job was not claimed");
    return job;
  }

  it("changes 1000 to 800 and safely restores 1000", async () => {
    const value = await shop();
    const schedule = await runStart(value.id, 201, 800);
    expect(fake.product(201)?.sales_price).toBe(800);
    const endJob = await makeEndDue(schedule.schedule.id);
    await processClaimedJob(endJob, dependencies());
    expect(fake.product(201)?.sales_price).toBe(1000);
    expect((await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0].status).toBe("COMPLETED");
  });

  it("keeps a manual price change and marks the item CONFLICT", async () => {
    const value = await shop();
    const schedule = await runStart(value.id, 202, 800);
    fake.setPrice(202, 900);
    const putCountBeforeEnd = fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/202")).length;
    const endJob = await makeEndDue(schedule.schedule.id);
    await processClaimedJob(endJob, dependencies());
    const item = (await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0];
    expect(fake.product(202)?.sales_price).toBe(900);
    expect(fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/202")).length).toBe(putCountBeforeEnd);
    expect(item.status).toBe("CONFLICT");
    expect(item.effectiveOriginalPrice).toBe(1000);
    expect(item.conflictReason).toContain("自動復元しませんでした");
  });

  it("retries a delayed start verification without marking a conflict", async () => {
    const value = await shop();
    fake.delayNextWriteVerification(209, [1000]);
    const schedule = await runStart(value.id, 209, 800);
    const item = (await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0];
    const audits = await listAuditForSchedule(db, value.id, schedule.schedule.id);
    expect(fake.product(209)?.sales_price).toBe(800);
    expect(item.status).toBe("ACTIVE");
    const verificationAudits = audits.filter((audit) => audit.eventType === "START_PRICE_UPDATE_VERIFICATION");
    expect(verificationAudits).toHaveLength(2);
    expect(verificationAudits.at(-1)?.metadata).toMatchObject({ expectedPrice: 800, observedPrice: 800, attempt: 2, result: "CONFIRMED" });
  });

  it("retries a delayed end verification and completes without a conflict", async () => {
    const value = await shop();
    const schedule = await runStart(value.id, 210, 800);
    fake.delayNextWriteVerification(210, [800, 800]);
    const endJob = await makeEndDue(schedule.schedule.id);
    expect(await processClaimedJob(endJob, dependencies())).toBe("COMPLETED");
    const item = (await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0];
    const audits = await listAuditForSchedule(db, value.id, schedule.schedule.id);
    expect(fake.product(210)?.sales_price).toBe(1000);
    expect(item.status).toBe("COMPLETED");
    expect(audits.filter((audit) => audit.eventType === "END_PRICE_UPDATE_VERIFICATION")).toHaveLength(3);
    expect(audits.some((audit) => audit.eventType === "END_VERIFY_UNKNOWN" || audit.eventType === "END_POST_WRITE_DIVERGENCE")).toBe(false);
  });

  it("marks a stale post-write read VERIFY_UNKNOWN without another PUT", async () => {
    const value = await shop();
    const schedule = await runStart(value.id, 211, 800);
    fake.delayNextWriteVerification(211, [800, 800, 800, 800, 800]);
    const putCountBeforeEnd = fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/211")).length;
    const endJob = await makeEndDue(schedule.schedule.id);
    expect(await processClaimedJob(endJob, dependencies())).toBe("VERIFY_UNKNOWN");
    const item = (await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0];
    const scheduleRow = await getScheduleForShop(db, value.id, schedule.schedule.id);
    const audits = await listAuditForSchedule(db, value.id, schedule.schedule.id);
    expect(fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/211")).length).toBe(putCountBeforeEnd + 1);
    expect(item.status).toBe("VERIFY_UNKNOWN");
    expect(scheduleRow?.status).toBe("FAILED");
    expect(audits.filter((audit) => audit.eventType === "END_PRICE_UPDATE_VERIFICATION")).toHaveLength(5);
    expect(audits.at(-1)?.eventType).toBe("END_VERIFY_UNKNOWN");
    expect(audits.at(-1)?.metadata).toMatchObject({ expectedPrice: 1000, observedPrice: 800, verificationAttempts: 5, finalResult: "VERIFY_UNKNOWN" });
  });

  it("marks a persistent third post-write price as POST_WRITE_DIVERGENCE without another PUT", async () => {
    const value = await shop();
    const schedule = await runStart(value.id, 212, 800);
    fake.delayNextWriteVerification(212, [900, 900, 900, 900, 900]);
    const putCountBeforeEnd = fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/212")).length;
    const endJob = await makeEndDue(schedule.schedule.id);
    expect(await processClaimedJob(endJob, dependencies())).toBe("POST_WRITE_DIVERGENCE");
    const item = (await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0];
    const audits = await listAuditForSchedule(db, value.id, schedule.schedule.id);
    expect(fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/212")).length).toBe(putCountBeforeEnd + 1);
    expect(item.status).toBe("POST_WRITE_DIVERGENCE");
    expect(item.conflictReason).toBeNull();
    expect(audits.at(-1)?.eventType).toBe("END_POST_WRITE_DIVERGENCE");
    expect(audits.at(-1)?.metadata).toMatchObject({ expectedPrice: 1000, observedPrice: 900, verificationAttempts: 5, finalResult: "POST_WRITE_DIVERGENCE" });
  });

  it("retries a 429 and then completes the start", async () => {
    const value = await shop();
    const schedule = await scheduleFor(value.id, 203, 800);
    fake.failNext("PUT", /\/v1\/products\/203$/, 429);
    const first = await claimDueJob(db, "worker-test", 60);
    if (!first) throw new Error("start job was not claimed");
    expect(await processClaimedJob(first, dependencies())).toBe("RETRY_WAIT");
    await db.query("UPDATE sale_jobs SET run_at = NOW() WHERE id = $1", [first.id]);
    const retry = await claimDueJob(db, "worker-test", 60);
    if (!retry) throw new Error("retry job was not claimed");
    await processClaimedJob(retry, dependencies());
    expect(fake.product(203)?.sales_price).toBe(800);
    expect((await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0].status).toBe("ACTIVE");
  });

  it("retries a 503 during restore and then completes the end", async () => {
    const value = await shop();
    const schedule = await runStart(value.id, 204, 800);
    const endJob = await makeEndDue(schedule.schedule.id);
    fake.failNext("PUT", /\/v1\/products\/204$/, 503);
    expect(await processClaimedJob(endJob, dependencies())).toBe("RETRY_WAIT");
    await db.query("UPDATE sale_jobs SET run_at = NOW() WHERE id = $1", [endJob.id]);
    const retry = await claimDueJob(db, "worker-test", 60);
    if (!retry) throw new Error("end retry job was not claimed");
    await processClaimedJob(retry, dependencies());
    expect(fake.product(204)?.sales_price).toBe(1000);
    expect((await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0].status).toBe("COMPLETED");
  });

  it("does not call the API when cancelling before start", async () => {
    const value = await shop();
    const schedule = await scheduleFor(value.id, 205, 800, new Date(Date.now() + 60_000), new Date(Date.now() + 120_000));
    const callCount = fake.calls.length;
    const { cancelScheduledSchedule } = await import("@sale-scheduler/database");
    await cancelScheduledSchedule(db, value.id, schedule.schedule.id);
    expect(fake.calls.length).toBe(callCount);
    expect((await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0].status).toBe("CANCELLED");
  });

  it("reconciles an in-flight mutation after a worker restart without a duplicate PUT", async () => {
    const value = await shop();
    const schedule = await scheduleFor(value.id, 206, 800);
    const claimed = await claimDueJob(db, "crashed-worker", 1);
    if (!claimed) throw new Error("start job was not claimed");
    await db.query("UPDATE sale_jobs SET mutation_state = 'IN_FLIGHT', lease_until = NOW() - INTERVAL '1 second' WHERE id = $1", [claimed.id]);
    fake.setPrice(206, 800);
    const callsBefore = fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/206")).length;
    await recoverExpiredJobs(db);
    const recovered = await claimDueJob(db, "restarted-worker", 60);
    if (!recovered) throw new Error("recovered job was not claimed");
    await processClaimedJob(recovered, dependencies());
    const callsAfter = fake.calls.filter((call) => call.method === "PUT" && call.path.endsWith("/206")).length;
    expect(callsAfter).toBe(callsBefore);
    expect((await getScheduleItemsForShop(db, value.id, schedule.schedule.id))[0].status).toBe("ACTIVE");
  });

  it("treats active cancellation as an end-and-restore operation", async () => {
    const value = await shop();
    const schedule = await runStart(value.id, 201, 750);
    await requestScheduleEnd(db, value.id, schedule.schedule.id);
    const endJob = await makeEndDue(schedule.schedule.id);
    await processClaimedJob(endJob, dependencies());
    expect(fake.product(201)?.sales_price).toBe(1000);
  });

  it("continues other items when one item fails permanently", async () => {
    const value = await shop();
    const schedule = await createSchedule(db, {
      id: randomUUID(), shopId: value.id, pricingMode: "FIXED", pricingValue: 800,
      startAt: new Date(Date.now() - 5_000), endAt: new Date(Date.now() + 120_000),
      items: [
        { productId: 207, productName: "対象外商品", originalPrice: 1000, scheduledPrice: 800 },
        { productId: 208, productName: "部分成功商品", originalPrice: 1000, scheduledPrice: 800 }
      ]
    });
    const first = await claimDueJob(db, "worker-test", 60);
    if (!first) throw new Error("first partial job was not claimed");
    await processClaimedJob(first, dependencies());
    const second = await claimDueJob(db, "worker-test", 60);
    if (!second) throw new Error("second partial job was blocked");
    await processClaimedJob(second, dependencies());
    const items = await getScheduleItemsForShop(db, value.id, schedule.schedule.id);
    expect(items.map((item) => item.status).sort()).toEqual(["ACTIVE", "FAILED"]);
  });
});
