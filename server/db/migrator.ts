import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DBClient, SQLiteClient } from './index';

export interface MigrationRecord {
  version: string;
  name: string;
  checksum: string;
  applied_at: number;
  execution_time_ms: number;
}

export interface MigrationStatus {
  isUpToDate: boolean;
  applied: MigrationRecord[];
  pending: string[];
  latestVersion: string;
}

export const MIGRATION_ADVISORY_LOCK_ID = 8492049102938491n;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

// In-process mutex for SQLite concurrent migration calls within the same process
let sqliteMigrationMutex: Promise<void> = Promise.resolve();

/**
 * Computes deterministic SHA-256 checksum of migration SQL file.
 */
export function computeMigrationChecksum(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Loads and sorts migration files deterministically from disk.
 */
export function loadMigrationFiles(migrationsDir: string = DEFAULT_MIGRATIONS_DIR): Array<{
  version: string;
  name: string;
  filename: string;
  filepath: string;
  sql: string;
  checksum: string;
}> {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const filepath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    const name = filename.replace(/\.sql$/, '');
    const versionMatch = filename.match(/^([0-9]+)/);
    const version = versionMatch ? versionMatch[1] : name;
    const checksum = computeMigrationChecksum(sql);

    return {
      version,
      name,
      filename,
      filepath,
      sql,
      checksum,
    };
  });
}

/**
 * Preprocesses SQL for SQLite compatibility:
 * Strips comments, parses statements, and converts
 * `ALTER TABLE <table> ADD COLUMN [IF NOT EXISTS] <col> <def>`
 * into conditional column creation via `PRAGMA table_info`.
 */
export function executeSqlForSQLiteSync(rawDb: any, sql: string): void {
  // Strip comments first
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    const addColMatch = stmt.match(
      /^\s*ALTER\s+TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)([\s\S]*)$/i
    );

    if (addColMatch) {
      const tableName = addColMatch[1];
      const colName = addColMatch[2];
      const colDef = addColMatch[3].trim();

      try {
        const tableInfo = rawDb.prepare(`PRAGMA table_info(${tableName})`).all();
        const exists = tableInfo.some((col: any) => col.name.toLowerCase() === colName.toLowerCase());
        if (exists) {
          continue;
        }
        rawDb.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef}`);
      } catch (err: any) {
        throw new Error(`Failed to alter table ${tableName} on SQLite: ${err.message}`);
      }
    } else {
      rawDb.exec(stmt);
    }
  }
}

/**
 * Ensures the `schema_migrations` tracking table exists.
 */
export async function ensureMigrationTable(db: DBClient): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(32) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at BIGINT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    );
  `);
}

/**
 * Synchronously ensures schema_migrations table exists for SQLite.
 */
export function ensureMigrationTableSync(rawDb: any): void {
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(32) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at BIGINT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    );
  `);
}

/**
 * Fetches all applied migrations ordered by version ascending.
 */
export async function getAppliedMigrations(db: DBClient): Promise<MigrationRecord[]> {
  await ensureMigrationTable(db);
  const rows = await db.query<any>(
    `SELECT version, name, checksum, applied_at, execution_time_ms FROM schema_migrations ORDER BY version ASC`
  );
  return rows.map((r) => ({
    version: String(r.version),
    name: String(r.name),
    checksum: String(r.checksum),
    applied_at: Number(r.applied_at),
    execution_time_ms: Number(r.execution_time_ms),
  }));
}

/**
 * Checks migration status without modifying state (used for Readiness probes).
 */
export async function getMigrationStatus(
  db: DBClient,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR
): Promise<MigrationStatus> {
  const diskMigrations = loadMigrationFiles(migrationsDir);
  const applied = await getAppliedMigrations(db);
  const appliedMap = new Map(applied.map((m) => [m.version, m]));

  const pending: string[] = [];
  for (const m of diskMigrations) {
    if (!appliedMap.has(m.version)) {
      pending.push(m.name);
    }
  }

  const latestDiskVersion = diskMigrations.length > 0 ? diskMigrations[diskMigrations.length - 1].version : '0';
  const isUpToDate = pending.length === 0 && (diskMigrations.length === 0 || applied.length >= diskMigrations.length);

  return {
    isUpToDate,
    applied,
    pending,
    latestVersion: latestDiskVersion,
  };
}

/**
 * Runs migrations synchronously for SQLite instances.
 * Guarantees zero-race initialization for unit tests and local development.
 */
export function runMigrationsSync(
  sqliteClient: SQLiteClient,
  options: { migrationsDir?: string } = {}
): { appliedCount: number; migrations: MigrationRecord[] } {
  const rawDb = sqliteClient.db;
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;

  ensureMigrationTableSync(rawDb);

  const diskMigrations = loadMigrationFiles(migrationsDir);
  const appliedRows = rawDb.prepare(
    `SELECT version, name, checksum, applied_at, execution_time_ms FROM schema_migrations ORDER BY version ASC`
  ).all() as any[];

  const appliedMap = new Map(
    appliedRows.map((r) => [
      String(r.version),
      {
        version: String(r.version),
        name: String(r.name),
        checksum: String(r.checksum),
        applied_at: Number(r.applied_at),
        execution_time_ms: Number(r.execution_time_ms),
      },
    ])
  );

  // Verify Checksums
  for (const disk of diskMigrations) {
    const stored = appliedMap.get(disk.version);
    if (stored && stored.checksum !== disk.checksum) {
      throw new Error(
        `FATAL: Migration checksum mismatch for version ${disk.version} (${disk.name}).\n` +
        `  Persisted in DB : ${stored.checksum}\n` +
        `  Current on disk : ${disk.checksum}\n` +
        `Historical schema migrations are immutable. Refusing to start server in unsafe financial state.`
      );
    }
  }

  let appliedCount = 0;
  for (const disk of diskMigrations) {
    if (!appliedMap.has(disk.version)) {
      const startTime = Date.now();
      rawDb.exec('BEGIN TRANSACTION;');
      try {
        executeSqlForSQLiteSync(rawDb, disk.sql);
        const elapsedMs = Date.now() - startTime;
        const now = Date.now();
        rawDb.prepare(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms) VALUES (?, ?, ?, ?, ?)`
        ).run(disk.version, disk.name, disk.checksum, now, elapsedMs);
        rawDb.exec('COMMIT;');
        appliedCount++;
      } catch (err: any) {
        try {
          rawDb.exec('ROLLBACK;');
        } catch {}
        throw new Error(`Migration ${disk.name} failed: ${err.message}`);
      }
    }
  }

  const finalRows = rawDb.prepare(
    `SELECT version, name, checksum, applied_at, execution_time_ms FROM schema_migrations ORDER BY version ASC`
  ).all() as any[];

  return {
    appliedCount,
    migrations: finalRows.map((r) => ({
      version: String(r.version),
      name: String(r.name),
      checksum: String(r.checksum),
      applied_at: Number(r.applied_at),
      execution_time_ms: Number(r.execution_time_ms),
    })),
  };
}

/**
 * Runs pending migrations deterministically and forward-only with advisory lock protection.
 */
export async function runMigrations(
  db: DBClient,
  options: { migrationsDir?: string } = {}
): Promise<{ appliedCount: number; migrations: MigrationRecord[] }> {
  if (!db.isPostgres() && 'db' in (db as any)) {
    return runMigrationsSync(db as unknown as SQLiteClient, options);
  }

  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const isPostgres = db.isPostgres();

  let releasePostgresLock: (() => Promise<void>) | null = null;

  if (isPostgres && (db as any).acquireAdvisoryLock) {
    await (db as any).acquireAdvisoryLock(MIGRATION_ADVISORY_LOCK_ID);
    releasePostgresLock = async () => {
      try {
        await (db as any).releaseAdvisoryLock(MIGRATION_ADVISORY_LOCK_ID);
      } catch (e: any) {
        console.warn('[Migrator] Warning: Failed to release advisory lock:', e.message);
      }
    };
  } else {
    let unlockMutex: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      unlockMutex = resolve;
    });
    const prev = sqliteMigrationMutex;
    sqliteMigrationMutex = sqliteMigrationMutex.then(() => lockPromise, () => lockPromise);
    await prev.catch(() => {});
    releasePostgresLock = async () => {
      unlockMutex!();
    };
  }

  try {
    await ensureMigrationTable(db);
    const diskMigrations = loadMigrationFiles(migrationsDir);
    const applied = await getAppliedMigrations(db);
    const appliedMap = new Map(applied.map((m) => [m.version, m]));

    // Checksums verification
    for (const disk of diskMigrations) {
      const stored = appliedMap.get(disk.version);
      if (stored && stored.checksum !== disk.checksum) {
        throw new Error(
          `FATAL: Migration checksum mismatch for version ${disk.version} (${disk.name}).\n` +
          `  Persisted in DB : ${stored.checksum}\n` +
          `  Current on disk : ${disk.checksum}\n` +
          `Historical schema migrations are immutable. Refusing to start server in unsafe financial state.`
        );
      }
    }

    let appliedCount = 0;
    const newlyApplied: MigrationRecord[] = [];

    for (const disk of diskMigrations) {
      if (!appliedMap.has(disk.version)) {
        const startTime = Date.now();

        await db.transaction(async (tx) => {
          await tx.execute(disk.sql);
          const elapsedMs = Date.now() - startTime;
          const now = Date.now();

          await tx.execute(
            `INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms) VALUES (?, ?, ?, ?, ?)`,
            [disk.version, disk.name, disk.checksum, now, elapsedMs]
          );

          newlyApplied.push({
            version: disk.version,
            name: disk.name,
            checksum: disk.checksum,
            applied_at: now,
            execution_time_ms: elapsedMs,
          });
        });

        appliedCount++;
      }
    }

    const allApplied = await getAppliedMigrations(db);
    return { appliedCount, migrations: allApplied };
  } finally {
    if (releasePostgresLock) {
      await releasePostgresLock();
    }
  }
}
