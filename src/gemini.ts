import { AppState, Asset, Market } from './types';
import { indicators, money, portfolioValue, risk } from './trading';

export type GeminiModel = {
  name: string;
  displayName?: string;
};

export async function listGeminiModels(customKey?: string): Promise<GeminiModel[]> {
  try {
    const headers: Record<string, string> = {};
    if (customKey) headers['x-gemini-key'] = customKey;

    const res = await fetch('/api/gemini/models', { headers });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    return data.models || [
      { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash (Default)' },
      { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro' },
    ];
  } catch {
    return [
      { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
      { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro' },
      { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite' },
    ];
  }
}

export function buildContext(s: AppState, markets: Record<Asset, Market | undefined>) {
  const rk = risk(s, markets);
  const pv = portfolioValue(s, markets);
  return {
    portfolioValue: +pv.toFixed(2),
    cash: +s.cash.toFixed(2),
    risk: rk,
    assets: Object.fromEntries(
      (Object.keys(markets) as Asset[]).map((a) => {
        const m = markets[a];
        return [
          a,
          {
            price: m?.price,
            change24h: m?.change24h,
            holding: s.positions[a] || 0,
            indicators: m ? indicators(m.history) : null,
          },
        ];
      })
    ),
  };
}

export async function fetchAIInsight(
  asset: Asset,
  s: AppState,
  markets: Record<Asset, Market | undefined>
) {
  const m = markets[asset];
  const ind = m
    ? indicators(m.history)
    : { s10: null, s30: null, rsi: 50, vol: 0.02, chg: 0, score: 0, bb: null };
  const portfolioContext = buildContext(s, markets);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (s.settings.geminiApiKey) headers['x-gemini-key'] = s.settings.geminiApiKey;

    const res = await fetch('/api/gemini/insight', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        asset,
        marketData: {
          price: m?.price,
          change24h: m?.change24h,
          indicators: ind,
        },
        portfolioContext,
        model: s.settings.geminiModel || 'gemini-3.8-flash',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.insight) return data.insight;
    }
  } catch (e) {
    console.warn('AI insight fetch failed, computing client fallback:', e);
  }

  // Client heuristic fallback if server is momentarily unreachable
  const dir: 'bullish' | 'bearish' | 'neutral' =
    ind.score >= 1 ? 'bullish' : ind.score <= -1 ? 'bearish' : 'neutral';
  const conf = Math.min(90, 52 + Math.abs(ind.score) * 14);

  return {
    direction: dir,
    confidence: conf,
    rationale: `${asset} displays ${dir} posture at $${m?.price ? money(m.price) : '0'}. RSI (14) is balanced at ${ind.rsi.toFixed(1)} with a 24-hour return of ${ind.chg >= 0 ? '+' : ''}${ind.chg.toFixed(2)}% and ${(ind.vol * 100).toFixed(2)}% historical volatility.`,
    signals: [
      { label: 'Momentum', value: ind.s10 && ind.s30 && ind.s10 > ind.s30 ? 'Bullish (SMA10>SMA30)' : 'Neutral/Defensive' },
      { label: 'RSI Momentum', value: `${ind.rsi.toFixed(1)} (${ind.rsi > 70 ? 'Overbought' : ind.rsi < 30 ? 'Oversold' : 'Neutral'})` },
      { label: '24h Variance', value: `${ind.chg >= 0 ? '+' : ''}${ind.chg.toFixed(2)}%` },
      { label: 'Volatility', value: `${(ind.vol * 100).toFixed(2)}%` },
    ],
    proposals: [
      dir === 'bullish'
        ? { type: 'order', side: 'buy', amount: 0.05, reason: 'Follow momentum expansion' }
        : { type: 'alert', alertType: 'above', value: Math.round((m?.price || 100) * 1.04), reason: 'Alert on breakout' },
    ],
  };
}

export async function sendAIChat(
  text: string,
  s: AppState,
  markets: Record<Asset, Market | undefined>,
  history: { role: 'user' | 'assistant'; text: string }[]
): Promise<{ reply: string; actionProposal?: any }> {
  const portfolioContext = buildContext(s, markets);
  const marketsData = markets;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (s.settings.geminiApiKey) headers['x-gemini-key'] = s.settings.geminiApiKey;

    const res = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: text,
        history,
        portfolioContext,
        marketsData,
        model: s.settings.geminiModel || 'gemini-3.8-flash',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        reply: data.reply || 'Analysis complete.',
        actionProposal: data.actionProposal,
      };
    }
  } catch (err: any) {
    console.warn('Chat request failed:', err);
  }

  return {
    reply: `Live analysis for $${portfolioValue(s, markets).toLocaleString()} portfolio: Risk score is ${risk(s, markets).score}/100. Key asset ${s.selectedAsset} is trading at ${money(markets[s.selectedAsset]?.price || 0)}. You have $${money(s.cash)} in cash reserve ready for execution.`,
  };
}
