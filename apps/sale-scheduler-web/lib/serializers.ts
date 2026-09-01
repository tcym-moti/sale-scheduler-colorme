import type { ScheduleItemRow, ScheduleRow, ScheduleSummaryRow } from "@sale-scheduler/database";
import type { ScheduleDetail, ScheduleItemView, ScheduleSummary } from "@sale-scheduler/shared";

function itemView(item: ScheduleItemRow): ScheduleItemView {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    originalPrice: item.originalPrice,
    effectiveOriginalPrice: item.effectiveOriginalPrice,
    scheduledPrice: item.scheduledPrice,
    currentPrice: item.currentPrice,
    status: item.status,
    conflictReason: item.conflictReason,
    lastError: item.lastError,
    retryCount: item.retryCount,
    startedAt: item.startedAt,
    endedAt: item.endedAt
  };
}

export function summaryView(row: ScheduleSummaryRow): ScheduleSummary {
  return { id: row.id, status: row.status, pricingMode: row.pricingMode, pricingValue: row.pricingValue, startAt: row.startAt, endAt: row.endAt, itemCount: row.itemCount, completedCount: row.completedCount, activeCount: row.activeCount, failedCount: row.failedCount, conflictCount: row.conflictCount, createdAt: row.createdAt };
}

export function detailView(schedule: ScheduleRow, items: ScheduleItemRow[]): ScheduleDetail {
  const summary: ScheduleSummary = {
    id: schedule.id,
    status: schedule.status,
    pricingMode: schedule.pricingMode,
    pricingValue: schedule.pricingValue,
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    itemCount: items.length,
    completedCount: items.filter((item) => item.status === "COMPLETED").length,
    activeCount: items.filter((item) => item.status === "ACTIVE").length,
    failedCount: items.filter((item) => item.status === "FAILED").length,
    conflictCount: items.filter((item) => item.status === "CONFLICT").length,
    createdAt: schedule.createdAt
  };
  return { ...summary, items: items.map(itemView) };
}
