import { ColormeApiError, ColormeNetworkError, retryDelayMs } from "@sale-scheduler/colorme-api";

export const MAX_RETRIES = 5;

export function isRetryableJobError(error: unknown): boolean {
  if (error instanceof ColormeNetworkError) return true;
  if (error instanceof ColormeApiError) return error.responseStatus === 429 || error.responseStatus === 503 || error.responseStatus >= 500;
  return false;
}

export function retryAfterForJob(error: unknown, retryCount: number, now = new Date()): Date {
  const retryAfter = error instanceof ColormeApiError ? error.retryAfterMs : null;
  return new Date(now.getTime() + retryDelayMs(retryCount, retryAfter));
}

export function responseStatusForError(error: unknown): number | null {
  return error instanceof ColormeApiError ? error.responseStatus : null;
}

export function errorCodeForJob(error: unknown): string {
  if (error instanceof ColormeApiError || error instanceof ColormeNetworkError) return error.code;
  return "INTERNAL_ERROR";
}

export function errorMessageForJob(error: unknown): string {
  if (error instanceof ColormeApiError || error instanceof ColormeNetworkError) return error.message;
  return error instanceof Error ? error.message.slice(0, 500) : "予期しないエラーが発生しました。";
}
