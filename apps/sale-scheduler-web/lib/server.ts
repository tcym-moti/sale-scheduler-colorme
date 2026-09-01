import { cookies } from "next/headers";
import { ColormeClient } from "@sale-scheduler/colorme-api";
import { decryptSecret, SESSION_COOKIE, sessionShop } from "@sale-scheduler/colorme-auth";
import { Database, getOAuthToken, type ShopRow } from "@sale-scheduler/database";
import { PostgresShopRateLimiter } from "@sale-scheduler/jobs";
import { ApiHttpError } from "./http";

const globalForSaleScheduler = globalThis as unknown as { saleSchedulerDb?: Database };

export function db(): Database {
  if (!globalForSaleScheduler.saleSchedulerDb) globalForSaleScheduler.saleSchedulerDb = new Database();
  return globalForSaleScheduler.saleSchedulerDb;
}

export async function currentShop(): Promise<ShopRow | null> {
  const cookieStore = await cookies();
  return sessionShop(db(), cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireShop(): Promise<ShopRow> {
  const shop = await currentShop();
  if (!shop) throw new ApiHttpError(401, "COLORME_AUTH_ERROR", "ログインが必要です。");
  return shop;
}

export async function clientForShop(shop: ShopRow): Promise<{ client: ColormeClient; limiter: PostgresShopRateLimiter }> {
  const token = await getOAuthToken(db(), shop.id);
  if (!token) throw new ApiHttpError(401, "COLORME_AUTH_ERROR");
  return { client: new ColormeClient(decryptSecret(token.encryptedAccessToken)), limiter: new PostgresShopRateLimiter(db()) };
}

export async function verifyCsrf(request: Request): Promise<void> {
  const cookieStore = await cookies();
  const expected = cookieStore.get("sale-scheduler-csrf")?.value;
  const received = request.headers.get("x-csrf-token");
  if (!expected || !received || expected.length !== received.length || expected !== received) throw new ApiHttpError(403, "INVALID_INPUT", "安全確認に失敗しました。画面を再読み込みして再試行してください。");
}

export function publicBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}
