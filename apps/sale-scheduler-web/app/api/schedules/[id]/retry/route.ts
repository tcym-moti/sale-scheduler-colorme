import { NextResponse } from "next/server";
import { retryFailedSchedule } from "@sale-scheduler/database";
import { jsonError, jsonOk, requestIdFrom } from "../../../../../lib/http";
import { db, requireShop, verifyCsrf } from "../../../../../lib/server";

interface Context { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    await verifyCsrf(request);
    const shop = await requireShop();
    const { id } = await context.params;
    const result = await retryFailedSchedule(db(), shop.id, id);
    if (!result.schedule) return jsonError({ status: 404, code: "INVALID_INPUT", message: "予約が見つかりません。" }, requestId);
    return jsonOk({ schedule: result.schedule, retried: result.retried }, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
