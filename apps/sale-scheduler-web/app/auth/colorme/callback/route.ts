import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ColormeClient } from "@sale-scheduler/colorme-api";
import { consumeOAuthState, createShopForOAuth, saveOAuthToken } from "@sale-scheduler/database";
import { exchangeAuthorizationCode, encryptSecret, issueSession, SESSION_COOKIE, hashOpaqueToken } from "@sale-scheduler/colorme-auth";
import { db, publicBaseUrl } from "../../../../lib/server";

function redirectWithError(request: Request): NextResponse {
  const url = new URL("/", publicBaseUrl() || request.url);
  url.searchParams.set("error", "oauth_failed");
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectWithError(request);
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get("sale-scheduler-oauth-state")?.value;
  if (!stateCookie || stateCookie !== state) return redirectWithError(request);
  try {
    const stateRow = await consumeOAuthState(db(), hashOpaqueToken(state));
    if (!stateRow) return redirectWithError(request);
    const token = await exchangeAuthorizationCode(code);
    const colorme = new ColormeClient(token.accessToken);
    const shopInfo = await colorme.getShop();
    const shop = await createShopForOAuth(db(), shopInfo.accountId, shopInfo.name);
    await saveOAuthToken(db(), { shopId: shop.id, encryptedAccessToken: encryptSecret(token.accessToken), encryptedRefreshToken: token.refreshToken ? encryptSecret(token.refreshToken) : null, scope: token.scope, expiresAt: token.expiresAt });
    const session = await issueSession(db(), shop.id);
    cookieStore.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.floor((session.expiresAt.getTime() - Date.now()) / 1000) });
    cookieStore.set("sale-scheduler-oauth-state", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    const destination = new URL(stateRow.returnTo, publicBaseUrl());
    return NextResponse.redirect(destination);
  } catch {
    return redirectWithError(request);
  }
}
