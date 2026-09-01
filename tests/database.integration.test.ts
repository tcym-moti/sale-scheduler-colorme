import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSchedule, createShopForOAuth, Database, findOverlappingProductIds, claimDueJob } from "@sale-scheduler/database";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = describe.skipIf(!enabled);
let db: Database;
const shopIds: string[] = [];

suite("PostgreSQL queue and schedule integration", () => {
  beforeAll(async () => {
    db = new Database();
    await db.ping();
  });
  afterAll(async () => {
    for (const shopId of shopIds) await db.query("DELETE FROM shops WHERE id = $1", [shopId]);
    await db.close();
  });

  async function shop() {
    const value = await createShopForOAuth(db, `integration-${randomUUID()}`, "Integration Shop");
    shopIds.push(value.id);
    return value;
  }

  it("rejects overlapping product reservations", async () => {
    const value = await shop();
    const start = new Date(Date.now() + 60_000);
    const end = new Date(Date.now() + 120_000);
    await createSchedule(db, { id: randomUUID(), shopId: value.id, pricingMode: "FIXED", pricingValue: 800, startAt: start, endAt: end, items: [{ productId: 101, productName: "Overlap", originalPrice: 1000, scheduledPrice: 800 }] });
    expect(await findOverlappingProductIds(db, value.id, [101], new Date(start.getTime() + 10_000), new Date(end.getTime() + 10_000))).toEqual([101]);
    await expect(createSchedule(db, { id: randomUUID(), shopId: value.id, pricingMode: "FIXED", pricingValue: 700, startAt: new Date(start.getTime() + 10_000), endAt: new Date(end.getTime() + 10_000), items: [{ productId: 101, productName: "Overlap", originalPrice: 1000, scheduledPrice: 700 }] })).rejects.toThrow("SCHEDULE_OVERLAP");
  });

  it("claims one due item once even with concurrent workers", async () => {
    const value = await shop();
    const schedule = await createSchedule(db, { id: randomUUID(), shopId: value.id, pricingMode: "FIXED", pricingValue: 800, startAt: new Date(Date.now() - 5_000), endAt: new Date(Date.now() + 120_000), items: [{ productId: 102, productName: "Queue", originalPrice: 1000, scheduledPrice: 800 }] });
    const [first, second] = await Promise.all([claimDueJob(db, "integration-worker-a", 60), claimDueJob(db, "integration-worker-b", 60)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect([first, second].filter((job) => job?.itemId === schedule.items[0].id)).toHaveLength(1);
  });
});
