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
  'COMMUNICATE_DIALOGUE',
  'EXPLAIN_CONCEPT',
  'CLARIFY_CONTEXT',
  'EMPATHETIC_RESPONSE',
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

export const INSTITUTIONAL_QUANT_WORDS = [
  // Grammar & Connectives
  'the', 'is', 'a', 'an', 'in', 'of', 'and', 'or', 'to', 'with', 'by', 'from', 'as', 'on',
  'this', 'that', 'which', 'be', 'are', 'not', 'have', 'has', 'will', 'shows', 'indicates',
  'calculated', 'derived', 'verified', 'confirms', 'breaches', 'exceeds', 'satisfies',
  // Mathematical Derivatives & Greeks
  'delta', 'gamma', 'vega', 'theta', 'vanna', 'volga', 'taylor', 'expansion', 'curvature',
  'hedge', 'ratio', 'order', 'second', 'closed', 'form', 'analytical', 'solution', 'partial',
  'derivative', 'black', 'scholes', 'heston', 'stochastic', 'volatility', 'feller', 'condition',
  'boundary', 'variance', 'drift', 'mean', 'reversion', 'ornstein', 'uhlenbeck', 'equilibrium',
  'sigma', 'standard', 'deviation', 'z_score', 'cointegration', 'stationary', 'stationarity',
  'adf', 'p_value', 'hypothesis', 'rejection',
  // Microstructure & Exchange Invariants
  'microstructure', 'order_flow', 'imbalance', 'depth', 'liquidity', 'bid', 'ask', 'spread',
  'amihud', 'illiquidity', 'tick', 'size', 'quantization', 'integer', 'lot', 'shares',
  'mandatory', 'liquid', 'cash', 'reserve', 'floor', 'statutory', 'charges', 'execution',
  'slippage', 'notional', 'margin', 'leverage', 'mis', 'circuit_breaker', 'intraday',
  // Sentinel Risk & Governance
  'sentinel', 'defense', 'veto', 'volatility_shock', 'drawdown', 'preservation', 'halt',
  'circuit', 'breaker', 'epistemic', 'uncertainty', 'shannon', 'entropy', 'bits', 'confidence',
  'process', 'reward', 'critic', 'prm', 'expected', 'value', 'var', 'parametric', 'stress_test',
  'governance', 'sovereign',
  // Corporate Finance & Valuation
  'solvency', 'balance_sheet', 'quick_ratio', 'current_assets', 'liabilities', 'inventory',
  'receivables', 'ebitda', 'debt', 'coverage', 'altman', 'z', 'score', 'piotroski', 'f',
  'sec', '10k', '10q', 'operating', 'revenue', 'interest', 'expense'
] as const;

export const CONVERSATIONAL_AND_REASONING_WORDS = [
  // Greetings & Social
  'hello', 'hi', 'hey', 'welcome', 'greetings', 'thanks', 'thank', 'you', 'please', 'good',
  'morning', 'afternoon', 'evening', 'day', 'glad', 'delighted', 'happy', 'great', 'pleasure', 'meet',
  'farewell', 'bye', 'yes', 'no', 'sure', 'certainly', 'absolutely', 'indeed', 'okay', 'alright',
  'welcome_back', 'fine', 'wonderful', 'cheers', 'appreciated',
  // Pronouns & Conversational Connectors
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'us', 'your', 'yours',
  'they', 'their', 'them', 'he', 'she', 'it', 'its', 'who', 'what', 'when',
  'where', 'why', 'how', 'which', 'whose', 'can', 'could', 'would', 'should', 'might',
  'may', 'must', 'shall', 'am',
  // Conversational Understanding & Dialogue Flow
  'understand', 'understanding', 'comprehend', 'context', 'meaning', 'perspective', 'insight', 'dialogue', 'conversation', 'chat',
  'message', 'discuss', 'discussion', 'topic', 'explore', 'learn', 'learning', 'explain', 'explaining', 'explanation',
  'clarify', 'clarification', 'question', 'answer', 'answering', 'response', 'query', 'inquiry', 'thoughtful', 'nuance',
  'balance', 'balanced', 'honest', 'listen', 'listening', 'helpful', 'assist', 'assistant', 'assistance', 'guide',
  'guidance', 'collaborate', 'collaborative', 'share',
  // Reasoning, Logic & Explanatory Conjunctions
  'because', 'therefore', 'however', 'moreover', 'furthermore', 'meanwhile', 'although', 'whereas', 'similarly', 'specifically',
  'essentially', 'ultimately', 'firstly', 'secondly', 'finally', 'example', 'analogous', 'analogy', 'difference', 'similarity',
  'advantage', 'disadvantage', 'tradeoff', 'cause', 'effect', 'consequence', 'implication', 'premise', 'conclusion', 'rationale',
  'principle', 'framework', 'concept', 'structured', 'systematic', 'deduce', 'infer', 'synthesize', 'evaluate', 'assess',
  'compare', 'contrast', 'contrastive', 'fundamental', 'intuitive',
  // Personality, Demeanor & Humanized Empathy
  'lumen', 'astra', 'sovereign', 'calm', 'objective', 'transparent', 'rigorous', 'curious', 'respectful', 'composed',
  'humble', 'disciplined', 'companion', 'partner', 'colleague', 'intellect', 'poise', 'friendly', 'warm', 'reassuring',
  'patient', 'clarity', 'integrity', 'empathy', 'feeling', 'sentiment', 'nervous', 'excited', 'cautious', 'confident',
  'curiosity', 'enthusiasm', 'wisdom', 'experience', 'mindful', 'steady', 'grounded', 'reliable', 'trust', 'truth',
  'candid', 'realistic', 'humor', 'philosophy', 'journey',
  // General Knowledge & Conversational Financial Q&A
  'market_order', 'limit_order', 'stop_order', 'broker', 'exchange', 'matching', 'investor', 'trader', 'beginner', 'basics',
  'fundamentals', 'psychology', 'emotion', 'fear', 'greed', 'discipline', 'habit', 'mistake', 'lesson', 'advice',
  'recommendation', 'suggestion', 'horizon', 'long_term', 'short_term', 'wealth', 'compounding', 'savings', 'retirement', 'inflation',
  'purchasing_power', 'interest_rate', 'central_bank', 'economy', 'growth', 'recession', 'bear', 'bull', 'cycle', 'allocation',
  'diversification', 'safety_net', 'emergency_fund', 'simple', 'easy',
  // Nuanced Dialogue Tokens
  'inquisitive', 'reflective', 'articulate', 'perspective_shift', 'thoughtfulness'
] as const;

export const GEOPOLITICAL_AND_MACRO_WORDS = [
  // Geopolitics & Strategic Resources
  'geopolitics', 'geopolitical', 'multipolar', 'bipolar', 'unipolar', 'hegemony', 'sanctions',
  'embargo', 'chokepoint', 'malacca_strait', 'hormuz', 'taiwan_strait', 'bosphorus', 'suez_canal',
  'deglobalization', 'reshoring', 'nearshoring', 'friendshoring', 'nato', 'brics', 'g20',
  'sovereignty', 'treaty', 'diplomacy', 'protectionism', 'tariffs', 'strategic_petroleum_reserve',
  'rare_earths', 'semiconductors', 'lithium', 'cobalt', 'nickel', 'opec', 'energy_security',
  'food_security', 'trade_corridor', 'belt_and_road', 'hegemon', 'non_aligned',
  // Demography & Human Capital
  'demography', 'demographic', 'demographic_dividend', 'fertility_rate', 'replacement_rate',
  'dependency_ratio', 'working_age_population', 'aging_population', 'median_age', 'urbanization',
  'migration', 'labor_force_participation', 'pyramid_inversion', 'life_expectancy', 'demographic_drag',
  'pension_solvency', 'productivity_growth', 'human_capital', 'automation', 'dependency',
  // Politics, Statecraft & Macro Policy
  'fiscal_stimulus', 'fiscal_deficit', 'monetary_expansion', 'quantitative_easing', 'quantitative_tightening',
  'central_bank_balance_sheet', 'yield_curve_control', 'sovereign_debt_ceiling', 'petrodollar',
  'dedollarization', 'foreign_exchange_reserves', 'current_account_deficit', 'capital_flight',
  'capital_controls', 'inflationary_impulse', 'stagflation', 'debt_supercycle', 'currency_devaluation',
  'sovereign_spread', 'default_risk', 'credit_rating', 'structural_reform', 'industrial_policy',
  'subsidies', 'sovereign_wealth_fund', 'geoeconomics'
] as const;

// Assemble Complete Vocabulary
const ALL_TOKENS: string[] = [
  ...SPECIAL_TOKENS,
  ...ACTION_TOKENS,
  ...REGIME_TOKENS,
  ...QUANT_DESCRIPTOR_TOKENS,
  ...INDIAN_ASSETS,
  ...REASONING_WORDS,
  ...INSTITUTIONAL_QUANT_WORDS,
  ...CONVERSATIONAL_AND_REASONING_WORDS,
  ...GEOPOLITICAL_AND_MACRO_WORDS,
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
