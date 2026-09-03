import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ASSETS, Asset, Market, Side, Timeframe, OrderType, StrategyConfig } from './types';
import { fetchAll } from './market';
import { executeOrder, indicators, risk, portfolioValue, money } from './trading';
import { freshState, loadState, resetState, saveState } from './storage';
import { fetchAIInsight, sendAIChat } from './gemini';

type Ctx = {
  state: AppState;
  markets: Record<Asset, Market | undefined>;
  loading: boolean;
  marketError: string;
  ai: any;
  aiLoading: boolean;
  chatHistory: { role: 'user' | 'assistant'; text: string; actionProposal?: any }[];
  chatLoading: boolean;
  activeToast: { id: string; title: string; message: string; type: 'success' | 'info' | 'warn' } | null;
  dismissToast: () => void;
  setSelectedAsset: (a: Asset) => void;
  setTimeframe: (t: Timeframe) => void;
  toggleWatch: (a: Asset) => void;
  order: (
    side: Side,
    a: Asset,
    qty: number,
    options?: { type?: OrderType; limitPrice?: number; auto?: boolean; strategyName?: string; takeProfit?: number; stopLoss?: number }
  ) => { ok: boolean; error?: string };
  toggleStrategy: (id: string) => void;
  updateStrategy: (id: string, p: Partial<StrategyConfig>) => void;
  addAlert: (x: Omit<AppState['alerts'][number], 'id' | 'triggered' | 'createdAt'>) => void;
  toggleAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  setSettings: (x: Partial<AppState['settings']>) => void;
  refreshAI: () => void;
  sendChat: (text: string) => Promise<void>;
  executeActionProposal: (proposal: any) => { ok: boolean; error?: string };
  reset: (startingCash?: number) => void;
  refreshMarkets: () => Promise<void>;
};

const Context = createContext<Ctx | null>(null);

// Gentle Web Audio notification chimes
function playChime(type: 'success' | 'alert' | 'trade') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'trade') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'alert') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch {
    // Audio contexts might be blocked until first user gesture
  }
}

export function Provider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const [markets, setMarkets] = useState<Record<Asset, Market | undefined>>(() =>
    Object.fromEntries(ASSETS.map((a) => [a, undefined])) as Record<Asset, Market | undefined>
  );
  const [loading, setLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  const [ai, setAi] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; text: string; actionProposal?: any }[]>([
    {
      role: 'assistant',
      text: "Greetings. I'm Lumen Copilot, your algorithmic portfolio co-pilot. I analyze order book flow, RSI divergence, and momentum indicators across your live positions. How may I assist your strategy today?",
    },
  ]);
  const [activeToast, setActiveToast] = useState<{ id: string; title: string; message: string; type: 'success' | 'info' | 'warn' } | null>(null);

  const stateRef = useRef(state);
  const marketsRef = useRef(markets);
  const toastTimeoutRef = useRef<any>(null);

  const triggerToast = useCallback((title: string, message: string, type: 'success' | 'info' | 'warn' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setActiveToast({ id: Math.random().toString(), title, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 4500);
  }, []);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  useEffect(() => {
    stateRef.current = state;
    saveState(state);
  }, [state]);

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  const refreshMarkets = useCallback(async () => {
    try {
      const data = await fetchAll(stateRef.current.timeframe);
      setMarkets(data);
      setMarketError('');
    } catch {
      setMarketError('Exchange public endpoints delayed. Utilizing resilient heuristic price engine.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll live markets every 4.5 seconds
  useEffect(() => {
    refreshMarkets();
    const id = setInterval(refreshMarkets, 4500);
    return () => clearInterval(id);
  }, [refreshMarkets]);

  // Algorithmic Strategy & Alert Monitor Loop
  useEffect(() => {
    const loopId = setInterval(() => {
      const s = {
        ...stateRef.current,
        positions: { ...stateRef.current.positions },
        avgBuyPrice: { ...(stateRef.current.avgBuyPrice || {}) },
        orders: [...stateRef.current.orders],
        alerts: stateRef.current.alerts.map((x) => ({ ...x })),
        strategies: stateRef.current.strategies.map((x) => ({ ...x })),
        notifications: [...stateRef.current.notifications],
      };
      const m = marketsRef.current;
      if (!m.BTC) return;

      let changed = false;
      const now = Date.now();

      // 1. Evaluate Alerts
      for (const rule of s.alerts.filter((x) => x.enabled && !x.triggered)) {
        const mm = m[rule.asset];
        if (!mm) continue;

        let pass = false;
        if (rule.type === 'above' && mm.price >= rule.value) pass = true;
        if (rule.type === 'below' && mm.price <= rule.value) pass = true;
        if (rule.type === 'changeUp' && mm.change24h >= rule.value) pass = true;
        if (rule.type === 'changeDown' && mm.change24h <= -Math.abs(rule.value)) pass = true;

        if (pass) {
          rule.triggered = true;
          rule.lastTriggeredAt = now;
          const msg = `${rule.asset} reached ${money(mm.price)} (${rule.type} target ${rule.value})`;
          s.notifications.unshift({
            id: 'notif_' + Math.random().toString(36).substring(2, 8),
            ts: now,
            title: `Alert Triggered: ${rule.asset}`,
            body: msg,
            type: 'alert',
          });
          if (s.settings.soundEnabled) playChime('alert');
          triggerToast(`Price Alert: ${rule.asset}`, msg, 'info');
          changed = true;
        }
      }

      // 2. Evaluate Algorithmic Strategies
      const pv = portfolioValue(s, m);

      for (const strat of s.strategies.filter((x) => x.enabled)) {
        const mm = m[strat.asset];
        if (!mm) continue;

        const lastExec = strat.lastExecutedAt || 0;
        if (now - lastExec < strat.cooldownSec * 1000) continue;

        const ind = indicators(mm.history);
        const currentVal = (s.positions[strat.asset] || 0) * mm.price;
        const maxAllowedVal = pv * strat.maxAllocation;

        if (strat.kind === 'momentum') {
          // Momentum: SMA10 > SMA30 and RSI in healthy zone
          if (ind.score >= 1 && ind.rsi < (strat.params.rsiThresholdBuy || 70) && currentVal < maxAllowedVal) {
            const budget = Math.min(maxAllowedVal - currentVal, s.cash * 0.2);
            if (budget >= 10) {
              const qty = +(budget / mm.price).toFixed(4);
              const r = executeOrder(s, m, 'buy', strat.asset, qty, {
                auto: true,
                strategyName: strat.name,
              });
              if (r.ok) {
                strat.lastExecutedAt = now;
                strat.tradesExecuted = (strat.tradesExecuted || 0) + 1;
                const msg = `Algo Buy: ${qty} ${strat.asset} @ ${money(r.order!.price)}`;
                s.notifications.unshift({
                  id: 'notif_' + Math.random().toString(36).substring(2, 8),
                  ts: now,
                  title: `${strat.name}`,
                  body: msg,
                  type: 'strategy',
                });
                if (s.settings.soundEnabled) playChime('trade');
                triggerToast(strat.name, msg, 'success');
                changed = true;
              }
            }
          } else if (ind.score <= -1 && ind.rsi > (strat.params.rsiThresholdSell || 30) && (s.positions[strat.asset] || 0) > 0) {
            // Trim 20% of position
            const trimQty = +((s.positions[strat.asset] || 0) * 0.2).toFixed(4);
            if (trimQty > 0) {
              const r = executeOrder(s, m, 'sell', strat.asset, trimQty, {
                auto: true,
                strategyName: strat.name,
              });
              if (r.ok) {
                strat.lastExecutedAt = now;
                strat.tradesExecuted = (strat.tradesExecuted || 0) + 1;
                const msg = `Algo Take-Profit: Sold ${trimQty} ${strat.asset} @ ${money(r.order!.price)}`;
                s.notifications.unshift({
                  id: 'notif_' + Math.random().toString(36).substring(2, 8),
                  ts: now,
                  title: `${strat.name}`,
                  body: msg,
                  type: 'strategy',
                });
                if (s.settings.soundEnabled) playChime('trade');
                triggerToast(strat.name, msg, 'info');
                changed = true;
              }
            }
          }
        } else if (strat.kind === 'mean_reversion') {
          // Bollinger oversold buy
          if (ind.bb && mm.price < ind.bb.lower && ind.rsi < (strat.params.rsiThresholdBuy || 35) && currentVal < maxAllowedVal) {
            const budget = Math.min(maxAllowedVal - currentVal, s.cash * 0.15);
            if (budget >= 15) {
              const qty = +(budget / mm.price).toFixed(4);
              const r = executeOrder(s, m, 'buy', strat.asset, qty, {
                auto: true,
                strategyName: strat.name,
              });
              if (r.ok) {
                strat.lastExecutedAt = now;
                strat.tradesExecuted = (strat.tradesExecuted || 0) + 1;
                const msg = `Mean-Reversion Oversold Entry: ${qty} ${strat.asset} @ ${money(r.order!.price)}`;
                s.notifications.unshift({
                  id: 'notif_' + Math.random().toString(36).substring(2, 8),
                  ts: now,
                  title: `${strat.name}`,
                  body: msg,
                  type: 'strategy',
                });
                if (s.settings.soundEnabled) playChime('trade');
                triggerToast(strat.name, msg, 'success');
                changed = true;
              }
            }
          }
        } else if (strat.kind === 'dca') {
          // Systematic dollar-cost averaging
          const dcaUsd = strat.params.dcaAmountUsd || 100;
          if (s.cash >= dcaUsd && currentVal < maxAllowedVal) {
            const qty = +(dcaUsd / mm.price).toFixed(4);
            const r = executeOrder(s, m, 'buy', strat.asset, qty, {
              auto: true,
              strategyName: strat.name,
            });
            if (r.ok) {
              strat.lastExecutedAt = now;
              strat.tradesExecuted = (strat.tradesExecuted || 0) + 1;
              const msg = `DCA Periodic Allocation: ${qty} ${strat.asset} ($${dcaUsd})`;
              s.notifications.unshift({
                id: 'notif_' + Math.random().toString(36).substring(2, 8),
                ts: now,
                title: `${strat.name}`,
                body: msg,
                type: 'strategy',
              });
              if (s.settings.soundEnabled) playChime('trade');
              triggerToast(strat.name, msg, 'success');
              changed = true;
            }
          }
        }
      }

      if (changed) {
        setState(s);
      }
    }, 5000);

    return () => clearInterval(loopId);
  }, [triggerToast]);

  const setSelectedAsset = useCallback((a: Asset) => {
    setState((s) => ({ ...s, selectedAsset: a }));
  }, []);

  const setTimeframe = useCallback(
    (t: Timeframe) => {
      setState((s) => ({ ...s, timeframe: t }));
      setTimeout(refreshMarkets, 0);
    },
    [refreshMarkets]
  );

  const toggleWatch = useCallback((a: Asset) => {
    setState((s) => {
      const exists = s.watchlist.includes(a);
      return {
        ...s,
        watchlist: exists ? s.watchlist.filter((x) => x !== a) : [...s.watchlist, a],
      };
    });
  }, []);

  const order = useCallback(
    (
      side: Side,
      a: Asset,
      qty: number,
      options?: { type?: OrderType; limitPrice?: number; auto?: boolean; strategyName?: string; takeProfit?: number; stopLoss?: number }
    ) => {
      const s = {
        ...stateRef.current,
        positions: { ...stateRef.current.positions },
        avgBuyPrice: { ...(stateRef.current.avgBuyPrice || {}) },
        orders: [...stateRef.current.orders],
        notifications: [...stateRef.current.notifications],
      };
      const r = executeOrder(s, marketsRef.current, side, a, qty, options);
      if (r.ok && r.order) {
        const msg = `${side === 'buy' ? 'Purchased' : 'Sold'} ${qty} ${a} @ ${money(r.order.price)} (Total: ${money(r.order.notional)})`;
        s.notifications.unshift({
          id: 'notif_' + Math.random().toString(36).substring(2, 8),
          ts: Date.now(),
          title: `Order Executed (${side.toUpperCase()})`,
          body: msg,
          type: 'order',
        });
        if (s.settings.soundEnabled) playChime('trade');
        triggerToast(`Order Filled: ${side.toUpperCase()} ${a}`, msg, 'success');
        setState(s);
      } else if (r.error) {
        triggerToast('Order Rejected', r.error, 'warn');
      }
      return r;
    },
    [triggerToast]
  );

  const toggleStrategy = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      strategies: s.strategies.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)),
    }));
  }, []);

  const updateStrategy = useCallback((id: string, p: Partial<StrategyConfig>) => {
    setState((s) => ({
      ...s,
      strategies: s.strategies.map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));
  }, []);

  const addAlert = useCallback(
    (x: Omit<AppState['alerts'][number], 'id' | 'triggered' | 'createdAt'>) => {
      const id = 'alt_' + Math.random().toString(36).substring(2, 8);
      setState((s) => ({
        ...s,
        alerts: [
          {
            ...x,
            id,
            triggered: false,
            createdAt: Date.now(),
          },
          ...s.alerts,
        ],
      }));
      triggerToast('Alert Created', `Target set for ${x.asset} (${x.type} ${x.value})`, 'info');
    },
    [triggerToast]
  );

  const toggleAlert = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      alerts: s.alerts.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)),
    }));
  }, []);

  const removeAlert = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      alerts: s.alerts.filter((x) => x.id !== id),
    }));
  }, []);

  const setSettings = useCallback((x: Partial<AppState['settings']>) => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, ...x },
    }));
  }, []);

  const refreshAI = useCallback(async () => {
    const snap = stateRef.current;
    if (!marketsRef.current[snap.selectedAsset]) return;
    setAiLoading(true);
    try {
      const insight = await fetchAIInsight(snap.selectedAsset, snap, marketsRef.current);
      setAi(insight);
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (markets[state.selectedAsset]) {
      refreshAI();
    }
  }, [state.selectedAsset, state.settings.geminiApiKey, state.settings.geminiModel, refreshAI]);

  const sendChat = useCallback(
    async (text: string) => {
      const userMsg = { role: 'user' as const, text };
      const updated = [...chatHistory, userMsg];
      setChatHistory(updated);
      setChatLoading(true);

      try {
        const { reply, actionProposal } = await sendAIChat(
          text,
          stateRef.current,
          marketsRef.current,
          updated
        );
        setChatHistory((h) => [...h, { role: 'assistant', text: reply, actionProposal }]);
      } catch (err: any) {
        setChatHistory((h) => [
          ...h,
          { role: 'assistant', text: `Failed to retrieve analysis: ${err.message}` },
        ]);
      } finally {
        setChatLoading(false);
      }
    },
    [chatHistory]
  );

  const executeActionProposal = useCallback(
    (proposal: any) => {
      if (proposal.type === 'order') {
        return order(proposal.side, proposal.asset, proposal.amount, {
          auto: false,
          strategyName: 'AI Copilot Recommendation',
        });
      } else if (proposal.type === 'alert') {
        addAlert({
          asset: proposal.asset,
          type: proposal.alertType || 'above',
          value: proposal.value,
          enabled: true,
        });
        return { ok: true };
      }
      return { ok: false, error: 'Unknown proposal type' };
    },
    [order, addAlert]
  );

  const reset = useCallback(
    (startingCash = 50000) => {
      const s = resetState(startingCash);
      setState(s);
      setAi(null);
      setChatHistory([
        {
          role: 'assistant',
          text: 'Simulation state restored. Fresh liquidity and market signals loaded.',
        },
      ]);
      triggerToast('Simulator Reset', `Allocated $${startingCash.toLocaleString()} starting balance`, 'info');
      refreshMarkets();
    },
    [refreshMarkets, triggerToast]
  );

  const value = useMemo(
    () => ({
      state,
      markets,
      loading,
      marketError,
      ai,
      aiLoading,
      chatHistory,
      chatLoading,
      activeToast,
      dismissToast,
      setSelectedAsset,
      setTimeframe,
      toggleWatch,
      order,
      toggleStrategy,
      updateStrategy,
      addAlert,
      toggleAlert,
      removeAlert,
      setSettings,
      refreshAI,
      sendChat,
      executeActionProposal,
      reset,
      refreshMarkets,
    }),
    [
      state,
      markets,
      loading,
      marketError,
      ai,
      aiLoading,
      chatHistory,
      chatLoading,
      activeToast,
      dismissToast,
      setSelectedAsset,
      setTimeframe,
      toggleWatch,
      order,
      toggleStrategy,
      updateStrategy,
      addAlert,
      toggleAlert,
      removeAlert,
      setSettings,
      refreshAI,
      sendChat,
      executeActionProposal,
      reset,
      refreshMarkets,
    ]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLumen() {
  const c = useContext(Context);
  if (!c) throw new Error('Provider missing');
  return c;
}

export { risk };
