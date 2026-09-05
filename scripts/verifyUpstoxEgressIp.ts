#!/usr/bin/env tsx
/**
 * Upstox VPS Outbound Egress IP Diagnostic Tool
 * 
 * Verifies that the host VPS/server egress IP strictly matches the static IP
 * registered with Upstox for live API trading.
 * 
 * Compares against authoritative Upstox registered IPs (/user/ip) and local configuration.
 * Never leaks access tokens, client secrets, or private keys.
 * 
 * Exit Codes:
 *   0: Semantic PASS or BYPASS_SANDBOX
 *   1: Semantic FAIL (Mismatched IP or undetectable in production)
 */

import { config } from '../server/config';
import { getDb, initDb } from '../server/db';
import { UpstoxClient } from '../server/services/brokers/upstox/upstoxClient';

async function main() {
  console.log('\n======================================================');
  console.log('🔍 Upstox Outbound Egress IP Diagnostic');
  console.log('======================================================\n');

  console.log(`Environment:                  ${config.NODE_ENV}`);
  console.log(`Upstox Mode:                  ${config.UPSTOX_ENV}`);
  console.log(`Live Trading Allowed:         ${config.UPSTOX_LIVE_TRADING_ENABLED ? 'YES (LIVE ENABLED)' : 'NO (PAPER/SAFE)'}`);
  console.log(`Configured Primary IP:        ${config.UPSTOX_STATIC_IP || '(none)'}`);
  if (config.UPSTOX_SECONDARY_STATIC_IP) {
    console.log(`Configured Secondary IP:      ${config.UPSTOX_SECONDARY_STATIC_IP}`);
  }

  // Attempt to load token from environment or database for authoritative /user/ip check
  let accessToken: string | undefined = process.env.UPSTOX_ACCESS_TOKEN;
  if (!accessToken) {
    try {
      await initDb();
      const db = getDb();
      const row = await db.queryOne<any>(
        `SELECT access_token_encrypted FROM broker_credentials WHERE broker = 'upstox' ORDER BY updated_at DESC LIMIT 1`
      );
      if (row?.access_token_encrypted) {
        const { UpstoxAdapter } = await import('../server/services/brokers/upstox/upstoxAdapter');
        const adapter = new UpstoxAdapter();
        const creds = await adapter.getCredentials(row.user_id || 'system');
        accessToken = creds?.accessToken;
      }
    } catch {
      // Database not available or no credentials stored
    }
  }

  console.log('\nProbing outbound public egress IP and Upstox registered IPs...');
  const diagnostic = await UpstoxClient.checkOutboundIp(true, accessToken);

  console.log(`Detected Outbound IP:         ${diagnostic.outboundIp || 'FAILED TO DETECT'}`);
  console.log(`Authoritative Source:         ${diagnostic.authoritativeSource}`);
  if (diagnostic.upstoxRegisteredIps) {
    console.log(`Upstox Primary Reg IP:        ${diagnostic.upstoxRegisteredIps.primary}`);
    if (diagnostic.upstoxRegisteredIps.secondary) {
      console.log(`Upstox Secondary Reg IP:      ${diagnostic.upstoxRegisteredIps.secondary}`);
    }
  }
  console.log(`Diagnostic Status:            ${diagnostic.status}`);

  if (diagnostic.error) {
    console.error(`\n⚠️  Diagnostic Error:           ${diagnostic.error}`);
  }

  if (diagnostic.status === 'PASS') {
    console.log('\n✅ [PASS] Host egress IP strictly matches registered Upstox static IP.');
    console.log('Orders submitted in live mode will satisfy Upstox IP origin validation.\n');
    process.exit(0);
  } else if (diagnostic.status === 'BYPASS_SANDBOX') {
    console.log('\nℹ️  [BYPASS] Running in sandbox/development mode without static IP requirement.');
    console.log('Safe paper trading and testing can proceed.\n');
    process.exit(0);
  } else {
    console.error('\n❌ [FAIL] Host egress IP does NOT match registered Upstox static IP.');
    console.error('CRITICAL: Upstox will reject live orders originating from unregistered IPs.');
    console.error('Please configure the server network or update Upstox registered IP before enabling live execution.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Diagnostic crashed:', err);
  process.exit(1);
});
