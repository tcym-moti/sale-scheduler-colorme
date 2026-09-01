import { verifyHmacSha256Base64 } from "./crypto";

export function verifyColormeWebhook(rawBody: string, signature: string | null): boolean {
  return verifyHmacSha256Base64(rawBody, signature ?? "");
}

export interface InstallWebhookPayload {
  account_id: string;
  application_charge_source_id?: string;
  recurring_application_charge_id?: string;
  application_charge_id?: string;
  trial_term?: { starts_at?: number; ends_at?: number };
  mail?: string;
}

export interface UninstallWebhookPayload {
  account_id: string;
  application_charge_source_id?: string;
  recurring_application_charge_id?: string;
  uninstalled_at?: number;
  reason?: string;
}

export function parseInstallPayload(value: unknown): InstallWebhookPayload {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).account_id !== "string") throw new Error("invalid install webhook payload");
  return value as InstallWebhookPayload;
}

export function parseUninstallPayload(value: unknown): UninstallWebhookPayload {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).account_id !== "string") throw new Error("invalid uninstall webhook payload");
  return value as UninstallWebhookPayload;
}
