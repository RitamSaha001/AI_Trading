import { Asset, Market, AppState, AIActionProposal } from '../../types';

export interface BlackScholesInputs {
  spotPrice: number;
  strikePrice: number;
  timeToExpiryYears: number;
  volatility: number;
  riskFreeRate: number;
  dividendYield?: number;
}

export interface GreeksResult {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  vanna: number;
  volga: number;
}

export interface OptionPriceAndGreeks {
  callPrice: number;
  putPrice: number;
  callGreeks: GreeksResult;
  putGreeks: GreeksResult;
  d1: number;
  d2: number;
}

export interface OptionsLeg {
  type: 'call' | 'put';
  side: 'buy' | 'sell';
  strike: number;
  expiryDays: number;
  premium: number;
  quantity: number;
}

export interface MultiLegStrategyAnalysis {
  strategyName: string;
  legs: OptionsLeg[];
  netDebitOrCredit: number; // positive = debit, negative = credit
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakevens: number[];
  netGreeks: GreeksResult;
  payoffPoints: { underlyingPrice: number; pnl: number }[];
}

export interface ImpliedVolResult {
  impliedVol: number;
  converged: boolean;
  iterations: number;
  residualError: number;
}

export interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
}

export interface HRPAllocation {
  weights: Record<string, number>;
  clusterOrder: string[];
  diversificationRatio: number;
}

export interface BlackLittermanInputs {
  priorReturns: Record<string, number>;
  covarianceMatrix: number[][];
  assets: string[];
  views: {
    asset: string;
    viewReturn: number;
    confidence: number; // 0 to 1
  }[];
  tau?: number;
  riskAversion?: number;
}

export interface VaRReport {
  parametricVaR95: number;
  parametricVaR99: number;
  historicalVaR95: number;
  historicalVaR99: number;
  cVar95: number; // Expected Shortfall
  cVar99: number;
  portfolioEquity: number;
}

export interface MonteCarloSimulationResult {
  paths: number[][];
  terminalPrices: number[];
  medianTerminalPrice: number;
  percentile5: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  probabilityOfLoss: number;
  maxSimulatedDrawdownPct: number;
  simulatedVaR95Pct: number;
}

export interface KylesLambdaMetrics {
  lambda: number;
  priceImpactBpsPerUnit: number;
  rSquared: number;
  interpretation: string;
}

export interface AmihudIlliquidity {
  illiqValue: number;
  liquidityTier: 'Deep Liquidity' | 'Moderate Liquidity' | 'Illiquid' | 'High Slippage Risk';
  estimatedSpreadBps: number;
}

export interface OrderFlowImbalance {
  ofiValue: number;
  normalizedOfi: number; // -1 to +1
  pressureDirection: 'Strong Buying' | 'Moderate Buying' | 'Neutral' | 'Moderate Selling' | 'Aggressive Selling';
}

export interface AlmgrenChrissSchedule {
  totalQuantity: number;
  timeHorizonMinutes: number;
  intervals: number;
  trajectory: {
    minute: number;
    remainingShares: number;
    sharesToTrade: number;
    expectedPriceImpactPct: number;
  }[];
  halfLifeMinutes: number;
  recommendedExecution: 'TWAP' | 'VWAP' | 'Aggressive Liquidation' | 'Passive Staged Brackets';
}

export interface HurstExponentResult {
  hurst: number;
  regime: 'Mean-Reverting' | 'Random Walk' | 'Persistent Trending';
  confidence: number;
  recommendation: string;
}

export interface OrnsteinUhlenbeckParams {
  theta: number; // rate of mean reversion
  mu: number; // long-term equilibrium mean
  sigma: number; // volatility
  halfLifePeriods: number; // ln(2) / theta
  currentZScore: number;
  signal: 'Strong Buy (Oversold)' | 'Mild Buy' | 'Neutral Equilibrium' | 'Mild Sell' | 'Strong Sell (Overbought)';
}

export interface GarchVolatilityForecast {
  currentVolAnnualized: number;
  forecastVol30d: number;
  longRunVolAnnualized: number;
  persistence: number; // alpha + beta
  volatilityRegime: 'Elevated Clustered Volatility' | 'Subdued Low Volatility' | 'Normal Equilibrium';
}

export interface KalmanFilterState {
  estimatedState: number; // filtered fair price
  estimatedVariance: number;
  innovationResidual: number;
  kalmanGain: number;
}

export interface QuantEngineResponse {
  reply: string;
  actionProposal?: AIActionProposal | null;
  engine: string;
}
