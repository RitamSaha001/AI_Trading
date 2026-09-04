import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SQLiteClient } from '../db';
import {
  runMigrations,
  runMigrationsSync,
  getMigrationStatus,
  computeMigrationChecksum,
  ensureMigrationTable,
  getAppliedMigrations,
} from '../db/migrator';

describe('Versioned Forward-Only Schema Migrations & Integrity Suite', () => {
  let tempDir: string;
  let client: SQLiteClient;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen_mig_test_'));
    client = new SQLiteClient(':memory:');
  });

  afterEach(() => {
    client.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. applies migrations to a clean database in deterministic sequential order', async () => {
    fs.writeFileSync(
      path.join(tempDir, '001_initial.sql'),
      `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);`
    );
    fs.writeFileSync(
      path.join(tempDir, '002_add_profile.sql'),
      `ALTER TABLE users ADD COLUMN name TEXT;`
    );

    const result = await runMigrations(client, { migrationsDir: tempDir });
    expect(result.appliedCount).toBe(2);

    const applied = await getAppliedMigrations(client);
    expect(applied.length).toBe(2);
    expect(applied[0].version).toBe('001');
    expect(applied[0].name).toBe('001_initial');
    expect(applied[1].version).toBe('002');
    expect(applied[1].name).toBe('002_add_profile');

    // Verify table structure
    await client.execute(`INSERT INTO users (id, email, name) VALUES ('u1', 'test@lumen.io', 'Trader')`);
    const user = await client.queryOne<any>(`SELECT * FROM users WHERE id = 'u1'`);
    expect(user.name).toBe('Trader');
  });

  it('2. restart after all migrations applied is an idempotent no-op', async () => {
    fs.writeFileSync(
      path.join(tempDir, '001_setup.sql'),
      `CREATE TABLE test_table (id TEXT PRIMARY KEY);`
    );

    const firstRun = await runMigrations(client, { migrationsDir: tempDir });
    expect(firstRun.appliedCount).toBe(1);

    // Second run (simulating application restart)
    const secondRun = await runMigrations(client, { migrationsDir: tempDir });
    expect(secondRun.appliedCount).toBe(0);

    const status = await getMigrationStatus(client, tempDir);
    expect(status.isUpToDate).toBe(true);
    expect(status.pending.length).toBe(0);
  });

  it('3. detects migration checksum mismatch and fails closed without applying altered migration', async () => {
    const file1 = path.join(tempDir, '001_immutable.sql');
    fs.writeFileSync(file1, `CREATE TABLE immutable_records (id TEXT PRIMARY KEY, val TEXT);`);

    await runMigrations(client, { migrationsDir: tempDir });

    // Tamper with the migration file on disk (simulating malicious or accidental modification of applied migration)
    fs.writeFileSync(file1, `CREATE TABLE immutable_records (id TEXT PRIMARY KEY, val TEXT, tampered TEXT);`);

    await expect(runMigrations(client, { migrationsDir: tempDir })).rejects.toThrow(
      /FATAL: Migration checksum mismatch/
    );
  });

  it('4. rolls back on migration failure and does not record failed migration in history', async () => {
    fs.writeFileSync(
      path.join(tempDir, '001_good.sql'),
      `CREATE TABLE good_table (id TEXT PRIMARY KEY);`
    );
    // 002 has a deliberate syntax error
    fs.writeFileSync(
      path.join(tempDir, '002_bad.sql'),
      `CREATE TABLE bad_table (id TEXT PRIMARY KEY, BROKEN SYNTAX ERROR HERE !@#$);`
    );

    await expect(runMigrations(client, { migrationsDir: tempDir })).rejects.toThrow();

    const applied = await getAppliedMigrations(client);
    expect(applied.length).toBe(1);
    expect(applied[0].version).toBe('001');

    const status = await getMigrationStatus(client, tempDir);
    expect(status.isUpToDate).toBe(false);
    expect(status.pending).toContain('002_bad');
  });

  it('5. coordinates concurrent migration attempts safely without duplicate execution', async () => {
    fs.writeFileSync(
      path.join(tempDir, '001_concurrent.sql'),
      `CREATE TABLE concurrent_test (id TEXT PRIMARY KEY, counter INT);`
    );

    // Simulate two server instances starting and running migrations concurrently
    const [res1, res2] = await Promise.all([
      runMigrations(client, { migrationsDir: tempDir }),
      runMigrations(client, { migrationsDir: tempDir }),
    ]);

    const totalApplied = res1.appliedCount + res2.appliedCount;
    expect(totalApplied).toBe(1); // Exactly one instance executes it

    const applied = await getAppliedMigrations(client);
    expect(applied.length).toBe(1);
  });

  it('6. safely migrates an existing legacy schema to the new versioned migration schema', async () => {
    // 1. Initialize legacy schema (as existed before versioned migrations were introduced)
    client.db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL);
      CREATE TABLE exchange_orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        client_order_id TEXT UNIQUE NOT NULL,
        symbol TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `);

    // 2. Add versioned migration files that include columns not yet present in legacy
    fs.writeFileSync(
      path.join(tempDir, '001_initial.sql'),
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL);`
    );
    fs.writeFileSync(
      path.join(tempDir, '002_exact_precision.sql'),
      `ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS orig_qty_exact TEXT;
       ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS price_exact TEXT;`
    );

    const result = await runMigrations(client, { migrationsDir: tempDir });
    expect(result.appliedCount).toBe(2);

    // Verify exact precision columns exist on the legacy table
    const tableInfo = client.db.prepare(`PRAGMA table_info(exchange_orders)`).all();
    const colNames = tableInfo.map((c: any) => c.name);
    expect(colNames).toContain('orig_qty_exact');
    expect(colNames).toContain('price_exact');
  });

  it('7. verifies computeMigrationChecksum is deterministic and whitespace-trimmed', () => {
    const sql1 = 'CREATE TABLE test (id TEXT);';
    const sql2 = '  CREATE TABLE test (id TEXT);  \n\n';
    expect(computeMigrationChecksum(sql1)).toBe(computeMigrationChecksum(sql2));
  });
});
