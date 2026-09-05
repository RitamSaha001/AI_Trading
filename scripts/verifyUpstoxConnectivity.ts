#!/usr/bin/env tsx
/**
 * Upstox End-to-End Read-Only Production Connectivity CLI
 *
 * Runs the 11-capability read-only connectivity suite against Upstox:
 * AUTH, PROFILE, FUNDS, POSITIONS, HOLDINGS, ORDERS, TRADES, MARKET DATA,
 * INSTRUMENT LOOKUP, STATIC IP, and TOKEN EXPIRY.
 *
 * INVARIANT: Never places, modifies, or cancels any orders.
 * INVARIANT: Never prints tokens, client secrets, or sensitive hashes.
 *
 * Exit Codes:
 *   0: All checks PASS or non-fatal WARNING in dev/sandbox
 *   1: Any check FAILS in production or hard failure encountered
 */

import { config } from '../server/config';
import { getDb, initDb } from '../server/db';
import { UpstoxConnectivityValidator } from '../server/services/brokers/upstox/upstoxConnectivityValidator';

async function main() {
  console.log('\n======================================================');
  console.log('📡 Upstox End-to-End Read-Only Connectivity Suite');
  console.log('======================================================\n');

  console.log(`Environment:          ${config.NODE_ENV}`);
  console.log(`Upstox Mode:          ${config.UPSTOX_ENV}`);
  console.log(`Live Trading Allowed: ${config.UPSTOX_LIVE_TRADING_ENABLED ? 'YES' : 'NO (SAFE READ-ONLY)'}`);
  console.log(`Timestamp:            ${new Date().toISOString()}\n`);

  // Connect to database to load encrypted user credentials if available
  let userId: string | undefined;
  try {
    await initDb();
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT user_id FROM broker_credentials WHERE broker = 'upstox' ORDER BY updated_at DESC LIMIT 1`
    );
    if (row?.user_id) {
      userId = row.user_id;
    }
  } catch {
    // Database connection optional if token is passed via env
  }

  const explicitToken = process.env.UPSTOX_ACCESS_TOKEN;

  console.log('Executing 11-point read-only validation...\n');
  const report = await UpstoxConnectivityValidator.runDiagnostics(userId, explicitToken);

  console.log('----------------------------------------------------------------------');
  console.log(
    'CAPABILITY'.padEnd(20) +
    'STATUS'.padEnd(12) +
    'LATENCY'.padEnd(10) +
    'DETAILS'
  );
  console.log('----------------------------------------------------------------------');

  for (const check of report.checks) {
    const statusIcon =
      check.status === 'PASS'
        ? '✅ PASS'
        : check.status === 'WARNING'
        ? '⚠️  WARN'
        : '❌ FAIL';

    const latency = `${check.latencyMs}ms`.padEnd(10);
    const detail = check.details || check.error || '';
    console.log(
      check.capability.padEnd(20) +
      statusIcon.padEnd(12) +
      latency +
      detail
    );
  }

  console.log('----------------------------------------------------------------------');
  console.log(`\nOVERALL CONNECTIVITY STATUS: ${report.overallStatus}`);

  if (report.overallStatus === 'PASS') {
    console.log('All read-only Upstox capabilities verified successfully.\n');
    process.exit(0);
  } else if (report.overallStatus === 'WARNING' && config.NODE_ENV !== 'production') {
    console.log('Diagnostic passed with warnings (safe for development/testing).\n');
    process.exit(0);
  } else {
    console.error('One or more capabilities failed read-only connectivity verification.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Connectivity suite encountered fatal error:', err.message);
  process.exit(1);
});
