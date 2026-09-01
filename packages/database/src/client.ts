import pg, { type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const { Pool } = pg;

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

export class Database implements Queryable {
  readonly pool;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const configuredPoolMax = Number(process.env.DB_POOL_MAX ?? 10);
    this.pool = new Pool({
      connectionString,
      max: Number.isFinite(configuredPoolMax) ? Math.max(1, Math.floor(configuredPoolMax)) : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.NODE_ENV === "production" && process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined
    });
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Serialize all external mutations for one shop/product pair. */
  async withProductLock<T>(shopId: string, productId: number, callback: () => Promise<T>): Promise<T> {
    return this.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`product:${shopId}:${productId}`]);
      return callback();
    });
  }

  async ping(): Promise<void> {
    await this.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
