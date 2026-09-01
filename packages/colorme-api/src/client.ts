import { ColormeApiError, ColormeNetworkError, retryDelayMs } from "./errors";
import type { ColormeRequestOptions, ColormeShop, ProductListOptions } from "./types";
import type { Product } from "@sale-scheduler/shared";

const DEFAULT_BASE_URL = "https://api.shop-pro.jp";
const DEFAULT_TIMEOUT_MS = 30_000;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : value === null || value === undefined ? null : String(value);
}

function asNumber(value: unknown): number | null {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function unwrapCollection(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const nested = root.data as Record<string, unknown> | null;
  const candidates = [root.products, root.data, nested?.products];
  return candidates.find((candidate): candidate is unknown[] => Array.isArray(candidate)) ?? [];
}

function mapProduct(value: unknown): Product | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asNumber(row.id ?? row.product_id);
  if (id === null) return null;
  const variants = Array.isArray(row.variants) ? row.variants : [];
  return {
    id,
    name: asString(row.name ?? row.product_name) ?? `商品 ${id}`,
    salesPrice: asNumber(row.sales_price),
    salesPriceIncludingTax: asNumber(row.sales_price_including_tax),
    price: asNumber(row.price),
    membersPrice: asNumber(row.members_price),
    modelNumber: asString(row.model_number ?? row.modelNumber),
    variantCount: variants.length
  };
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export class ColormeClient {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly defaultOptions: ColormeRequestOptions;

  constructor(accessToken: string, options: { baseUrl?: string; timeoutMs?: number; beforeRequest?: () => Promise<void> } = {}) {
    if (!accessToken) throw new Error("Color Me Shop access token is required");
    this.accessToken = accessToken;
    this.baseUrl = (options.baseUrl ?? process.env.COLORME_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.defaultOptions = { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, beforeRequest: options.beforeRequest };
  }

  async requestOnce<T = unknown>(path: string, init: RequestInit = {}, options: ColormeRequestOptions = {}): Promise<{ status: number; data: T | null; headers: Headers }> {
    const beforeRequest = options.beforeRequest ?? this.defaultOptions.beforeRequest;
    if (beforeRequest) await beforeRequest();
    const timeoutMs = options.timeoutMs ?? this.defaultOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    headers.set("Accept", "application/json");
    headers.set("User-Agent", "sale-scheduler-colorme/0.1");
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) throw new ColormeApiError({ status: response.status, body, retryAfterMs: parseRetryAfter(response.headers.get("retry-after")), endpoint: path });
      let data: T | null = null;
      if (body) {
        try { data = JSON.parse(body) as T; } catch { data = null; }
      }
      return { status: response.status, data, headers: response.headers };
    } catch (error) {
      if (error instanceof ColormeApiError) throw error;
      const message = error instanceof Error && error.name === "AbortError"
        ? "カラーミーショップAPIへの接続がタイムアウトしました。"
        : "カラーミーショップAPIへの接続に失敗しました。";
      const mutationMayHaveBeenSent = ["POST", "PUT", "PATCH", "DELETE"].includes((init.method ?? "GET").toUpperCase());
      throw new ColormeNetworkError(message, mutationMayHaveBeenSent);
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestWithRetry<T = unknown>(path: string, init: RequestInit = {}, options: ColormeRequestOptions & { maxAttempts?: number } = {}): Promise<{ status: number; data: T | null; headers: Headers }> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.requestOnce<T>(path, init, options);
      } catch (error) {
        const status = error instanceof ColormeApiError ? error.responseStatus : null;
        const retryable = status === 429 || status === 503 || (status !== null && status >= 500) || error instanceof ColormeNetworkError;
        if (!retryable || attempt >= maxAttempts) throw error;
        const retryAfter = error instanceof ColormeApiError ? error.retryAfterMs : null;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, retryAfter)));
      }
    }
    throw new Error("unreachable");
  }

  async listProducts(options: ProductListOptions = {}, requestOptions: ColormeRequestOptions = {}): Promise<Product[]> {
    const query = new URLSearchParams();
    if (options.ids?.length) query.set("ids", options.ids.join(","));
    if (options.name) query.set("name", options.name);
    if (options.modelNumber) query.set("model_number", options.modelNumber);
    if (options.janCode) query.set("jan_code", options.janCode);
    query.set("limit", String(Math.min(50, Math.max(1, options.limit ?? 50))));
    query.set("offset", String(Math.max(0, options.offset ?? 0)));
    const response = await this.requestWithRetry(`/v1/products?${query.toString()}`, {}, { ...requestOptions, maxAttempts: 3 });
    return unwrapCollection(response.data).map(mapProduct).filter((product): product is Product => product !== null);
  }

  async searchProducts(query: string, requestOptions: ColormeRequestOptions = {}): Promise<Product[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    if (/^\d+$/.test(trimmed)) {
      const byId = await this.listProducts({ ids: [Number(trimmed)], limit: 50 }, requestOptions);
      if (byId.length) return byId;
    }
    const byName = await this.listProducts({ name: trimmed, limit: 50 }, requestOptions);
    if (byName.length) return byName;
    const byModel = await this.listProducts({ modelNumber: trimmed, limit: 50 }, requestOptions);
    if (byModel.length) return byModel;
    return this.listProducts({ janCode: trimmed, limit: 50 }, requestOptions);
  }

  async getProduct(productId: number, requestOptions: ColormeRequestOptions = {}): Promise<Product> {
    const path = `/v1/products/${encodeURIComponent(String(productId))}`;
    const response = await this.requestWithRetry(path, {}, { ...requestOptions, maxAttempts: 3 });
    const root = response.data as Record<string, unknown> | null;
    const value = mapProduct(root?.product ?? response.data);
    if (!value) throw new ColormeApiError({ status: 404, endpoint: path, body: "product not found" });
    return value;
  }

  async updateProductPrice(productId: number, salesPrice: number, requestOptions: ColormeRequestOptions = {}): Promise<Product> {
    const path = `/v1/products/${encodeURIComponent(String(productId))}`;
    const response = await this.requestOnce(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: { sales_price: salesPrice } })
    }, requestOptions);
    const root = response.data as Record<string, unknown> | null;
    const value = mapProduct(root?.product ?? response.data);
    if (!value) throw new ColormeApiError({ status: 502, endpoint: path, body: "update response did not contain a product" });
    return value;
  }

  async getShop(requestOptions: ColormeRequestOptions = {}): Promise<ColormeShop> {
    const response = await this.requestWithRetry("/v1/shop", {}, { ...requestOptions, maxAttempts: 3 });
    const root = (response.data ?? {}) as Record<string, unknown>;
    const shop = (root.shop ?? root) as Record<string, unknown>;
    const accountId = asString(shop.account_id ?? shop.uid ?? shop.accountId ?? shop.id);
    if (!accountId) throw new Error("Color Me Shop response did not contain an account ID");
    return { accountId, name: asString(shop.name ?? shop.shop_name ?? shop.title) ?? accountId };
  }
}
