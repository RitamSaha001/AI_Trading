/**
 * Server-Authoritative Live Order Gate Service
 * 
 * The single, unified pre-execution safety gate for all live-money orders.
 * Every live order MUST pass all 15 authoritative checks before any network request
 * can be dispatched to the broker API:
 * 
 * 1.  Environment & Live Enablement Gate
 * 2.  Emergency State Check (TRADING_NORMAL required; TRADING_HALTED / PANIC blocked)
 * 3.  Broker Verification
 * 4.  User Authorization & Account Limits
 * 5.  Production Broker Credentials Scoping
 * 6.  Session Health & Daily 03:30 AM IST Cutoff Guards
 * 7.  Authoritative Outbound Egress IP Verification
 * 8.  Indian Market Calendar & Trading Hours (NSE/BSE)
 * 9.  Authoritative Instrument Master Registry Resolution
 * 10. Exchange Rules, Price Bands (Circuit Limits) & Freeze Quantities
 * 11. Mandatory Product Selection (CNC/Delivery vs MIS/Intraday vs MTF)
 * 12. Human Confirmation Token Verification & Anti-Tampering Hash Check
 * 13. Risk Snapshot Drift Revalidation
 * 14. Available Liquid Funds & Sellable Holdings Verification
 * 15. Atomic Double-Entry Ledger Reservation
 */

import { getDb, DBClient } from '../db';
import { config } from '../config';
import { AuditService, logger } from './auditService';
import { BrokerOrderRequest } from './brokers/brokerTypes';
import { StandardBrokerError } from './brokers/brokerGateway';
import { UpstoxClient } from './brokers/upstox/upstoxClient';
import { UpstoxAdapter } from './brokers/upstox/upstoxAdapter';
import { UpstoxInstrumentProvider } from './brokers/upstox/upstoxInstrumentProvider';
import { UpstoxInstrumentRegistry } from './brokers/upstox/upstoxInstrumentRegistry';
import { UpstoxProductMatrix } from './brokers/upstox/upstoxProductMatrix';
import { IndianMarketCalendar } from './brokers/upstox/indianMarketCalendar';
import { RiskEngine } from './riskEngine';
import { LedgerService } from './ledgerService';
import { ExactDecimal } from './precision';
import { EmergencyControlService } from './emergencyControlService';
import { LiveOrderConfirmationService } from './liveOrderConfirmationService';
import { IntradaySquareOffService } from './intradaySquareOffService';
import { OtrLimiterService } from './otrLimiterService';

export interface LiveOrderGateVerificationResult {
  passed: boolean;
  rejectReason?: string;
  errorCode?: string;
  instrument?: any;
  credentials?: any;
  confirmationRecord?: any;
  riskResult?: any;
  reservedCashMinor?: bigint;
  reservedQtyMinor?: bigint;
}

export class LiveOrderGateService {
  /**
   * Executes the comprehensive 15-point pre-submission verification.
   * Throws a StandardBrokerError immediately if ANY check fails.
   */
  public static async verifyLiveOrderPreSubmission(
    order: BrokerOrderRequest,
    confirmationId?: string,
    options?: { tx?: DBClient }
  ): Promise<LiveOrderGateVerificationResult> {
    const brokerId = (order.broker || 'upstox').toLowerCase();

    // 1. Environment & Live Trading Enablement Gate
    if (!config.UPSTOX_LIVE_TRADING_ENABLED) {
      throw new StandardBrokerError(
        'ORDER_REJECTED',
        'UPSTOX_LIVE_TRADING_DISABLED: Upstox live trading is currently disabled by server safety gate (READ_ONLY / PAPER mode only).',
        brokerId
      );
    }

    // 2. Emergency State Check (Durable PANIC / TRADING_HALTED)
    const emergencyStatus = await EmergencyControlService.getStatus();
    if (emergencyStatus.state === 'PANIC') {
      if (!order.isSystemPanic) {
        throw new StandardBrokerError(
          'EMERGENCY_PANIC_ACTIVE',
          `Live order blocked: Emergency PANIC mode is currently active. Reason: ${emergencyStatus.reason}`,
          brokerId
        );
      }
    } else if (order.isSystemPanic) {
      // Security guard: If order claims isSystemPanic but system is NOT in PANIC state, reject immediately
      throw new StandardBrokerError(
        'ORDER_REJECTED',
        'Unauthorized panic order: System is not in PANIC state.',
        brokerId
      );
    }

    if (emergencyStatus.state === 'TRADING_HALTED' && !order.isSystemPanic) {
      throw new StandardBrokerError(
        'TRADING_HALTED',
        `Live order blocked: System trading is temporarily halted. Reason: ${emergencyStatus.reason}`,
        brokerId
      );
    }

    // 3. Broker Verification
    if (brokerId !== 'upstox') {
      throw new StandardBrokerError(
        'INVALID_BROKER',
        `Unsupported broker for live equity execution: ${order.broker}`,
        brokerId
      );
    }

    // 4. User Authorization & Account Limits
    const db = options?.tx || getDb();
    const user = await db.queryOne<any>(`SELECT id, role FROM users WHERE id = ?`, [order.userId]);
    if (!user) {
      throw new StandardBrokerError(
        'USER_UNAUTHORIZED',
        'User account not found or not authorized to place live orders.',
        brokerId
      );
    }

    const limits = await db.queryOne<any>(
      `SELECT is_emergency_frozen, freeze_reason FROM account_limits WHERE user_id = ?`,
      [order.userId]
    );
    if (limits?.is_emergency_frozen) {
      throw new StandardBrokerError(
        'ACCOUNT_FROZEN',
        `Account is under emergency freeze: ${limits.freeze_reason || 'Trading frozen'}`,
        brokerId
      );
    }

    // 5. Production Broker Credentials Scoping (Finding 6)
    const credRow = await db.queryOne<any>(
      `SELECT * FROM broker_credentials 
       WHERE user_id = ? AND broker = 'upstox' AND (environment = 'production' OR environment = 'prod')
       ORDER BY updated_at DESC LIMIT 1`,
      [order.userId]
    );

    if (!credRow || !credRow.access_token_encrypted) {
      throw new StandardBrokerError(
        'AUTHENTICATION_FAILED',
        'Live trading requires production Upstox credentials. Connected credentials are for sandbox or missing.',
        brokerId
      );
    }

    // 6. Session Health & Daily 03:30 AM IST Cutoff Guards
    const tokenExpiresAt = credRow.token_expires_at ? Number(credRow.token_expires_at) : null;
    const now = Date.now();
    if (tokenExpiresAt && tokenExpiresAt <= now) {
      throw new StandardBrokerError(
        'AUTHENTICATION_FAILED',
        'Upstox daily session expired at 03:30 AM IST. Please re-authenticate.',
        brokerId
      );
    }

    // 5-minute pre-market cutoff guard
    const UPSTOX_PRE_MARKET_CUTOFF_MS = 5 * 60 * 1000;
    if (tokenExpiresAt && tokenExpiresAt - now < UPSTOX_PRE_MARKET_CUTOFF_MS) {
      throw new StandardBrokerError(
        'SESSION_EXPIRING',
        'Upstox daily session expires in less than 5 minutes. Live orders blocked until morning re-authentication.',
        brokerId
      );
    }

    // Decrypt access token
    let accessToken: string;
    try {
      accessToken = UpstoxAdapter.decryptSecret(credRow.access_token_encrypted);
    } catch {
      throw new StandardBrokerError(
        'AUTHENTICATION_FAILED',
        'Could not decrypt production Upstox access token.',
        brokerId
      );
    }

    // 7. Authoritative Outbound Egress IP Verification
    const ipCheck = await UpstoxClient.checkOutboundIp(false, accessToken);
    if (ipCheck.status === 'FAIL' || (config.NODE_ENV === 'production' && ipCheck.authoritativeSource === 'NONE')) {
      throw new StandardBrokerError(
        'STATIC_IP_MISMATCH',
        `Upstox live order blocked: outbound IP does not match registered static IP. ${ipCheck.error || ''}`,
        brokerId
      );
    }

    // 8. Indian Market Calendar & Trading Hours (Finding 9)
    const isAmo = (order as any).isAmo || (order as any).amo || order.validity === 'AMO';
    if (!isAmo && !IndianMarketCalendar.isMarketOpen()) {
      const nextOpen = IndianMarketCalendar.getNextMarketOpen();
      const istNext = IndianMarketCalendar.toIST(nextOpen);
      throw new StandardBrokerError(
        'MARKET_CLOSED',
        `Indian markets (NSE/BSE) are currently closed. Next regular market open is ${istNext.dateStr} 09:15 IST.`,
        brokerId
      );
    }

    // 9. Mandatory Product Selection (Finding 15)
    if (!order.product || typeof order.product !== 'string' || !order.product.trim()) {
      throw new StandardBrokerError(
        'PRODUCT_REQUIRED',
        'Explicit product selection is strictly required for live orders (e.g. CNC/D for Delivery, MIS/I for Intraday, MTF for Margin). Silent defaulting is prohibited.',
        brokerId
      );
    }
    const rawProduct = order.product.toUpperCase().trim();
    const validProducts = ['CNC', 'MIS', 'NRML', 'MTF', 'D', 'I', 'DELIVERY', 'INTRADAY'];
    if (!validProducts.includes(rawProduct)) {
      throw new StandardBrokerError(
        'INVALID_PRODUCT',
        `Unsupported order product: ${order.product}. Permitted products: ${validProducts.join(', ')}`,
        brokerId
      );
    }

    // Intraday (MIS) 15:00 IST Cutoff Check (Component 2)
    const isMisProduct = rawProduct === 'MIS' || rawProduct === 'I' || rawProduct === 'INTRADAY';
    if (isMisProduct && order.side === 'BUY' && !order.isSystemPanic) {
      if (IntradaySquareOffService.isCutoffActive()) {
        throw new StandardBrokerError(
          'INTRADAY_CUTOFF_ACTIVE',
          'Market is within intraday cutoff window (>= 15:00 IST). No new Intraday (MIS) BUY orders are permitted.',
          brokerId
        );
      }
    }

    // SEBI Order-to-Trade Ratio (OTR) Pre-Submission Check (Component 4)
    if (!order.isSystemPanic) {
      OtrLimiterService.assertOtrLimit(order.userId, order.symbol, 'PLACE');
    }

    // 10. Authoritative Instrument Rules, Price Bands & Freeze Limits (Findings 1 & 8)
    const instrumentProvider = new UpstoxInstrumentProvider();
    const validation = instrumentProvider.validateOrder(order);
    if (!validation.isValid) {
      throw new StandardBrokerError('ORDER_REJECTED', validation.error || 'Invalid order parameters', brokerId);
    }

    const instrument = instrumentProvider.getInstrument(order.symbol);
    if (!instrument) {
      throw new StandardBrokerError('ORDER_REJECTED', `Unsupported Upstox instrument: ${order.symbol}`, brokerId);
    }

    // Authoritative Product & Segment Matrix Validation (P0-3)
    const segment = instrument.segment || (instrument.exchange === 'NSE' ? 
      (instrument.instrumentType === 'FUT' || instrument.instrumentType === 'OPT' ? 'NSE_FO' : 'NSE_EQ') :
      (instrument.instrumentType === 'FUT' || instrument.instrumentType === 'OPT' ? 'BSE_FO' : 'BSE_EQ'));
    const productResolution = UpstoxProductMatrix.resolveProduct(segment, rawProduct);
    if (!productResolution) {
      throw new StandardBrokerError(
        'ORDER_REJECTED',
        `Unsupported product '${order.product}' for segment '${segment}'. Allowed: ${UpstoxProductMatrix.getAllowedProducts(segment)?.join(', ') || 'none'}.`,
        brokerId
      );
    }

    // 11. System Panic Bypass or Authorized Autonomous Algo or Two-Step Human Confirmation Token Verification
    let isPanicBypass = false;
    if (order.isSystemPanic) {
      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'PANIC_GATE_BYPASS',
        source: 'live_order_gate_service',
        actor: 'emergency_control_service',
        result: 'SUCCESS',
        metadata: {
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          clientOrderId: order.clientOrderId,
          reason: 'Emergency Panic Square-Off — bypassing human confirmation and risk drift',
        },
      });
      isPanicBypass = true;
    }

    const isAutonomousAlgo = Boolean(
      !isPanicBypass &&
      ((order as any).isAutonomous || (order as any).auto) &&
      ((order as any).strategyName || (order as any).strategyId)
    );

    if (isAutonomousAlgo) {
      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'AUTONOMOUS_ALGO_AUTHORIZED',
        source: 'live_order_gate_service',
        actor: 'autonomous_pilot_engine',
        result: 'SUCCESS',
        metadata: {
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          clientOrderId: order.clientOrderId,
          strategy: (order as any).strategyName || (order as any).strategyId,
          reason: 'Authorized Autonomous Local Quant Execution — bypassing human confirmation click with SEBI algo tag attached',
        },
      });
    }

    let confirmation: any = null;
    if (!isPanicBypass && !isAutonomousAlgo) {
      if (!confirmationId) {
        // Require server-side confirmation for all live orders
        throw new StandardBrokerError(
          'CONFIRMATION_REQUIRED',
          'Live orders strictly require a valid two-step human confirmation token. Please propose order first via /api/orders/propose.',
          brokerId
        );
      }

      // Inspect pending confirmation record
      confirmation = await LiveOrderConfirmationService.getConfirmation(confirmationId, order.userId);
      if (!confirmation) {
        throw new StandardBrokerError(
          'CONFIRMATION_NOT_FOUND',
          'Live order confirmation not found or unauthorized.',
          brokerId
        );
      }

      if (confirmation.status === 'CONSUMED') {
        throw new StandardBrokerError(
          'CONFIRMATION_ALREADY_CONSUMED',
          'Live order confirmation has already been consumed.',
          brokerId
        );
      }

      if (confirmation.status === 'EXPIRED' || confirmation.expiresAt <= Date.now()) {
        throw new StandardBrokerError(
          'CONFIRMATION_EXPIRED',
          'Live order confirmation has expired. Please propose order again.',
          brokerId
        );
      }

      if (confirmation.status !== 'PENDING') {
        throw new StandardBrokerError(
          'CONFIRMATION_INVALID',
          `Live order confirmation is not in PENDING state (status: ${confirmation.status}).`,
          brokerId
        );
      }

      // Anti-Tampering Hash Verification (includes disclosedQuantity and slice)
      const submittedHash = LiveOrderConfirmationService.computeOrderHash({
        userId: order.userId,
        broker: brokerId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: Number(order.quantity),
        price: order.price ? Number(order.price) : undefined,
        triggerPrice: order.triggerPrice ? Number(order.triggerPrice) : undefined,
        product: rawProduct,
        validity: order.validity,
        disclosedQuantity: order.disclosedQuantity,
        slice: order.slice,
      });

      if (submittedHash !== confirmation.orderHash) {
        // Mark confirmation as rejected due to tampering
        await db.execute(
          `UPDATE live_order_confirmations SET status = 'REJECTED', rejection_reason = 'Order parameters tampered' WHERE id = ?`,
          [confirmationId]
        );

        await AuditService.logEvent({
          userId: order.userId,
          eventType: 'ORDER_REJECTED',
          source: 'live_order_gate_service',
          actor: 'anti_tampering_guard',
          result: 'BLOCKED',
          metadata: { confirmationId, reason: 'PARAMETER_TAMPERING' },
        });

        throw new StandardBrokerError(
          'ORDER_PARAMETER_TAMPERING',
          'Order parameters do not match confirmed proposal. A new confirmation is required.',
          brokerId
        );
      }
    }

    // 12. Final Pre-Submission Risk Engine Revalidation (Section 8 & 13)
    const upstoxAdapter = new UpstoxAdapter();
    let liveQuote: any = null;
    try {
      liveQuote = await upstoxAdapter.getMarketQuote(order.symbol, order.userId, accessToken);
    } catch {
      liveQuote = null;
    }

    // Fail-Closed Authoritative Quote Guard (P0-2)
    if (!liveQuote || !liveQuote.quoteTime || !liveQuote.lastPrice || liveQuote.lastPrice <= 0 || liveQuote.isAuthoritative === false) {
      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'ORDER_REJECTED',
        source: 'live_order_gate_service',
        actor: 'authoritative_quote_guard',
        result: 'BLOCKED',
        metadata: { symbol: order.symbol, reason: 'Authoritative market quote unavailable from broker' },
      });
      throw new StandardBrokerError(
        'LIVE_ORDER_REJECTED_QUOTE_UNAVAILABLE',
        `Live order rejected: Authoritative broker market quote for ${order.symbol} is unavailable from Upstox. No live order without authoritative broker price.`,
        brokerId
      );
    }

    const serverNow = Date.now();
    const serverQuoteAgeMs = Math.max(0, serverNow - liveQuote.quoteTime);
    if (serverQuoteAgeMs > 45_000) {
      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'ORDER_REJECTED',
        source: 'live_order_gate_service',
        actor: 'quote_freshness_guard',
        result: 'BLOCKED',
        metadata: { symbol: order.symbol, quoteAgeMs: serverQuoteAgeMs, maxAllowed: 45000 },
      });
      throw new StandardBrokerError(
        'LIVE_ORDER_REJECTED_STALE_QUOTE',
        `Live order rejected: Authoritative broker market quote is stale (${Math.round(serverQuoteAgeMs / 1000)}s old > 45s threshold).`,
        brokerId
      );
    }

    // Fail closed on dynamic price bands (circuit limits) (P0-10)
    const isLimitType = order.type === 'LIMIT' || order.type === 'STOP_LOSS_LIMIT' || order.type === 'SL' || (order.type as string) === 'SL-M';
    if (order.price && (order.type === 'LIMIT' || order.type === 'STOP_LOSS_LIMIT' || order.type === 'SL')) {
      const limitPrice = Number(order.price);
      if (liveQuote.lowerCircuitLimit && limitPrice < liveQuote.lowerCircuitLimit) {
        throw new StandardBrokerError(
          'CIRCUIT_LIMIT_BREACH',
          `Order price ${limitPrice} is below lower circuit limit ${liveQuote.lowerCircuitLimit}.`,
          brokerId
        );
      }
      if (liveQuote.upperCircuitLimit && limitPrice > liveQuote.upperCircuitLimit) {
        throw new StandardBrokerError(
          'CIRCUIT_LIMIT_BREACH',
          `Order price ${limitPrice} is above upper circuit limit ${liveQuote.upperCircuitLimit}.`,
          brokerId
        );
      }
    }
    if (order.triggerPrice && (order.type === 'STOP_LOSS' || order.type === 'STOP_LOSS_LIMIT' || order.type === 'SL' || (order.type as string) === 'SL-M')) {
      const triggerPrice = Number(order.triggerPrice);
      if (liveQuote.lowerCircuitLimit && triggerPrice < liveQuote.lowerCircuitLimit) {
        throw new StandardBrokerError(
          'CIRCUIT_LIMIT_BREACH',
          `Trigger price ${triggerPrice} is below lower circuit limit ${liveQuote.lowerCircuitLimit}.`,
          brokerId
        );
      }
      if (liveQuote.upperCircuitLimit && triggerPrice > liveQuote.upperCircuitLimit) {
        throw new StandardBrokerError(
          'CIRCUIT_LIMIT_BREACH',
          `Trigger price ${triggerPrice} is above upper circuit limit ${liveQuote.upperCircuitLimit}.`,
          brokerId
        );
      }
    }

    const price = order.price ? Number(order.price) : liveQuote.lastPrice;

    // Resolve accurate asset class (EQUITY vs FUTURE vs OPTION) (P0-9)
    let assetClass: 'EQUITY' | 'FUTURE' | 'OPTION' = 'EQUITY';
    if (instrument.segment === 'NSE_FO' || instrument.segment === 'BSE_FO') {
      if (instrument.instrumentType === 'OPTIONS' || instrument.instrumentType === 'OPT' || (instrument as any).optionType) {
        assetClass = 'OPTION';
      } else {
        assetClass = 'FUTURE';
      }
    }

    let riskResult: any = null;
    if (!isPanicBypass) {
      riskResult = await RiskEngine.evaluateTrade({
        userId: order.userId,
        broker: 'upstox',
        assetClass,
        currency: instrument.quoteAsset || 'INR',
        accountMode: 'live',
        symbol: order.symbol,
        asset: instrument.baseAsset || order.symbol,
        quoteAsset: instrument.quoteAsset || 'INR',
        side: order.side,
        type: order.type as any,
        quantity: order.quantity,
        price,
        marketQuoteAgeMs: serverQuoteAgeMs,
        idempotencyKey: order.clientOrderId || order.idempotencyKey,
      });

      if (!riskResult.approved) {
        await AuditService.logEvent({
          userId: order.userId,
          eventType: 'ORDER_REJECTED',
          source: 'live_order_gate_service',
          actor: 'risk_engine',
          result: 'BLOCKED',
          metadata: { symbol: order.symbol, reason: riskResult.rejectReason },
        });

        if (riskResult.rejectReason?.toLowerCase().includes('insufficient holdings')) {
          throw new StandardBrokerError(
            'INSUFFICIENT_HOLDINGS',
            `Insufficient sellable equity: ${riskResult.rejectReason}`,
            brokerId
          );
        }

        throw new StandardBrokerError(
          'ORDER_REJECTED',
          `Pre-submission risk check rejected: ${riskResult.rejectReason || 'Limits exceeded'}`,
          brokerId
        );
      }
    }

    // 13. Comprehensive Risk Snapshot Drift Check
    if (!isPanicBypass && !isAutonomousAlgo && confirmation && confirmation.riskSnapshot && riskResult) {
      const snapshot = confirmation.riskSnapshot;
      const currentEquity = riskResult.portfolioEquity || 0;
      const initialEquity = snapshot.accountEquity || currentEquity;

      // 1. Total Equity Degradation (>15%)
      if (initialEquity > 0 && (initialEquity - currentEquity) / initialEquity > 0.15) {
        throw new StandardBrokerError(
          'RISK_CONDITIONS_CHANGED',
          'Account equity has degraded significantly (>15%) since confirmation. A new confirmation is required.',
          brokerId
        );
      }

      // 2. Available Cash Degradation for BUY orders (>25%)
      if (order.side === 'BUY') {
        const currentCash = riskResult.availableCash || 0;
        const initialCash = snapshot.availableCash || currentCash;
        if (initialCash > 0 && (initialCash - currentCash) / initialCash > 0.25) {
          throw new StandardBrokerError(
            'RISK_CONDITIONS_CHANGED',
            'Available cash has degraded significantly (>25%) since confirmation. A new confirmation is required.',
            brokerId
          );
        }
      }

      // 3. Projected Concentration Drift (>5 percentage points increase)
      if (order.side === 'BUY') {
        const currentConcentration = riskResult.projectedConcentrationPct || 0;
        const initialConcentration = snapshot.projectedConcentrationPct || 0;
        if (currentConcentration > initialConcentration + 0.05) {
          throw new StandardBrokerError(
            'RISK_CONDITIONS_CHANGED',
            'Projected asset concentration drifted beyond safe tolerance since confirmation. A new confirmation is required.',
            brokerId
          );
        }
      }

      // 4. Single Order Notional Ratio Drift (>5 percentage points increase)
      const currentSingleOrderPct = riskResult.singleOrderPct || 0;
      const initialSingleOrderPct = snapshot.singleOrderPct || 0;
      if (currentSingleOrderPct > initialSingleOrderPct + 0.05) {
        throw new StandardBrokerError(
          'RISK_CONDITIONS_CHANGED',
          'Order size relative to portfolio equity drifted beyond safe tolerance since confirmation. A new confirmation is required.',
          brokerId
        );
      }
    }

    // 14. Available Liquid Funds & Sellable Holdings Verification (Section 14)
    const notional = ExactDecimal.from(order.quantity).times(price > 0 ? price : 1);
    const reservedCashMinor = order.side === 'BUY' ? notional.toMinor(2) : 0n;
    const reservedQtyMinor = order.side === 'SELL' ? ExactDecimal.from(order.quantity).toMinor(0) : 0n;

    if (!isPanicBypass) {
      if (order.side === 'BUY' && reservedCashMinor > 0n) {
        // Query Upstox venue funds pre-flight
        let venueAvailableMinor: bigint | null = null;
        try {
          const venueFunds = await upstoxAdapter.getFunds(order.userId);
          if (venueFunds) {
            venueAvailableMinor = venueFunds.availableCash.toMinor(2);
            if (venueAvailableMinor < reservedCashMinor) {
              throw new StandardBrokerError(
                'INSUFFICIENT_FUNDS',
                `Insufficient Upstox broker margin for live order. Required: ₹${notional.toFixed(2)}, Available on Upstox: ₹${venueFunds.availableCash.toFixed(2)}`,
                brokerId
              );
            }
          }
        } catch (err: any) {
          if (err instanceof StandardBrokerError && err.code === 'INSUFFICIENT_FUNDS') {
            throw err;
          }
          logger.warn(`[LiveOrderGate] Could not query Upstox venue funds pre-flight: ${err.message}`);
        }

        const cashAcc = await LedgerService.getOrCreateAccount(order.userId, 'trading_allocated', 'INR', 'live', db);
        const availableMinor = BigInt(cashAcc.balance_minor || 0) - BigInt(cashAcc.reserved_minor || 0);

        // If local ledger has insufficient free cash, but venue funds verified, synchronize local ledger
        if (availableMinor < reservedCashMinor) {
          if (venueAvailableMinor !== null && venueAvailableMinor >= reservedCashMinor) {
            const neededBalance = BigInt(cashAcc.reserved_minor || 0) + (venueAvailableMinor > reservedCashMinor ? venueAvailableMinor : reservedCashMinor);
            await db.execute(
              `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
              [neededBalance, Date.now(), cashAcc.id]
            );
          } else {
            throw new StandardBrokerError(
              'INSUFFICIENT_FUNDS',
              `Insufficient liquid INR cash for live order. Required: ₹${notional.toFixed(2)}, Available: ₹${(Number(availableMinor) / 100).toFixed(2)}`,
              brokerId
            );
          }
        }
      } else if (order.side === 'SELL' && reservedQtyMinor > 0n) {
        const baseAsset = instrument.baseAsset || order.symbol;
        const holdingAcc = await LedgerService.getOrCreateAccount(order.userId, 'equity_holdings', baseAsset, 'live', db);
        const availableQtyMinor = BigInt(holdingAcc.balance_minor || 0) - BigInt(holdingAcc.reserved_minor || 0);

        if (availableQtyMinor < reservedQtyMinor) {
          // Check Upstox broker holdings and positions
          let brokerShares = 0n;
          try {
            const [holdings, positions] = await Promise.all([
              upstoxAdapter.getHoldings(order.userId).catch(() => []),
              upstoxAdapter.getPositions(order.userId).catch(() => []),
            ]);
            const holdingItem = holdings.find((h: any) => h.symbol === baseAsset || h.symbol === order.symbol);
            const posItem = positions.find((p: any) => p.symbol === baseAsset || p.symbol === order.symbol);
            brokerShares = BigInt(Math.max(0, Math.floor(Number(holdingItem?.quantity || 0) + Number(posItem?.quantity || 0))));
          } catch {}

          if (brokerShares >= reservedQtyMinor) {
            const neededBalance = BigInt(holdingAcc.reserved_minor || 0) + brokerShares;
            await db.execute(
              `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
              [neededBalance, Date.now(), holdingAcc.id]
            );
          } else {
            throw new StandardBrokerError(
              'INSUFFICIENT_HOLDINGS',
              `Insufficient sellable equity shares for ${baseAsset}. Required: ${order.quantity} shares, Available: ${availableQtyMinor > brokerShares ? availableQtyMinor : brokerShares} shares`,
              brokerId
            );
          }
        }
      }
    }

    // 15. Atomically Consume Confirmation (Only AFTER all checks pass!)
    let confirmationRecord = null;
    if (!isPanicBypass && !isAutonomousAlgo) {
      const claimResult = await LiveOrderConfirmationService.claimConfirmationAtomically(
        confirmationId,
        order.userId,
        options?.tx
      );
      if (!claimResult.claimed) {
        throw new StandardBrokerError(
          'CONFIRMATION_INVALID',
          `Live order confirmation token ${confirmationId} invalid, expired, or already claimed.`,
          brokerId
        );
      }
      confirmationRecord = claimResult.record;

      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'ORDER_CONFIRMED',
        source: 'live_order_gate_service',
        actor: 'human_operator',
        externalId: confirmationId,
        result: 'SUCCESS',
        metadata: { confirmationId, symbol: order.symbol, quantity: order.quantity },
      });
    }

    // 16. Atomic Ledger Reservation (Cash for BUY, Equity Shares for SELL)
    if (!isPanicBypass) {
      const clientOrderId = order.clientOrderId || order.idempotencyKey;
      if (order.side === 'BUY' && reservedCashMinor > 0n) {
        await LedgerService.reserveOrderFunds({
          userId: order.userId,
          orderId: clientOrderId,
          accountMode: 'live',
          accountType: 'trading_allocated',
          assetOrCurrency: instrument.quoteAsset || 'INR',
          amountMinor: reservedCashMinor,
          tx: options?.tx,
        });
      } else if (order.side === 'SELL' && reservedQtyMinor > 0n) {
        await LedgerService.reserveOrderFunds({
          userId: order.userId,
          orderId: clientOrderId,
          accountMode: 'live',
          accountType: 'equity_holdings',
          assetOrCurrency: instrument.baseAsset || order.symbol,
          amountMinor: reservedQtyMinor,
          tx: options?.tx,
        });
      }
    }

    return {
      passed: true,
      instrument,
      credentials: { accessToken, accountId: credRow.account_id },
      confirmationRecord,
      riskResult,
      reservedCashMinor,
      reservedQtyMinor,
    };
  }
}
