import { config } from '../config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

// Unified Database Interface
export interface DBClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
  transaction<T>(fn: (tx: DBClient) => Promise<T>): Promise<T>;
}

let activeDbClient: DBClient | null = null;

/**
 * SQLite Implementation using Node 26 built-in `node:sqlite`
 */
class SQLiteClient implements DBClient {
  private db: any;

  constructor(dbPath: string) {
    // Dynamic import to support node:sqlite
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite');
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private txStorage = new AsyncLocalStorage<{ depth: number }>();
  private txMutex: Promise<void> = Promise.resolve();

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async transaction<T>(fn: (tx: DBClient) => Promise<T>): Promise<T> {
    const parent = this.txStorage.getStore();
    if (parent) {
      // Nested transaction within the same async context -> SAVEPOINT
      const depth = parent.depth + 1;
      const savepointName = `sp_${depth}`;
      this.db.exec(`SAVEPOINT ${savepointName};`);
      return this.txStorage.run({ depth }, async () => {
        try {
          const result = await fn(this);
          this.db.exec(`RELEASE SAVEPOINT ${savepointName};`);
          return result;
        } catch (err) {
          try { this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`); } catch {}
          throw err;
        }
      });
    }

    // Top-level transaction -> serialize via mutex to prevent concurrent BEGIN/COMMIT races
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const prevMutex = this.txMutex;
    this.txMutex = this.txMutex.then(() => lockPromise, () => lockPromise);

    await prevMutex.catch(() => {});

    try {
      this.db.exec('BEGIN TRANSACTION;');
      return await this.txStorage.run({ depth: 0 }, async () => {
        try {
          const result = await fn(this);
          this.db.exec('COMMIT;');
          return result;
        } catch (err) {
          try { this.db.exec('ROLLBACK;'); } catch {}
          throw err;
        }
      });
    } finally {
      releaseLock!();
    }
  }

  execRaw(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * PostgreSQL Implementation using `pg` pool
 */
class PostgresClient implements DBClient {
  private pool: any;

  constructor(connectionString: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString });
  }

  private normalizeSql(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const normalized = this.normalizeSql(sql);
    const res = await this.pool.query(normalized, params);
    return res.rows as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
    const normalized = this.normalizeSql(sql);
    const res = await this.pool.query(normalized, params);
    return { changes: res.rowCount || 0 };
  }

  async transaction<T>(fn: (tx: DBClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let depth = 0;
    try {
      await client.query('BEGIN');
      const createTxClient = (currentDepth: number): DBClient => ({
        query: async <R = any>(sql: string, params: any[] = []): Promise<R[]> => {
          let index = 1;
          const normalized = sql.replace(/\?/g, () => `$${index++}`);
          const res = await client.query(normalized, params);
          return res.rows as R[];
        },
        queryOne: async <R = any>(sql: string, params: any[] = []): Promise<R | null> => {
          const rows = await createTxClient(currentDepth).query<R>(sql, params);
          return rows.length > 0 ? rows[0] : null;
        },
        execute: async (sql: string, params: any[] = []): Promise<{ changes: number }> => {
          let index = 1;
          const normalized = sql.replace(/\?/g, () => `$${index++}`);
          const res = await client.query(normalized, params);
          return { changes: res.rowCount || 0 };
        },
        transaction: async <SubT>(nestedFn: (nestedTx: DBClient) => Promise<SubT>): Promise<SubT> => {
          const spId = ++depth;
          const spName = `sp_${spId}`;
          await client.query(`SAVEPOINT ${spName}`);
          try {
            const res = await nestedFn(createTxClient(spId));
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            return res;
          } catch (err) {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            throw err;
          }
        },
      });

      const result = await fn(createTxClient(0));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Initializes and returns the active database connection.
 * Runs `schema.sql` automatically on initialization.
 */
export function getDb(): DBClient {
  if (activeDbClient) return activeDbClient;

  if (config.DATABASE_URL && config.DATABASE_URL.startsWith('postgres')) {
    activeDbClient = new PostgresClient(config.DATABASE_URL);
  } else {
    activeDbClient = new SQLiteClient(config.SQLITE_PATH);
  }

  // Load and apply schema
  const schemaPath = path.resolve(process.cwd(), 'server/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    try {
      if ('execRaw' in (activeDbClient as any)) {
        (activeDbClient as any).execRaw(schemaSql);
      } else {
        activeDbClient.execute(schemaSql);
      }
    } catch (err: any) {
      console.warn('Database schema init warning:', err.message);
    }
  }

  // Run non-destructive migrations for newly added exact precision columns
  runSchemaMigrations(activeDbClient);

  return activeDbClient;
}

/**
 * Non-destructive, idempotent migrations for financial execution schema updates.
 */
function runSchemaMigrations(db: DBClient): void {
  const migrations = [
    // exchange_orders exact precision columns
    `ALTER TABLE exchange_orders ADD COLUMN orig_qty_exact TEXT;`,
    `ALTER TABLE exchange_orders ADD COLUMN executed_qty_exact TEXT DEFAULT '0';`,
    `ALTER TABLE exchange_orders ADD COLUMN price_exact TEXT;`,
    `ALTER TABLE exchange_orders ADD COLUMN avg_price_exact TEXT DEFAULT '0';`,
    `ALTER TABLE exchange_orders ADD COLUMN cumulative_quote_exact TEXT DEFAULT '0';`,
    `ALTER TABLE exchange_orders ADD COLUMN notional_exact TEXT;`,
    `ALTER TABLE exchange_orders ADD COLUMN fee_exact TEXT DEFAULT '0';`,
    `ALTER TABLE exchange_orders ADD COLUMN fee_asset TEXT;`,
    `ALTER TABLE exchange_orders ADD COLUMN reserved_cash_minor BIGINT DEFAULT 0;`,
    `ALTER TABLE exchange_orders ADD COLUMN reserved_qty_minor BIGINT DEFAULT 0;`,
    // exchange_fills exact precision columns
    `ALTER TABLE exchange_fills ADD COLUMN price_exact TEXT;`,
    `ALTER TABLE exchange_fills ADD COLUMN qty_exact TEXT;`,
    `ALTER TABLE exchange_fills ADD COLUMN commission_exact TEXT;`,
    `ALTER TABLE exchange_fills ADD COLUMN quote_qty_exact TEXT;`,
    // order_reservations table
    `CREATE TABLE IF NOT EXISTS order_reservations (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      account_mode TEXT NOT NULL DEFAULT 'live',
      asset_or_currency TEXT NOT NULL,
      amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PARTIALLY_CONSUMED', 'CONSUMED', 'RELEASED')),
      consumed_minor BIGINT NOT NULL DEFAULT 0 CHECK (consumed_minor >= 0),
      released_minor BIGINT NOT NULL DEFAULT 0 CHECK (released_minor >= 0),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE(order_id, account_id),
      CHECK (consumed_minor + released_minor <= amount_minor)
    );`,
    `ALTER TABLE order_reservations ADD COLUMN account_mode TEXT DEFAULT 'live';`,
    `CREATE INDEX IF NOT EXISTS idx_order_reservations_order ON order_reservations(order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_order_reservations_user ON order_reservations(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_order_reservations_status ON order_reservations(status);`,
  ];

  for (const sql of migrations) {
    try {
      if ('execRaw' in (db as any)) {
        (db as any).execRaw(sql);
      } else {
        db.execute(sql);
      }
    } catch {
      // Column or table already exists; silently ignore
    }
  }
}

/**
 * Sets a custom DB client (useful for in-memory testing).
 */
export function setDb(client: DBClient | null): void {
  activeDbClient = client;
}
