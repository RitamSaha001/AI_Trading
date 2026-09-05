/**
 * Upstox End-to-End Read-Only Production Connectivity Validator
 *
 * Executes comprehensive 11-capability read-only validation against Upstox APIs:
 * AUTH, PROFILE, FUNDS, POSITIONS, HOLDINGS, ORDERS, TRADES, MARKET DATA,
 * INSTRUMENT LOOKUP, STATIC IP, and TOKEN EXPIRY.
 *
 * INVARIANT: NEVER executes placeOrder(), modifyOrder(), or cancelOrder().
 * INVARIANT: Never leaks access tokens, secrets, or privileged authorization headers.
 */

import { config } from '../../../config';
import { getDb } from '../../../db';
import { UpstoxClient } from './upstoxClient';
import { UpstoxInstrumentProvider } from './upstoxInstrumentProvider';
import { getTokenHealth, UpstoxTokenHealth } from './upstoxExpiry';
import { StandardBrokerError } from '../brokerGateway';

export type UpstoxCheckStatus = 'PASS' | 'FAIL' | 'WARNING';

export interface UpstoxCheckResult {
  capability: string;
  status: UpstoxCheckStatus;
  latencyMs: number;
  details?: string;
  error?: string;
}

export interface UpstoxConnectivityReport {
  overallStatus: UpstoxCheckStatus;
  probedAt: number;
  environment: string;
  checks: UpstoxCheckResult[];
}

export class UpstoxConnectivityValidator {
  private static instrumentProvider = new UpstoxInstrumentProvider();

  /**
   * Sanitizes text to remove any potential bearer tokens or secrets.
   */
  private static sanitize(text?: string): string | undefined {
    if (!text) return undefined;
    return text
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[REDACTED_TOKEN]')
      .replace(/client_secret=[^&\s]+/gi, 'client_secret=[REDACTED]');
  }

  /**
   * Runs the complete 11-point read-only connectivity validation suite.
   */
  public static async runDiagnostics(
    userId?: string,
    explicitToken?: string
  ): Promise<UpstoxConnectivityReport> {
    const checks: UpstoxCheckResult[] = [];
    const db = getDb();
    let accessToken: string | null = explicitToken || null;
    let tokenExpiresAt: number | null = null;
    let environment = config.UPSTOX_ENV || 'sandbox';

    // 1. Resolve credentials if not explicitly passed
    if (!accessToken && userId) {
      const row = await db.queryOne<any>(
        `SELECT access_token_encrypted, token_expires_at, environment FROM broker_credentials 
         WHERE user_id = ? AND broker = 'upstox' ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );
      if (row?.access_token_encrypted) {
        try {
          const { UpstoxAdapter } = await import('./upstoxAdapter');
          const adapter = new UpstoxAdapter();
          const creds = await adapter.getCredentials(userId);
          accessToken = creds?.accessToken || null;
          tokenExpiresAt = row.token_expires_at ? Number(row.token_expires_at) : null;
          environment = row.environment || environment;
        } catch {
          accessToken = null;
        }
      }
    }

    // Capability 1: AUTH
    const authStart = Date.now();
    if (!accessToken) {
      checks.push({
        capability: 'AUTH',
        status: 'FAIL',
        latencyMs: Date.now() - authStart,
        error: 'No valid Upstox access token found for user/environment. Please authenticate via OAuth.',
      });
    } else {
      checks.push({
        capability: 'AUTH',
        status: 'PASS',
        latencyMs: Date.now() - authStart,
        details: 'Access token present and loaded securely from encrypted storage.',
      });
    }

    // If AUTH failed, mark remaining API checks as FAIL/SKIPPED safely
    if (!accessToken) {
      const missingReason = 'Skipped: valid access token required.';
      for (const cap of [
        'PROFILE',
        'FUNDS',
        'POSITIONS',
        'HOLDINGS',
        'ORDERS',
        'TRADES',
        'MARKET DATA',
      ]) {
        checks.push({
          capability: cap,
          status: 'FAIL',
          latencyMs: 0,
          error: missingReason,
        });
      }
    } else {
      // Capability 2: PROFILE
      const profStart = Date.now();
      try {
        const profile = await UpstoxClient.getProfile(accessToken);
        checks.push({
          capability: 'PROFILE',
          status: 'PASS',
          latencyMs: Date.now() - profStart,
          details: `User ID: ${profile.user_id}, Name: ${profile.user_name || 'Verified'}, Active: ${profile.is_active}`,
        });
      } catch (err: any) {
        checks.push({
          capability: 'PROFILE',
          status: 'FAIL',
          latencyMs: Date.now() - profStart,
          error: this.sanitize(err.message),
        });
      }

      // Capability 3: FUNDS
      const fundsStart = Date.now();
      try {
        const funds = await UpstoxClient.getFunds(accessToken);
        const avail = funds.equity?.available_margin ?? 0;
        const used = funds.equity?.used_margin ?? 0;
        checks.push({
          capability: 'FUNDS',
          status: 'PASS',
          latencyMs: Date.now() - fundsStart,
          details: `Available Margin: INR ${avail.toFixed(2)}, Used Margin: INR ${used.toFixed(2)}`,
        });
      } catch (err: any) {
        checks.push({
          capability: 'FUNDS',
          status: 'FAIL',
          latencyMs: Date.now() - fundsStart,
          error: this.sanitize(err.message),
        });
      }

      // Capability 4: POSITIONS
      const posStart = Date.now();
      try {
        const positions = await UpstoxClient.getPositions(accessToken);
        checks.push({
          capability: 'POSITIONS',
          status: 'PASS',
          latencyMs: Date.now() - posStart,
          details: `Retrieved ${positions.length} open/short-term position(s).`,
        });
      } catch (err: any) {
        checks.push({
          capability: 'POSITIONS',
          status: 'FAIL',
          latencyMs: Date.now() - posStart,
          error: this.sanitize(err.message),
        });
      }

      // Capability 5: HOLDINGS
      const holdStart = Date.now();
      try {
        const holdings = await UpstoxClient.getHoldings(accessToken);
        checks.push({
          capability: 'HOLDINGS',
          status: 'PASS',
          latencyMs: Date.now() - holdStart,
          details: `Retrieved ${holdings.length} long-term holding(s).`,
        });
      } catch (err: any) {
        checks.push({
          capability: 'HOLDINGS',
          status: 'FAIL',
          latencyMs: Date.now() - holdStart,
          error: this.sanitize(err.message),
        });
      }

      // Capability 6: ORDERS
      const ordStart = Date.now();
      try {
        const orders = await UpstoxClient.getOrderBook(accessToken);
        checks.push({
          capability: 'ORDERS',
          status: 'PASS',
          latencyMs: Date.now() - ordStart,
          details: `Retrieved ${orders.length} order(s) for the trading day.`,
        });
      } catch (err: any) {
        checks.push({
          capability: 'ORDERS',
          status: 'FAIL',
          latencyMs: Date.now() - ordStart,
          error: this.sanitize(err.message),
        });
      }

      // Capability 7: TRADES
      const trdStart = Date.now();
      try {
        const trades = await UpstoxClient.getTradesForDay(accessToken);
        checks.push({
          capability: 'TRADES',
          status: 'PASS',
          latencyMs: Date.now() - trdStart,
          details: `Retrieved ${trades.length} executed trade(s) for the trading day.`,
        });
      } catch (err: any) {
        checks.push({
          capability: 'TRADES',
          status: 'FAIL',
          latencyMs: Date.now() - trdStart,
          error: this.sanitize(err.message),
        });
      }

      // Capability 8: MARKET DATA
      const mdStart = Date.now();
      try {
        // Benchmark liquid instrument: RELIANCE on NSE Equity
        const benchmarkKey = 'NSE_EQ|INE002A01018';
        const quoteMap = await UpstoxClient.getQuote(accessToken, benchmarkKey);
        const quote = quoteMap[benchmarkKey];
        if (quote && quote.last_price > 0) {
          checks.push({
            capability: 'MARKET DATA',
            status: 'PASS',
            latencyMs: Date.now() - mdStart,
            details: `RELIANCE LTP: INR ${quote.last_price}, Volume: ${quote.volume ?? 'N/A'}`,
          });
        } else {
          checks.push({
            capability: 'MARKET DATA',
            status: 'WARNING',
            latencyMs: Date.now() - mdStart,
            details: 'Quote received but last_price is 0 or market is closed.',
          });
        }
      } catch (err: any) {
        checks.push({
          capability: 'MARKET DATA',
          status: 'FAIL',
          latencyMs: Date.now() - mdStart,
          error: this.sanitize(err.message),
        });
      }
    }

    // Capability 9: INSTRUMENT LOOKUP (Local authoritative rules)
    const instStart = Date.now();
    try {
      const rel = this.instrumentProvider.getInstrument('RELIANCE');
      const tcs = this.instrumentProvider.getInstrument('TCS');
      if (rel && tcs && rel.tickSize === '0.05') {
        checks.push({
          capability: 'INSTRUMENT LOOKUP',
          status: 'PASS',
          latencyMs: Date.now() - instStart,
          details: `Resolved RELIANCE (${rel.instrumentKey}) and TCS (${tcs.instrumentKey}) with tick size 0.05 INR.`,
        });
      } else {
        checks.push({
          capability: 'INSTRUMENT LOOKUP',
          status: 'FAIL',
          latencyMs: Date.now() - instStart,
          error: 'Failed to resolve standard Indian equity instruments or tick constraints.',
        });
      }
    } catch (err: any) {
      checks.push({
        capability: 'INSTRUMENT LOOKUP',
        status: 'FAIL',
        latencyMs: Date.now() - instStart,
        error: this.sanitize(err.message),
      });
    }

    // Capability 10: STATIC IP (Outbound probe vs Upstox registered IP / configuration)
    const ipStart = Date.now();
    try {
      const ipDiag = await UpstoxClient.checkOutboundIp(true, accessToken || undefined);
      if (ipDiag.status === 'PASS') {
        checks.push({
          capability: 'STATIC IP',
          status: 'PASS',
          latencyMs: Date.now() - ipStart,
          details: `Outbound IP (${ipDiag.outboundIp}) matches registered IP(s) [${ipDiag.registeredIps.join(', ')}] via ${ipDiag.authoritativeSource}.`,
        });
      } else if (ipDiag.status === 'BYPASS_SANDBOX') {
        checks.push({
          capability: 'STATIC IP',
          status: 'PASS',
          latencyMs: Date.now() - ipStart,
          details: 'Static IP check bypassed (running in sandbox/development mode without hard IP requirement).',
        });
      } else {
        checks.push({
          capability: 'STATIC IP',
          status: 'FAIL',
          latencyMs: Date.now() - ipStart,
          error: ipDiag.error || 'Outbound IP does not match registered static IPs.',
        });
      }
    } catch (err: any) {
      checks.push({
        capability: 'STATIC IP',
        status: 'FAIL',
        latencyMs: Date.now() - ipStart,
        error: this.sanitize(err.message),
      });
    }

    // Capability 11: TOKEN EXPIRY (03:30 AM IST lifecycle evaluation)
    const expStart = Date.now();
    try {
      const health = getTokenHealth(tokenExpiresAt);
      if (health.status === 'ACTIVE') {
        checks.push({
          capability: 'TOKEN EXPIRY',
          status: 'PASS',
          latencyMs: Date.now() - expStart,
          details: `Session ACTIVE (${health.formattedRemaining} remaining until daily 03:30 AM IST cutoff).`,
        });
      } else if (health.status === 'EXPIRING_SOON') {
        checks.push({
          capability: 'TOKEN EXPIRY',
          status: 'WARNING',
          latencyMs: Date.now() - expStart,
          details: `Session EXPIRING_SOON (${health.formattedRemaining} remaining). Re-auth recommended.`,
        });
      } else if (health.status === 'EXPIRED') {
        checks.push({
          capability: 'TOKEN EXPIRY',
          status: 'FAIL',
          latencyMs: Date.now() - expStart,
          error: 'Daily 03:30 AM IST session has EXPIRED. Morning re-authentication required.',
        });
      } else {
        checks.push({
          capability: 'TOKEN EXPIRY',
          status: 'FAIL',
          latencyMs: Date.now() - expStart,
          error: 'No active session or token expiry record found.',
        });
      }
    } catch (err: any) {
      checks.push({
        capability: 'TOKEN EXPIRY',
        status: 'FAIL',
        latencyMs: Date.now() - expStart,
        error: this.sanitize(err.message),
      });
    }

    // Compute Overall Status
    const hasFailures = checks.some((c) => c.status === 'FAIL');
    const hasWarnings = checks.some((c) => c.status === 'WARNING');
    const overallStatus: UpstoxCheckStatus = hasFailures ? 'FAIL' : hasWarnings ? 'WARNING' : 'PASS';

    return {
      overallStatus,
      probedAt: Date.now(),
      environment,
      checks,
    };
  }
}
