import type { Product, SchedulePreview } from "@sale-scheduler/shared";
import { ColormeApiError } from "@sale-scheduler/colorme-api";
import { findOverlappingProductIds } from "@sale-scheduler/database";
import { buildSchedulePreview, parseScheduleInput, type ParsedScheduleInput } from "./planner";
import { asObject } from "./http";
import { clientForShop, db } from "./server";
import type { ShopRow } from "@sale-scheduler/database";

export async function planSchedule(shop: ShopRow, body: unknown): Promise<{ input: ParsedScheduleInput; products: Product[]; preview: SchedulePreview }> {
  const input = parseScheduleInput(asObject(body));
  const { client, limiter } = await clientForShop(shop);
  const products: Product[] = [];
  for (const productId of input.productIds) {
    try {
      products.push(await client.getProduct(productId, { beforeRequest: () => limiter.acquire(shop.id) }));
    } catch (error) {
      if (error instanceof ColormeApiError && error.responseStatus === 404) continue;
      throw error;
    }
  }
  const overlapping = await findOverlappingProductIds(db(), shop.id, input.productIds, input.startAt, input.endAt);
  return { input, products, preview: buildSchedulePreview(input, products, overlapping) };
}
