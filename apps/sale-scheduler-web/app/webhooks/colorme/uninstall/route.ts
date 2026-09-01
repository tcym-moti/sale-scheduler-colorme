import { parseUninstallPayload, verifyColormeWebhook } from "@sale-scheduler/colorme-auth";
import { markShopUninstalled } from "@sale-scheduler/database";
import { NextResponse } from "next/server";
import { db } from "../../../../lib/server";

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  if (!verifyColormeWebhook(rawBody, request.headers.get("x-appstore-signature"))) return NextResponse.json({ ok: false }, { status: 401 });
  const appKey = process.env.COLORME_APP_KEY?.trim();
  if (!appKey) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    const payload = parseUninstallPayload(JSON.parse(rawBody));
    await markShopUninstalled(db(), payload.account_id, appKey);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
