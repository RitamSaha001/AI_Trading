/**
 * LUMEN-ASTRA-FIN NEURAL: VOCABULARY & DOMAIN TOKENIZER
 * Maps financial market scenarios, corporate disclosures, and reasoning trajectories into discrete token IDs.
 */

import { INDIAN_ASSETS } from '../../../types';

export const SPECIAL_TOKENS = [
  '<pad>',
  '<bos>',
  '<eos>',
  '<unk>',
  '<thought>',
  '</thought>',
  '<think>',
  '</think>',
  '<reflection>',
  '</reflection>',
  '<verify>',
  '</verify>',
  '<backtrack>',
  '</backtrack>',
  '<scenario>',
  '</scenario>',
  '<regime>',
  '</regime>',
  '<aci>',
  '</aci>',
  '<vwap>',
  '</vwap>',
  '<atr>',
  '</atr>',
  '<volume>',
  '</volume>',
  '<action>',
  '</action>',
  '<confidence>',
  '</confidence>',
  '<risk>',
  '</risk>',
  '<verdict>',
  '</verdict>',
] as const;

export const ACTION_TOKENS = [
  'BUY_BREAKOUT',
  'VWAP_PULLBACK',
  'MEAN_REVERT',
  'DEFENSIVE_EXIT',
  'STAND_ASIDE',
  'PROFIT_HARVEST',
  'EMERGENCY_VETO',
  'ACCUMULATE',
  'REDUCE',
  'HOLD',
  'ASSESS_FUNDAMENTALS',
  'VERIFIED_SAFE',
  'QUANT_VERIFIED',
  'COMMUNICATE',
] as const;

export const REGIME_TOKENS = [
  'REGIME_BULL_TREND',
  'REGIME_BEAR_TREND',
  'REGIME_RANGE_BOUND',
  'REGIME_HIGH_VOLATILITY',
  'REGIME_LOW_VOLATILITY',
  'REGIME_VOLATILITY_SHOCK',
  'DOMAIN_FINANCE_SEC',
  'DOMAIN_RISK_SAFETY',
  'DOMAIN_QUANT_MATH',
  'DOMAIN_COMMUNICATION',
  'DOMAIN_TRADING_ALPHA',
] as const;

export const QUANT_DESCRIPTOR_TOKENS = [
  // ACI Buckets
  'ACI_EXEMPLARY_85_PLUS',
  'ACI_STRONG_75_84',
  'ACI_MODERATE_65_74',
  'ACI_SUBPAR_BELOW_65',
  // VWAP Relations
  'ABOVE_VWAP_EXPANSION',
  'BELOW_VWAP_FAILED',
  'AT_VWAP_SUPPORT',
  'VWAP_STRETCH_EXTREME',
  // Volume Surge
  'VOLUME_SURGE_EXTREME_3X',
  'VOLUME_SURGE_STRONG_2X',
  'VOLUME_NORMAL_1X',
  'VOLUME_FADING_SUB_1X',
  // Sentiment / Catalyst
  'CATALYST_EARNINGS_BEAT',
  'CATALYST_EARNINGS_MISS',
  'CATALYST_SEBI_ORDER',
  'CATALYST_FORENSIC_PROBE',
  'CATALYST_BLOCK_DEAL',
  'CATALYST_COMMODITY_SPIKE',
  'CATALYST_NONE',
  // Outcomes / Labels
  'OUTCOME_WIN_1_5_ATR',
  'OUTCOME_WIN_RUNNER',
  'OUTCOME_LOSS_DEFENSIVE',
  'OUTCOME_LOSS_STOP_HIT',
  'OUTCOME_STAGNANT_SCRATCH',
] as const;

export const REASONING_WORDS = [
  'analyzing', 'market', 'conditions', 'for', 'asset', 'volume', 'surge',
  'detected', 'at', 'institutional', 'vwap', 'support', 'broken', 'confirmed',
  'breakout', 'above', 'morning', 'high', 'failed', 'reversion', 'probable',
  'aci', 'score', 'indicates', 'high', 'moderate', 'low', 'conviction',
  'capital', 'defense', 'mandates', 'immediate', 'exit', 'to', 'prevent',
  'further', 'drawdown', 'allocating', 'runner', 'target', 'with', 'trailing',
  'ratchet', 'sizing', 'multiplier', 'set', 'halving', 'risk', 'due', 'elevated',
  'volatility', 'regime', 'favorable', 'trend', 'rider', 'entry', 'valid',
  'veto', 'engaged', 'governance', 'red', 'flag', 'stand', 'aside', 'preserve',
  'cash', 'healthy', 'expectancy', 'verified', 'prm', 'consensus', 'expansion'
] as const;

// Assemble Complete Vocabulary
const ALL_TOKENS: string[] = [
  ...SPECIAL_TOKENS,
  ...ACTION_TOKENS,
  ...REGIME_TOKENS,
  ...QUANT_DESCRIPTOR_TOKENS,
  ...INDIAN_ASSETS,
  ...REASONING_WORDS,
];

// Unique set deduplication
export const VOCABULARY: string[] = Array.from(new Set(ALL_TOKENS));

export const TOKEN_TO_ID: Record<string, number> = {};
export const ID_TO_TOKEN: Record<number, string> = {};

for (let i = 0; i < VOCABULARY.length; i++) {
  const tok = VOCABULARY[i];
  TOKEN_TO_ID[tok] = i;
  ID_TO_TOKEN[i] = tok;
}

export const VOCAB_SIZE = VOCABULARY.length;
export const PAD_TOKEN_ID = TOKEN_TO_ID['<pad>'] ?? 0;
export const BOS_TOKEN_ID = TOKEN_TO_ID['<bos>'] ?? 1;
export const EOS_TOKEN_ID = TOKEN_TO_ID['<eos>'] ?? 2;
export const UNK_TOKEN_ID = TOKEN_TO_ID['<unk>'] ?? 3;

export class DomainTokenizer {
  public static vocabSize: number = VOCAB_SIZE;

  /**
   * Tokenizes text or sequence of tokens into integer token IDs.
   */
  public static encode(text: string): number[] {
    const regex = new RegExp(`(<[^>]+>|[a-zA-Z0-9_]+|[^\\s\\w])`, 'g');
    const rawTokens = text.match(regex) || [];

    const ids: number[] = [];
    for (const raw of rawTokens) {
      const upper = raw.toUpperCase();
      const lower = raw.toLowerCase();

      if (TOKEN_TO_ID[raw] !== undefined) {
        ids.push(TOKEN_TO_ID[raw]);
      } else if (TOKEN_TO_ID[upper] !== undefined) {
        ids.push(TOKEN_TO_ID[upper]);
      } else if (TOKEN_TO_ID[lower] !== undefined) {
        ids.push(TOKEN_TO_ID[lower]);
      } else {
        ids.push(UNK_TOKEN_ID);
      }
    }
    return ids;
  }

  /**
   * Decodes a sequence of integer token IDs back to a readable string.
   */
  public static decode(ids: number[]): string {
    return ids
      .map((id) => ID_TO_TOKEN[id] || '<unk>')
      .filter((t) => t !== '<pad>' && t !== '<bos>')
      .join(' ')
      .replace(/\s+([<>[\](),.:;])/g, '$1');
  }

  /**
   * Returns token ID for a specific action token.
   */
  public static getActionTokenId(action: string): number {
    return TOKEN_TO_ID[action] ?? UNK_TOKEN_ID;
  }
}
