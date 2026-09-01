import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const token = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("sale-scheduler-csrf", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60
  });
  return NextResponse.json({ ok: true });
}
