import { Asset, indicatorsFor, PortfolioState, computeRisk, portfolioValue } from '../domain/trading';

export type AIInsight = {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  rationale: string;
  signals: { label: string; value: string; tone: 'positive' | 'neutral' | 'negative' }[];
};

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

function ruleBasedInsight(asset: Asset, state: PortfolioState): AIInsight {
  const ind = indicatorsFor(asset, state);
  const direction = ind.score >= 1 ? 'bullish' : ind.score <= -1 ? 'bearish' : 'neutral';
  const confidence = Math.round(50 + Math.min(Math.abs(ind.score) * 15 + Math.abs(50 - ind.rsi) * 0.5, 40));
  const rationale = direction === 'bullish'
    ? `${asset} is above its short-term average with RSI at ${ind.rsi.toFixed(0)}, consistent with building upward momentum.`
    : direction === 'bearish'
      ? `${asset} is below its short-term average with RSI at ${ind.rsi.toFixed(0)}, consistent with fading momentum.`
      : `${asset} has mixed momentum with RSI near ${ind.rsi.toFixed(0)}, suggesting a range-bound setup.`;
  return { direction, confidence, rationale, signals: [
    { label: 'Momentum', value: ind.sma10 !== null && ind.sma30 !== null ? (ind.sma10 > ind.sma30 ? 'Bullish' : 'Bearish') : 'Building', tone: ind.sma10 !== null && ind.sma30 !== null && ind.sma10 > ind.sma30 ? 'positive' : 'negative' },
    { label: 'RSI (14)', value: ind.rsi.toFixed(1), tone: ind.rsi > 60 ? 'positive' : ind.rsi < 40 ? 'negative' : 'neutral' },
    { label: '24h change', value: `${ind.pctChange >= 0 ? '+' : ''}${ind.pctChange.toFixed(2)}%`, tone: ind.pctChange >= 0 ? 'positive' : 'negative' },
    { label: 'Volatility', value: `${(ind.vol * 100).toFixed(2)}%`, tone: ind.vol > 0.02 ? 'negative' : 'neutral' },
  ] };
}

export function buildAIContext(state: PortfolioState & { breakerActive?: boolean }) {
  const risk = computeRisk(state);
  return {
    cash: Number(state.cash.toFixed(2)),
    portfolioValue: Number(portfolioValue(state).toFixed(2)),
    riskScore: risk.score,
    riskLabel: risk.label,
    circuitBreakerActive: Boolean(state.breakerActive),
    assets: Object.fromEntries((Object.keys(state.prices) as Asset[]).map((asset) => {
      const ind = indicatorsFor(asset, state);
      return [asset, { price: Number(state.prices[asset].current.toFixed(2)), pct24h: Number(ind.pctChange.toFixed(2)), rsi: Number(ind.rsi.toFixed(1)), sma10: ind.sma10 === null ? null : Number(ind.sma10.toFixed(2)), sma30: ind.sma30 === null ? null : Number(ind.sma30.toFixed(2)), volatility: Number(ind.vol.toFixed(4)), holdings: state.positions[asset] }];
    })),
  };
}

export async function getAIInsight(asset: Asset, state: PortfolioState & { breakerActive?: boolean }, signal?: AbortSignal): Promise<AIInsight> {
  const fallback = ruleBasedInsight(asset, state);
  const url = process.env.EXPO_PUBLIC_AI_API_URL;
  if (!url) return fallback;
  const response = await fetch(`${url.replace(/\/$/, '')}/insight`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ asset, context: buildAIContext(state) }) });
  if (!response.ok) throw new Error(`AI service error ${response.status}`);
  const data = (await response.json()) as AIInsight;
  if (!data?.rationale || !Array.isArray(data.signals)) throw new Error('Invalid AI response');
  return data;
}

export async function sendCopilotMessage(text: string, state: PortfolioState & { breakerActive?: boolean }, history: ChatHistoryItem[], asset: Asset, signal?: AbortSignal): Promise<string> {
  const url = process.env.EXPO_PUBLIC_AI_API_URL;
  if (!url) {
    const ind = indicatorsFor(asset, state);
    return `The local simulator has ${asset} at ${state.prices[asset].current.toFixed(2)}, RSI ${ind.rsi.toFixed(1)}, and portfolio risk ${computeRisk(state).score}/100. For safety, the demo does not make autonomous real-money decisions.`;
  }
  const response = await fetch(`${url.replace(/\/$/, '')}/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ message: text, history, context: buildAIContext(state) }),
  });
  if (!response.ok) throw new Error(`AI service error ${response.status}`);
  const data = (await response.json()) as { reply?: string };
  if (!data.reply) throw new Error('Invalid AI response');
  return data.reply;
}
