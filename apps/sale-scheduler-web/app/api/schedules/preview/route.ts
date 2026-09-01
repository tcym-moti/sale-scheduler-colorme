import { NextResponse } from "next/server";
import { jsonError, jsonOk, requestIdFrom } from "../../../../lib/http";
import { planSchedule } from "../../../../lib/schedule-data";
import { requireShop } from "../../../../lib/server";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    const shop = await requireShop();
    const result = await planSchedule(shop, await request.json());
    return jsonOk({ preview: result.preview }, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
