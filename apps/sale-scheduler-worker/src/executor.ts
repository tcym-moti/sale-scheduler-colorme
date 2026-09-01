import { ColormeClient } from "@sale-scheduler/colorme-api";
import {
  completeEndJob,
  completeSkippedStartJob,
  completeStartJob,
  failJobPermanently,
  markJobConflict,
  markVerificationUncertain,
  recordAudit,
  scheduleJobRetry,
  setVerificationPending,
  setEffectiveOriginalPrice,
  setJobMutationState,
  type Database,
  type ScheduleJobRow
} from "@sale-scheduler/database";
import {
  MAX_RETRIES,
  JobError,
  PostgresShopRateLimiter,
  errorCodeForJob,
  isRetryableJobError,
  responseStatusForError,
  retryAfterForJob,
  type ShopRateLimiter
} from "@sale-scheduler/jobs";
import { classifyWriteVerification, ERROR_CODES, type ErrorCode, type WriteVerificationOutcome, userFacingError, verificationDelayMs } from "@sale-scheduler/shared";

export interface JobExecutorDependencies {
  db: Database;
  limiter: ShopRateLimiter;
  getClient: (shopId: string) => Promise<ColormeClient>;
  now?: () => Date;
  requestId?: (job: ScheduleJobRow) => string;
}

export type JobExecutionResult = "COMPLETED" | "RETRY_WAIT" | "FAILED" | "CONFLICT" | "VERIFY_UNKNOWN" | "POST_WRITE_DIVERGENCE" | "CANCELLED";

function nowOf(dependencies: JobExecutorDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

function userMessage(error: unknown): string {
  const code = errorCodeForJob(error);
  return userFacingError(isErrorCode(code) ? code : "INTERNAL_ERROR");
}

function responseStatus(error: unknown): number | null {
  return responseStatusForError(error);
}

function endpoint(job: ScheduleJobRow): string {
  return `/v1/products/${job.productId}`;
}

function boundedEnvInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function verificationMaxAttempts(): number {
  return boundedEnvInteger("VERIFY_MAX_ATTEMPTS", 5, 1, 10);
}

function verificationBackoffMs(): number {
  return boundedEnvInteger("VERIFY_BACKOFF_MS", 500, 0, 30_000);
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

interface VerificationResult {
  outcome: WriteVerificationOutcome;
  observedPrice: number | null;
  attempts: number;
  maxAttempts: number;
}

type VerificationFailureResult = Omit<VerificationResult, "outcome"> & { outcome: "VERIFY_UNKNOWN" | "POST_WRITE_DIVERGENCE" };

function isVerificationFailure(result: VerificationResult): result is VerificationFailureResult {
  return result.outcome !== "CONFIRMED";
}

async function verifyPriceAfterWrite(
  job: ScheduleJobRow,
  dependencies: JobExecutorDependencies,
  client: ColormeClient,
  operation: "START" | "END",
  expectedPrice: number,
  previousPrice: number | null
): Promise<VerificationResult> {
  const maxAttempts = verificationMaxAttempts();
  const baseDelayMs = verificationBackoffMs();
  let observedPrice: number | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let product;
    try {
      product = await getProduct(job, dependencies, client);
    } catch (error) {
      await recordAudit(dependencies.db, {
        requestId: dependencies.requestId?.(job) ?? job.id,
        shopId: job.shopId,
        scheduleId: job.scheduleId,
        itemId: job.itemId,
        eventType: `${operation}_PRICE_UPDATE_VERIFICATION_ERROR`,
        endpoint: endpoint(job),
        responseStatus: responseStatus(error),
        retryCount: attempt - 1,
        errorCode: errorCodeForJob(error),
        metadata: { expectedPrice, previousPrice, attempt, maxAttempts, result: "ERROR" }
      });
      throw error;
    }
    observedPrice = product.salesPrice;
    const confirmed = observedPrice === expectedPrice;
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: `${operation}_PRICE_UPDATE_VERIFICATION`,
      endpoint: endpoint(job),
      responseStatus: 200,
      retryCount: attempt - 1,
      metadata: { expectedPrice, previousPrice, observedPrice, attempt, maxAttempts, result: confirmed ? "CONFIRMED" : "VERIFY_PENDING" }
    });
    if (confirmed) return { outcome: "CONFIRMED", observedPrice, attempts: attempt, maxAttempts };
    if (attempt < maxAttempts) await sleep(verificationDelayMs(baseDelayMs, attempt));
  }
  return { outcome: classifyWriteVerification(expectedPrice, previousPrice, observedPrice), observedPrice, attempts: maxAttempts, maxAttempts };
}

function verificationFailureReason(operation: "START" | "END", result: VerificationResult, expectedPrice: number, previousPrice: number | null): string {
  const observed = result.observedPrice === null ? "不明" : `${result.observedPrice}円`;
  if (result.outcome === "VERIFY_UNKNOWN") {
    const target = operation === "START" ? "セール価格" : "元価格";
    return `${target}${expectedPrice}円への変更後、${result.attempts}回確認しても反映を確認できませんでした（最終観測価格: ${observed}）。追加の価格変更は行っていません。`;
  }
  return `価格変更後に第三の価格${observed}が${result.attempts}回目の確認で観測されました（期待値: ${expectedPrice}円、変更前価格: ${previousPrice ?? "不明"}）。追加の価格変更は行っていません。`;
}

async function finishVerificationFailure(
  job: ScheduleJobRow,
  dependencies: JobExecutorDependencies,
  operation: "START" | "END",
  result: VerificationFailureResult,
  expectedPrice: number,
  previousPrice: number | null
): Promise<JobExecutionResult> {
  const reason = verificationFailureReason(operation, result, expectedPrice, previousPrice);
  await markVerificationUncertain(dependencies.db, job.id, job.itemId, job.scheduleId, result.outcome, result.observedPrice, reason, 200);
  await recordAudit(dependencies.db, {
    requestId: dependencies.requestId?.(job) ?? job.id,
    shopId: job.shopId,
    scheduleId: job.scheduleId,
    itemId: job.itemId,
    eventType: `${operation}_${result.outcome}`,
    endpoint: endpoint(job),
    fromPrice: previousPrice,
    toPrice: expectedPrice,
    responseStatus: 200,
    retryCount: result.attempts - 1,
    errorCode: result.outcome,
    metadata: { expectedPrice, previousPrice, observedPrice: result.observedPrice, verificationAttempts: result.attempts, maxAttempts: result.maxAttempts, finalResult: result.outcome }
  });
  return result.outcome;
}

async function retryOrFail(
  job: ScheduleJobRow,
  dependencies: JobExecutorDependencies,
  error: unknown,
  mutationState: "NOT_STARTED" | "UNKNOWN"
): Promise<JobExecutionResult> {
  const code = errorCodeForJob(error);
  const message = userMessage(error);
  const status = responseStatus(error);
  const requestId = dependencies.requestId?.(job) ?? job.id;
  if (isRetryableJobError(error) && job.retryCount < MAX_RETRIES) {
    const runAt = retryAfterForJob(error, job.retryCount + 1, nowOf(dependencies));
    await scheduleJobRetry(dependencies.db, job.id, job.itemId, job.scheduleId, runAt, message, mutationState, status);
    await recordAudit(dependencies.db, {
      requestId,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "JOB_RETRY_SCHEDULED",
      endpoint: endpoint(job),
      responseStatus: status,
      retryCount: job.retryCount + 1,
      errorCode: code,
      metadata: { operation: job.operation, mutationState }
    });
    return "RETRY_WAIT";
  }
  await failJobPermanently(dependencies.db, job.id, job.itemId, job.scheduleId, message, status);
  await recordAudit(dependencies.db, {
    requestId,
    shopId: job.shopId,
    scheduleId: job.scheduleId,
    itemId: job.itemId,
    eventType: "JOB_FAILED",
    endpoint: endpoint(job),
    responseStatus: status,
    retryCount: job.retryCount,
    errorCode: code,
    metadata: { operation: job.operation }
  });
  return "FAILED";
}

async function getProduct(job: ScheduleJobRow, dependencies: JobExecutorDependencies, client: ColormeClient) {
  return client.getProduct(job.productId, { beforeRequest: () => dependencies.limiter.acquire(job.shopId) });
}

async function startJob(job: ScheduleJobRow, dependencies: JobExecutorDependencies, client: ColormeClient): Promise<JobExecutionResult> {
  if (new Date(job.scheduleEndAt).getTime() <= nowOf(dependencies).getTime()) {
    const reason = userFacingError("SCHEDULE_ENDED_BEFORE_START");
    await completeSkippedStartJob(dependencies.db, job.id, job.itemId, job.scheduleId, reason);
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "START_SKIPPED",
      endpoint: endpoint(job),
      errorCode: "SCHEDULE_ENDED_BEFORE_START",
      metadata: { reason }
    });
    return "CANCELLED";
  }

  let product;
  try {
    product = await getProduct(job, dependencies, client);
  } catch (error) {
    return retryOrFail(job, dependencies, error, job.mutationState === "UNKNOWN" ? "UNKNOWN" : "NOT_STARTED");
  }
  if (product.variantCount > 0) {
    const error = new JobError("PRODUCT_HAS_VARIANTS");
    return retryOrFail(job, dependencies, error, "NOT_STARTED");
  }
  if (product.salesPrice === null) {
    const error = new JobError("COLORME_VALIDATION_ERROR");
    return retryOrFail(job, dependencies, error, "NOT_STARTED");
  }

  const effectiveOriginalPrice = job.effectiveOriginalPrice ?? product.salesPrice;
  if (job.effectiveOriginalPrice === null) await setEffectiveOriginalPrice(dependencies.db, job.itemId, effectiveOriginalPrice);

  if (product.salesPrice === job.scheduledPrice) {
    await completeStartJob(dependencies.db, job.id, job.itemId, job.scheduleId, 200);
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "START_ALREADY_APPLIED",
      endpoint: endpoint(job),
      fromPrice: product.salesPrice,
      toPrice: job.scheduledPrice,
      responseStatus: 200,
      metadata: { effectiveOriginalPrice }
    });
    return "COMPLETED";
  }

  if (job.mutationState === "UNKNOWN" && product.salesPrice !== effectiveOriginalPrice) {
    const reason = `開始処理の確認前に価格が${product.salesPrice}円へ変更されていたため、価格を変更しませんでした。`;
    await markJobConflict(dependencies.db, job.id, job.itemId, job.scheduleId, product.salesPrice, reason);
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "START_CONFLICT",
      endpoint: endpoint(job),
      fromPrice: product.salesPrice,
      toPrice: job.scheduledPrice,
      errorCode: "CONFLICT",
      metadata: { effectiveOriginalPrice, scheduledPrice: job.scheduledPrice, reason }
    });
    return "CONFLICT";
  }

  await setJobMutationState(dependencies.db, job.id, "IN_FLIGHT");
  await recordAudit(dependencies.db, {
    requestId: dependencies.requestId?.(job) ?? job.id,
    shopId: job.shopId,
    scheduleId: job.scheduleId,
    itemId: job.itemId,
    eventType: "START_PRICE_UPDATE_REQUESTED",
    endpoint: endpoint(job),
    fromPrice: product.salesPrice,
    toPrice: job.scheduledPrice,
    metadata: { effectiveOriginalPrice }
  });

  try {
    const updated = await client.updateProductPrice(job.productId, job.scheduledPrice, { beforeRequest: () => dependencies.limiter.acquire(job.shopId) });
    await setVerificationPending(dependencies.db, job.itemId);
    const verification = await verifyPriceAfterWrite(job, dependencies, client, "START", job.scheduledPrice, product.salesPrice);
    if (isVerificationFailure(verification)) return finishVerificationFailure(job, dependencies, "START", verification, job.scheduledPrice, product.salesPrice);
    await completeStartJob(dependencies.db, job.id, job.itemId, job.scheduleId, 200);
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "START_PRICE_UPDATE_CONFIRMED",
      endpoint: endpoint(job),
      fromPrice: product.salesPrice,
      toPrice: verification.observedPrice,
      responseStatus: 200,
      metadata: { apiResponsePrice: updated.salesPrice, verificationAttempts: verification.attempts, expectedPrice: job.scheduledPrice, observedPrice: verification.observedPrice, finalResult: verification.outcome }
    });
    return "COMPLETED";
  } catch (error) {
    return retryOrFail(job, dependencies, error, "UNKNOWN");
  }
}

async function endJob(job: ScheduleJobRow, dependencies: JobExecutorDependencies, client: ColormeClient): Promise<JobExecutionResult> {
  let product;
  try {
    product = await getProduct(job, dependencies, client);
  } catch (error) {
    return retryOrFail(job, dependencies, error, job.mutationState === "UNKNOWN" ? "UNKNOWN" : "NOT_STARTED");
  }
  const effectiveOriginalPrice = job.effectiveOriginalPrice;
  if (effectiveOriginalPrice === null) {
    const error = new JobError("INTERNAL_ERROR", "復元元価格が保存されていないため、価格を変更しませんでした。");
    return retryOrFail(job, dependencies, error, "NOT_STARTED");
  }
  if (product.salesPrice === effectiveOriginalPrice) {
    await completeEndJob(dependencies.db, job.id, job.itemId, job.scheduleId, 200);
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "END_ALREADY_RESTORED",
      endpoint: endpoint(job),
      fromPrice: product.salesPrice,
      toPrice: effectiveOriginalPrice,
      responseStatus: 200
    });
    return "COMPLETED";
  }
  if (product.salesPrice !== job.scheduledPrice) {
    const reason = `セール価格${job.scheduledPrice}円から${product.salesPrice ?? "不明"}円へ変更されているため、自動復元しませんでした。`;
    await markJobConflict(dependencies.db, job.id, job.itemId, job.scheduleId, product.salesPrice, reason);
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "END_CONFLICT",
      endpoint: endpoint(job),
      fromPrice: product.salesPrice,
      toPrice: effectiveOriginalPrice,
      responseStatus: 200,
      errorCode: "CONFLICT",
      metadata: { scheduledPrice: job.scheduledPrice, effectiveOriginalPrice, observedPrice: product.salesPrice, reason }
    });
    return "CONFLICT";
  }

  await setJobMutationState(dependencies.db, job.id, "IN_FLIGHT");
  await recordAudit(dependencies.db, {
    requestId: dependencies.requestId?.(job) ?? job.id,
    shopId: job.shopId,
    scheduleId: job.scheduleId,
    itemId: job.itemId,
    eventType: "END_PRICE_UPDATE_REQUESTED",
    endpoint: endpoint(job),
    fromPrice: product.salesPrice,
    toPrice: effectiveOriginalPrice,
    metadata: { scheduledPrice: job.scheduledPrice }
  });
  try {
    const updated = await client.updateProductPrice(job.productId, effectiveOriginalPrice, { beforeRequest: () => dependencies.limiter.acquire(job.shopId) });
    await setVerificationPending(dependencies.db, job.itemId);
    const verification = await verifyPriceAfterWrite(job, dependencies, client, "END", effectiveOriginalPrice, product.salesPrice);
    if (isVerificationFailure(verification)) return finishVerificationFailure(job, dependencies, "END", verification, effectiveOriginalPrice, product.salesPrice);
    await completeEndJob(dependencies.db, job.id, job.itemId, job.scheduleId, 200);
    await recordAudit(dependencies.db, {
      requestId: dependencies.requestId?.(job) ?? job.id,
      shopId: job.shopId,
      scheduleId: job.scheduleId,
      itemId: job.itemId,
      eventType: "END_PRICE_UPDATE_CONFIRMED",
      endpoint: endpoint(job),
      fromPrice: product.salesPrice,
      toPrice: verification.observedPrice,
      responseStatus: 200,
      metadata: { apiResponsePrice: updated.salesPrice, verificationAttempts: verification.attempts, expectedPrice: effectiveOriginalPrice, observedPrice: verification.observedPrice, finalResult: verification.outcome }
    });
    return "COMPLETED";
  } catch (error) {
    return retryOrFail(job, dependencies, error, "UNKNOWN");
  }
}

export async function processClaimedJob(job: ScheduleJobRow, dependencies: JobExecutorDependencies): Promise<JobExecutionResult> {
  let client: ColormeClient;
  try {
    client = await dependencies.getClient(job.shopId);
  } catch (error) {
    return retryOrFail(job, dependencies, error, job.mutationState === "UNKNOWN" ? "UNKNOWN" : "NOT_STARTED");
  }
  return dependencies.db.withProductLock(job.shopId, job.productId, async () => {
    if (job.operation === "START") return startJob(job, dependencies, client);
    return endJob(job, dependencies, client);
  });
}

export function createWorkerDependencies(db: Database, options: { workerId?: string } = {}): JobExecutorDependencies & { workerId: string } {
  const limiter = new PostgresShopRateLimiter(db);
  return {
    db,
    limiter,
    workerId: options.workerId ?? process.env.WORKER_ID ?? `worker-${process.pid}`,
    getClient: async (shopId) => {
      const { decryptSecret } = await import("@sale-scheduler/colorme-auth");
      const { getOAuthToken } = await import("@sale-scheduler/database");
      const token = await getOAuthToken(db, shopId);
      if (!token) throw new Error("OAuth token is not available for this shop");
      return new ColormeClient(decryptSecret(token.encryptedAccessToken));
    }
  };
}
