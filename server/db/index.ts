import { config } from '../config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  private txDepth = 0;

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
    const depth = this.txDepth++;
    const savepointName = `sp_${depth}`;
    if (depth === 0) {
      this.db.exec('BEGIN TRANSACTION;');
    } else {
      this.db.exec(`SAVEPOINT ${savepointName};`);
    }

    try {
      const result = await fn(this);
      if (depth === 0) {
        this.db.exec('COMMIT;');
      } else {
        this.db.exec(`RELEASE SAVEPOINT ${savepointName};`);
      }
      return result;
    } catch (err) {
      if (depth === 0) {
        this.db.exec('ROLLBACK;');
      } else {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
      }
      throw err;
    } finally {
      this.txDepth--;
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

  return activeDbClient;
}

/**
 * Sets a custom DB client (useful for in-memory testing).
 */
export function setDb(client: DBClient | null): void {
  activeDbClient = client;
}
