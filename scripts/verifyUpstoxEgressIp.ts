#!/usr/bin/env tsx
/**
 * Upstox VPS Outbound Egress IP Diagnostic Tool
 * 
 * Verifies that the host VPS/server egress IP strictly matches the static IP
 * registered with Upstox for live API trading.
 * 
 * Exit Codes:
 *   0: Semantic PASS or BYPASS_SANDBOX
 *   1: Semantic FAIL (Mismatched IP or undetectable)
 */

import { config } from '../server/config';
import { UpstoxClient } from '../server/services/brokers/upstox/upstoxClient';

async function main() {
  console.log('\n======================================================');
  console.log('🔍 Upstox Outbound Egress IP Diagnostic');
  console.log('======================================================\n');

  console.log(`Environment:           ${config.NODE_ENV}`);
  console.log(`Upstox Mode:           ${config.UPSTOX_ENV}`);
  console.log(`Live Trading Allowed:  ${config.UPSTOX_LIVE_TRADING_ENABLED ? 'YES (LIVE ENABLED)' : 'NO (PAPER/SAFE)'}`);
  console.log(`Configured Static IP:  ${config.UPSTOX_STATIC_IP || '(none)'}`);
  if (config.UPSTOX_SECONDARY_STATIC_IP) {
    console.log(`Secondary Static IP:   ${config.UPSTOX_SECONDARY_STATIC_IP}`);
  }

  console.log('\nProbing outbound public egress IP...');
  const diagnostic = await UpstoxClient.checkOutboundIp(true);

  console.log(`Detected Outbound IP:  ${diagnostic.outboundIp || 'FAILED TO DETECT'}`);
  console.log(`Status Result:         ${diagnostic.status}`);

  if (diagnostic.error) {
    console.error(`\n⚠️  Diagnostic Error:    ${diagnostic.error}`);
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
    console.error('\n❌ [FAIL] Host egress IP does NOT match configured Upstox static IP.');
    console.error('CRITICAL: Upstox will reject live orders originating from unregistered IPs.');
    console.error('Please configure the server network or update UPSTOX_STATIC_IP before enabling live execution.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Diagnostic crashed:', err);
  process.exit(1);
});
