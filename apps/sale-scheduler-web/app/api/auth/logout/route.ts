import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@sale-scheduler/colorme-auth";
import { jsonError, jsonOk, requestIdFrom } from "../../../../lib/http";
import { db, verifyCsrf } from "../../../../lib/server";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  try {
    await verifyCsrf(request);
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    await destroySession(db(), token);
    cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return jsonOk({ ok: true }, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
