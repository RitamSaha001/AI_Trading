import { getDb } from '../db';
import { AuditService } from './auditService';
import { LedgerService } from './ledgerService';
import { ExactDecimal, getAssetDecimals } from './precision';
import { UpstoxInstrumentRegistry } from './brokers/upstox/upstoxInstrumentRegistry';
import { UpstoxInstrumentMasterService } from './brokers/upstox/upstoxInstrumentMasterService';
import { IndianMarketCalendar } from './brokers/upstox/indianMarketCalendar';

export interface RiskEvaluationRequest {
  userId: string;
  asset?: string;
  quoteAsset?: string;
  symbol?: string;
  broker?: string;
  assetClass?: 'CRYPTO' | 'EQUITY' | 'FUTURE' | 'OPTION';
  product?: string;
  skipMarketHoursCheck?: boolean;
  skipHoldingsCheck?: boolean;
  currency?: string;
  accountMode?: 'live' | 'paper';
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
  notionalNative: number;
  portfolioEquityNative: number;
  /** @deprecated Use notionalNative */ notionalUsd: number;
  /** @deprecated Use portfolioEquityNative */ portfolioEquityUsd: number;
  notional?: number;
  notionalInr?: number;
  portfolioEquity?: number;
  portfolioEquityInr?: number;
  availableCash?: number;
  currency?: string;
  currencySymbol?: string;
  singleOrderPct: number;
  projectedConcentrationPct: number;
}

export class ServerRiskEngine {
  /**
   * Evaluates a trade proposal against server-authoritative institutional risk policies.
   * Multi-asset and multi-currency aware (USD / INR, CRYPTO / EQUITY / FUTURE / OPTION).
   */
  static async evaluateTrade(req: RiskEvaluationRequest): Promise<RiskDecision> {
    const db = getDb();
    const isUpstox = req.broker === 'upstox';
    const assetClass: 'CRYPTO' | 'EQUITY' | 'FUTURE' | 'OPTION' =
      req.assetClass || (isUpstox ? 'EQUITY' : 'CRYPTO');
    const quoteAsset = (req.currency || req.quoteAsset || (isUpstox ? 'INR' : 'USDT')).toUpperCase();
    const currencySymbol = quoteAsset === 'INR' ? '₹' : '$';

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
        notionalNative: 0,
        portfolioEquityUsd: 0,
        portfolioEquityNative: 0,
        notional: 0,
        portfolioEquity: 0,
        currency: quoteAsset,
        currencySymbol,
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
        notionalNative: 0,
        portfolioEquityUsd: 0,
        portfolioEquityNative: 0,
        notional: 0,
        portfolioEquity: 0,
        currency: quoteAsset,
        currencySymbol,
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
        notionalNative: 0,
        portfolioEquityUsd: 0,
        portfolioEquityNative: 0,
        notional: 0,
        portfolioEquity: 0,
        currency: quoteAsset,
        currencySymbol,
        singleOrderPct: 0,
        projectedConcentrationPct: 0,
      };
    }

    const sym = req.symbol || req.asset || '';
    let inst = null;
    if (isUpstox || assetClass === 'EQUITY' || assetClass === 'FUTURE' || assetClass === 'OPTION') {
      inst = UpstoxInstrumentMasterService.getInstrument(sym, req.accountMode === 'live') || UpstoxInstrumentRegistry.get(sym);
    }

    // Apply contract multiplier for derivatives (P0-9)
    const contractMultiplier = (assetClass === 'FUTURE' || assetClass === 'OPTION') ? 
      (inst?.contractMultiplier || 1) : 1;
    const notionalDec = qtyDec.mul(priceDec).mul(ExactDecimal.from(contractMultiplier));

    const notionalAmount = notionalDec.toDisplayNumber();
    const notionalUsd = notionalAmount; // retained for backward compatibility
    const notionalNative = notionalAmount;
    const notionalInr = quoteAsset === 'INR' ? notionalAmount : undefined;

    // Market hours check for Indian Equities and Derivatives in live trading
    const isIndianMarket = isUpstox || assetClass === 'EQUITY' || assetClass === 'FUTURE' || assetClass === 'OPTION';
    const skipMarketHours = req.skipMarketHoursCheck || req.accountMode === 'paper' || (req as any).isAmo;
    if (!skipMarketHours && req.accountMode === 'live' && isIndianMarket) {
      if (!IndianMarketCalendar.isMarketOpen()) {
        return {
          approved: false,
          rejectReason: 'Market is closed. Live orders cannot be placed outside NSE/BSE regular trading hours (09:15 - 15:30 IST).',
          requiredCashReserve: 0,
          notionalUsd,
          notionalNative,
          portfolioEquityUsd: 0,
          portfolioEquityNative: 0,
          notional: notionalAmount,
          portfolioEquity: 0,
          currency: quoteAsset,
          currencySymbol,
          singleOrderPct: 0,
          projectedConcentrationPct: 0,
        };
      }
    }

    // Derivative and Equity Contract Constraint Validation (P0-9 & P0-10)
    if (inst) {
      const qtyNum = qtyDec.toDisplayNumber();
      const priceNum = priceDec.toDisplayNumber();

        // Lot size divisibility check (P0-9)
        const lotSize = inst.lotSize || 1;
        if (lotSize > 1 && qtyNum % lotSize !== 0) {
          return {
            approved: false,
            rejectReason: `Order quantity ${qtyNum} must be an exact multiple of contract lot size ${lotSize} for ${sym}.`,
            requiredCashReserve: 0,
            notionalUsd,
            portfolioEquityUsd: 0,
            portfolioEquityNative: 0,
            notional: notionalAmount,
            notionalNative,
            notionalInr,
            portfolioEquity: 0,
            currency: quoteAsset,
            currencySymbol,
            singleOrderPct: 0,
            projectedConcentrationPct: 0,
          };
        }

        // Freeze quantity check
        if (inst.freezeQuantity && qtyNum > inst.freezeQuantity) {
          return {
            approved: false,
            rejectReason: `Order quantity ${qtyNum} exceeds exchange freeze limit of ${inst.freezeQuantity} for ${sym}. Auto-slicing required.`,
            requiredCashReserve: 0,
            notionalUsd,
            portfolioEquityUsd: 0,
            portfolioEquityNative: 0,
            notional: notionalAmount,
            notionalNative,
            notionalInr,
            portfolioEquity: 0,
            currency: quoteAsset,
            currencySymbol,
            singleOrderPct: 0,
            projectedConcentrationPct: 0,
          };
        }

        // Dynamic price band / circuit limit check (P0-10)
        if (inst.lowerCircuitLimit !== undefined && priceNum < inst.lowerCircuitLimit) {
          return {
            approved: false,
            rejectReason: `Order price ${priceNum} breaches lower circuit limit of ${inst.lowerCircuitLimit} for ${sym}.`,
            requiredCashReserve: 0,
            notionalUsd,
            portfolioEquityUsd: 0,
            portfolioEquityNative: 0,
            notional: notionalAmount,
            notionalNative,
            notionalInr,
            portfolioEquity: 0,
            currency: quoteAsset,
            currencySymbol,
            singleOrderPct: 0,
            projectedConcentrationPct: 0,
          };
        }
        if (inst.upperCircuitLimit !== undefined && priceNum > inst.upperCircuitLimit) {
          return {
            approved: false,
            rejectReason: `Order price ${priceNum} breaches upper circuit limit of ${inst.upperCircuitLimit} for ${sym}.`,
            requiredCashReserve: 0,
            notionalUsd,
            portfolioEquityUsd: 0,
            portfolioEquityNative: 0,
            notional: notionalAmount,
            notionalNative,
            notionalInr,
            portfolioEquity: 0,
            currency: quoteAsset,
            currencySymbol,
            singleOrderPct: 0,
            projectedConcentrationPct: 0,
          };
        }
      }

    const rawAsset = req.asset || (req.symbol ? req.symbol.replace(quoteAsset, '').replace('NSE:', '').replace('BSE:', '') : 'UNKNOWN');
    const asset = rawAsset.trim().toUpperCase();
    const symbolPattern = req.symbol || `${asset}%`;

    // 3. Duplicate Order Rate-Limit / Cooldown Check (5 seconds window)
    const recentDuplicateQuery = req.idempotencyKey
      ? `SELECT id FROM exchange_orders 
         WHERE user_id = ? AND symbol LIKE ? AND side = ? 
         AND created_at > ? AND status IN ('SUBMITTING', 'OPEN')
         AND client_order_id != ? AND idempotency_key != ?`
      : `SELECT id FROM exchange_orders 
         WHERE user_id = ? AND symbol LIKE ? AND side = ? 
         AND created_at > ? AND status IN ('SUBMITTING', 'OPEN')`;
    const recentDuplicateParams = req.idempotencyKey
      ? [req.userId, symbolPattern, req.side, Date.now() - 5000, req.idempotencyKey, req.idempotencyKey]
      : [req.userId, symbolPattern, req.side, Date.now() - 5000];

    const recentDuplicate = await db.queryOne<any>(recentDuplicateQuery, recentDuplicateParams);

    if (recentDuplicate) {
      return {
        approved: false,
        rejectReason: `Duplicate order rate-limit breached: active ${req.side} order on ${req.symbol || asset} placed within last 5s.`,
        requiredCashReserve: 0,
        notionalUsd,
        notionalNative,
        portfolioEquityUsd: 0,
        portfolioEquityNative: 0,
        notional: notionalAmount,
        portfolioEquity: 0,
        currency: quoteAsset,
        currencySymbol,
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
        notionalNative,
        portfolioEquityUsd: 0,
        portfolioEquityNative: 0,
        notional: notionalAmount,
        portfolioEquity: 0,
        currency: quoteAsset,
        currencySymbol,
        singleOrderPct: 0,
        projectedConcentrationPct: 0,
      };
    }

    // 5. Balance & Portfolio Valuation (Asset-Class and Currency Aware)
    const balances = await LedgerService.getUserBalances(req.userId);
    const tradingCashMinor = BigInt(
      balances[`trading_allocated:${quoteAsset}`]?.free ??
        balances[`sovereign_cash:${quoteAsset}`]?.free ??
        0
    );
    const cashDecimals = getAssetDecimals(quoteAsset);
    let tradingCashDec = ExactDecimal.fromMinor(tradingCashMinor, cashDecimals);

    // Calculate portfolio equity across holding accounts
    let portfolioEquityDec = tradingCashDec;
    for (const [key, bal] of Object.entries(balances)) {
      const balMinor = BigInt(bal.balance || 0);
      if (balMinor <= 0n) continue;

      if (assetClass === 'EQUITY' || assetClass === 'FUTURE' || assetClass === 'OPTION') {
        // Indian equities, futures, options: check equity_holdings and asset_holdings (0 decimals)
        if (key.startsWith('equity_holdings:') || key.startsWith('asset_holdings:') || key.startsWith('derivative_positions:')) {
          const holdingSymbol = key.split(':')[1]?.toUpperCase();
          const balDec = ExactDecimal.fromMinor(balMinor, 0);
          let holdingPriceDec = ExactDecimal.zero();
          const authInst = UpstoxInstrumentMasterService.getInstrument(holdingSymbol || '') || UpstoxInstrumentRegistry.get(holdingSymbol || '');
          if (holdingSymbol === asset) {
            holdingPriceDec = priceDec;
          } else {
            if (authInst?.lastPrice) {
              holdingPriceDec = ExactDecimal.from(authInst.lastPrice);
            }
          }
          // Apply contract multiplier for derivatives
          const multiplier = (assetClass === 'FUTURE' || assetClass === 'OPTION') ? 
            (authInst?.contractMultiplier || 1) : 1;
          portfolioEquityDec = portfolioEquityDec.add(balDec.mul(holdingPriceDec).mul(ExactDecimal.from(multiplier)));
        }
      } else {
        // Crypto assets: check crypto_holdings (8 decimals for standard crypto)
        if (key.startsWith('crypto_holdings:') && key.includes(asset)) {
          const balDec = ExactDecimal.fromMinor(balMinor, 8);
          let cryptoVal = balDec.mul(priceDec);
          if (quoteAsset === 'INR') {
            // Convert USD crypto valuation to INR benchmark rate (₹87.50 / USD)
            cryptoVal = cryptoVal.mul(ExactDecimal.from('87.50'));
          }
          portfolioEquityDec = portfolioEquityDec.add(cryptoVal);
        }
      }
    }

    // Portfolio equity fallback
    if (portfolioEquityDec.lte(ExactDecimal.zero())) {
      if (req.accountMode === 'paper') {
        // Virtual paper trading capital
        portfolioEquityDec = quoteAsset === 'INR' ? ExactDecimal.from(1_000_000) : ExactDecimal.from(100_000);
        tradingCashDec = portfolioEquityDec;
      } else {
        return {
          approved: false,
          rejectReason: `Insufficient portfolio equity: Insufficient funds. Total portfolio value is ${currencySymbol}0.00. Please deposit funds before live trading.`,
          requiredCashReserve: 0,
          notionalUsd,
          notionalNative,
          portfolioEquityUsd: 0,
          portfolioEquityNative: 0,
          notional: notionalAmount,
          portfolioEquity: 0,
          currency: quoteAsset,
          currencySymbol,
          singleOrderPct: 0,
          projectedConcentrationPct: 0,
        };
      }
    }

    const portfolioEquityAmount = portfolioEquityDec.toDisplayNumber();
    const portfolioEquityUsd = portfolioEquityAmount;
    const portfolioEquityNative = portfolioEquityAmount;

    // Calculate current asset holdings
    let currentAssetMinor = 0n;
    let assetHoldingsDecimals = 8;
    if (assetClass === 'EQUITY' || assetClass === 'FUTURE' || assetClass === 'OPTION') {
      currentAssetMinor = BigInt(
        balances[`equity_holdings:${asset}`]?.balance ??
          balances[`asset_holdings:${asset}`]?.balance ??
          balances[`derivative_positions:${asset}`]?.balance ??
          0
      );
      assetHoldingsDecimals = 0;
    } else {
      currentAssetMinor = BigInt(balances[`crypto_holdings:${asset}`]?.balance ?? 0);
      assetHoldingsDecimals = 8;
    }
    const currentAssetHoldingDec = ExactDecimal.fromMinor(currentAssetMinor, assetHoldingsDecimals);

    // Pre-trade cash, margin, and holdings validations for live accounts
    if (req.accountMode !== 'paper') {
      if (assetClass === 'EQUITY') {
        const isDelivery = req.product === 'D' || req.product === 'CNC' || !req.product || req.product === 'DELIVERY';
        if (req.side === 'SELL' && isDelivery && !req.skipHoldingsCheck) {
          // SEBI compliance: Retail delivery sales must be covered by pre-existing holdings
          if (currentAssetHoldingDec.lt(qtyDec)) {
            return {
              approved: false,
              rejectReason: `Insufficient holdings: Cannot place delivery SELL order for ${req.quantity} shares of ${asset} with only ${currentAssetHoldingDec.toDisplayNumber()} available. Naked short selling is prohibited by SEBI.`,
              requiredCashReserve: 0,
              notionalUsd,
              notionalNative,
              portfolioEquityUsd: portfolioEquityAmount,
              portfolioEquityNative: portfolioEquityAmount,
              notional: notionalAmount,
              portfolioEquity: portfolioEquityAmount,
              currency: quoteAsset,
              currencySymbol,
              singleOrderPct: 0,
              projectedConcentrationPct: 0,
            };
          }
        } else if (req.side === 'BUY' && tradingCashDec.lte(ExactDecimal.zero())) {
          return {
            approved: false,
            rejectReason: `Insufficient funds: Available cash balance is ${currencySymbol}0.00. Please deposit ${quoteAsset} before live trading.`,
            requiredCashReserve: 0,
            notionalUsd,
            notionalNative,
            portfolioEquityUsd: 0,
            portfolioEquityNative: 0,
            notional: notionalAmount,
            portfolioEquity: 0,
            currency: quoteAsset,
            currencySymbol,
            singleOrderPct: 0,
            projectedConcentrationPct: 0,
          };
        }
      } else if (assetClass === 'FUTURE' || assetClass === 'OPTION') {
        // Derivative margin requirements (SPAN + Exposure)
        let requiredMarginDec: ExactDecimal;
        if (assetClass === 'OPTION' && req.side === 'BUY') {
          // Long options require 100% premium paid upfront
          requiredMarginDec = notionalDec;
        } else {
          // Short options and all futures require SPAN + Exposure margin (minimum 15% of notional)
          requiredMarginDec = notionalDec.mul(ExactDecimal.from('0.15'));
        }

        if (tradingCashDec.lt(requiredMarginDec)) {
          return {
            approved: false,
            rejectReason: `Insufficient margin: Derivative ${req.side} order requires ${currencySymbol}${requiredMarginDec.toDisplayNumber()} initial margin (SPAN + Exposure), but available cash is only ${currencySymbol}${tradingCashDec.toDisplayNumber()}.`,
            requiredCashReserve: 0,
            notionalUsd,
            notionalNative,
            portfolioEquityUsd: portfolioEquityAmount,
            portfolioEquityNative: portfolioEquityAmount,
            notional: notionalAmount,
            portfolioEquity: portfolioEquityAmount,
            currency: quoteAsset,
            currencySymbol,
            singleOrderPct: 0,
            projectedConcentrationPct: 0,
          };
        }
      } else if (req.side === 'BUY' && tradingCashDec.lte(ExactDecimal.zero())) {
        return {
          approved: false,
          rejectReason: `Insufficient funds: Available cash balance is ${currencySymbol}0.00. Please deposit ${quoteAsset} before live trading.`,
          requiredCashReserve: 0,
          notionalUsd,
          notionalNative,
          portfolioEquityUsd: 0,
          portfolioEquityNative: 0,
          notional: notionalAmount,
          portfolioEquity: 0,
          currency: quoteAsset,
          currencySymbol,
          singleOrderPct: 0,
          projectedConcentrationPct: 0,
        };
      }
    }

    // 6. Max Single Order Percentage (40% hard policy)
    const singleOrderPctDec = notionalDec.div(portfolioEquityDec, 4);
    const singleOrderPct = singleOrderPctDec.toDisplayNumber();
    const maxSingleOrderPct = limits?.max_single_order_pct ?? 0.40;
    if (singleOrderPct > maxSingleOrderPct + 0.001) {
      return {
        approved: false,
        rejectReason: `Single order size (${currencySymbol}${notionalAmount.toFixed(2)}) is ${(singleOrderPct * 100).toFixed(1)}% of portfolio, exceeding maximum allowed limit of ${(maxSingleOrderPct * 100).toFixed(0)}%.`,
        requiredCashReserve: 0,
        notionalUsd,
        notionalNative,
        portfolioEquityUsd,
        portfolioEquityNative,
        notional: notionalAmount,
        portfolioEquity: portfolioEquityAmount,
        currency: quoteAsset,
        currencySymbol,
        singleOrderPct,
        projectedConcentrationPct: singleOrderPct,
      };
    }

    // 7. Minimum Liquid Cash Reserve (15% policy)
    const minReservePct = limits?.min_cash_reserve_pct ?? 0.15;
    const minReservePctDec = ExactDecimal.from(String(minReservePct));
    const requiredCashReserveDec = portfolioEquityDec.mul(minReservePctDec);
    const requiredCashReserve = requiredCashReserveDec.toDisplayNumber();

    let cashCommittedDec = ExactDecimal.zero();
    if (assetClass === 'OPTION') {
      cashCommittedDec = req.side === 'BUY' ? notionalDec : notionalDec.mul(ExactDecimal.from('0.15'));
    } else if (assetClass === 'FUTURE') {
      cashCommittedDec = notionalDec.mul(ExactDecimal.from('0.15'));
    } else if (req.side === 'BUY') {
      cashCommittedDec = notionalDec;
    }

    if (cashCommittedDec.gt(ExactDecimal.zero())) {
      const remainingCashDec = tradingCashDec.sub(cashCommittedDec);
      if (remainingCashDec.lt(requiredCashReserveDec)) {
        return {
          approved: false,
          rejectReason: `Order would violate minimum liquid cash reserve of ${(minReservePct * 100).toFixed(0)}% (${currencySymbol}${requiredCashReserve.toFixed(2)}). Projected remaining cash: ${currencySymbol}${remainingCashDec.toFixed(2)}.`,
          requiredCashReserve,
          notionalUsd,
          notionalNative,
          portfolioEquityUsd,
          portfolioEquityNative,
          notional: notionalAmount,
          portfolioEquity: portfolioEquityAmount,
          currency: quoteAsset,
          currencySymbol,
          singleOrderPct,
          projectedConcentrationPct: singleOrderPct,
        };
      }
    }

    // 8. Max Asset Concentration (50% policy)
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
        rejectReason: `Projected ${asset} allocation (${(projectedConcentrationPct * 100).toFixed(1)}%) exceeds maximum asset concentration cap of ${(maxConcentrationPct * 100).toFixed(0)}%.`,
        requiredCashReserve,
        notionalUsd,
        notionalNative,
        portfolioEquityUsd,
        portfolioEquityNative,
        notional: notionalAmount,
        portfolioEquity: portfolioEquityAmount,
        currency: quoteAsset,
        currencySymbol,
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
        symbol: `${asset}${quoteAsset}`,
        broker: req.broker || 'binance',
        assetClass,
        currency: quoteAsset,
        side: req.side,
        notional: notionalAmount,
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
      notional: notionalAmount,
      notionalNative,
      notionalInr,
      portfolioEquity: portfolioEquityAmount,
      portfolioEquityNative: portfolioEquityAmount,
      portfolioEquityInr: quoteAsset === 'INR' ? portfolioEquityAmount : undefined,
      availableCash: tradingCashDec.toDisplayNumber(),
      currency: quoteAsset,
      currencySymbol,
      singleOrderPct,
      projectedConcentrationPct,
    };
  }
}

export { ServerRiskEngine as RiskEngine };
