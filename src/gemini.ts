import { AppState, Asset, Market } from './types';
import { indicators, money, portfolioValue, risk } from './trading';

export type GeminiModel = {
  name: string;
  displayName?: string;
};

export async function listGeminiModels(customKey?: string): Promise<GeminiModel[]> {
  const key = customKey;
  if (!key) {
    return [
      { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
      { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro' },
      { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite' },
    ];
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    
    const list: GeminiModel[] = [];
    if (data.models) {
      for (const m of data.models) {
        if (m.name && m.supportedGenerationMethods?.includes('generateContent')) {
          list.push({
            name: m.name.replace(/^models\//, ''),
            displayName: m.displayName || m.name.replace(/^models\//, ''),
          });
        }
      }
    }
    return list.length > 0 ? list : [
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
    const key = s.settings.geminiApiKey;
    if (key) {
      const model = s.settings.geminiModel || 'gemini-3.8-flash';
      
      const prompt = `You are Lumen AI, an institutional-grade algorithmic cryptocurrency strategist and quantitative risk officer.
Analyze the target asset with mathematical precision.

Asset: ${asset}
Price: $${m?.price}
24h Change: ${m?.change24h}%
Indicators: RSI=${ind.rsi.toFixed(1)}, SMA10=${ind.s10?.toFixed(2)}, SMA30=${ind.s30?.toFixed(2)}, Volatility=${(ind.vol * 100).toFixed(2)}%
Portfolio State: Cash=$${portfolioContext.cash}, Total Value=$${portfolioContext.portfolioValue}, Current Holding in ${asset}=${portfolioContext.assets?.[asset]?.holding || 0} units.

Respond ONLY with valid JSON conforming to this schema:
{
  "direction": "bullish" | "bearish" | "neutral",
  "confidence": number (40-98),
  "rationale": string (2-3 crisp sentences detailing technical confluence, order flow dynamics, and risk-managed execution advice),
  "signals": [
    {"label": string, "value": string},
    {"label": string, "value": string},
    {"label": string, "value": string},
    {"label": string, "value": string}
  ],
  "proposals": [
    {"type": "order" | "alert", "side": "buy" | "sell", "amount": number, "alertType": "above" | "below", "value": number, "reason": string}
  ]
}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          }
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return JSON.parse(text);
      }
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
    const key = s.settings.geminiApiKey;
    if (key) {
      const systemPrompt = `You are Lumen Copilot, an elite AI portfolio strategist and algorithmic crypto execution assistant.
Tone: Apple-like elegance, concise, mathematically sharp, Wall Street quantitative precision. Never sound hypey, spammy, or use generic platitudes.
Always ground assertions in the user's live data:
Portfolio: Value=$${portfolioContext.portfolioValue}, Cash=$${portfolioContext.cash}, Risk=${portfolioContext.risk.label} (${portfolioContext.risk.score}/100).
Holdings: ${JSON.stringify(portfolioContext.assets || {})}.
Live Market Prices: ${JSON.stringify(Object.fromEntries(Object.entries(marketsData || {}).map(([k, v]: any) => [k, { price: v?.price, chg24h: v?.change24h, rsi: v?.indicators?.rsi }]))) }.

You can suggest interactive executable actions for the user if relevant to their intent:
- To propose a paper order: output a JSON block inside <<<ACTION ... ACTION>>> containing:
{"type":"order","side":"buy"|"sell","asset":"BTC"|"ETH"|"SOL"|"ADA"|"XRP"|"AVAX"|"LINK"|"DOGE","amount":number,"reason":string}
- To propose a price alert: output a JSON block inside <<<ACTION ... ACTION>>> containing:
{"type":"alert","asset":"BTC"|"ETH"|"SOL"|"ADA"|"XRP"|"AVAX"|"LINK"|"DOGE","alertType":"above"|"below","value":number,"reason":string}

Keep responses structured and scannable (2-4 clear, impactful paragraphs or bullet points).`;

      const formattedHistory = history.slice(-8).map((h) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      }));

      formattedHistory.push({
        role: 'user',
        parts: [{ text: `${text}\n\n[Current Live Data Context: Portfolio Value=$${portfolioContext.portfolioValue}, Cash=$${portfolioContext.cash}]` }],
      });
      
      const model = s.settings.geminiModel || 'gemini-3.8-flash';

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: formattedHistory,
          generationConfig: { temperature: 0.3 }
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        let cleanedText = fullText;
        let actionProposal: any = null;

        const actionMatch = fullText.match(/<<<ACTION\s*([\s\S]*?)\s*ACTION>>>/);
        if (actionMatch) {
          try {
            actionProposal = JSON.parse(actionMatch[1]);
            cleanedText = fullText.replace(/<<<ACTION[\s\S]*?ACTION>>>/, '').trim();
          } catch (e) {
            console.warn('Failed to parse proposed action:', e);
          }
        }

        return {
          reply: cleanedText || 'Analysis complete.',
          actionProposal,
        };
      }
    }
  } catch (err: any) {
    console.warn('Chat request failed:', err);
  }

  return {
    reply: `Live analysis for $${portfolioValue(s, markets).toLocaleString()} portfolio: Risk score is ${risk(s, markets).score}/100. Key asset ${s.selectedAsset} is trading at ${money(markets[s.selectedAsset]?.price || 0)}. You have $${money(s.cash)} in cash reserve ready for execution.`,
  };
}
