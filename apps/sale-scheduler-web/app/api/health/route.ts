import { NextResponse } from "next/server";
import { db } from "../../../lib/server";

export async function GET(): Promise<NextResponse> {
  try {
    await db().ping();
    return NextResponse.json({ ok: true, service: "sale-scheduler-web" });
  } catch {
    return NextResponse.json({ ok: false, service: "sale-scheduler-web" }, { status: 503 });
  }
}
