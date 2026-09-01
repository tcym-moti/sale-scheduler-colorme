import type { JobOperation, JobStatus, PricingMode, ScheduleItemStatus, ScheduleStatus, ShopContext } from "@sale-scheduler/shared";

export type ShopRow = ShopContext;

export interface InstallationRow {
  id: string;
  shopId: string;
  appKey: string;
  status: "INSTALLED" | "UNINSTALLED";
  chargeSourceId: string | null;
  recurringChargeId: string | null;
  chargeId: string | null;
  ownerEmail: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  installedAt: string;
  uninstalledAt: string | null;
}

export interface OAuthStateRow {
  id: string;
  shopId: string | null;
  returnTo: string;
}

export interface ScheduleRow {
  id: string;
  shopId: string;
  status: ScheduleStatus;
  pricingMode: PricingMode;
  pricingValue: number;
  startAt: string;
  endAt: string;
  timeZone: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleItemRow {
  id: string;
  scheduleId: string;
  shopId: string;
  productId: number;
  productName: string;
  originalPrice: number | null;
  effectiveOriginalPrice: number | null;
  scheduledPrice: number;
  currentPrice: number | null;
  status: ScheduleItemStatus;
  conflictReason: string | null;
  lastError: string | null;
  retryCount: number;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ScheduleJobRow {
  id: string;
  scheduleId: string;
  itemId: string;
  shopId: string;
  operation: JobOperation;
  status: JobStatus;
  runAt: string;
  retryCount: number;
  mutationState: "NOT_STARTED" | "IN_FLIGHT" | "UNKNOWN" | "CONFIRMED";
  leaseUntil: string | null;
  productId: number;
  productName: string;
  scheduledPrice: number;
  effectiveOriginalPrice: number | null;
  currentPrice: number | null;
  itemStatus: ScheduleItemStatus;
  scheduleStatus: ScheduleStatus;
  scheduleStartAt: string;
  scheduleEndAt: string;
  workerId: string | null;
}

export interface ScheduleSummaryRow extends ScheduleRow {
  itemCount: number;
  completedCount: number;
  activeCount: number;
  failedCount: number;
  conflictCount: number;
}

export interface AuditInput {
  requestId?: string;
  shopId?: string;
  scheduleId?: string;
  itemId?: string;
  eventType: string;
  endpoint?: string;
  fromPrice?: number | null;
  toPrice?: number | null;
  responseStatus?: number | null;
  retryCount?: number | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}
