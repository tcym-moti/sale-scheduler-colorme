import type { ErrorCode } from "@sale-scheduler/shared";

export function errorCodeForStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) return "COLORME_AUTH_ERROR";
  if (status === 404) return "PRODUCT_NOT_FOUND";
  if (status === 429) return "COLORME_RATE_LIMIT";
  if (status === 503 || status >= 500) return "COLORME_TEMPORARY_ERROR";
  return "COLORME_VALIDATION_ERROR";
}

export class ColormeApiError extends Error {
  readonly name = "ColormeApiError";
  readonly code: ErrorCode;
  readonly responseStatus: number;
  readonly retryAfterMs: number | null;
  readonly responseBody: string;

  constructor(input: { status: number; body?: string; retryAfterMs?: number | null; endpoint: string }) {
    super(`カラーミーショップAPI request failed (${input.status}) at ${input.endpoint}`);
    this.code = errorCodeForStatus(input.status);
    this.responseStatus = input.status;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.responseBody = (input.body ?? "").slice(0, 500);
  }
}

export class ColormeNetworkError extends Error {
  readonly name = "ColormeNetworkError";
  readonly code = "COLORME_TEMPORARY_ERROR" as const;
  readonly possiblySent: boolean;

  constructor(message: string, possiblySent: boolean) {
    super(message);
    this.possiblySent = possiblySent;
  }
}

export function retryDelayMs(retryNumber: number, retryAfterMs?: number | null): number {
  const schedule = [5_000, 10_000, 20_000, 40_000, 60_000];
  const base = retryAfterMs && retryAfterMs > 0
    ? Math.min(retryAfterMs, 120_000)
    : schedule[Math.max(0, Math.min(retryNumber - 1, schedule.length - 1))];
  return Math.round(base + Math.random() * Math.min(1_000, base * 0.2));
}
