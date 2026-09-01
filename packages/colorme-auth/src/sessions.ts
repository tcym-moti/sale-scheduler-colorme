import type { Database } from "@sale-scheduler/database";
import { createSession, getSessionShop, revokeSession } from "@sale-scheduler/database";
import { createOpaqueToken, hashOpaqueToken } from "./crypto";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sale-scheduler-session" : "sale-scheduler-session";

export function sessionTtlDays(): number {
  const value = Number(process.env.SESSION_TTL_DAYS ?? 30);
  return Number.isFinite(value) && value > 0 && value <= 90 ? value : 30;
}

export async function issueSession(db: Database, shopId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + sessionTtlDays() * 24 * 60 * 60 * 1000);
  await createSession(db, shopId, hashOpaqueToken(token), expiresAt);
  return { token, expiresAt };
}

export async function sessionShop(db: Database, token: string | undefined) {
  return token ? getSessionShop(db, hashOpaqueToken(token)) : null;
}

export async function destroySession(db: Database, token: string | undefined): Promise<void> {
  if (token) await revokeSession(db, hashOpaqueToken(token));
}
