import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizationUrl, createOpaqueToken, hashOpaqueToken } from "@sale-scheduler/colorme-auth";
import { createOAuthState } from "@sale-scheduler/database";
import { db, currentShop } from "../../../lib/server";

export async function GET(request: Request): Promise<NextResponse> {
  const state = createOpaqueToken();
  const shop = await currentShop();
  await createOAuthState(db(), { shopId: shop?.id ?? null, stateHash: hashOpaqueToken(state), returnTo: new URL(request.url).searchParams.get("return_to") === "/" ? "/" : "/", expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  const cookieStore = await cookies();
  cookieStore.set("sale-scheduler-oauth-state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
