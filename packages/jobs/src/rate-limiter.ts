import { randomUUID } from "node:crypto";
import type { Database } from "@sale-scheduler/database";

export interface ShopRateLimiter {
  acquire(shopId: string): Promise<void>;
}

export interface RateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  maxWaitMs?: number;
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * A small PostgreSQL-backed sliding-window limiter. The transaction advisory
 * lock serializes the check and insert for each shop across all workers.
 */
export class PostgresShopRateLimiter implements ShopRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxWaitMs: number;

  constructor(private readonly db: Database, options: RateLimiterOptions = {}) {
    this.maxRequests = Math.max(1, Math.floor(options.maxRequests ?? Number(process.env.API_RATE_LIMIT_REQUESTS ?? 4)));
    this.windowMs = Math.max(1_000, Math.floor(options.windowMs ?? Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 10_000)));
    this.maxWaitMs = Math.max(this.windowMs * 2, Math.floor(options.maxWaitMs ?? 120_000));
  }

  async acquire(shopId: string): Promise<void> {
    const safeShopId = shopId;
    for (;;) {
      const waitMs = await this.db.withTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`rate:${safeShopId}`]);
        await client.query("DELETE FROM api_rate_events WHERE requested_at < NOW() - ($1 * INTERVAL '1 millisecond')", [this.windowMs]);
        const result = await client.query(
          "SELECT requested_at FROM api_rate_events WHERE shop_id = $1 AND requested_at >= NOW() - ($2 * INTERVAL '1 millisecond') ORDER BY requested_at ASC",
          [safeShopId, this.windowMs]
        );
        if (result.rowCount !== null && result.rowCount < this.maxRequests) {
          await client.query("INSERT INTO api_rate_events (id, shop_id, requested_at) VALUES ($1, $2, NOW())", [randomUUID(), safeShopId]);
          return 0;
        }
        const oldest = result.rows[0]?.requested_at;
        const oldestTime = oldest instanceof Date ? oldest.getTime() : Date.parse(String(oldest));
        const delay = Number.isFinite(oldestTime) ? Math.max(50, oldestTime + this.windowMs - Date.now() + 25) : this.windowMs;
        return Math.min(this.maxWaitMs, delay);
      });
      if (waitMs <= 0) return;
      await sleep(waitMs);
    }
  }
}

export class NoopRateLimiter implements ShopRateLimiter {
  async acquire(_shopId: string): Promise<void> {
    return Promise.resolve();
  }
}
