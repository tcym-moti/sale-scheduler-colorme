import { describe, expect, it } from "vitest";
import { calculateDiscountedPrice, calculateScheduledPrice, canTransitionSchedule, schedulesOverlap, shouldRestore, validateDiscountRate, validateSalePrice } from "@sale-scheduler/shared";

describe("sale price rules", () => {
  it("calculates discount prices by rounding down to integer yen", () => {
    expect(calculateDiscountedPrice(5000, 20)).toBe(4000);
    expect(calculateDiscountedPrice(3980, 20)).toBe(3184);
    expect(calculateScheduledPrice("DISCOUNT_RATE", 20, 101)).toBe(80);
  });
  it("validates fixed prices and rates", () => {
    expect(validateSalePrice(99)).not.toBeNull();
    expect(validateSalePrice(100)).toBeNull();
    expect(validateSalePrice(100.5)).not.toBeNull();
    expect(validateDiscountRate(0)).not.toBeNull();
    expect(validateDiscountRate(99)).toBeNull();
    expect(validateDiscountRate(100)).not.toBeNull();
  });
});

describe("schedule safety rules", () => {
  const start = new Date("2026-09-01T00:00:00Z");
  const end = new Date("2026-09-02T00:00:00Z");
  it("detects overlapping half-open intervals", () => {
    expect(schedulesOverlap(start, end, new Date("2026-09-01T12:00:00Z"), new Date("2026-09-03T00:00:00Z"))).toBe(true);
    expect(schedulesOverlap(start, end, end, new Date("2026-09-03T00:00:00Z"))).toBe(false);
  });
  it("restores only when the current price is still the scheduled price", () => {
    expect(shouldRestore(3980, 3980)).toBe(true);
    expect(shouldRestore(4500, 3980)).toBe(false);
    expect(shouldRestore(null, 3980)).toBe(false);
  });
  it("allows only defined schedule transitions", () => {
    expect(canTransitionSchedule("SCHEDULED", "STARTING")).toBe(true);
    expect(canTransitionSchedule("ACTIVE", "ENDING")).toBe(true);
    expect(canTransitionSchedule("ACTIVE", "COMPLETED")).toBe(false);
    expect(canTransitionSchedule("COMPLETED", "ACTIVE")).toBe(false);
  });
});
