import {
  calculateScheduledPrice,
  estimateRateLimitedProcessingSeconds,
  type PricingMode,
  type Product,
  type SchedulePreview,
  type SaleScheduleItemPreview,
  validateDiscountRate,
  validateSalePrice
} from "@sale-scheduler/shared";
import { ApiHttpError } from "./http";

export const MAX_SELECTED_PRODUCTS = 100;

export interface ParsedScheduleInput {
  productIds: number[];
  pricingMode: PricingMode;
  pricingValue: number;
  startAt: Date;
  endAt: Date;
}

export function parseScheduleInput(value: Record<string, unknown>): ParsedScheduleInput {
  if (!Array.isArray(value.productIds) || value.productIds.length === 0 || value.productIds.length > MAX_SELECTED_PRODUCTS) throw new ApiHttpError(400, "INVALID_INPUT", `商品は1〜${MAX_SELECTED_PRODUCTS}件選択してください。`);
  const productIds = [...new Set(value.productIds.map((item) => {
    const id = typeof item === "number" ? item : typeof item === "string" && /^\d+$/.test(item) ? Number(item) : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiHttpError(400, "INVALID_INPUT", "商品IDが正しくありません。");
    return id;
  }))];
  if (productIds.length !== value.productIds.length) throw new ApiHttpError(400, "INVALID_INPUT", "同じ商品を重複して選択しています。");
  const pricingMode = value.pricingMode === "FIXED" || value.pricingMode === "DISCOUNT_RATE" ? value.pricingMode : null;
  if (!pricingMode) throw new ApiHttpError(400, "INVALID_INPUT", "価格方式を選択してください。");
  const rawValue = typeof value.pricingValue === "number" ? value.pricingValue : typeof value.pricingValue === "string" && /^\d+$/.test(value.pricingValue.trim()) ? Number(value.pricingValue) : NaN;
  if (!Number.isSafeInteger(rawValue)) throw new ApiHttpError(400, "INVALID_INPUT", "セール価格または割引率を整数で指定してください。");
  const pricingError = pricingMode === "FIXED" ? validateSalePrice(rawValue) : validateDiscountRate(rawValue);
  if (pricingError) throw new ApiHttpError(422, pricingMode === "FIXED" ? "PRICE_TOO_LOW" : "INVALID_INPUT", pricingError);
  const startAt = parseDate(value.startAt, "開始日時");
  const endAt = parseDate(value.endAt, "終了日時");
  if (endAt.getTime() <= startAt.getTime()) throw new ApiHttpError(422, "SCHEDULE_ENDED_BEFORE_START");
  if (startAt.getTime() <= Date.now()) throw new ApiHttpError(422, "INVALID_INPUT", "開始日時は現在より後に設定してください。");
  return { productIds, pricingMode, pricingValue: rawValue, startAt, endAt };
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string") throw new ApiHttpError(400, "INVALID_INPUT", `${field}を入力してください。`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ApiHttpError(400, "INVALID_INPUT", `${field}が正しくありません。`);
  return date;
}

function actualDiscountRate(currentPrice: number, scheduledPrice: number): number {
  return Math.round(((currentPrice - scheduledPrice) / currentPrice) * 10000) / 100;
}

export function buildSchedulePreview(input: ParsedScheduleInput, products: Product[], overlappingProductIds: number[] = []): SchedulePreview {
  const overlapSet = new Set(overlappingProductIds);
  const items: SaleScheduleItemPreview[] = input.productIds.map((productId) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return { productId, productName: `商品 ${productId}`, currentPrice: null, scheduledPrice: null, discountAmount: null, discountRate: null, valid: false, errorCode: "PRODUCT_NOT_FOUND", errorMessage: "商品を取得できませんでした。" };
    if (product.variantCount > 0) return { productId, productName: product.name, currentPrice: product.salesPrice, scheduledPrice: null, discountAmount: null, discountRate: null, valid: false, errorCode: "PRODUCT_HAS_VARIANTS", errorMessage: "バリエーション商品はMVPの対象外です。" };
    if (product.salesPrice === null) return { productId, productName: product.name, currentPrice: null, scheduledPrice: null, discountAmount: null, discountRate: null, valid: false, errorCode: "COLORME_VALIDATION_ERROR", errorMessage: "販売価格を取得できないため対象にできません。" };
    if (overlapSet.has(productId)) return { productId, productName: product.name, currentPrice: product.salesPrice, scheduledPrice: null, discountAmount: null, discountRate: null, valid: false, errorCode: "SCHEDULE_OVERLAP", errorMessage: "同じ商品に重複する予約があります。期間を変更してください。" };
    const scheduledPrice = calculateScheduledPrice(input.pricingMode, input.pricingValue, product.salesPrice);
    const error = scheduledPrice === null ? "セール価格を算出できません。" : validateSalePrice(scheduledPrice);
    if (error || scheduledPrice === null) return { productId, productName: product.name, currentPrice: product.salesPrice, scheduledPrice, discountAmount: null, discountRate: null, valid: false, errorCode: scheduledPrice !== null && scheduledPrice < 100 ? "PRICE_TOO_LOW" : "INVALID_INPUT", errorMessage: error ?? "セール価格を算出できません。" };
    return { productId, productName: product.name, currentPrice: product.salesPrice, scheduledPrice, discountAmount: product.salesPrice - scheduledPrice, discountRate: actualDiscountRate(product.salesPrice, scheduledPrice), valid: true, errorCode: null, errorMessage: null };
  });
  const estimatedSeconds = estimateRateLimitedProcessingSeconds(input.productIds.length);
  return { pricingMode: input.pricingMode, value: input.pricingValue, startAt: input.startAt.toISOString(), endAt: input.endAt.toISOString(), timeZone: "Asia/Tokyo", estimatedStartSeconds: estimatedSeconds, estimatedEndSeconds: estimatedSeconds, items, valid: items.length > 0 && items.every((item) => item.valid) };
}
