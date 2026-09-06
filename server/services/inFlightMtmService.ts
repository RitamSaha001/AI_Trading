/**
 * In-Flight Real-Time Mark-to-Market (MTM) & Margin Liquidation Daemon
 * 
 * Continuously evaluates live open positions against account equity and maintenance margin.
 * Pre-emptively triggers circuit-aware emergency panic square-off before broker RMS penalties
 * or negative debt balances can occur.
 */

import { getDb } from '../db';
import { logger, AuditService } from './auditService';
import { BrokerRegistry } from './brokers/brokerRegistry';
import { IndianMarketCalendar } from './brokers/upstox/indianMarketCalendar';
import { UpstoxInstrumentMasterService } from './brokers/upstox/upstoxInstrumentMasterService';
import { EmergencyControlService } from './emergencyControlService';
import { ExactDecimal } from './precision';

export interface MtmEvaluationResult {
  userId: string;
  broker: string;
  nav: number;
  unrealizedPnl: number;
  realizedPnl: number;
  maintenanceMarginRequired: number;
  marginHealthRatio: number;
  isMarginCallWarning: boolean;
  isStopOutTriggered: boolean;
  isRiskDegraded?: boolean;
  reason?: string;
}

export class InFlightMtmService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Evaluates a user's open positions for margin health and stop-out triggers.
   */
  public static async evaluateUserPositions(
    userId: string,
    brokerId: string = 'upstox'
  ): Promise<MtmEvaluationResult> {
    const db = getDb();
    const broker = BrokerRegistry.get(brokerId);

    // 1. Fetch cash balance from ledger
    const cashRow = await db.queryOne<{ balance_minor: number }>(
      `SELECT balance_minor FROM ledger_accounts 
       WHERE user_id = ? AND account_mode = 'live' AND account_type = 'trading_allocated'
       ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    const cashBalance = cashRow ? Number(cashRow.balance_minor) / 100 : 0;

    // 2. Fetch user limits for daily loss checks
    const limits = await db.queryOne<any>(
      `SELECT max_daily_loss_usd, is_emergency_frozen FROM account_limits WHERE user_id = ?`,
      [userId]
    );
    const maxDailyLoss = Number(limits?.max_daily_loss_usd || 50000);

    // 3. Fetch authoritative funds and margins from broker
    let brokerFunds: any = null;
    try {
      if (broker.getFunds) {
        brokerFunds = await broker.getFunds(userId);
      }
    } catch (err: any) {
      logger.warn(`[InFlightMtmService] Could not fetch broker funds for user ${userId}: ${err.message}`);
    }

    // 4. Fetch live positions from broker
    let positions: any[] = [];
    try {
      if (broker.getPositions) {
        positions = await broker.getPositions(userId);
      }
    } catch (err: any) {
      logger.error(`[InFlightMtmService] Failed to fetch positions for user ${userId}: ${err.message}. Entering RISK_GUARD_DEGRADED.`);
      
      void AuditService.logEvent({
        userId,
        eventType: 'RISK_DATA_UNAVAILABLE',
        source: 'in_flight_mtm_service',
        actor: 'mtm_daemon',
        result: 'DEGRADED',
        metadata: { error: err.message, broker: brokerId },
      });

      // Fail-closed invariant: halt new trading orders when risk state cannot be verified
      await EmergencyControlService.setState(
        'TRADING_HALTED',
        `Live risk evaluation degraded: unable to query broker positions for ${userId} (${err.message})`,
        'in_flight_mtm_service'
      ).catch(() => {});

      return {
        userId,
        broker: brokerId,
        nav: cashBalance,
        unrealizedPnl: 0,
        realizedPnl: 0,
        maintenanceMarginRequired: 0,
        marginHealthRatio: 0,
        isMarginCallWarning: true,
        isStopOutTriggered: false,
        isRiskDegraded: true,
        reason: `Broker position data unavailable: ${err.message}`,
      };
    }

    let totalUnrealizedPnl = ExactDecimal.zero();
    let totalRealizedPnl = ExactDecimal.zero();
    let totalMaintenanceMargin = ExactDecimal.zero();

    for (const pos of positions) {
      const qtyDec = ExactDecimal.from(pos.quantity || 0);
      if (qtyDec.isZero()) continue;

      const inst = UpstoxInstrumentMasterService.getInstrument(pos.symbol);
      const multiplier = inst?.contractMultiplier || 1;
      const avgPrice = Number(pos.averagePrice || 0);
      const curPrice = Number(pos.currentPrice || avgPrice);

      const unPnl = pos.unrealizedPnl !== undefined
        ? ExactDecimal.from(pos.unrealizedPnl)
        : qtyDec.mul(ExactDecimal.from(curPrice - avgPrice)).mul(ExactDecimal.from(multiplier));

      const rePnl = pos.realizedPnl !== undefined
        ? ExactDecimal.from(pos.realizedPnl)
        : ExactDecimal.zero();

      totalUnrealizedPnl = totalUnrealizedPnl.add(unPnl);
      totalRealizedPnl = totalRealizedPnl.add(rePnl);

      // Margin requirement: 15% SPAN+Exposure for F&O, 10% for intraday equities
      const isDerivative = pos.symbol.includes('FUT') || pos.symbol.includes('CE') || pos.symbol.includes('PE');
      const marginRate = isDerivative ? 0.15 : 0.10;
      const notional = qtyDec.abs().mul(ExactDecimal.from(curPrice)).mul(ExactDecimal.from(multiplier));
      const posMargin = notional.mul(ExactDecimal.from(marginRate));

      totalMaintenanceMargin = totalMaintenanceMargin.add(posMargin);
    }

    const unPnlNum = totalUnrealizedPnl.toNumber();
    const rePnlNum = totalRealizedPnl.toNumber();
    // Use authoritative broker used_margin if reported and greater than local calculation
    const calculatedMaint = totalMaintenanceMargin.toNumber();
    const brokerMaint = brokerFunds?.usedMargin ? Number(brokerFunds.usedMargin) : 0;
    const maintMarginNum = Math.max(calculatedMaint, brokerMaint);

    const nav = cashBalance + unPnlNum + rePnlNum;

    // Margin Health Ratio: NAV / Maintenance Margin
    const marginHealthRatio = maintMarginNum > 0
      ? Math.max(0, nav / maintMarginNum)
      : 1.0;

    const isMarginCallWarning = maintMarginNum > 0 && marginHealthRatio <= 1.0 && marginHealthRatio > 0.25;
    const isStopOutTriggered = (maintMarginNum > 0 && marginHealthRatio <= 0.25) || (nav < 0) || (unPnlNum + rePnlNum <= -maxDailyLoss);

    let reason: string | undefined = undefined;
    if (isStopOutTriggered) {
      if (marginHealthRatio <= 0.25) {
        reason = `Margin health ratio (${marginHealthRatio.toFixed(2)}) breached stop-out threshold (0.25).`;
      } else if (nav < 0) {
        reason = `Net Asset Value dropped below zero (NAV: ${nav.toFixed(2)}). Immediate stop-out required.`;
      } else {
        reason = `Total daily loss (${(unPnlNum + rePnlNum).toFixed(2)}) breached max daily loss limit (${maxDailyLoss}).`;
      }
    }

    return {
      userId,
      broker: brokerId,
      nav,
      unrealizedPnl: unPnlNum,
      realizedPnl: rePnlNum,
      maintenanceMarginRequired: maintMarginNum,
      marginHealthRatio,
      isMarginCallWarning,
      isStopOutTriggered,
      isRiskDegraded: false,
      reason,
    };
  }


  /**
   * Executes a single evaluation pass across all active live users.
   */
  public static async runEvaluationPass(): Promise<MtmEvaluationResult[]> {
    const db = getDb();
    const results: MtmEvaluationResult[] = [];

    // Query all live users with active credentials
    const users = await db.query<{ user_id: string; broker: string }>(
      `SELECT DISTINCT user_id, broker FROM broker_credentials WHERE can_trade = TRUE`
    );

    for (const { user_id, broker } of users) {
      try {
        const evalResult = await this.evaluateUserPositions(user_id, broker);
        results.push(evalResult);

        if (evalResult.isMarginCallWarning) {
          await AuditService.logEvent({
            userId: user_id,
            eventType: 'MARGIN_CALL_WARNING',
            source: 'in_flight_mtm_service',
            actor: 'mtm_daemon',
            result: 'DEGRADED',
            metadata: {
              nav: evalResult.nav,
              maintMargin: evalResult.maintenanceMarginRequired,
              ratio: evalResult.marginHealthRatio,
            },
          });
        }

        if (evalResult.isStopOutTriggered) {
          logger.error(`[InFlightMtmService] STOP-OUT TRIGGERED for user ${user_id}: ${evalResult.reason}`);

          await AuditService.logEvent({
            userId: user_id,
            eventType: 'MARGIN_CALL_STOP_OUT',
            source: 'in_flight_mtm_service',
            actor: 'mtm_daemon',
            result: 'FAILED',
            metadata: {
              reason: evalResult.reason,
              nav: evalResult.nav,
              unrealizedPnl: evalResult.unrealizedPnl,
              ratio: evalResult.marginHealthRatio,
            },
          });

          // Execute circuit-aware emergency panic square-off
          await EmergencyControlService.executePanicSquareOff(
            user_id,
            broker,
            `In-Flight MTM Stop-Out: ${evalResult.reason}`,
            'mtm_liquidation_daemon'
          );

          // Halt trading for this user
          await EmergencyControlService.setState(
            'TRADING_HALTED',
            `Trading halted after MTM stop-out for user ${user_id}: ${evalResult.reason}`,
            'mtm_liquidation_daemon'
          );
        }
      } catch (err: any) {
        logger.warn(`[InFlightMtmService] Evaluation pass error for user ${user_id}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Starts the 1-second continuous background MTM monitoring loop.
   */
  public static startDaemon(intervalMs: number = 1000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(async () => {
      if (!this.isRunning) return;

      // Only execute if market is open
      if (!IndianMarketCalendar.isMarketOpen()) return;

      try {
        await this.runEvaluationPass();
      } catch (err: any) {
        logger.error(`[InFlightMtmService] Daemon tick error: ${err.message}`);
      }
    }, intervalMs);
  }

  public static stopDaemon(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
