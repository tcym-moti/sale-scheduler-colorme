import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSchedule, listScheduleSummaries, recordAudit } from "@sale-scheduler/database";
import { jsonError, jsonOk, requestIdFrom } from "../../../lib/http";
import { detailView, summaryView } from "../../../lib/serializers";
import { planSchedule } from "../../../lib/schedule-data";
import { db, requireShop, verifyCsrf } from "../../../lib/server";

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    const shop = await requireShop();
    const rows = await listScheduleSummaries(db(), shop.id);
    return jsonOk({ schedules: rows.map(summaryView) }, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    await verifyCsrf(request);
    const shop = await requireShop();
    const planned = await planSchedule(shop, await request.json());
    if (!planned.preview.valid) {
      const firstError = planned.preview.items.find((item) => !item.valid && item.errorMessage);
      return jsonError({ status: 422, code: firstError?.errorCode ?? "INVALID_INPUT", message: firstError?.errorMessage ?? "入力内容を確認してください。" }, requestId);
    }
    const scheduleId = randomUUID();
    const result = await createSchedule(db(), {
      id: scheduleId,
      shopId: shop.id,
      pricingMode: planned.input.pricingMode,
      pricingValue: planned.input.pricingValue,
      startAt: planned.input.startAt,
      endAt: planned.input.endAt,
      items: planned.preview.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        originalPrice: item.currentPrice as number,
        scheduledPrice: item.scheduledPrice as number
      }))
    });
    await recordAudit(db(), { requestId, shopId: shop.id, scheduleId, eventType: "SCHEDULE_CREATED", metadata: { itemCount: result.items.length, pricingMode: planned.input.pricingMode } });
    return jsonOk({ schedule: detailView(result.schedule, result.items) }, requestId, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "SCHEDULE_OVERLAP") return jsonError({ status: 409, code: "SCHEDULE_OVERLAP", message: "同じ商品に重複する予約があります。期間を変更してください。" }, requestId);
    return jsonError(error, requestId);
  }
}
