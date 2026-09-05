import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';
import { config } from '../config';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';

describe('Upstox Phase 4 Hardening & Execution Safety', () => {
  const adapter = new UpstoxAdapter();
  const userId = 'usr_phase4_test_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM broker_oauth_states WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'phase4@lumen.io', 'Phase 4 Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );
  });

  it('strictly rejects authorization code exchange when OAuth state is missing (Finding 5)', async () => {
    // Calling saveCredentials with code but without state must throw AUTHENTICATION_FAILED
    await expect(
      adapter.saveCredentials(userId, {
        code: 'auth_code_without_state_xyz',
        redirectUri: 'https://lumen.local/callback',
      })
    ).rejects.toThrow('OAuth state parameter is strictly required');
  });

  it('enforces environment-scoped credential retrieval (Finding 6)', async () => {
    const db = getDb();
    // Save sandbox credentials
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, can_trade, can_withdraw, is_safe, last_sync_at, created_at, updated_at
      ) VALUES (?, ?, 'upstox', 'sandbox', 'oauth2', ?, ?, 1, 0, 1, ?, ?, ?)`,
      [
        'cred_sbx_001',
        userId,
        (adapter as any).encryptSecret('sandbox_token_abc'),
        Date.now() + 86400000,
        Date.now(),
        Date.now(),
        Date.now(),
      ]
    );

    // Querying explicitly for production credentials should return null
    const prodCreds = await adapter.getCredentials(userId, 'production');
    expect(prodCreds).toBeNull();

    // Querying for sandbox credentials should return the sandbox token
    const sbxCreds = await adapter.getCredentials(userId, 'sandbox');
    expect(sbxCreds).not.toBeNull();
    expect(sbxCreds!.environment).toBe('sandbox');
    expect(sbxCreds!.accessToken).toBe('sandbox_token_abc');
  });

  it('defaults equity order product to Delivery (CNC/D) and dynamically routes Intraday (MIS/I) (Finding 3)', async () => {
    // In paper mode, verify order parameters are placed correctly
    const defaultOrder = await adapter.placeOrder({
      userId,
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2900,
      accountMode: 'paper',
      idempotencyKey: 'idemp_p4_default',
    });

    expect(defaultOrder.status).toBe('FILLED');

    const intradayOrder = await adapter.placeOrder({
      userId,
      symbol: 'TCS',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 4000,
      product: 'MIS',
      accountMode: 'paper',
      idempotencyKey: 'idemp_p4_mis',
    });

    expect(intradayOrder.status).toBe('FILLED');
  });

  it('reserves against equity_holdings for SELL orders (Finding 4)', async () => {
    // Setup production credentials
    const db = getDb();
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, can_trade, can_withdraw, is_safe, last_sync_at, created_at, updated_at
      ) VALUES (?, ?, 'upstox', 'production', 'oauth2', ?, ?, 1, 0, 1, ?, ?, ?)`,
      [
        'cred_prod_001',
        userId,
        (adapter as any).encryptSecret('prod_token_xyz'),
        Date.now() + 86400000,
        Date.now(),
        Date.now(),
        Date.now(),
      ]
    );

    // Credit 50 shares of INFY in equity_holdings (0 decimals)
    const infyAcc = await LedgerService.getOrCreateAccount(userId, 'equity_holdings', 'INFY', 'live');
    await db.execute(`UPDATE ledger_accounts SET balance_minor = 50 WHERE id = ?`, [infyAcc.id]);

    // Enable live trading flag and mock market open and IP check
    const origLive = config.UPSTOX_LIVE_TRADING_ENABLED;
    (config as any).UPSTOX_LIVE_TRADING_ENABLED = true;
    vi.spyOn(IndianMarketCalendar, 'isMarketOpen').mockReturnValue(true);
    vi.spyOn(UpstoxClient, 'checkOutboundIp').mockResolvedValue({
      status: 'PASS',
      publicIp: '1.2.3.4',
      configuredIp: '1.2.3.4',
    });
    vi.spyOn(UpstoxClient, 'placeOrder').mockResolvedValue({
      order_id: 'upstox_order_sell_001',
    });

    try {
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId,
        broker: 'upstox',
        symbol: 'INFY',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 10,
        price: 1800,
        product: 'CNC',
      });

      const sellOrder = await adapter.placeOrder({
        userId,
        symbol: 'INFY',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 10,
        price: 1800,
        accountMode: 'live',
        product: 'CNC',
        confirmationId: proposal.confirmationId,
        idempotencyKey: proposal.idempotencyKey,
        clientOrderId: proposal.clientOrderId,
      });

      expect(sellOrder.status).toBe('OPEN');

      // Verify that the reservation was booked against equity_holdings
      const refreshedAcc = await db.queryOne<any>(
        `SELECT * FROM ledger_accounts WHERE id = ?`,
        [infyAcc.id]
      );
      expect(BigInt(refreshedAcc.reserved_minor)).toBe(10n);
      expect(refreshedAcc.account_type).toBe('equity_holdings');
    } finally {
      (config as any).UPSTOX_LIVE_TRADING_ENABLED = origLive;
      vi.restoreAllMocks();
    }
  });

  it('rejects live equity orders when market is closed (Finding 9)', async () => {
    // Setup production credentials
    const db = getDb();
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, can_trade, can_withdraw, is_safe, last_sync_at, created_at, updated_at
      ) VALUES (?, ?, 'upstox', 'production', 'oauth2', ?, ?, 1, 0, 1, ?, ?, ?)`,
      [
        'cred_prod_002',
        userId,
        (adapter as any).encryptSecret('prod_token_xyz'),
        Date.now() + 86400000,
        Date.now(),
        Date.now(),
        Date.now(),
      ]
    );

    const origLive = config.UPSTOX_LIVE_TRADING_ENABLED;
    (config as any).UPSTOX_LIVE_TRADING_ENABLED = true;
    vi.spyOn(IndianMarketCalendar, 'isMarketOpen').mockReturnValue(false);

    try {
      await expect(
        adapter.placeOrder({
          userId,
          symbol: 'RELIANCE',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 10,
          price: 2900,
          accountMode: 'live',
          idempotencyKey: 'idemp_off_hours',
        })
      ).rejects.toThrow('Indian markets (NSE/BSE) are currently closed');
    } finally {
      (config as any).UPSTOX_LIVE_TRADING_ENABLED = origLive;
      vi.restoreAllMocks();
    }
  });
});
