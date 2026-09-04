import { Asset, ASSETS, StrategyKind } from '../types';

export interface UserPreferences {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxTradeRiskPct?: number; // e.g. 0.005 for 0.5%
  preferredAssets: Asset[];
  excludedAssets: Asset[];
  investmentHorizon: 'intraday' | 'short-term' | 'swing' | 'medium-term' | 'long-term';
  minCashReservePct?: number; // e.g. 0.20 for 20%
  strategyPreferences: StrategyKind[];
  specialInstructions: string[];
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  riskTolerance: 'moderate',
  preferredAssets: [],
  excludedAssets: [],
  investmentHorizon: 'swing',
  strategyPreferences: [],
  specialInstructions: [],
};

/**
 * Parses user input to extract persistent session preferences and constraints.
 */
export function extractPreferencesFromText(text: string, current: UserPreferences): UserPreferences {
  const updated = {
    ...current,
    preferredAssets: [...current.preferredAssets],
    excludedAssets: [...current.excludedAssets],
    strategyPreferences: [...current.strategyPreferences],
    specialInstructions: [...current.specialInstructions],
  };

  const lower = text.toLowerCase();

  // 1. Max risk per trade (e.g., "max risk per trade is 0.5%", "risk 1% per trade", "max risk 2%")
  const riskMatch = lower.match(/(?:max(?:imum)?\s+risk|risk\s+per\s+trade|trade\s+risk)(?:\s+is|\s*:\s*|\s+of)?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (riskMatch && riskMatch[1]) {
    const val = parseFloat(riskMatch[1]);
    if (val > 0 && val <= 10) {
      updated.maxTradeRiskPct = val / 100;
      updated.specialInstructions.push(`Enforce user constraint: Maximum trade risk capped at ${val}% of portfolio equity.`);
    }
  }

  // 2. Risk tolerance
  if (lower.includes('conservative') || lower.includes('low risk') || lower.includes('capital preservation')) {
    updated.riskTolerance = 'conservative';
  } else if (lower.includes('aggressive') || lower.includes('high risk') || lower.includes('maximum growth')) {
    updated.riskTolerance = 'aggressive';
  } else if (lower.includes('moderate risk') || lower.includes('balanced risk')) {
    updated.riskTolerance = 'moderate';
  }

  // 3. Investment Horizon
  if (lower.includes('intraday') || lower.includes('day trade') || lower.includes('scalp')) {
    updated.investmentHorizon = 'intraday';
  } else if (lower.includes('short term') || lower.includes('short-term') || lower.includes('few days')) {
    updated.investmentHorizon = 'short-term';
  } else if (lower.includes('swing') || lower.includes('1-2 weeks') || lower.includes('few weeks')) {
    updated.investmentHorizon = 'swing';
  } else if (lower.includes('medium term') || lower.includes('medium-term') || lower.includes('6-month') || lower.includes('6 month') || lower.includes('quarterly')) {
    updated.investmentHorizon = 'medium-term';
  } else if (lower.includes('long term') || lower.includes('long-term') || lower.includes('multi-year') || lower.includes('hoddle') || lower.includes('hodl') || lower.includes('1-year') || lower.includes('multi year')) {
    updated.investmentHorizon = 'long-term';
  }

  // 4. Cash Preference (e.g. "keep at least 25% in cash", "maintain 20% cash")
  const cashMatch = lower.match(/(?:keep|maintain|hold)\s+(?:at\s+least\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:in\s+)?cash/i);
  if (cashMatch && cashMatch[1]) {
    const cVal = parseFloat(cashMatch[1]);
    if (cVal >= 5 && cVal <= 80) {
      updated.minCashReservePct = cVal / 100;
      updated.specialInstructions.push(`Enforce user constraint: Maintain at least ${cVal}% liquid cash reserve.`);
    }
  }

  // 5. Excluded or Protected Assets (e.g. "don't sell BTC", "never sell BTC", "exclude DOGE", "don't want to exit BTC")
  for (const a of ASSETS) {
    const sym = a.toLowerCase();
    if (
      lower.includes(`don't sell ${sym}`) ||
      lower.includes(`never sell ${sym}`) ||
      lower.includes(`do not sell ${sym}`) ||
      lower.includes(`don't want to completely exit ${sym}`) ||
      lower.includes(`do not exit ${sym}`)
    ) {
      const note = `User directive: Preserve core holding in ${a}, do not completely liquidate.`;
      if (!updated.specialInstructions.includes(note)) {
        updated.specialInstructions.push(note);
      }
    }
    if (lower.includes(`exclude ${sym}`) || lower.includes(`avoid ${sym}`) || lower.includes(`no ${sym}`)) {
      if (!updated.excludedAssets.includes(a)) {
        updated.excludedAssets.push(a);
      }
    }
    if (lower.includes(`favorite asset is ${sym}`) || lower.includes(`prefer ${sym}`)) {
      if (!updated.preferredAssets.includes(a)) {
        updated.preferredAssets.push(a);
      }
    }
  }

  // Remove duplicates
  updated.specialInstructions = Array.from(new Set(updated.specialInstructions)).slice(-6);

  return updated;
}

/**
 * Formats user preferences into a clean system prompt injection block.
 */
export function formatPreferencesContext(prefs: UserPreferences): string {
  const lines: string[] = ['### 👤 Active User Constraints & Preferences'];
  lines.push(`- Risk Profile: **${prefs.riskTolerance.toUpperCase()}**`);
  lines.push(`- Horizon: **${prefs.investmentHorizon}**`);
  if (prefs.maxTradeRiskPct !== undefined) {
    lines.push(`- Max Risk Per Trade: **${(prefs.maxTradeRiskPct * 100).toFixed(1)}%** of equity`);
  }
  if (prefs.minCashReservePct !== undefined) {
    lines.push(`- Minimum Cash Reserve Floor: **${(prefs.minCashReservePct * 100).toFixed(0)}%**`);
  }
  if (prefs.preferredAssets.length > 0) {
    lines.push(`- Preferred Assets: ${prefs.preferredAssets.join(', ')}`);
  }
  if (prefs.excludedAssets.length > 0) {
    lines.push(`- Excluded Assets: ${prefs.excludedAssets.join(', ')}`);
  }
  if (prefs.specialInstructions.length > 0) {
    lines.push('- Explicit Directives:');
    for (const inst of prefs.specialInstructions) {
      lines.push(`  * ${inst}`);
    }
  }

  return lines.join('\n');
}
