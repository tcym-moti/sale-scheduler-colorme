import { randomUUID } from "node:crypto";
import type { Queryable } from "./client";
import type {
  AuditInput,
  InstallationRow,
  OAuthStateRow,
  ScheduleItemRow,
  ScheduleJobRow,
  ScheduleRow,
  ScheduleSummaryRow,
  ShopRow
} from "./types";
import type { JobOperation, ScheduleItemStatus, ScheduleStatus } from "@sale-scheduler/shared";
import type { Database } from "./client";

function iso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : value === null || value === undefined ? null : String(value);
}

function requiredIso(value: unknown): string {
  return iso(value) ?? new Date(0).toISOString();
}

function mapShop(row: Record<string, unknown>): ShopRow {
  return { id: String(row.id), accountId: String(row.account_id), shopName: String(row.shop_name ?? ""), status: String(row.status) as ShopRow["status"] };
}

function mapSchedule(row: Record<string, unknown>): ScheduleRow {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    status: String(row.status) as ScheduleStatus,
    pricingMode: String(row.pricing_mode) as ScheduleRow["pricingMode"],
    pricingValue: Number(row.pricing_value),
    startAt: requiredIso(row.start_at),
    endAt: requiredIso(row.end_at),
    timeZone: String(row.time_zone),
    lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
    createdAt: requiredIso(row.created_at),
    updatedAt: requiredIso(row.updated_at)
  };
}

function mapScheduleItem(row: Record<string, unknown>): ScheduleItemRow {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    shopId: String(row.shop_id),
    productId: Number(row.product_id),
    productName: String(row.product_name),
    originalPrice: row.original_price === null || row.original_price === undefined ? null : Number(row.original_price),
    effectiveOriginalPrice: row.effective_original_price === null || row.effective_original_price === undefined ? null : Number(row.effective_original_price),
    scheduledPrice: Number(row.scheduled_price),
    currentPrice: row.current_price === null || row.current_price === undefined ? null : Number(row.current_price),
    status: String(row.status) as ScheduleItemStatus,
    conflictReason: row.conflict_reason === null || row.conflict_reason === undefined ? null : String(row.conflict_reason),
    lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
    retryCount: Number(row.retry_count),
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at)
  };
}

function mapScheduleJob(row: Record<string, unknown>): ScheduleJobRow {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    itemId: String(row.item_id),
    shopId: String(row.shop_id),
    operation: String(row.operation) as JobOperation,
    status: String(row.job_status ?? row.status) as ScheduleJobRow["status"],
    runAt: requiredIso(row.run_at),
    retryCount: Number(row.job_retry_count ?? row.retry_count),
    mutationState: String(row.mutation_state) as ScheduleJobRow["mutationState"],
    leaseUntil: iso(row.lease_until),
    productId: Number(row.product_id),
    productName: String(row.product_name),
    scheduledPrice: Number(row.scheduled_price),
    effectiveOriginalPrice: row.effective_original_price === null || row.effective_original_price === undefined ? null : Number(row.effective_original_price),
    currentPrice: row.current_price === null || row.current_price === undefined ? null : Number(row.current_price),
    itemStatus: String(row.item_status) as ScheduleItemStatus,
    scheduleStatus: String(row.schedule_status) as ScheduleStatus,
    scheduleStartAt: requiredIso(row.schedule_start_at),
    scheduleEndAt: requiredIso(row.schedule_end_at),
    workerId: row.worker_id === null || row.worker_id === undefined ? null : String(row.worker_id)
  };
}

const scheduleColumns = "id, shop_id, status, pricing_mode, pricing_value, start_at, end_at, time_zone, last_error, created_at, updated_at";
const itemColumns = "id, schedule_id, shop_id, product_id, product_name, original_price, effective_original_price, scheduled_price, current_price, status, conflict_reason, last_error, retry_count, started_at, ended_at";

export async function findShopById(db: Queryable, shopId: string): Promise<ShopRow | null> {
  const result = await db.query("SELECT id, account_id, shop_name, status FROM shops WHERE id = $1", [shopId]);
  return result.rows[0] ? mapShop(result.rows[0] as Record<string, unknown>) : null;
}

export async function findShopByAccountId(db: Queryable, accountId: string): Promise<ShopRow | null> {
  const result = await db.query("SELECT id, account_id, shop_name, status FROM shops WHERE account_id = $1", [accountId]);
  return result.rows[0] ? mapShop(result.rows[0] as Record<string, unknown>) : null;
}

export async function upsertInstalledShop(
  db: Queryable,
  input: { accountId: string; shopName?: string; appKey: string; ownerEmail?: string | null; chargeSourceId?: string | null; recurringChargeId?: string | null; chargeId?: string | null; trialStartsAt?: Date | null; trialEndsAt?: Date | null }
): Promise<{ shop: ShopRow; installation: InstallationRow }> {
  const shopResult = await db.query(
    `INSERT INTO shops (id, account_id, shop_name, status)
     VALUES ($1, $2, COALESCE($3, ''), 'ACTIVE')
     ON CONFLICT (account_id) DO UPDATE SET
       shop_name = CASE WHEN $3 IS NULL OR $3 = '' THEN shops.shop_name ELSE $3 END,
       status = 'ACTIVE', updated_at = NOW()
     RETURNING id, account_id, shop_name, status`,
    [randomUUID(), input.accountId, input.shopName ?? null]
  );
  const shop = mapShop(shopResult.rows[0] as Record<string, unknown>);
  const installationResult = await db.query(
    `INSERT INTO app_installations
      (id, shop_id, app_key, status, charge_source_id, recurring_charge_id, charge_id, owner_email, trial_starts_at, trial_ends_at)
     VALUES ($1, $2, $3, 'INSTALLED', $4, $5, $6, $7, $8, $9)
     ON CONFLICT (shop_id, app_key) DO UPDATE SET
       status = 'INSTALLED', charge_source_id = EXCLUDED.charge_source_id,
       recurring_charge_id = EXCLUDED.recurring_charge_id, charge_id = EXCLUDED.charge_id,
       owner_email = EXCLUDED.owner_email, trial_starts_at = EXCLUDED.trial_starts_at,
       trial_ends_at = EXCLUDED.trial_ends_at, installed_at = NOW(), uninstalled_at = NULL
     RETURNING id, shop_id, app_key, status, charge_source_id, recurring_charge_id, charge_id, owner_email,
       trial_starts_at, trial_ends_at, installed_at, uninstalled_at`,
    [randomUUID(), shop.id, input.appKey, input.chargeSourceId ?? null, input.recurringChargeId ?? null, input.chargeId ?? null, input.ownerEmail ?? null, input.trialStartsAt ?? null, input.trialEndsAt ?? null]
  );
  const row = installationResult.rows[0] as Record<string, unknown>;
  return {
    shop,
    installation: {
      id: String(row.id), shopId: String(row.shop_id), appKey: String(row.app_key), status: String(row.status) as InstallationRow["status"],
      chargeSourceId: row.charge_source_id ? String(row.charge_source_id) : null, recurringChargeId: row.recurring_charge_id ? String(row.recurring_charge_id) : null,
      chargeId: row.charge_id ? String(row.charge_id) : null, ownerEmail: row.owner_email ? String(row.owner_email) : null,
      trialStartsAt: iso(row.trial_starts_at), trialEndsAt: iso(row.trial_ends_at), installedAt: requiredIso(row.installed_at), uninstalledAt: iso(row.uninstalled_at)
    }
  };
}

export async function createShopForOAuth(db: Queryable, accountId: string, shopName: string): Promise<ShopRow> {
  const result = await db.query(
    `INSERT INTO shops (id, account_id, shop_name, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     ON CONFLICT (account_id) DO UPDATE SET shop_name = EXCLUDED.shop_name, status = 'ACTIVE', updated_at = NOW()
     RETURNING id, account_id, shop_name, status`,
    [randomUUID(), accountId, shopName]
  );
  return mapShop(result.rows[0] as Record<string, unknown>);
}

export async function saveOAuthToken(db: Queryable, input: { shopId: string; encryptedAccessToken: string; encryptedRefreshToken?: string | null; scope: string[]; expiresAt?: Date | null }): Promise<void> {
  await db.query(
    `INSERT INTO oauth_tokens (shop_id, encrypted_access_token, encrypted_refresh_token, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shop_id) DO UPDATE SET encrypted_access_token = EXCLUDED.encrypted_access_token,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token, scope = EXCLUDED.scope,
       expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
    [input.shopId, input.encryptedAccessToken, input.encryptedRefreshToken ?? null, input.scope, input.expiresAt ?? null]
  );
}

export async function getOAuthToken(db: Queryable, shopId: string): Promise<{ encryptedAccessToken: string; scope: string[]; expiresAt: string | null } | null> {
  const result = await db.query("SELECT encrypted_access_token, scope, expires_at FROM oauth_tokens WHERE shop_id = $1", [shopId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { encryptedAccessToken: String(row.encrypted_access_token), scope: Array.isArray(row.scope) ? row.scope.map(String) : [], expiresAt: iso(row.expires_at) };
}

export async function createSession(db: Queryable, shopId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await db.query("INSERT INTO app_sessions (id, shop_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)", [randomUUID(), shopId, tokenHash, expiresAt]);
}

export async function getSessionShop(db: Queryable, tokenHash: string): Promise<ShopRow | null> {
  const result = await db.query(
    `SELECT s.id, s.account_id, s.shop_name, s.status
       FROM app_sessions AS a JOIN shops AS s ON s.id = a.shop_id
      WHERE a.token_hash = $1 AND a.revoked_at IS NULL AND a.expires_at > NOW() AND s.status = 'ACTIVE'`,
    [tokenHash]
  );
  return result.rows[0] ? mapShop(result.rows[0] as Record<string, unknown>) : null;
}

export async function revokeSession(db: Queryable, tokenHash: string): Promise<void> {
  await db.query("UPDATE app_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash]);
}

export async function revokeAllSessions(db: Queryable, shopId: string): Promise<void> {
  await db.query("UPDATE app_sessions SET revoked_at = NOW() WHERE shop_id = $1 AND revoked_at IS NULL", [shopId]);
}

export async function createOAuthState(db: Queryable, input: { shopId: string | null; stateHash: string; returnTo: string; expiresAt: Date }): Promise<void> {
  await db.query("INSERT INTO oauth_states (id, shop_id, state_hash, return_to, expires_at) VALUES ($1, $2, $3, $4, $5)", [randomUUID(), input.shopId, input.stateHash, input.returnTo, input.expiresAt]);
}

export async function consumeOAuthState(db: Database, stateHash: string): Promise<OAuthStateRow | null> {
  return db.withTransaction(async (client) => {
    const result = await client.query("SELECT id, shop_id, return_to FROM oauth_states WHERE state_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE", [stateHash]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    await client.query("UPDATE oauth_states SET used_at = NOW() WHERE id = $1", [row.id]);
    return { id: String(row.id), shopId: row.shop_id ? String(row.shop_id) : null, returnTo: String(row.return_to ?? "/") };
  });
}

export async function markShopUninstalled(db: Database, accountId: string, appKey: string): Promise<ShopRow | null> {
  return db.withTransaction(async (client) => {
    const shopResult = await client.query("SELECT id, account_id, shop_name, status FROM shops WHERE account_id = $1 FOR UPDATE", [accountId]);
    const row = shopResult.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const shopId = String(row.id);
    await client.query("UPDATE app_installations SET status = 'UNINSTALLED', uninstalled_at = NOW() WHERE shop_id = $1 AND app_key = $2", [shopId, appKey]);
    await client.query("UPDATE shops SET status = 'UNINSTALLED', updated_at = NOW() WHERE id = $1", [shopId]);
    await client.query("DELETE FROM oauth_tokens WHERE shop_id = $1", [shopId]);
    await client.query("UPDATE app_sessions SET revoked_at = NOW() WHERE shop_id = $1 AND revoked_at IS NULL", [shopId]);
    await client.query("UPDATE sale_jobs SET status = 'CANCELLED', lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE schedule_id IN (SELECT id FROM sale_schedules WHERE shop_id = $1) AND status IN ('QUEUED', 'RETRY_WAIT')", [shopId]);
    await client.query("UPDATE sale_schedule_items SET status = CASE WHEN status IN ('PENDING', 'RETRY_WAIT') THEN 'CANCELLED' WHEN status IN ('ACTIVE', 'STARTING', 'ENDING') THEN 'PARTIAL' ELSE status END, last_error = CASE WHEN status IN ('PENDING', 'RETRY_WAIT', 'ACTIVE', 'STARTING', 'ENDING') THEN 'アプリがアンインストールされたため、自動処理を停止しました。' ELSE last_error END, updated_at = NOW() WHERE shop_id = $1", [shopId]);
    await client.query("UPDATE sale_schedules SET status = CASE WHEN status IN ('SCHEDULED', 'STARTING') THEN 'CANCELLED' WHEN status IN ('ACTIVE', 'ENDING', 'PARTIAL', 'CONFLICT') THEN 'PARTIAL' ELSE status END, last_error = CASE WHEN status NOT IN ('COMPLETED', 'CANCELLED', 'FAILED') THEN 'アプリがアンインストールされたため、自動処理を停止しました。' ELSE last_error END, updated_at = NOW() WHERE shop_id = $1", [shopId]);
    return { id: shopId, accountId: String(row.account_id), shopName: String(row.shop_name ?? ""), status: "UNINSTALLED" };
  });
}

export async function findOverlappingProductIds(db: Queryable, shopId: string, productIds: number[], startAt: Date, endAt: Date): Promise<number[]> {
  if (!productIds.length) return [];
  const result = await db.query(
    `SELECT DISTINCT i.product_id
       FROM sale_schedule_items AS i
       JOIN sale_schedules AS s ON s.id = i.schedule_id
      WHERE i.shop_id = $1 AND i.product_id = ANY($2::bigint[])
        AND s.status NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')
        AND s.start_at < $3 AND s.end_at > $4`,
    [shopId, productIds, endAt, startAt]
  );
  return result.rows.map((row) => Number((row as Record<string, unknown>).product_id));
}

export async function createSchedule(
  db: Database,
  input: { id: string; shopId: string; pricingMode: "FIXED" | "DISCOUNT_RATE"; pricingValue: number; startAt: Date; endAt: Date; items: Array<{ productId: number; productName: string; originalPrice: number; scheduledPrice: number }> }
): Promise<{ schedule: ScheduleRow; items: ScheduleItemRow[] }> {
  return db.withTransaction(async (client) => {
    for (const productId of [...new Set(input.items.map((item) => item.productId))].sort((a, b) => a - b)) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${input.shopId}:${productId}`]);
    const overlapping = await client.query(
      `SELECT i.product_id FROM sale_schedule_items AS i JOIN sale_schedules AS s ON s.id = i.schedule_id
        WHERE i.shop_id = $1 AND i.product_id = ANY($2::bigint[])
          AND s.status NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')
          AND s.start_at < $3 AND s.end_at > $4 LIMIT 1`,
      [input.shopId, input.items.map((item) => item.productId), input.endAt, input.startAt]
    );
    if (overlapping.rowCount) throw new Error("SCHEDULE_OVERLAP");
    const scheduleResult = await client.query(
      `INSERT INTO sale_schedules (id, shop_id, status, pricing_mode, pricing_value, start_at, end_at, time_zone)
       VALUES ($1, $2, 'SCHEDULED', $3, $4, $5, $6, 'Asia/Tokyo') RETURNING ${scheduleColumns}`,
      [input.id, input.shopId, input.pricingMode, input.pricingValue, input.startAt, input.endAt]
    );
    const itemRows: ScheduleItemRow[] = [];
    for (const item of input.items) {
      const itemResult = await client.query(
        `INSERT INTO sale_schedule_items (id, schedule_id, shop_id, product_id, product_name, original_price, scheduled_price, current_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $6, 'PENDING') RETURNING ${itemColumns}`,
        [randomUUID(), input.id, input.shopId, item.productId, item.productName, item.originalPrice, item.scheduledPrice]
      );
      const itemRow = itemResult.rows[0] as Record<string, unknown>;
      itemRows.push(mapScheduleItem(itemRow));
      await client.query(
        `INSERT INTO sale_jobs (id, schedule_id, item_id, operation, status, run_at)
         VALUES ($1, $2, $3, 'START', 'QUEUED', $4)`,
        [randomUUID(), input.id, itemRow.id, input.startAt]
      );
    }
    return { schedule: mapSchedule(scheduleResult.rows[0] as Record<string, unknown>), items: itemRows };
  });
}

export async function listScheduleSummaries(db: Queryable, shopId: string, limit = 50): Promise<ScheduleSummaryRow[]> {
  const result = await db.query(
    `SELECT s.${scheduleColumns.replaceAll(", ", ", s.")},
       COUNT(i.id)::int AS item_count,
       COUNT(i.id) FILTER (WHERE i.status = 'COMPLETED')::int AS completed_count,
       COUNT(i.id) FILTER (WHERE i.status = 'ACTIVE')::int AS active_count,
       COUNT(i.id) FILTER (WHERE i.status IN ('FAILED', 'VERIFY_UNKNOWN', 'POST_WRITE_DIVERGENCE'))::int AS failed_count,
       COUNT(i.id) FILTER (WHERE i.status = 'CONFLICT')::int AS conflict_count
       FROM sale_schedules AS s LEFT JOIN sale_schedule_items AS i ON i.schedule_id = s.id
      WHERE s.shop_id = $1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT $2`,
    [shopId, Math.min(100, Math.max(1, limit))]
  );
  return result.rows.map((row) => {
    const value = row as Record<string, unknown>;
    return { ...mapSchedule(value), itemCount: Number(value.item_count), completedCount: Number(value.completed_count), activeCount: Number(value.active_count), failedCount: Number(value.failed_count), conflictCount: Number(value.conflict_count) };
  });
}

export async function getScheduleForShop(db: Queryable, shopId: string, scheduleId: string): Promise<ScheduleRow | null> {
  const result = await db.query(`SELECT ${scheduleColumns} FROM sale_schedules WHERE id = $1 AND shop_id = $2`, [scheduleId, shopId]);
  return result.rows[0] ? mapSchedule(result.rows[0] as Record<string, unknown>) : null;
}

export async function getScheduleItemsForShop(db: Queryable, shopId: string, scheduleId: string): Promise<ScheduleItemRow[]> {
  const result = await db.query(`SELECT ${itemColumns} FROM sale_schedule_items WHERE schedule_id = $1 AND shop_id = $2 ORDER BY created_at ASC`, [scheduleId, shopId]);
  return result.rows.map((row) => mapScheduleItem(row as Record<string, unknown>));
}

export async function cancelScheduledSchedule(db: Database, shopId: string, scheduleId: string): Promise<ScheduleRow | null> {
  return db.withTransaction(async (client) => {
    const result = await client.query(`SELECT ${scheduleColumns} FROM sale_schedules WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [scheduleId, shopId]);
    if (!result.rows[0]) return null;
    const current = mapSchedule(result.rows[0] as Record<string, unknown>);
    if (current.status !== "SCHEDULED") throw new Error("SCHEDULE_NOT_BEFORE_START");
    await client.query("UPDATE sale_jobs SET status = 'CANCELLED', updated_at = NOW() WHERE schedule_id = $1 AND status IN ('QUEUED', 'RETRY_WAIT')", [scheduleId]);
    await client.query("UPDATE sale_schedule_items SET status = 'CANCELLED', updated_at = NOW() WHERE schedule_id = $1 AND status IN ('PENDING', 'RETRY_WAIT')", [scheduleId]);
    const updated = await client.query(`UPDATE sale_schedules SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING ${scheduleColumns}`, [scheduleId]);
    return mapSchedule(updated.rows[0] as Record<string, unknown>);
  });
}

export async function requestScheduleEnd(db: Database, shopId: string, scheduleId: string): Promise<ScheduleRow | null> {
  return db.withTransaction(async (client) => {
    const result = await client.query(`SELECT ${scheduleColumns} FROM sale_schedules WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [scheduleId, shopId]);
    if (!result.rows[0]) return null;
    const current = mapSchedule(result.rows[0] as Record<string, unknown>);
    if (!["ACTIVE", "PARTIAL", "CONFLICT", "ENDING"].includes(current.status)) throw new Error("SCHEDULE_NOT_ACTIVE");
    const activeItems = await client.query("SELECT id FROM sale_schedule_items WHERE schedule_id = $1 AND status = 'ACTIVE' FOR UPDATE", [scheduleId]);
    if (current.status === "CONFLICT" && activeItems.rowCount === 0) return current;
    await client.query("UPDATE sale_schedules SET status = 'ENDING', updated_at = NOW() WHERE id = $1", [scheduleId]);
    for (const raw of activeItems.rows) {
      const itemId = String((raw as Record<string, unknown>).id);
      await client.query(
        `INSERT INTO sale_jobs (id, schedule_id, item_id, operation, status, run_at)
         VALUES ($1, $2, $3, 'END', 'QUEUED', NOW())
         ON CONFLICT (item_id, operation) DO UPDATE SET status = 'QUEUED', run_at = NOW(), lease_until = NULL, worker_id = NULL, updated_at = NOW()`,
        [randomUUID(), scheduleId, itemId]
      );
    }
    const updated = await client.query(`SELECT ${scheduleColumns} FROM sale_schedules WHERE id = $1`, [scheduleId]);
    return mapSchedule(updated.rows[0] as Record<string, unknown>);
  });
}

export async function retryFailedSchedule(db: Database, shopId: string, scheduleId: string): Promise<{ retried: number; schedule: ScheduleRow | null }> {
  return db.withTransaction(async (client) => {
    const scheduleResult = await client.query(`SELECT ${scheduleColumns} FROM sale_schedules WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [scheduleId, shopId]);
    if (!scheduleResult.rows[0]) return { retried: 0, schedule: null };
    const jobs = await client.query(
      "SELECT j.id, j.item_id, j.operation FROM sale_jobs j JOIN sale_schedule_items i ON i.id = j.item_id WHERE j.schedule_id = $1 AND j.status = 'FAILED' AND i.status = 'FAILED'",
      [scheduleId]
    );
    let retried = 0;
    let hasStart = false;
    let hasEnd = false;
    for (const raw of jobs.rows) {
      const row = raw as Record<string, unknown>;
      const operation = String(row.operation) as JobOperation;
      if (operation === "START") {
        hasStart = true;
        await client.query("UPDATE sale_schedule_items SET status = 'PENDING', last_error = NULL, conflict_reason = NULL, updated_at = NOW() WHERE id = $1 AND status = 'FAILED'", [row.item_id]);
      } else {
        hasEnd = true;
        await client.query("UPDATE sale_schedule_items SET status = 'ENDING', last_error = NULL, updated_at = NOW() WHERE id = $1 AND status = 'FAILED'", [row.item_id]);
      }
      await client.query("UPDATE sale_jobs SET status = 'QUEUED', run_at = NOW(), retry_count = 0, mutation_state = 'NOT_STARTED', last_error = NULL, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [row.id]);
      retried += 1;
    }
    const targetStatus = hasEnd ? "ENDING" : hasStart ? "SCHEDULED" : String((scheduleResult.rows[0] as Record<string, unknown>).status);
    const updated = await client.query(`UPDATE sale_schedules SET status = $2, last_error = NULL, updated_at = NOW() WHERE id = $1 RETURNING ${scheduleColumns}`, [scheduleId, targetStatus]);
    return { retried, schedule: mapSchedule(updated.rows[0] as Record<string, unknown>) };
  });
}

const dueJobQuery = `SELECT j.id, j.schedule_id, j.item_id, s.shop_id, j.operation, j.status AS job_status, j.run_at,
       j.retry_count AS job_retry_count, j.mutation_state, j.lease_until, j.worker_id,
       i.product_id, i.product_name, i.scheduled_price, i.effective_original_price, i.current_price,
       i.status AS item_status, s.status AS schedule_status, s.start_at AS schedule_start_at, s.end_at AS schedule_end_at
       FROM sale_jobs AS j
       JOIN sale_schedule_items AS i ON i.id = j.item_id
       JOIN sale_schedules AS s ON s.id = j.schedule_id
      WHERE j.status IN ('QUEUED', 'RETRY_WAIT') AND j.run_at <= NOW()
        AND s.status NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')
      ORDER BY j.run_at ASC, j.created_at ASC
      FOR UPDATE OF j SKIP LOCKED LIMIT 1`;

export async function claimDueJob(db: Database, workerId: string, leaseSeconds: number): Promise<ScheduleJobRow | null> {
  return db.withTransaction(async (client) => {
    const result = await client.query(dueJobQuery);
    if (!result.rows[0]) return null;
    const row = result.rows[0] as Record<string, unknown>;
    const jobId = String(row.id);
    const itemStatus = String(row.item_status);
    const nextItemStatus = row.operation === "START" ? "STARTING" : "ENDING";
    await client.query("UPDATE sale_jobs SET status = 'RUNNING', lease_until = NOW() + ($2 * INTERVAL '1 second'), worker_id = $3, updated_at = NOW() WHERE id = $1", [jobId, leaseSeconds, workerId]);
    if (["PENDING", "RETRY_WAIT", "ACTIVE", "STARTING", "ENDING"].includes(itemStatus)) await client.query("UPDATE sale_schedule_items SET status = $2, updated_at = NOW() WHERE id = $1", [row.item_id, nextItemStatus]);
    row.job_status = "RUNNING";
    row.item_status = nextItemStatus;
    row.worker_id = workerId;
    return mapScheduleJob(row);
  });
}

export async function recoverExpiredJobs(db: Database): Promise<string[]> {
  return db.withTransaction(async (client) => {
    const result = await client.query("UPDATE sale_jobs SET status = 'QUEUED', lease_until = NULL, worker_id = NULL, mutation_state = CASE WHEN mutation_state = 'IN_FLIGHT' THEN 'UNKNOWN' ELSE mutation_state END, updated_at = NOW() WHERE status = 'RUNNING' AND lease_until IS NOT NULL AND lease_until < NOW() RETURNING id, item_id, operation");
    for (const raw of result.rows) {
      const row = raw as Record<string, unknown>;
      await client.query("UPDATE sale_schedule_items SET status = CASE WHEN $2 = 'START' THEN 'PENDING' ELSE 'ACTIVE' END, updated_at = NOW() WHERE id = $1 AND status IN ('STARTING', 'ENDING', 'VERIFY_PENDING')", [row.item_id, row.operation]);
    }
    return result.rows.map((row) => String((row as Record<string, unknown>).id));
  });
}

export async function setJobMutationState(db: Queryable, jobId: string, state: "IN_FLIGHT" | "UNKNOWN" | "CONFIRMED"): Promise<void> {
  await db.query("UPDATE sale_jobs SET mutation_state = $2, updated_at = NOW() WHERE id = $1", [jobId, state]);
}

async function refreshScheduleStatus(client: Queryable, scheduleId: string): Promise<void> {
  const result = await client.query("SELECT status, COUNT(*)::int AS count FROM sale_schedule_items WHERE schedule_id = $1 GROUP BY status", [scheduleId]);
  const counts = new Map<string, number>(result.rows.map((row) => { const value = row as Record<string, unknown>; return [String(value.status), Number(value.count)]; }));
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const count = (status: string) => counts.get(status) ?? 0;
  let status: ScheduleStatus;
  if (total > 0 && count("CANCELLED") === total) status = "CANCELLED";
  else if (count("CONFLICT") > 0) status = "CONFLICT";
  else if (count("FAILED") > 0 || count("VERIFY_UNKNOWN") > 0 || count("POST_WRITE_DIVERGENCE") > 0) {
    const remainingOrCompleted = count("PENDING") + count("RETRY_WAIT") + count("STARTING") + count("ACTIVE") + count("ENDING") + count("VERIFY_PENDING") + count("COMPLETED");
    status = remainingOrCompleted > 0 ? "PARTIAL" : "FAILED";
  }
  else if (total > 0 && count("COMPLETED") === total) status = "COMPLETED";
  else if (count("ENDING") > 0) status = "ENDING";
  else if (count("ACTIVE") > 0) status = "ACTIVE";
  else if (count("STARTING") > 0) status = "STARTING";
  else status = "SCHEDULED";
  await client.query("UPDATE sale_schedules SET status = $2, updated_at = NOW() WHERE id = $1 AND status NOT IN ('CANCELLED', 'COMPLETED')", [scheduleId, status]);
}

export async function setEffectiveOriginalPrice(db: Database, itemId: string, currentPrice: number): Promise<void> {
  await db.query("UPDATE sale_schedule_items SET effective_original_price = COALESCE(effective_original_price, $2), current_price = $2, updated_at = NOW() WHERE id = $1", [itemId, currentPrice]);
}

export async function setVerificationPending(db: Database, itemId: string): Promise<void> {
  await db.query("UPDATE sale_schedule_items SET status = 'VERIFY_PENDING', last_error = NULL, conflict_reason = NULL, updated_at = NOW() WHERE id = $1", [itemId]);
}

export async function completeStartJob(db: Database, jobId: string, itemId: string, scheduleId: string, responseStatus = 200): Promise<void> {
  await db.withTransaction(async (client) => {
    await client.query("UPDATE sale_jobs SET status = 'SUCCEEDED', mutation_state = 'CONFIRMED', last_response_status = $2, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [jobId, responseStatus]);
    await client.query("UPDATE sale_schedule_items SET status = 'ACTIVE', current_price = scheduled_price, started_at = COALESCE(started_at, NOW()), last_error = NULL, conflict_reason = NULL, updated_at = NOW() WHERE id = $1", [itemId]);
    await client.query(
      `INSERT INTO sale_jobs (id, schedule_id, item_id, operation, status, run_at)
       SELECT $1, $2, $3, 'END', 'QUEUED', end_at FROM sale_schedules WHERE id = $2
       ON CONFLICT (item_id, operation) DO NOTHING`,
      [randomUUID(), scheduleId, itemId]
    );
    await refreshScheduleStatus(client, scheduleId);
  });
}

export async function completeEndJob(db: Database, jobId: string, itemId: string, scheduleId: string, responseStatus = 200): Promise<void> {
  await db.withTransaction(async (client) => {
    await client.query("UPDATE sale_jobs SET status = 'SUCCEEDED', mutation_state = 'CONFIRMED', last_response_status = $2, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [jobId, responseStatus]);
    await client.query("UPDATE sale_schedule_items SET status = 'COMPLETED', current_price = effective_original_price, ended_at = COALESCE(ended_at, NOW()), last_error = NULL, conflict_reason = NULL, updated_at = NOW() WHERE id = $1", [itemId]);
    await refreshScheduleStatus(client, scheduleId);
  });
}

export async function completeSkippedStartJob(db: Database, jobId: string, itemId: string, scheduleId: string, reason: string): Promise<void> {
  await db.withTransaction(async (client) => {
    await client.query("UPDATE sale_jobs SET status = 'CANCELLED', last_error = $2, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [jobId, reason]);
    await client.query("UPDATE sale_schedule_items SET status = 'CANCELLED', last_error = $2, updated_at = NOW() WHERE id = $1", [itemId, reason]);
    await refreshScheduleStatus(client, scheduleId);
  });
}

export async function markJobConflict(db: Database, jobId: string, itemId: string, scheduleId: string, currentPrice: number | null, reason: string): Promise<void> {
  await db.withTransaction(async (client) => {
    await client.query("UPDATE sale_jobs SET status = 'SUCCEEDED', mutation_state = 'CONFIRMED', last_error = $2, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [jobId, reason]);
    await client.query("UPDATE sale_schedule_items SET status = 'CONFLICT', current_price = $2, conflict_reason = $3, last_error = $3, updated_at = NOW() WHERE id = $1", [itemId, currentPrice, reason]);
    await client.query("UPDATE sale_schedules SET last_error = $2, updated_at = NOW() WHERE id = $1", [scheduleId, reason]);
    await refreshScheduleStatus(client, scheduleId);
  });
}

export async function markVerificationUncertain(
  db: Database,
  jobId: string,
  itemId: string,
  scheduleId: string,
  status: "VERIFY_UNKNOWN" | "POST_WRITE_DIVERGENCE",
  currentPrice: number | null,
  reason: string,
  responseStatus: number | null = 200
): Promise<void> {
  await db.withTransaction(async (client) => {
    await client.query("UPDATE sale_jobs SET status = 'FAILED', mutation_state = 'UNKNOWN', last_error = $2, last_response_status = $3, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [jobId, reason, responseStatus]);
    await client.query("UPDATE sale_schedule_items SET status = $2, current_price = $3, conflict_reason = NULL, last_error = $4, updated_at = NOW() WHERE id = $1", [itemId, status, currentPrice, reason]);
    await client.query("UPDATE sale_schedules SET last_error = $2, updated_at = NOW() WHERE id = $1", [scheduleId, reason]);
    await refreshScheduleStatus(client, scheduleId);
  });
}

export async function scheduleJobRetry(db: Database, jobId: string, itemId: string, scheduleId: string, nextRunAt: Date, errorMessage: string, mutationState: "NOT_STARTED" | "UNKNOWN", responseStatus: number | null): Promise<void> {
  await db.withTransaction(async (client) => {
    await client.query("UPDATE sale_jobs SET status = 'RETRY_WAIT', run_at = $2, retry_count = retry_count + 1, mutation_state = $3, last_error = $4, last_response_status = $5, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [jobId, nextRunAt, mutationState, errorMessage, responseStatus]);
    await client.query("UPDATE sale_schedule_items SET status = 'RETRY_WAIT', retry_count = retry_count + 1, last_error = $2, updated_at = NOW() WHERE id = $1", [itemId, errorMessage]);
    await client.query("UPDATE sale_schedules SET last_error = $2, updated_at = NOW() WHERE id = $1", [scheduleId, errorMessage]);
  });
}

export async function failJobPermanently(db: Database, jobId: string, itemId: string, scheduleId: string, errorMessage: string, responseStatus: number | null): Promise<void> {
  await db.withTransaction(async (client) => {
    await client.query("UPDATE sale_jobs SET status = 'FAILED', last_error = $2, last_response_status = $3, lease_until = NULL, worker_id = NULL, updated_at = NOW() WHERE id = $1", [jobId, errorMessage, responseStatus]);
    await client.query("UPDATE sale_schedule_items SET status = 'FAILED', last_error = $2, updated_at = NOW() WHERE id = $1", [itemId, errorMessage]);
    await client.query("UPDATE sale_schedules SET last_error = $2, updated_at = NOW() WHERE id = $1", [scheduleId, errorMessage]);
    await refreshScheduleStatus(client, scheduleId);
  });
}

export async function recordAudit(db: Queryable, input: AuditInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (id, request_id, shop_id, schedule_id, item_id, event_type, endpoint, from_price, to_price, response_status, retry_count, error_code, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
    [randomUUID(), input.requestId ?? null, input.shopId ?? null, input.scheduleId ?? null, input.itemId ?? null, input.eventType, input.endpoint ?? null, input.fromPrice ?? null, input.toPrice ?? null, input.responseStatus ?? null, input.retryCount ?? null, input.errorCode ?? null, JSON.stringify(input.metadata ?? {})]
  );
}

export async function listAuditForSchedule(db: Queryable, shopId: string, scheduleId: string): Promise<Array<Record<string, unknown>>> {
  const result = await db.query(
    `SELECT a.created_at, a.event_type, a.item_id, a.endpoint, a.from_price, a.to_price, a.response_status, a.retry_count, a.error_code, a.metadata
       FROM audit_logs AS a WHERE a.shop_id = $1 AND a.schedule_id = $2 ORDER BY a.created_at ASC`,
    [shopId, scheduleId]
  );
  return result.rows.map((row) => {
    const value = row as Record<string, unknown>;
    return { createdAt: iso(value.created_at), eventType: value.event_type, itemId: value.item_id, endpoint: value.endpoint, fromPrice: value.from_price, toPrice: value.to_price, responseStatus: value.response_status, retryCount: value.retry_count, errorCode: value.error_code, metadata: value.metadata };
  });
}

export type { ScheduleItemRow, ScheduleJobRow, ScheduleRow, ShopRow } from "./types";
