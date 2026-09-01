export const JST_TIME_ZONE = "Asia/Tokyo" as const;
export const MIN_SALE_PRICE = 100;

export const PRICING_MODES = ["FIXED", "DISCOUNT_RATE"] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const SCHEDULE_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "STARTING",
  "ACTIVE",
  "ENDING",
  "COMPLETED",
  "PARTIAL",
  "CONFLICT",
  "FAILED",
  "CANCELLED"
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const ITEM_STATUSES = [
  "PENDING",
  "STARTING",
  "ACTIVE",
  "ENDING",
  "COMPLETED",
  "PARTIAL",
  "CONFLICT",
  "FAILED",
  "CANCELLED",
  "RETRY_WAIT"
] as const;
export type ScheduleItemStatus = (typeof ITEM_STATUSES)[number];

export const JOB_OPERATIONS = ["START", "END"] as const;
export type JobOperation = (typeof JOB_OPERATIONS)[number];

export const JOB_STATUSES = ["QUEUED", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ERROR_CODES = [
  "INVALID_INPUT",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_HAS_VARIANTS",
  "PRICE_TOO_LOW",
  "PRICE_NOT_INTEGER",
  "SCHEDULE_OVERLAP",
  "SCHEDULE_ENDED_BEFORE_START",
  "CONFLICT",
  "COLORME_RATE_LIMIT",
  "COLORME_TEMPORARY_ERROR",
  "COLORME_AUTH_ERROR",
  "COLORME_VALIDATION_ERROR",
  "INTERNAL_ERROR"
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface Product {
  id: number;
  name: string;
  salesPrice: number | null;
  salesPriceIncludingTax: number | null;
  price: number | null;
  membersPrice: number | null;
  modelNumber: string | null;
  variantCount: number;
}

export interface ShopContext {
  id: string;
  accountId: string;
  shopName: string;
  status: "ACTIVE" | "UNINSTALLED";
}

export interface SaleScheduleItemPreview {
  productId: number;
  productName: string;
  currentPrice: number | null;
  scheduledPrice: number | null;
  discountAmount: number | null;
  discountRate: number | null;
  valid: boolean;
  errorCode: ErrorCode | null;
  errorMessage: string | null;
}

export interface SchedulePreview {
  pricingMode: PricingMode;
  value: number;
  startAt: string;
  endAt: string;
  timeZone: typeof JST_TIME_ZONE;
  items: SaleScheduleItemPreview[];
  valid: boolean;
}

export interface ScheduleSummary {
  id: string;
  status: ScheduleStatus;
  pricingMode: PricingMode;
  pricingValue: number;
  startAt: string;
  endAt: string;
  itemCount: number;
  completedCount: number;
  activeCount: number;
  failedCount: number;
  conflictCount: number;
  createdAt: string;
}

export interface ScheduleItemView {
  id: string;
  productId: number;
  productName: string;
  originalPrice: number | null;
  effectiveOriginalPrice: number | null;
  scheduledPrice: number;
  currentPrice: number | null;
  status: ScheduleItemStatus;
  conflictReason: string | null;
  lastError: string | null;
  retryCount: number;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ScheduleDetail extends ScheduleSummary {
  items: ScheduleItemView[];
}

export function calculateDiscountedPrice(price: number, discountRate: number): number {
  if (!Number.isSafeInteger(price) || !Number.isSafeInteger(discountRate)) return NaN;
  return Math.floor((price * (100 - discountRate)) / 100);
}

export function validateDiscountRate(value: number): string | null {
  if (!Number.isSafeInteger(value) || value < 1 || value > 99) return "割引率は1〜99の整数で指定してください。";
  return null;
}

export function validateSalePrice(value: number): string | null {
  if (!Number.isSafeInteger(value)) return "セール価格は整数円で指定してください。";
  if (value < MIN_SALE_PRICE) return `セール価格は${MIN_SALE_PRICE}円以上で指定してください。`;
  return null;
}

export function calculateScheduledPrice(mode: PricingMode, value: number, currentPrice: number | null): number | null {
  if (currentPrice === null) return null;
  const price = mode === "FIXED" ? value : calculateDiscountedPrice(currentPrice, value);
  return Number.isSafeInteger(price) ? price : null;
}

export function schedulesOverlap(startAt: Date, endAt: Date, otherStartAt: Date, otherEndAt: Date): boolean {
  return startAt.getTime() < otherEndAt.getTime() && endAt.getTime() > otherStartAt.getTime();
}

export function shouldRestore(currentPrice: number | null, scheduledPrice: number): boolean {
  return currentPrice !== null && currentPrice === scheduledPrice;
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 503 || status >= 500;
}

const scheduleTransitions: Record<ScheduleStatus, readonly ScheduleStatus[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["STARTING", "CANCELLED", "FAILED"],
  STARTING: ["ACTIVE", "PARTIAL", "FAILED", "CANCELLED"],
  ACTIVE: ["ENDING", "PARTIAL", "CONFLICT", "CANCELLED"],
  ENDING: ["COMPLETED", "PARTIAL", "CONFLICT", "FAILED"],
  COMPLETED: [],
  PARTIAL: ["ENDING", "COMPLETED", "CONFLICT", "FAILED"],
  CONFLICT: ["ENDING", "COMPLETED", "CANCELLED"],
  FAILED: ["SCHEDULED", "CANCELLED"],
  CANCELLED: []
};

export function canTransitionSchedule(from: ScheduleStatus, to: ScheduleStatus): boolean {
  return from === to || scheduleTransitions[from].includes(to);
}
