import { NextResponse } from "next/server";
import { requestScheduleEnd } from "@sale-scheduler/database";
import { jsonError, jsonOk, requestIdFrom } from "../../../../../lib/http";
import { db, requireShop, verifyCsrf } from "../../../../../lib/server";

interface Context { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    await verifyCsrf(request);
    const shop = await requireShop();
    const { id } = await context.params;
    const schedule = await requestScheduleEnd(db(), shop.id, id);
    if (!schedule) return jsonError({ status: 404, code: "INVALID_INPUT", message: "予約が見つかりません。" }, requestId);
    return jsonOk({ schedule, action: "END_REQUESTED" }, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
