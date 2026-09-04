import { Asset, AppState, Market } from '../types';
import { TradingDecision } from './decision';
import { RiskPolicy, DEFAULT_RISK_POLICY } from './riskPolicy';
import { portfolioValue, positionValue } from './portfolio';
import { calculatePortfolioRisk } from './risk';
import { indicators, returns, stdev } from './indicators';
import { MarketDataValidityGuard } from './marketValidity';

export interface ChallengerResult {
  hasCriticalConcerns: boolean;
  counterArgument: string;
  concerns: string[];
  mitigations: string[];
  suggestedActionOverride?: 'HOLD' | 'REDUCE_SIZE' | 'REJECT';
}

/**
 * Challenger / Self-Check Desk.
 * Rigorously attacks candidate trading decisions looking for regime mismatch,
 * excessive volatility, concentration clustering, contradictory signals, and hidden tail risk.
 */
export function challengeTradingDecision(
  decision: Partial<TradingDecision>,
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  policy: RiskPolicy = DEFAULT_RISK_POLICY,
  timeframeMinutes: number = 1440
): ChallengerResult {
  const concerns: string[] = [];
  const mitigations: string[] = [];
  const asset = decision.asset;
  const action = decision.action;
  const pv = portfolioValue(state, markets);
  const rk = calculatePortfolioRisk(state, markets);

  // If no action or informational query, no aggressive challenge needed
  if (!action || action === 'NONE' || action === 'HOLD') {
    return {
      hasCriticalConcerns: false,
      counterArgument: 'No capital deployment proposed; posture aligns with disciplined patience.',
      concerns: [],
      mitigations: [],
    };
  }

  // 1. Data Validity & Freshness Critique
  if (asset) {
    const m = markets[asset];
    const validity = MarketDataValidityGuard.validate(m, asset, policy);
    if (validity.isStale) {
      concerns.push(`Market feed is lagging by ${validity.ageSec} seconds. Spot fills may incur adverse slippage.`);
      mitigations.push('Delay execution until exchange WebSocket heartbeat confirms fresh quote.');
    }
    if (validity.isSynthetic) {
      concerns.push('Asset feed is currently operating on heuristic synthetic model rather than live liquidity books.');
      mitigations.push('Disable execution and treat as illustrative scenario only.');
    }
  }

  // 2. Concentration & Correlation Hazard Critique
  if (action === 'BUY' && asset) {
    const currentVal = positionValue(state, markets, asset);
    const mPrice = markets[asset]?.price ?? decision.entry ?? 0;
    const orderNotional = decision.notional || (decision.quantity && mPrice > 0 ? decision.quantity * mPrice : 0);
    const postNotional = currentVal + orderNotional;
    const postWeightPct = pv > 0 ? (postNotional / pv) * 100 : 0;

    if (postWeightPct > policy.maxSingleAssetPct * 100) {
      concerns.push(`Proposed buy elevates ${asset} allocation to ${postWeightPct.toFixed(1)}%, breaching the ${policy.maxSingleAssetPct * 100}% single-asset cap.`);
      mitigations.push('Downsize order quantity to stay under the 50% diversification ceiling.');
    } else if (postWeightPct > policy.warnSingleAssetPct * 100) {
      concerns.push(`Post-trade weight in ${asset} reaches ${postWeightPct.toFixed(1)}%, creating single-point-of-failure risk.`);
      mitigations.push('Consider splitting entry into staged limit orders over 3 separate intervals.');
    }

    // High correlation check with existing top asset
    if (rk.topAsset && rk.topAsset !== asset && rk.topAssetConcentrationPct > 30) {
      const topM = markets[rk.topAsset];
      const assetM = markets[asset];
      if (topM?.history?.length && assetM?.history?.length) {
        const r1 = returns(topM.history.slice(-20));
        const r2 = returns(assetM.history.slice(-20));
        const n = Math.min(r1.length, r2.length);
        if (n >= 10) {
          const mean1 = r1.slice(0, n).reduce((s, x) => s + x, 0) / n;
          const mean2 = r2.slice(0, n).reduce((s, x) => s + x, 0) / n;
          let num = 0, den1 = 0, den2 = 0;
          for (let i = 0; i < n; i++) {
            const d1 = r1[i] - mean1;
            const d2 = r2[i] - mean2;
            num += d1 * d2;
            den1 += d1 * d1;
            den2 += d2 * d2;
          }
          const corr = den1 > 0 && den2 > 0 ? num / Math.sqrt(den1 * den2) : 0;
          if (corr > 0.80) {
            concerns.push(`High correlation (${corr.toFixed(2)}) between proposed asset ${asset} and core holding ${rk.topAsset}. Increases systemic beta rather than diversifying.`);
          }
        }
      }
    }
  }

  // 3. Regime & Contradictory Indicator Critique
  if (asset && markets[asset]?.history?.length) {
    const m = markets[asset]!;
    if (m.history.length < 14) {
      concerns.push(`Weak sample size: Price history has only ${m.history.length} samples, reducing statistical reliability of indicators.`);
      mitigations.push('Wait for further tick history accumulation before deploying maximum risk budget.');
    }
    const ind = indicators(m.history, m.candles);
    const r = returns(m.history);
    const rawVol = stdev(r);
    const periodsPerYear = (365 * 24 * 60) / Math.max(1, timeframeMinutes);
    const annualizedVol = rawVol * Math.sqrt(periodsPerYear);

    if (ind.rsi === undefined || Number.isNaN(ind.rsi)) {
      concerns.push('RSI indicator unavailable — insufficient price data for momentum safety validation.');
      mitigations.push('Wait for additional ticks/candles to confirm oscillator regime.');
    }

    if (action === 'BUY') {
      if (ind.rsi !== undefined && !Number.isNaN(ind.rsi) && ind.rsi > 72) {
        concerns.push(`Overbought oscillator hazard: 14-period RSI is elevated at ${ind.rsi.toFixed(1)}, creating immediate mean-reversion pull-back vulnerability.`);
        mitigations.push('Wait for a retest of the 10-period SMA or RSI cool-down towards 50.');
      }
      if (ind.s10 && ind.s30 && m.price < ind.s30) {
        concerns.push(`Trend conflict: Spot price ($${m.price.toLocaleString()}) remains below 30-period trend SMA ($${ind.s30.toFixed(2)}). Buying constitutes catching a falling knife.`);
        mitigations.push('Require price recovery above SMA30 before confirming directional trend entry.');
      }
      if (annualizedVol > 0.85) {
        concerns.push(`Excessive volatility regime: Annualized volatility is ${(annualizedVol * 100).toFixed(1)}%. Wide swings increase stop-out probability.`);
        mitigations.push('Widen stop-loss distance to 2.5x ATR and scale down position size proportionally.');
      }
    } else if (action === 'SELL') {
      if (ind.rsi !== undefined && !Number.isNaN(ind.rsi) && ind.rsi < 28) {
        concerns.push(`Oversold capitulation hazard: RSI is depressed at ${ind.rsi.toFixed(1)}. Selling into panic runs the risk of bottom-ticking the local reversal.`);
        mitigations.push('Sell only a partial tranche (e.g. 33%) and place resting limit orders higher for the remainder.');
      }
    }
  }

  // 4. Bot & Rebalance Strategy Critique
  if (action === 'DEPLOY_BOT' && asset && markets[asset]?.history?.length) {
    const m = markets[asset]!;
    const ind = indicators(m.history, m.candles);
    if (decision.thesis?.toLowerCase().includes('grid') && ind.s10 && ind.s30 && Math.abs(ind.s10 - ind.s30) / ind.s30 > 0.08) {
      concerns.push('Regime mismatch: Deploying a mean-reverting grid bot during an active trend expansion risks inventory bag-holding.');
      mitigations.push('Switch bot architecture to trend-following (e.g. vwap_trend) or widen grid boundaries.');
    }
  }

  if (action === 'REBALANCE') {
    const activeCash = state.accountMode === 'exchange'
      ? (['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'] as const).reduce(
          (sum, c) => sum + (state.exchangeAccount?.balances[c]?.free || 0), 0
        )
      : state.accountMode === 'web3'
      ? (state.web3Account?.balances?.['USDT'] || 0) + (state.web3Account?.balances?.['USDC'] || 0)
      : state.cash;
    const currentCashPct = pv > 0 ? (activeCash / pv) * 100 : 100;
    if (currentCashPct < policy.minCashReservePct * 100) {
      concerns.push(`Rebalancing starting with depressed cash reserves (${currentCashPct.toFixed(1)}%). Requires sequential two-stage execution (sell-first).`);
      mitigations.push('Execute sell transactions first to unlock liquidity before executing purchase steps.');
    }
  }

  // 5. Cash Buffer & Drawdown Capacity Critique
  if (action === 'BUY') {
    const orderNotional = decision.notional || 0;
    const postCash = state.cash - orderNotional * (1 + policy.maxSlippagePct);
    const postCashPct = pv > 0 ? (postCash / pv) * 100 : 0;

    if (postCashPct < policy.minCashReservePct * 100) {
      concerns.push(`Liquidity drain: Trade reduces cash buffer to ${postCashPct.toFixed(1)}%, violating the mandatory ${policy.minCashReservePct * 100}% capital defense reserve.`);
      mitigations.push('Downsize trade notional to preserve minimum 15% cash liquidity cushion.');
    }
  }

  // Synthesize concise Challenger Counterargument
  let counterArgument: string;
  let suggestedActionOverride: ChallengerResult['suggestedActionOverride'];

  if (concerns.length === 0) {
    counterArgument = 'Thesis satisfies risk parameters: position size is risk-budgeted, cash liquidity is preserved, and indicators show favorable alignment.';
  } else {
    counterArgument = concerns.slice(0, 2).join(' ') + (mitigations.length > 0 ? ` Recommendation: ${mitigations[0]}` : '');
    suggestedActionOverride = concerns.some((c) => c.includes('breaching') || c.includes('violating')) ? 'REDUCE_SIZE' : undefined;
  }

  return {
    hasCriticalConcerns: concerns.length > 0,
    counterArgument,
    concerns,
    mitigations,
    suggestedActionOverride,
  };
}
