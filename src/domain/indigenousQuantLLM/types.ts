/**
 * LUMEN-ASTRA-FIN 1.0: INDIGENOUS TRADING & COMMERCE REASONING LLM
 * Core Data Structures, Tokenization Schemas & Causal Graph Types
 */

import { Asset } from '../../types';

export type FinancialEventType =
  | 'EARNINGS_ANNOUNCEMENT'
  | 'REGULATORY_SEBI'
  | 'CORPORATE_ORDER_WIN'
  | 'FDA_APPROVAL'
  | 'MERGER_ACQUISITION'
  | 'EXECUTIVE_MANAGEMENT'
  | 'MACRO_CENTRAL_BANK'
  | 'COMMODITY_SHOCK';

export type CognitiveExecutionTier = 'SYSTEM_1_REFLEX' | 'SYSTEM_2_DELIBERATION';

export type ModelActionDirective =
  | 'STRONG_BUY'
  | 'ACCUMULATE'
  | 'NEUTRAL'
  | 'EMERGENCY_VETO'
  | 'STAND_ASIDE';

export interface FinancialToken {
  text: string;
  lemma: string;
  type: 'TICKER' | 'MONETARY' | 'PERCENTAGE' | 'OPERATIONAL_METRIC' | 'SENTIMENT_POLARITY' | 'REGULATORY_ACTION' | 'CAUSAL_CONNECTOR' | 'WORD';
  val?: number;
  unit?: 'INR_CR' | 'INR_LAKH' | 'USD_M' | 'PCT' | 'BPS';
  confidence: number;
}

export interface MacroIndicatorVector {
  brentCrudeUsd: number;        // $/bbl
  us10yYieldPct: number;        // %
  in10yYieldPct: number;        // %
  usdInrExchangeRate: number;   // ₹
  rbiRepoRatePct: number;       // %
  indiaVix: number;             // Volatility index
}

export interface CausalEdge {
  source: string;               // e.g. "BRENT_CRUDE" or "TCS"
  target: Asset | string;       // e.g. "ASIANPAINT"
  elasticityBeta: number;       // Sensitivity coefficient dY/dX
  lagMinutes: number;           // Transmission latency (minutes)
  mechanism: string;            // Causal explanation e.g. "Direct raw material input cost"
}

export interface MoERouterWeights {
  macroMonetary: number;        // Expert 1
  earningsSurprise: number;     // Expert 2
  regulatoryForensic: number;   // Expert 3
  microstructure: number;       // Expert 4
  crossAssetContagion: number;  // Expert 5
  executionHorizon: number;     // Expert 6
}

export interface ExpertContribution {
  expertName: string;
  weight: number;
  directionScore: number;       // -1.0 to +1.0
  keyInsights: string[];
  recommendedSizingMult: number;// 0.5x to 1.5x
}

export interface PRMCritiqueStep {
  stepNumber: number;
  claim: string;
  isFactuallyGrounded: boolean;
  critiqueScore: number;        // 0.0 to 1.0
  reasoningFlawDetected?: string;
}

export interface PRMVerificationResult {
  overallFactualConfidence: number; // 0.0 to 1.0
  passedVerification: boolean;
  critiqueSteps: PRMCritiqueStep[];
  hallucinationPenaltyApplied: number;
}

export interface AstraFinReasoningTrajectory {
  rawInputHeadline: string;
  matchedTickers: Asset[];
  systemTier: CognitiveExecutionTier;
  inferenceLatencyMs: number;
  deliberationTokens: string[];
  causalChains: string[];
  routerWeights: MoERouterWeights;
  activeExperts: string[];
  expertOutputs: ExpertContribution[];
  consensusDeltaPct?: number;
  contagionEffects: Record<string, number>;
  prmVerification: PRMVerificationResult;
  uncertaintySigma: number;      // Epistemic uncertainty (0.0 to 1.0)
  action: ModelActionDirective;
  compositeScore: number;        // -100 to +100
  aciBonus: number;              // 0 to 18 points
  riskMultiplier: number;        // 0.5x to 1.35x
  runnerAtrTarget: number;       // 3.5 to 6.0 ATR
  rationale: string;
}

export interface AstraFinDirective {
  symbol: Asset;
  hasEmergencyVeto: boolean;
  hasAlphaCatalyst: boolean;
  action: ModelActionDirective;
  aciBoost: number;
  riskMultiplier: number;
  runnerAtrMultiplier: number;
  uncertaintySigma: number;
  confidenceScore: number;
  rationale: string;
  publishedAt: number;
  reasoningTrace?: AstraFinReasoningTrajectory;
}
