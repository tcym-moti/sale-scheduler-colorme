import { NextResponse } from "next/server";
import { getScheduleForShop, getScheduleItemsForShop, listAuditForSchedule } from "@sale-scheduler/database";
import { jsonError, jsonOk, requestIdFrom } from "../../../../lib/http";
import { detailView } from "../../../../lib/serializers";
import { db, requireShop } from "../../../../lib/server";

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    const shop = await requireShop();
    const { id } = await context.params;
    const schedule = await getScheduleForShop(db(), shop.id, id);
    if (!schedule) return jsonError({ status: 404, code: "INVALID_INPUT", message: "予約が見つかりません。" }, requestId);
    const items = await getScheduleItemsForShop(db(), shop.id, id);
    const audit = await listAuditForSchedule(db(), shop.id, id);
    return jsonOk({ schedule: detailView(schedule, items), audit }, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
