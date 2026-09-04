import { Asset, AIActionProposal } from '../types';

export type DecisionAction =
  | 'BUY'
  | 'SELL'
  | 'HOLD'
  | 'REBALANCE'
  | 'DEFEND'
  | 'DEPLOY_BOT'
  | 'SMART_DCA'
  | 'STRESS_TEST'
  | 'TOKEN_COMPARE'
  | 'ALERT'
  | 'NONE';

export interface TradingDecision {
  intent: string;
  thesis: string;
  evidence: string[];
  asset?: Asset;
  action: DecisionAction;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity?: number;
  notional?: number;
  riskAmount?: number;
  portfolioRiskImpact?: string;
  signalScore?: number; // -100 (Strong Bearish) to +100 (Strong Bullish)
  modelConfidence?: number; // 0 to 100
  dataQuality?: number; // 0 to 100
  riskQuality?: number; // 0 to 100
  executionQuality?: number; // 0 to 100
  expectedValue?: number;
  riskReward?: number;
  assumptions: string[];
  warnings: string[];
  alternatives: string[];
  requiresConfirmation: boolean;
  counterArgument?: string;
  timeHorizon?: 'intraday' | 'short-term' | 'swing' | 'medium-term' | 'long-term';
  regime?: string;
  invalidation?: string;
  proposedAction?: AIActionProposal | null;
}

/**
 * Renders an institutional, transparent quantitative markdown report from a structured TradingDecision.
 * Principles:
 * - Direct conclusion first.
 * - LaTeX mathematical formulations where relevant.
 * - Clearly distinguished evidence vs assumptions vs risks.
 * - Explicit counterargument consideration.
 */
export function formatDecisionMarkdown(decision: TradingDecision): string {
  const parts: string[] = [];

  // 1. Executive Take / Decision Header
  const actionBadge = decision.action === 'BUY'
    ? '🟢 **DIRECTIVE: PROPOSED BUY ORDER**'
    : decision.action === 'SELL'
    ? '🔴 **DIRECTIVE: PROPOSED TRIM / LIQUIDATION**'
    : decision.action === 'REBALANCE'
    ? '⚖️ **DIRECTIVE: PORTFOLIO REBALANCE**'
    : decision.action === 'DEFEND'
    ? '🛡️ **DIRECTIVE: EMERGENCY CAPITAL DEFENSE**'
    : decision.action === 'DEPLOY_BOT'
    ? '🤖 **DIRECTIVE: ALGORITHMIC STRATEGY DEPLOYMENT**'
    : decision.action === 'SMART_DCA'
    ? '💎 **DIRECTIVE: VALUE-WEIGHTED SMART DCA**'
    : decision.action === 'STRESS_TEST'
    ? '🌪️ **DIRECTIVE: SCENARIO STRESS TEST**'
    : decision.action === 'TOKEN_COMPARE'
    ? '📊 **DIRECTIVE: CROSS-ASSET ALPHA COMPARISON**'
    : decision.action === 'ALERT'
    ? '🔔 **DIRECTIVE: VOLATILITY / PRICE SENTINEL ALERT**'
    : decision.action === 'HOLD'
    ? '⏸️ **DIRECTIVE: MAINTAIN DISCIPLINED HOLD**'
    : '🔍 **DIRECTIVE: MARKET AUDIT & OBSERVATION**';

  parts.push(`### ${actionBadge}`);
  parts.push(`**Executive Summary**: ${decision.thesis}`);

  if (decision.regime || decision.timeHorizon) {
    const horizonStr = decision.timeHorizon ? `**Horizon**: \`${decision.timeHorizon}\`` : '';
    const regimeStr = decision.regime ? `**Market Regime**: \`${decision.regime}\`` : '';
    parts.push(`> ${[horizonStr, regimeStr].filter(Boolean).join(' | ')}`);
  }

  // 2. Quantitative Evidence Snapshot
  if (decision.evidence && decision.evidence.length > 0) {
    parts.push('#### 📊 Quantitative Telemetry & Grounding');
    for (const ev of decision.evidence) {
      parts.push(`* ${ev}`);
    }
  }

  // 3. Trade Sizing & Risk Parameters (if an execution is proposed)
  if (decision.asset && (decision.action === 'BUY' || decision.action === 'SELL') && decision.quantity) {
    parts.push('#### 🎯 Risk-Budgeted Execution Parameters');
    parts.push('| Parameter | Value | Formula / Constraint |');
    parts.push('| :--- | :--- | :--- |');
    parts.push(`| **Asset** | \`${decision.asset}\` | Spot Paper Execution |`);
    parts.push(`| **Action** | **${decision.action}** | Strict Risk Limit Enforced |`);
    parts.push(`| **Quantity** | **${decision.quantity}** | Risk Budget Allocation |`);
    if (decision.notional) parts.push(`| **Notional Value** | $${decision.notional.toLocaleString()} | Mark-to-Market Size |`);
    if (decision.entry) parts.push(`| **Entry Price** | $${decision.entry.toLocaleString()} | Limit / Expected Spot |`);
    if (decision.stopLoss) parts.push(`| **Stop-Loss** | $${decision.stopLoss.toLocaleString()} | $\\text{SL} = \\text{Entry} \\pm 2 \\cdot \\text{ATR}$ |`);
    if (decision.takeProfit) parts.push(`| **Take-Profit** | $${decision.takeProfit.toLocaleString()} | $\\text{TP} = \\text{Entry} \\mp 2.2 \\cdot \\text{Unit Risk}$ |`);
    if (decision.riskReward) parts.push(`| **Risk/Reward** | **${decision.riskReward}:1** | Asymmetric Expectancy |`);
    if (decision.riskAmount) parts.push(`| **Theoretical Max Loss** | $${decision.riskAmount.toLocaleString()} | Hard Capital Boundary |`);
  }

  // 4. Portfolio Impact & Capital Preservation
  if (decision.portfolioRiskImpact) {
    parts.push('#### 🛡️ Portfolio Risk Contribution');
    parts.push(decision.portfolioRiskImpact);
  }

  // 5. Model Calibration & Quality Scores
  const confStr = decision.modelConfidence !== undefined ? `Confidence: **${decision.modelConfidence}%**` : '';
  const dataQStr = decision.dataQuality !== undefined ? `Data Quality: **${decision.dataQuality}%**` : '';
  const sigStr = decision.signalScore !== undefined ? `Signal Score: **${decision.signalScore > 0 ? '+' : ''}${decision.signalScore}/100**` : '';
  const calibList = [confStr, dataQStr, sigStr].filter(Boolean);
  if (calibList.length > 0) {
    parts.push(`*Calibration: ${calibList.join(' · ')}*`);
  }

  // 6. Assumptions & Limitations
  if (decision.assumptions && decision.assumptions.length > 0) {
    parts.push('#### 🔬 Underlying Assumptions');
    for (const asm of decision.assumptions) {
      parts.push(`* ${asm}`);
    }
  }

  // 7. Challenger Counterargument
  if (decision.counterArgument) {
    parts.push('#### ⚖️ Counterargument & Falsification Conditions');
    parts.push(`> **Challenger Desk Review**: ${decision.counterArgument}`);
  }

  // 7b. Invalidation & What Would Change View
  if (decision.invalidation) {
    parts.push('#### 🔄 What Would Invalidate / Change My View');
    parts.push(`* ${decision.invalidation}`);
  }

  // 8. Alternatives Considered
  if (decision.alternatives && decision.alternatives.length > 0) {
    parts.push('#### 🔀 Alternative Strategic Paths');
    for (const alt of decision.alternatives) {
      parts.push(`* ${alt}`);
    }
  }

  // 9. Warnings & Safety Guard
  if (decision.warnings && decision.warnings.length > 0) {
    parts.push('#### ⚠️ Operational Warnings');
    for (const w of decision.warnings) {
      parts.push(`* ⚠️ ${w}`);
    }
  }

  return parts.join('\n\n');
}
