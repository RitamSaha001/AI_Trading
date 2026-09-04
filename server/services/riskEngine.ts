import { getDb } from '../db';
import { AuditService } from './auditService';
import { LedgerService } from './ledgerService';

export interface RiskEvaluationRequest {
  userId: string;
  asset: string;
  quoteAsset: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT';
  quantity: number;
  price: number;
  marketQuoteAgeMs: number;
  idempotencyKey?: string;
}

export interface RiskDecision {
  approved: boolean;
  rejectReason?: string;
  requiredCashReserve: number;
  notionalUsd: number;
  portfolioEquityUsd: number;
  singleOrderPct: number;
  projectedConcentrationPct: number;
}

export class ServerRiskEngine {
  /**
   * Evaluates a trade proposal against server-authoritative institutional risk policies.
   */
  static async evaluateTrade(req: RiskEvaluationRequest): Promise<RiskDecision> {
    const db = getDb();

    // 1. Emergency Freeze Check
    const limits = await db.queryOne<any>(
      `SELECT * FROM account_limits WHERE user_id = ?`,
      [req.userId]
    );

    if (limits && limits.is_emergency_frozen) {
      await AuditService.logEvent({
        userId: req.userId,
        eventType: 'RISK_REJECTED',
        source: 'server_risk_engine',
        actor: 'risk_engine',
        metadata: { reason: 'Account is emergency frozen', request: req },
        result: 'BLOCKED',
      });
      return {
        approved: false,
        rejectReason: 'Trading blocked: Account is under emergency freeze.',
        requiredCashReserve: 0,
        notionalUsd: 0,
        portfolioEquityUsd: 0,
        singleOrderPct: 0,
        projectedConcentrationPct: 0,
      };
    }

    // 2. Stale Market Data Check (Phase 19)
    if (req.marketQuoteAgeMs > 45_000) {
      const reason = `Execution market data is stale (${Math.round(req.marketQuoteAgeMs / 1000)}s old > 45s threshold).`;
      return {
        approved: false,
        rejectReason: reason,
        requiredCashReserve: 0,
        notionalUsd: 0,
        portfolioEquityUsd: 0,
        singleOrderPct: 0,
        projectedConcentrationPct: 0,
      };
    }

    if (req.quantity <= 0 || req.price <= 0) {
      return {
        approved: false,
        rejectReason: 'Quantity and price must be positive non-zero numbers.',
        requiredCashReserve: 0,
        notionalUsd: 0,
        portfolioEquityUsd: 0,
        singleOrderPct: 0,
        projectedConcentrationPct: 0,
      };
    }

    const notionalUsd = req.quantity * req.price;

    // 3. Duplicate Order Rate-Limit / Cooldown Check (5 seconds window)
    const recentDuplicate = await db.queryOne<any>(
      `SELECT id FROM exchange_orders
       WHERE user_id = ? AND symbol LIKE ? AND side = ?
       AND created_at > ? AND status IN ('SUBMITTING', 'OPEN')`,
      [req.userId, `${req.asset}%`, req.side, Date.now() - 5000]
    );

    if (recentDuplicate) {
      return {
        approved: false,
        rejectReason: `Duplicate order rate-limit breached: active ${req.side} order on ${req.asset} placed within last 5s.`,
        requiredCashReserve: 0,
        notionalUsd,
        portfolioEquityUsd: 0,
        singleOrderPct: 0,
        projectedConcentrationPct: 0,
      };
    }

    // 4. Rate-limit check: max 12 orders per minute per account
    const ordersPastMinute = await db.query<any>(
      `SELECT COUNT(*) as count FROM exchange_orders
       WHERE user_id = ? AND created_at > ?`,
      [req.userId, Date.now() - 60_000]
    );

    if (ordersPastMinute.length > 0 && ordersPastMinute[0].count >= 12) {
      return {
        approved: false,
        rejectReason: 'Rate limit exceeded: Maximum 12 orders per minute reached.',
        requiredCashReserve: 0,
        notionalUsd,
        portfolioEquityUsd: 0,
        singleOrderPct: 0,
        projectedConcentrationPct: 0,
      };
    }

    // 5. Balance & Portfolio Valuation
    const balances = await LedgerService.getUserBalances(req.userId);
    const tradingCashMinor = balances[`trading_allocated:${req.quoteAsset}`]?.free ?? balances[`sovereign_cash:${req.quoteAsset}`]?.free ?? 0;
    const tradingCashUsd = tradingCashMinor / 100; // Cents to USD

    // Calculate approximate portfolio equity
    let portfolioEquityUsd = tradingCashUsd;
    for (const [key, bal] of Object.entries(balances)) {
      if (key.startsWith('crypto_holdings:') && key.includes(req.asset)) {
        portfolioEquityUsd += (bal.balance / 1e8) * req.price;
      }
    }
    if (portfolioEquityUsd <= 0) {
      portfolioEquityUsd = notionalUsd; // Genesis baseline
    }

    // 6. Max Single Order Percentage (40% hard policy)
    const singleOrderPct = notionalUsd / Math.max(1, portfolioEquityUsd);
    const maxSingleOrderPct = limits?.max_single_order_pct ?? 0.40;
    if (singleOrderPct > maxSingleOrderPct + 0.001) {
      return {
        approved: false,
        rejectReason: `Single order size ($${notionalUsd.toFixed(2)}) is ${(singleOrderPct * 100).toFixed(1)}% of portfolio, exceeding maximum allowed limit of ${(maxSingleOrderPct * 100).toFixed(0)}%.`,
        requiredCashReserve: 0,
        notionalUsd,
        portfolioEquityUsd,
        singleOrderPct,
        projectedConcentrationPct: singleOrderPct,
      };
    }

    // 7. Minimum Liquid Cash Reserve (15% policy)
    const minReservePct = limits?.min_cash_reserve_pct ?? 0.15;
    const requiredCashReserve = portfolioEquityUsd * minReservePct;
    if (req.side === 'BUY') {
      const remainingCash = tradingCashUsd - notionalUsd;
      if (remainingCash < requiredCashReserve) {
        return {
          approved: false,
          rejectReason: `Order would violate minimum liquid cash reserve of ${(minReservePct * 100).toFixed(0)}% ($${requiredCashReserve.toFixed(2)}). Projected remaining cash: $${remainingCash.toFixed(2)}.`,
          requiredCashReserve,
          notionalUsd,
          portfolioEquityUsd,
          singleOrderPct,
          projectedConcentrationPct: singleOrderPct,
        };
      }
    }

    // 8. Max Asset Concentration (50% policy)
    const currentAssetHolding = (balances[`crypto_holdings:${req.asset}`]?.balance ?? 0) / 1e8;
    const currentHoldingNotional = currentAssetHolding * req.price;
    const projectedHoldingNotional = req.side === 'BUY'
      ? currentHoldingNotional + notionalUsd
      : Math.max(0, currentHoldingNotional - notionalUsd);
    const projectedConcentrationPct = projectedHoldingNotional / Math.max(1, portfolioEquityUsd);
    const maxConcentrationPct = limits?.max_asset_concentration_pct ?? 0.50;

    if (req.side === 'BUY' && projectedConcentrationPct > maxConcentrationPct + 0.001) {
      return {
        approved: false,
        rejectReason: `Projected ${req.asset} allocation (${(projectedConcentrationPct * 100).toFixed(1)}%) exceeds maximum asset concentration cap of ${(maxConcentrationPct * 100).toFixed(0)}%.`,
        requiredCashReserve,
        notionalUsd,
        portfolioEquityUsd,
        singleOrderPct,
        projectedConcentrationPct,
      };
    }

    await AuditService.logEvent({
      userId: req.userId,
      eventType: 'RISK_APPROVED',
      source: 'server_risk_engine',
      actor: 'risk_engine',
      idempotencyKey: req.idempotencyKey,
      metadata: {
        symbol: `${req.asset}${req.quoteAsset}`,
        side: req.side,
        notionalUsd,
        singleOrderPct,
        projectedConcentrationPct,
      },
      result: 'SUCCESS',
    });

    return {
      approved: true,
      requiredCashReserve,
      notionalUsd,
      portfolioEquityUsd,
      singleOrderPct,
      projectedConcentrationPct,
    };
  }
}
