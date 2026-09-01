import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ERROR_CODES, type ErrorCode, userFacingError } from "@sale-scheduler/shared";
import { ColormeApiError, ColormeNetworkError } from "@sale-scheduler/colorme-api";

export class ApiHttpError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message?: string) {
    super(message ?? userFacingError(code));
  }
}

export function requestIdFrom(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 100) || randomUUID();
}

function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

export function jsonError(error: unknown, requestId: string): NextResponse {
  if (error instanceof ColormeApiError) return NextResponse.json({ error: { code: error.code, message: userFacingError(error.code) }, requestId }, { status: error.responseStatus });
  if (error instanceof ColormeNetworkError) return NextResponse.json({ error: { code: error.code, message: userFacingError(error.code) }, requestId }, { status: 503 });
  const knownScheduleError = error instanceof Error && error.message === "SCHEDULE_NOT_BEFORE_START"
    ? { status: 409, code: "INVALID_INPUT" as const, message: "開始前の予約だけキャンセルできます。" }
    : error instanceof Error && error.message === "SCHEDULE_NOT_ACTIVE"
      ? { status: 409, code: "INVALID_INPUT" as const, message: "実施中の予約だけ終了して復元できます。" }
      : null;
  const candidate = error instanceof ApiHttpError ? error : knownScheduleError ?? (error && typeof error === "object" ? error as { status?: unknown; code?: unknown; message?: unknown } : null);
  const code = typeof candidate?.code === "string" && isErrorCode(candidate.code) ? candidate.code : "INTERNAL_ERROR";
  const status = typeof candidate?.status === "number" && candidate.status >= 400 && candidate.status <= 599 ? candidate.status : 500;
  const message = typeof candidate?.message === "string" && candidate.message ? candidate.message : userFacingError(code);
  return NextResponse.json({ error: { code: isErrorCode(code) ? code : "INTERNAL_ERROR", message }, requestId }, { status });
}

export function jsonOk<T>(body: T, requestId: string, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("x-request-id", requestId);
  return NextResponse.json(body, { ...init, headers });
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiHttpError(400, "INVALID_INPUT");
  return value as Record<string, unknown>;
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiHttpError(400, "INVALID_INPUT", `${field}を入力してください。`);
  return value.trim();
}

export function asInteger(value: unknown, field: string): number {
  const result = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isSafeInteger(result)) throw new ApiHttpError(400, "INVALID_INPUT", `${field}は整数で指定してください。`);
  return result;
}
