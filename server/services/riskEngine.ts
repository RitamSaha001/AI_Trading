import { getDb } from '../db';
import { AuditService } from './auditService';
import { LedgerService } from './ledgerService';
import { ExactDecimal } from './precision';

export interface RiskEvaluationRequest {
  userId: string;
  asset?: string;
  quoteAsset?: string;
  symbol?: string;
  broker?: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT' | string;
  quantity: number | string | ExactDecimal;
  price: number | string | ExactDecimal;
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

    const qtyDec = ExactDecimal.from(req.quantity);
    const priceDec = ExactDecimal.from(req.price);

    if (qtyDec.lte(ExactDecimal.zero()) || priceDec.lte(ExactDecimal.zero())) {
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

    const notionalDec = qtyDec.mul(priceDec);
    const notionalUsd = notionalDec.toDisplayNumber();

    const quoteAsset = req.quoteAsset || 'USDT';
    const asset = req.asset || (req.symbol ? req.symbol.replace(quoteAsset, '') : 'UNKNOWN');
    const symbolPattern = req.symbol || `${asset}%`;

    // 3. Duplicate Order Rate-Limit / Cooldown Check (5 seconds window)
    const recentDuplicate = await db.queryOne<any>(
      `SELECT id FROM exchange_orders 
       WHERE user_id = ? AND symbol LIKE ? AND side = ? 
       AND created_at > ? AND status IN ('SUBMITTING', 'OPEN')`,
      [req.userId, symbolPattern, req.side, Date.now() - 5000]
    );

    if (recentDuplicate) {
      return {
        approved: false,
        rejectReason: `Duplicate order rate-limit breached: active ${req.side} order on ${req.symbol || asset} placed within last 5s.`,
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
    const tradingCashMinor = BigInt(
      balances[`trading_allocated:${quoteAsset}`]?.free ??
        balances[`sovereign_cash:${quoteAsset}`]?.free ??
        0
    );
    const tradingCashDec = ExactDecimal.fromMinor(tradingCashMinor, 2);

    // Calculate portfolio equity
    let portfolioEquityDec = tradingCashDec;
    for (const [key, bal] of Object.entries(balances)) {
      if (key.startsWith('crypto_holdings:') && key.includes(asset)) {
        const balMinor = BigInt(bal.balance || 0);
        const balDec = ExactDecimal.fromMinor(balMinor, 8);
        portfolioEquityDec = portfolioEquityDec.add(balDec.mul(priceDec));
      }
    }
    if (portfolioEquityDec.lte(ExactDecimal.zero())) {
      portfolioEquityDec = notionalDec; // Genesis baseline
    }

    const portfolioEquityUsd = portfolioEquityDec.toDisplayNumber();

    // 6. Max Single Order Percentage (40% hard policy)
    const singleOrderPctDec = notionalDec.div(portfolioEquityDec, 4);
    const singleOrderPct = singleOrderPctDec.toDisplayNumber();
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
    const minReservePctDec = ExactDecimal.from(String(minReservePct));
    const requiredCashReserveDec = portfolioEquityDec.mul(minReservePctDec);
    const requiredCashReserve = requiredCashReserveDec.toDisplayNumber();
    if (req.side === 'BUY') {
      const remainingCashDec = tradingCashDec.sub(notionalDec);
      if (remainingCashDec.lt(requiredCashReserveDec)) {
        return {
          approved: false,
          rejectReason: `Order would violate minimum liquid cash reserve of ${(minReservePct * 100).toFixed(0)}% ($${requiredCashReserve.toFixed(2)}). Projected remaining cash: $${remainingCashDec.toFixed(2)}.`,
          requiredCashReserve,
          notionalUsd,
          portfolioEquityUsd,
          singleOrderPct,
          projectedConcentrationPct: singleOrderPct,
        };
      }
    }

    // 8. Max Asset Concentration (50% policy)
    const currentAssetMinor = BigInt(balances[`crypto_holdings:${req.asset}`]?.balance ?? 0);
    const currentAssetHoldingDec = ExactDecimal.fromMinor(currentAssetMinor, 8);
    const currentHoldingNotionalDec = currentAssetHoldingDec.mul(priceDec);
    const projectedHoldingNotionalDec = req.side === 'BUY'
      ? currentHoldingNotionalDec.add(notionalDec)
      : (currentHoldingNotionalDec.gt(notionalDec) ? currentHoldingNotionalDec.sub(notionalDec) : ExactDecimal.zero());
    const projectedConcentrationPctDec = projectedHoldingNotionalDec.div(portfolioEquityDec, 4);
    const projectedConcentrationPct = projectedConcentrationPctDec.toDisplayNumber();
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

export { ServerRiskEngine as RiskEngine };
