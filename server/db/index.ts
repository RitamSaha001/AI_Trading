import { config, isProd } from '../config';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
const { Pool } = pg;
import { runMigrations, runMigrationsSync, getMigrationStatus, MigrationStatus } from './migrator';

// Unified Database Interface
export interface DBClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
  transaction<T>(fn: (tx: DBClient) => Promise<T>): Promise<T>;
  isPostgres(): boolean;
  getEngine(): 'postgresql' | 'sqlite';
  close(): Promise<void> | void;
  acquireAdvisoryLock?(key: bigint | number): Promise<void>;
  releaseAdvisoryLock?(key: bigint | number): Promise<void>;
  tryAdvisoryLock?(key: bigint | number): Promise<boolean>;
  getPoolStats?(): { totalCount: number; idleCount: number; waitingCount: number };
}

let activeDbClient: DBClient | null = null;
let isMigrationsInitialized = false;

/**
 * SQLite Implementation using Node 22+ built-in `node:sqlite`
 * Used strictly for local development and unit tests.
 */
export class SQLiteClient implements DBClient {
  public db: any;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private txStorage = new AsyncLocalStorage<{ depth: number }>();
  private txMutex: Promise<void> = Promise.resolve();

  isPostgres(): boolean {
    return false;
  }

  getEngine(): 'postgresql' | 'sqlite' {
    return 'sqlite';
  }

  /**
   * Automatically strips PostgreSQL-specific row-locking keywords (e.g. FOR UPDATE)
   * which cause syntax errors in SQLite. SQLite transactions naturally serialize writes.
   */
  private cleanSql(sql: string): string {
    return sql.replace(/\s+FOR\s+UPDATE\b/gi, '');
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const cleaned = this.cleanSql(sql);
    const stmt = this.db.prepare(cleaned);
    stmt.setReadBigInts(true);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) => {
      const o: any = {};
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'bigint') {
          // Strictly preserve native BigInt for all minor-unit accounting fields and values >= 2^53
          if (k.endsWith('_minor') || v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
            o[k] = v;
          } else {
            o[k] = Number(v);
          }
        } else {
          o[k] = v;
        }
      }
      return o;
    }) as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    const cleaned = this.cleanSql(sql);
    const stmt = this.db.prepare(cleaned);
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
          try {
            this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
          } catch {}
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
          try {
            this.db.exec('ROLLBACK;');
          } catch {}
          throw err;
        }
      });
    } finally {
      releaseLock!();
    }
  }

  execRaw(sql: string): void {
    this.db.exec(this.cleanSql(sql));
  }

  close(): void {
    this.db.close();
  }
}

/**
 * PostgreSQL Implementation using hardened `pg` connection pool
 * Mandatory for Production environments.
 */
export class PostgresClient implements DBClient {
  private pool: any;
  private advisoryClients = new Map<string, any>();

  constructor(connectionString: string) {
    const maxPoolSize = Number(process.env.DB_POOL_MAX || process.env.PGPOOL_MAX || 20);

    this.pool = new Pool({
      connectionString,
      max: maxPoolSize,
      min: 2,
      connectionTimeoutMillis: 5000, // 5s connection acquisition timeout (fail fast)
      idleTimeoutMillis: 30000,      // 30s idle connection timeout
      statement_timeout: 10000,      // 10s individual query timeout
      query_timeout: 10000,          // 10s client query timeout
      keepAlive: true,
    });

    // Guard against unhandled error events on idle clients in the pool
    this.pool.on('error', (err: any) => {
      console.error('[PostgresClient] Unexpected error on idle PostgreSQL client:', err.message);
    });
  }

  isPostgres(): boolean {
    return true;
  }

  getEngine(): 'postgresql' | 'sqlite' {
    return 'postgresql';
  }

  getPoolStats(): { totalCount: number; idleCount: number; waitingCount: number } {
    return {
      totalCount: this.pool.totalCount || 0,
      idleCount: this.pool.idleCount || 0,
      waitingCount: this.pool.waitingCount || 0,
    };
  }

  private normalizeSql(sql: string): string {
    let index = 1;
    let normalized = sql.replace(/\?/g, () => `$${index++}`);
    // PostgreSQL requires boolean defaults and comparisons to use boolean literals (FALSE/TRUE), not integers (0/1)
    normalized = normalized.replace(/\bBOOLEAN\b(\s+NOT\s+NULL)?\s+DEFAULT\s+0\b/gi, 'BOOLEAN$1 DEFAULT FALSE');
    normalized = normalized.replace(/\bBOOLEAN\b(\s+NOT\s+NULL)?\s+DEFAULT\s+1\b/gi, 'BOOLEAN$1 DEFAULT TRUE');
    normalized = normalized.replace(/\b(is_[a-z0-9_]+|can_[a-z0-9_]+|has_[a-z0-9_]+)\s*=\s*1\b/gi, '$1 = TRUE');
    normalized = normalized.replace(/\b(is_[a-z0-9_]+|can_[a-z0-9_]+|has_[a-z0-9_]+)\s*=\s*0\b/gi, '$1 = FALSE');
    return normalized;
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

  /**
   * Acquires a session-level PostgreSQL advisory lock on a dedicated connection.
   */
  async acquireAdvisoryLock(key: bigint | number): Promise<void> {
    const k = key.toString();
    let client = this.advisoryClients.get(k);
    if (!client) {
      client = await this.pool.connect();
      this.advisoryClients.set(k, client);
    }
    await client.query('SELECT pg_advisory_lock($1)', [k]);
  }

  /**
   * Releases a session-level PostgreSQL advisory lock and returns connection to pool.
   */
  async releaseAdvisoryLock(key: bigint | number): Promise<void> {
    const k = key.toString();
    const client = this.advisoryClients.get(k);
    if (client) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [k]);
      } finally {
        client.release();
        this.advisoryClients.delete(k);
      }
    }
  }

  /**
   * Tries to acquire a session-level PostgreSQL advisory lock without blocking.
   * Holds the dedicated connection client if acquired; releases immediately if not.
   */
  async tryAdvisoryLock(key: bigint | number): Promise<boolean> {
    const k = key.toString();
    if (this.advisoryClients.has(k)) {
      return true;
    }
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [k]);
      const acquired = Boolean(res.rows[0]?.acquired);
      if (acquired) {
        this.advisoryClients.set(k, client);
        return true;
      } else {
        client.release();
        return false;
      }
    } catch (err) {
      client.release(true);
      throw err;
    }
  }

  async transaction<T>(fn: (tx: DBClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let depth = 0;
    let inError = false;

    try {
      await client.query('BEGIN');

      const createTxClient = (currentDepth: number): DBClient => ({
        isPostgres: () => true,
        getEngine: () => 'postgresql',
        query: async <R = any>(sql: string, params: any[] = []): Promise<R[]> => {
          const normalized = this.normalizeSql(sql);
          const res = await client.query(normalized, params);
          return res.rows as R[];
        },
        queryOne: async <R = any>(sql: string, params: any[] = []): Promise<R | null> => {
          const rows = await createTxClient(currentDepth).query<R>(sql, params);
          return rows.length > 0 ? rows[0] : null;
        },
        execute: async (sql: string, params: any[] = []): Promise<{ changes: number }> => {
          const normalized = this.normalizeSql(sql);
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
        close: () => {},
      });

      const result = await fn(createTxClient(0));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      inError = true;
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw err;
    } finally {
      // Discard client from pool if network/socket error occurred
      client.release(inError);
    }
  }

  async close(): Promise<void> {
    for (const [k, client] of this.advisoryClients.entries()) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [k]);
      } catch {}
      try {
        client.release(true);
      } catch {}
    }
    this.advisoryClients.clear();
    await this.pool.end();
  }
}

/**
 * Ensures production PostgreSQL requirement is strictly enforced.
 */
function assertProductionDbConfig(): void {
  if (config.NODE_ENV === 'production') {
    if (
      !config.DATABASE_URL ||
      (!config.DATABASE_URL.startsWith('postgres://') && !config.DATABASE_URL.startsWith('postgresql://'))
    ) {
      throw new Error(
        'FATAL: Production mode strictly requires a valid PostgreSQL DATABASE_URL. SQLite is strictly forbidden in production.'
      );
    }
  }
}

/**
 * Initializes and returns the active database connection.
 * Guarantees fail-closed PostgreSQL requirement in production.
 */
export function getDb(): DBClient {
  if (activeDbClient) return activeDbClient;

  // In test mode, default to isolated SQLite unless explicitly running Postgres integration tests
  if (config.NODE_ENV === 'test' && !process.env.USE_POSTGRES_IN_TESTS) {
    activeDbClient = new SQLiteClient(config.SQLITE_PATH);
  } else if (config.DATABASE_URL && (config.DATABASE_URL.startsWith('postgres://') || config.DATABASE_URL.startsWith('postgresql://'))) {
    activeDbClient = new PostgresClient(config.DATABASE_URL);
  } else {
    activeDbClient = new SQLiteClient(config.SQLITE_PATH);
  }

  // If SQLite, run migrations synchronously on initialization to guarantee ready state
  if (!isMigrationsInitialized && !activeDbClient.isPostgres()) {
    isMigrationsInitialized = true;
    runMigrationsSync(activeDbClient as SQLiteClient);
  }

  return activeDbClient;
}

/**
 * Explicit asynchronous database initializer called during server startup.
 * Runs versioned forward-only migrations with advisory lock protection.
 */
export async function initDb(): Promise<DBClient> {
  const db = getDb();
  await runMigrations(db);
  isMigrationsInitialized = true;
  return db;
}

/**
 * Closes the active database connection cleanly.
 */
export async function closeDb(): Promise<void> {
  if (activeDbClient) {
    await activeDbClient.close();
    activeDbClient = null;
    isMigrationsInitialized = false;
  }
}

/**
 * Sets a custom DB client (useful for in-memory testing).
 */
export function setDb(client: DBClient | null): void {
  if (config.NODE_ENV === 'production' && client && !client.isPostgres()) {
    throw new Error('FATAL: Refusing to assign non-PostgreSQL DB client in production mode.');
  }
  activeDbClient = client;
  isMigrationsInitialized = false;
}

export { runMigrations, getMigrationStatus };
export type { MigrationStatus };
