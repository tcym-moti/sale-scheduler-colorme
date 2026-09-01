import { createOpaqueToken, hashOpaqueToken, buildAuthorizationUrl, parseInstallPayload, verifyColormeWebhook } from "@sale-scheduler/colorme-auth";
import { createOAuthState, upsertInstalledShop } from "@sale-scheduler/database";
import { NextResponse } from "next/server";
import { db, publicBaseUrl } from "../../../../lib/server";

function webhookError(status = 400): NextResponse {
  return NextResponse.json({ ok: false }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  if (!verifyColormeWebhook(rawBody, request.headers.get("x-appstore-signature"))) return webhookError(401);
  const appKey = process.env.COLORME_APP_KEY?.trim();
  if (!appKey) return webhookError(503);
  try {
    const payload = parseInstallPayload(JSON.parse(rawBody));
    const trialStartsAt = payload.trial_term?.starts_at ? new Date(payload.trial_term.starts_at * 1000) : null;
    const trialEndsAt = payload.trial_term?.ends_at ? new Date(payload.trial_term.ends_at * 1000) : null;
    const installed = await upsertInstalledShop(db(), { accountId: payload.account_id, shopName: payload.account_id, appKey, ownerEmail: payload.mail ?? null, chargeSourceId: payload.application_charge_source_id ?? null, recurringChargeId: payload.recurring_application_charge_id ?? null, chargeId: payload.application_charge_id ?? null, trialStartsAt, trialEndsAt });
    const state = createOpaqueToken();
    await createOAuthState(db(), { shopId: installed.shop.id, stateHash: hashOpaqueToken(state), returnTo: "/", expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    return NextResponse.json({ redirect_url: buildAuthorizationUrl(state, `${publicBaseUrl()}/auth/colorme/callback`) });
  } catch {
    return webhookError(400);
  }
}
