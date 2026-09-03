import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// Helper to get GoogleGenAI client
function getGenAI(customKey?: string) {
  const key = customKey || process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// List models endpoint
app.get('/api/gemini/models', async (req, res) => {
  try {
    const customKey = req.headers['x-gemini-key'] as string | undefined;
    const ai = getGenAI(customKey);
    if (!ai) {
      return res.json({
        models: [
          { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash (Default)' },
          { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro' },
          { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite' },
        ],
        source: 'preset',
      });
    }
    const response = await ai.models.list();
    const list: any[] = [];
    for await (const m of response) {
      if (m.name && m.supportedActions?.includes('generateContent')) {
        list.push({
          name: m.name.replace(/^models\//, ''),
          displayName: m.displayName || m.name.replace(/^models\//, ''),
        });
      }
    }
    res.json({ models: list.length > 0 ? list : [{ name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' }], source: 'live' });
  } catch (err: any) {
    res.json({
      models: [
        { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash (Standard)' },
        { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro' },
        { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite' },
      ],
      warning: err.message,
    });
  }
});

// Insight generation
app.post('/api/gemini/insight', async (req, res) => {
  const { asset, marketData, portfolioContext, model = 'gemini-3.8-flash' } = req.body;
  const customKey = req.headers['x-gemini-key'] as string | undefined;
  const ai = getGenAI(customKey);

  // High quality heuristic generator if Gemini key is not configured or fails
  const indicators = marketData?.indicators || {};
  const score = indicators.score ?? 0;
  const rsi = indicators.rsi ?? 50;
  const chg = indicators.chg ?? 0;
  const vol = indicators.vol ?? 0.02;

  let dir: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (score >= 1 || (rsi < 35 && chg > -2) || (rsi > 50 && score > 0)) dir = 'bullish';
  else if (score <= -1 || (rsi > 70 && chg < 0) || (rsi < 50 && score < 0)) dir = 'bearish';

  const confidence = Math.min(92, Math.max(45, Math.round(52 + Math.abs(score) * 14 + (rsi > 65 || rsi < 35 ? 10 : 0))));

  const heuristicInsight = {
    direction: dir,
    confidence,
    rationale: `${asset} exhibits ${dir} structure based on momentum convergence. RSI stands at ${rsi.toFixed(1)} with a 24h delta of ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% and ${((vol || 0.02) * 100).toFixed(2)}% short-term volatility. Key moving averages suggest ${score >= 1 ? 'sustained accumulation' : score <= -1 ? 'elevated distribution pressure' : 'consolidation within dynamic range'}.`,
    signals: [
      { label: 'Trend Bias', value: dir === 'bullish' ? 'Bullish Expansion' : dir === 'bearish' ? 'Bearish Contraction' : 'Neutral Range' },
      { label: 'RSI (14)', value: `${rsi.toFixed(1)} (${rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Balanced'})` },
      { label: 'Moving Avg', value: indicators.s10 && indicators.s30 && indicators.s10 > indicators.s30 ? 'SMA10 > SMA30 (Bullish)' : 'SMA10 ≤ SMA30 (Defensive)' },
      { label: 'Volatility', value: `${((vol || 0.02) * 100).toFixed(2)}% (Modeled)` },
    ],
    proposals: [
      dir === 'bullish' ? { type: 'order', side: 'buy', amount: 0.02, reason: 'Momentum breakout entry with dynamic stop' } :
      dir === 'bearish' ? { type: 'order', side: 'sell', amount: 0.01, reason: 'Risk mitigation / take-profit trim' } :
      { type: 'alert', alertType: 'above', value: Math.round((marketData?.price || 1000) * 1.03), reason: 'Alert on upper range breakout' }
    ]
  };

  if (!ai) {
    return res.json({ insight: heuristicInsight, source: 'quantitative_engine' });
  }

  try {
    const prompt = `You are Lumen AI, an institutional-grade algorithmic cryptocurrency strategist and quantitative risk officer.
Analyze the target asset with mathematical precision.

Asset: ${asset}
Price: $${marketData?.price}
24h Change: ${marketData?.change24h}%
Indicators: RSI=${rsi.toFixed(1)}, SMA10=${indicators.s10?.toFixed(2)}, SMA30=${indicators.s30?.toFixed(2)}, Volatility=${((vol || 0.02) * 100).toFixed(2)}%
Portfolio State: Cash=$${portfolioContext?.cash}, Total Value=$${portfolioContext?.portfolioValue}, Current Holding in ${asset}=${portfolioContext?.assets?.[asset]?.holding || 0} units.

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

    const modelName = model || 'gemini-3.8-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    const parsed = JSON.parse(text);
    return res.json({ insight: parsed, source: 'gemini' });
  } catch (err: any) {
    console.error('Gemini insight error, falling back to quantitative engine:', err);
    return res.json({ insight: heuristicInsight, source: 'quantitative_engine_fallback', error: err.message });
  }
});

// Conversational Trading Copilot
app.post('/api/gemini/chat', async (req, res) => {
  const { message, history = [], portfolioContext, marketsData, model = 'gemini-3.8-flash' } = req.body;
  const customKey = req.headers['x-gemini-key'] as string | undefined;
  const ai = getGenAI(customKey);

  // Intent detection for actionable assistance
  const lowerMsg = (message || '').toLowerCase();
  
  // Intelligent heuristic assistant if Gemini is not set up
  if (!ai) {
    let reply = `I've analyzed your live portfolio and current market dynamics. `;
    let actionProposal: any = null;

    if (lowerMsg.includes('buy') || lowerMsg.includes('order') || lowerMsg.includes('long')) {
      const match = lowerMsg.match(/(btc|eth|sol|ada|xrp|avax|link|doge)/i);
      const symbol = match ? match[1].toUpperCase() : 'BTC';
      const m = marketsData?.[symbol];
      const p = m?.price || 1000;
      const recAmount = symbol === 'BTC' ? 0.05 : symbol === 'ETH' ? 0.5 : 5;
      reply += `Looking at ${symbol} at $${p.toLocaleString()} (${(m?.change24h || 0) >= 0 ? '+' : ''}${(m?.change24h || 0).toFixed(2)}% today), the technical indicators show an RSI of ${m?.indicators?.rsi ? m.indicators.rsi.toFixed(1) : '52'}. If you want to enter a position with disciplined size, I've prepared a paper execution draft below.`;
      actionProposal = {
        type: 'order',
        side: 'buy',
        asset: symbol,
        amount: recAmount,
        estTotal: p * recAmount,
        reason: `Paper Buy Entry for ${recAmount} ${symbol} @ ~$${p.toLocaleString()}`,
      };
    } else if (lowerMsg.includes('risk') || lowerMsg.includes('exposure') || lowerMsg.includes('portfolio')) {
      const pv = portfolioContext?.portfolioValue || 100000;
      const cash = portfolioContext?.cash || 100000;
      const r = portfolioContext?.risk;
      reply += `Your total portfolio valuation is $${pv.toLocaleString()} with $${cash.toLocaleString()} in liquid cash (${((cash / Math.max(pv, 1)) * 100).toFixed(1)}% liquidity ratio). Current overall risk index is rated ${r?.score || 18}/100 (${r?.label || 'Low Risk'}). Your risk profile has high preservation resilience against downside volatility.`;
    } else if (lowerMsg.includes('alert') || lowerMsg.includes('notify') || lowerMsg.includes('target')) {
      const match = lowerMsg.match(/(btc|eth|sol|ada|xrp|avax|link|doge)/i);
      const symbol = match ? match[1].toUpperCase() : 'BTC';
      const m = marketsData?.[symbol];
      const p = m?.price || 68000;
      const target = Math.round(p * 1.05);
      reply += `Setting automated price boundaries is essential for disciplined volatility capture. I've staged an alert for ${symbol} crossing above $${target.toLocaleString()} (+5.0% resistance check).`;
      actionProposal = {
        type: 'alert',
        asset: symbol,
        alertType: 'above',
        value: target,
        reason: `${symbol} crossing resistance at $${target.toLocaleString()}`,
      };
    } else if (lowerMsg.includes('strategy') || lowerMsg.includes('algorithm') || lowerMsg.includes('dca')) {
      reply += `Our quantitative suite features Momentum Crossover, Mean Reversion RSI, and Smart DCA. The Momentum engine triggers buys when 10-period SMA crosses above 30-period SMA with RSI < 70, preventing high-water mark slippage. You can enable automated execution on any asset in the Strategies studio.`;
    } else {
      reply += `Across monitored digital assets, market momentum is showing selective rotation. For optimal risk-adjusted returns, maintain at least 25% cash reserve while deploying momentum triggers on pullbacks. What would you like to execute or analyze next?`;
    }

    return res.json({
      reply,
      actionProposal,
      source: 'quantitative_copilot',
    });
  }

  try {
    const systemPrompt = `You are Lumen Copilot, an elite AI portfolio strategist and algorithmic crypto execution assistant.
Tone: Apple-like elegance, concise, mathematically sharp, Wall Street quantitative precision. Never sound hypey, spammy, or use generic platitudes.
Always ground assertions in the user's live data:
Portfolio: Value=$${portfolioContext?.portfolioValue}, Cash=$${portfolioContext?.cash}, Risk=${portfolioContext?.risk?.label} (${portfolioContext?.risk?.score}/100).
Holdings: ${JSON.stringify(portfolioContext?.assets || {})}.
Live Market Prices: ${JSON.stringify(Object.fromEntries(Object.entries(marketsData || {}).map(([k, v]: any) => [k, { price: v?.price, chg24h: v?.change24h, rsi: v?.indicators?.rsi }]))) }.

You can suggest interactive executable actions for the user if relevant to their intent:
- To propose a paper order: output a JSON block inside <<<ACTION ... ACTION>>> containing:
{"type":"order","side":"buy"|"sell","asset":"BTC"|"ETH"|"SOL"|"ADA"|"XRP"|"AVAX"|"LINK"|"DOGE","amount":number,"reason":string}
- To propose a price alert: output a JSON block inside <<<ACTION ... ACTION>>> containing:
{"type":"alert","asset":"BTC"|"ETH"|"SOL"|"ADA"|"XRP"|"AVAX"|"LINK"|"DOGE","alertType":"above"|"below","value":number,"reason":string}

Keep responses structured and scannable (2-4 clear, impactful paragraphs or bullet points).`;

    const formattedHistory = history.slice(-8).map((h: any) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    }));

    formattedHistory.push({
      role: 'user',
      parts: [{ text: `${message}\n\n[Current Live Data Context: Portfolio Value=$${portfolioContext?.portfolioValue}, Cash=$${portfolioContext?.cash}]` }],
    });

    const modelName = model || 'gemini-3.8-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedHistory,
      config: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        temperature: 0.3,
      },
    });

    const fullText = response.text || '';
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

    res.json({
      reply: cleanedText,
      actionProposal,
      source: 'gemini',
    });
  } catch (err: any) {
    console.error('Gemini chat error:', err);
    res.json({
      reply: `Market intelligence: I was unable to connect to Gemini directly (${err.message}), but your local portfolio valuation of $${(portfolioContext?.portfolioValue || 100000).toLocaleString()} remains actively monitored with $${(portfolioContext?.cash || 100000).toLocaleString()} in available paper cash.`,
      source: 'copilot_fallback',
    });
  }
});

// Vite integration
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: 3000,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lumen AI Trading Cockpit listening on port ${PORT}`);
  });
}

setupServer();
