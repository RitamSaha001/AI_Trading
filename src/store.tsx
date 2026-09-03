import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ASSETS,
  Asset,
  DataSource,
  Market,
  Order,
  OrderType,
  Side,
  StrategyConfig,
  Timeframe,
  AIActionProposal,
  AISafetyValidation,
  ExecutionReceipt,
} from './types';
import { fetchAll, fetchMarket, MarketStreamService } from './services/market';
import {
  executeOrder,
  checkPendingOrders,
  cancelOrder,
  portfolioValue,
  money,
  calculatePortfolioRisk,
} from './trading';
import { evaluateStrategy } from './domain/strategies';
import { evaluateAlert } from './domain/alerts';
import { validateAIProposal } from './services/safetyGate';
import { freshState, loadState, resetState, saveState, SimulationMode } from './storage';
import { fetchAIInsight, sendAIChat } from './gemini';

type Ctx = {
  state: AppState;
  markets: Record<Asset, Market | undefined>;
  loading: boolean;
  marketError: string;
  currentDataSource: DataSource;
  ai: any;
  aiLoading: boolean;
  chatHistory: { role: 'user' | 'assistant'; text: string; actionProposal?: any; engine?: string }[];
  chatLoading: boolean;
  chatOpen: boolean;
  prefilledChatPrompt: string;
  openChat: (prompt?: string) => void;
  closeChat: () => void;
  activeToast: { id: string; title: string; message: string; type: 'success' | 'info' | 'warn' } | null;
  dismissToast: () => void;
  setSelectedAsset: (a: Asset) => void;
  setTimeframe: (t: Timeframe) => void;
  toggleWatch: (a: Asset) => void;
  order: (
    side: Side,
    a: Asset,
    qty: number,
    options?: {
      type?: OrderType;
      limitPrice?: number;
      stopPrice?: number;
      auto?: boolean;
      strategyName?: string;
      takeProfit?: number;
      stopLoss?: number;
    }
  ) => { ok: boolean; error?: string; order?: Order };
  cancelPendingOrder: (orderId: string) => boolean;
  toggleStrategy: (id: string) => void;
  updateStrategy: (id: string, p: Partial<StrategyConfig>) => void;
  addStrategy: (x: Omit<StrategyConfig, 'id' | 'tradesExecuted' | 'totalPnl' | 'realizedPnl' | 'feesPaid'>) => void;
  removeStrategy: (id: string) => void;
  resetStrategyMetrics: (id: string) => void;
  addAlert: (x: Omit<AppState['alerts'][number], 'id' | 'triggered' | 'createdAt'>) => void;
  toggleAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  setSettings: (x: Partial<AppState['settings']>) => void;
  refreshAI: () => void;
  sendChat: (text: string) => Promise<void>;
  pendingAIProposal: AIActionProposal | null;
  pendingAIValidation: AISafetyValidation | null;
  requestExecuteAIProposal: (proposal: any) => void;
  confirmPendingAIProposal: () => { ok: boolean; error?: string };
  rejectPendingAIProposal: () => void;
  executeActionProposal: (proposal: any) => { ok: boolean; error?: string };
  reset: (startingCash?: number, mode?: SimulationMode) => void;
  refreshMarkets: () => Promise<void>;
};

const Context = createContext<Ctx | null>(null);

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
    // blocked until user interaction
  }
}

export function Provider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const [markets, setMarkets] = useState<Record<Asset, Market | undefined>>(() =>
    Object.fromEntries(ASSETS.map((a) => [a, undefined])) as Record<Asset, Market | undefined>
  );
  const [loading, setLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  const [currentDataSource, setCurrentDataSource] = useState<DataSource>('Binance WebSocket (Live)');
  const [ai, setAi] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [prefilledChatPrompt, setPrefilledChatPrompt] = useState('');

  const openChat = useCallback((prompt?: string) => {
    if (prompt) setPrefilledChatPrompt(prompt);
    setChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setPrefilledChatPrompt('');
  }, []);

  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; text: string; actionProposal?: any; engine?: string }[]>([
    {
      role: 'assistant',
      text: "Welcome to **Lumen Nexus**—your autonomous agentic trading intelligence. I analyze quantitative indicators (SMA/EMA ribbons, RSI, Bollinger Bands, ATR, VWAP), stress-test portfolios, synthesize algorithmic strategy bots, and execute mathematical capital allocation. Click the **`+`** icon below to launch any capability, or ask me directly.",
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    },
  ]);
  const [activeToast, setActiveToast] = useState<{ id: string; title: string; message: string; type: 'success' | 'info' | 'warn' } | null>(null);

  // Safety Gate Staging State
  const [pendingAIProposal, setPendingAIProposal] = useState<AIActionProposal | null>(null);
  const [pendingAIValidation, setPendingAIValidation] = useState<AISafetyValidation | null>(null);

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

  // Initial Full REST bootstrap
  const refreshMarkets = useCallback(async () => {
    try {
      const data = await fetchAll(stateRef.current.timeframe, stateRef.current.selectedAsset);
      setMarkets(data);
      const firstSource = Object.values(data)[0]?.source || 'Binance REST';
      setCurrentDataSource(firstSource);
      setMarketError('');
    } catch {
      setMarketError('Exchange public endpoints delayed. Utilizing resilient heuristic simulation feed.');
      setCurrentDataSource('Simulated Heuristic');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMarkets();
  }, [refreshMarkets]);

  // Live WebSocket ticker feed with auto-reconnection
  useEffect(() => {
    if (state.settings.enableWebSocket === false) return;

    const stream = new MarketStreamService(
      (updates) => {
        setMarkets((prev) => {
          let hasChange = false;
          const next = { ...prev };
          const now = Date.now();

          for (const [assetStr, upd] of Object.entries(updates)) {
            const a = assetStr as Asset;
            const currentM = prev[a];
            if (currentM && upd) {
              hasChange = true;
              const newHist = currentM.history.length > 0 ? [...currentM.history.slice(-99), upd.price] : [upd.price];
              next[a] = {
                ...currentM,
                price: upd.price,
                high24h: Math.max(currentM.high24h, upd.high),
                low24h: Math.min(currentM.low24h, upd.low),
                volume24h: upd.volume,
                change24h: upd.changePct,
                history: newHist,
                source: 'Binance WebSocket (Live)',
                isSynthetic: false,
                lastUpdated: now,
              };
            }
          }

          return hasChange ? next : prev;
        });
      },
      (status) => {
        setCurrentDataSource(status);
      }
    );

    return () => {
      stream.destroy();
    };
  }, [state.settings.enableWebSocket]);

  // Periodic REST poll every 12 seconds to ensure klines/history remain fresh
  useEffect(() => {
    const pollId = setInterval(() => {
      refreshMarkets();
    }, 12000);
    return () => clearInterval(pollId);
  }, [refreshMarkets]);

  // Price Tick Engine: Pending Orders, Limit Executions, Stop Loss & Take Profit, Strategies, Alerts
  useEffect(() => {
    const loopId = setInterval(() => {
      const s: AppState = {
        ...stateRef.current,
        positions: { ...stateRef.current.positions },
        avgBuyPrice: { ...(stateRef.current.avgBuyPrice || {}) },
        orders: stateRef.current.orders.map((o) => ({ ...o })),
        alerts: stateRef.current.alerts.map((x) => ({ ...x })),
        strategies: stateRef.current.strategies.map((x) => ({ ...x })),
        notifications: [...stateRef.current.notifications],
      };
      const m = marketsRef.current;
      const hasAnyMarket = Object.values(m).some((market) => market && market.price > 0);
      if (!hasAnyMarket) return;

      let changed = false;

      // 1. Evaluate Pending Limit & Bracket Orders
      const orderResults = checkPendingOrders(s, m);
      if (orderResults.changed) {
        changed = true;
      }
      if (orderResults.filledOrders.length > 0) {
        for (const order of orderResults.filledOrders) {
          const msg = `Order Executed: ${order.side.toUpperCase()} ${order.amount} ${order.asset} @ ${money(order.price)}`;
          s.notifications.unshift({
            id: 'notif_' + Math.random().toString(36).substring(2, 8),
            ts: Date.now(),
            title: `Order Filled (${order.type.toUpperCase()})`,
            body: msg,
            type: 'order',
          });
          if (s.settings.soundEnabled) playChime('trade');
          triggerToast(`Limit Order Filled`, msg, 'success');
        }
      }
      if (orderResults.rejectedOrders.length > 0) {
        for (const order of orderResults.rejectedOrders) {
          const msg = `Order Rejected: ${order.side.toUpperCase()} ${order.amount} ${order.asset} (${order.rejectReason || 'Validation failed'})`;
          s.notifications.unshift({
            id: 'notif_' + Math.random().toString(36).substring(2, 8),
            ts: Date.now(),
            title: `Order Rejected (${order.type.toUpperCase()})`,
            body: msg,
            type: 'order',
          });
          triggerToast(`Order Rejected`, msg, 'warn');
        }
      }
      if (orderResults.triggeredBrackets.length > 0) {
        for (const bracket of orderResults.triggeredBrackets) {
          const msg = `${bracket.order.asset} Bracket Triggered: ${bracket.reason}`;
          s.notifications.unshift({
            id: 'notif_' + Math.random().toString(36).substring(2, 8),
            ts: Date.now(),
            title: `Bracket Order Executed`,
            body: msg,
            type: 'strategy',
          });
          if (s.settings.soundEnabled) playChime('trade');
          triggerToast(`Bracket Triggered`, msg, 'info');
        }
      }

      // 2. Evaluate Alerts
      for (const rule of s.alerts) {
        const trigger = evaluateAlert(rule, m[rule.asset]);
        if (trigger) {
          s.notifications.unshift({
            id: 'notif_' + Math.random().toString(36).substring(2, 8),
            ts: Date.now(),
            title: `Price Alert: ${rule.asset}`,
            body: trigger.message,
            type: 'alert',
          });
          if (s.settings.soundEnabled) playChime('alert');
          triggerToast(`Price Alert: ${rule.asset}`, trigger.message, 'info');
          changed = true;
        }
      }

      // 3. Evaluate Automated Strategies
      for (const strat of s.strategies) {
        const stratResult = evaluateStrategy(strat, s, m);
        if (stratResult.executed && stratResult.message) {
          s.notifications.unshift({
            id: 'notif_' + Math.random().toString(36).substring(2, 8),
            ts: Date.now(),
            title: strat.name,
            body: stratResult.message,
            type: 'strategy',
          });
          if (s.settings.soundEnabled) playChime('trade');
          triggerToast(strat.name, stratResult.message, stratResult.type === 'buy' ? 'success' : 'info');
          changed = true;
        }
      }

      if (changed) {
        setState(s);
      }
    }, 2500);

    return () => clearInterval(loopId);
  }, [triggerToast]);

  const setSelectedAsset = useCallback((a: Asset) => {
    setState((s) => ({ ...s, selectedAsset: a }));
    fetchMarket(a, stateRef.current.timeframe).then((m: Market) => {
      setMarkets((prev) => ({ ...prev, [a]: m }));
    }).catch(() => {});
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
      options?: {
        type?: OrderType;
        limitPrice?: number;
        stopPrice?: number;
        auto?: boolean;
        strategyName?: string;
        takeProfit?: number;
        stopLoss?: number;
      }
    ) => {
      const s: AppState = {
        ...stateRef.current,
        positions: { ...stateRef.current.positions },
        avgBuyPrice: { ...(stateRef.current.avgBuyPrice || {}) },
        orders: [...stateRef.current.orders],
        notifications: [...stateRef.current.notifications],
      };

      const r = executeOrder(s, marketsRef.current, side, a, qty, options);

      if (r.ok && r.order) {
        const isLimit = r.order.type === 'limit';
        const msg = isLimit
          ? `Limit ${side.toUpperCase()} placed for ${qty} ${a} @ ${money(r.order.limitPrice || r.order.price)}`
          : `${side === 'buy' ? 'Purchased' : 'Sold'} ${qty} ${a} @ ${money(r.order.price)} (Total: ${money(r.order.notional)})`;

        s.notifications.unshift({
          id: 'notif_' + Math.random().toString(36).substring(2, 8),
          ts: Date.now(),
          title: isLimit ? `Limit Order Queued` : `Order Executed (${side.toUpperCase()})`,
          body: msg,
          type: 'order',
        });

        if (s.settings.soundEnabled) playChime('trade');
        triggerToast(isLimit ? 'Limit Order Placed' : `Order Filled: ${side.toUpperCase()} ${a}`, msg, 'success');
        setState(s);
      } else if (r.error) {
        triggerToast('Order Rejected', r.error, 'warn');
      }
      return r;
    },
    [triggerToast]
  );

  const cancelPendingOrder = useCallback(
    (orderId: string) => {
      const s: AppState = {
        ...stateRef.current,
        orders: stateRef.current.orders.map((o) => ({ ...o })),
        notifications: [...stateRef.current.notifications],
      };
      const ok = cancelOrder(s, orderId);
      if (ok) {
        s.notifications.unshift({
          id: 'notif_' + Math.random().toString(36).substring(2, 8),
          ts: Date.now(),
          title: 'Order Cancelled',
          body: `Pending order ${orderId.slice(0, 10)} was cancelled.`,
          type: 'order',
        });
        triggerToast('Order Cancelled', 'Limit order cancelled successfully.', 'info');
        setState(s);
      }
      return ok;
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

  const addStrategy = useCallback(
    (x: Omit<StrategyConfig, 'id' | 'tradesExecuted' | 'totalPnl' | 'realizedPnl' | 'feesPaid'>) => {
      const id = 'strat_' + x.asset.toLowerCase() + '_' + Math.random().toString(36).substring(2, 7);
      setState((s) => ({
        ...s,
        strategies: [
          {
            ...x,
            id,
            tradesExecuted: 0,
            totalPnl: 0,
            realizedPnl: 0,
            feesPaid: 0,
            winCount: 0,
            lossCount: 0,
          },
          ...s.strategies,
        ],
      }));
      triggerToast('Strategy Deployed', `New ${x.kind.replace('_', ' ')} algorithm activated on ${x.asset}`, 'success');
    },
    [triggerToast]
  );

  const removeStrategy = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      strategies: s.strategies.filter((x) => x.id !== id),
    }));
    triggerToast('Strategy Removed', 'Algorithmic strategy has been safely decommissioned.', 'info');
  }, [triggerToast]);

  const resetStrategyMetrics = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      strategies: s.strategies.map((x) =>
        x.id === id
          ? { ...x, tradesExecuted: 0, totalPnl: 0, realizedPnl: 0, feesPaid: 0, winCount: 0, lossCount: 0 }
          : x
      ),
    }));
    triggerToast('Metrics Reset', 'Strategy performance counters cleared.', 'info');
  }, [triggerToast]);

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
            isRecurring: x.isRecurring ?? false,
            cooldownSec: x.cooldownSec ?? 300,
            createdAt: Date.now(),
            triggerHistory: [],
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
        const { reply, actionProposal, engine } = await sendAIChat(
          text,
          stateRef.current,
          marketsRef.current,
          updated
        );
        setChatHistory((h) => [...h, { role: 'assistant', text: reply, actionProposal, engine }]);
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

  // Safety Gate: Intercepts AI proposals, validates, and stages for user confirmation
  const requestExecuteAIProposal = useCallback(
    (proposal: any) => {
      const validation = validateAIProposal(proposal, stateRef.current, marketsRef.current);
      setPendingAIProposal(proposal);
      setPendingAIValidation(validation);
    },
    []
  );

  const confirmPendingAIProposal = useCallback(() => {
    if (!pendingAIProposal || !pendingAIValidation?.valid) {
      return { ok: false, error: 'Cannot execute invalid proposal.' };
    }

    const proposal = pendingAIProposal;
    setPendingAIProposal(null);
    setPendingAIValidation(null);

    let receipt: ExecutionReceipt | undefined;

    if (proposal.type === 'order') {
      const res = order(proposal.side || 'buy', proposal.asset, proposal.amount || 0.05, {
        auto: false,
        strategyName: 'Lumen Nexus Recommendation',
      });
      if (res.ok) {
        receipt = {
          receiptId: 'rcpt_' + Math.random().toString(36).substring(2, 8),
          actionType: 'order',
          title: `Order Executed: ${proposal.side?.toUpperCase()} ${proposal.amount} ${proposal.asset}`,
          summary: `Submitted ${proposal.side?.toUpperCase()} order for ${proposal.amount} ${proposal.asset} via Nexus execution gate.`,
          executedAt: Date.now(),
          details: [
            `Side: ${proposal.side?.toUpperCase()}`,
            `Asset: ${proposal.asset}`,
            `Amount: ${proposal.amount} units`,
            `Market Price: $${(marketsRef.current[proposal.asset]?.price || 0).toLocaleString()}`,
            `Execution Mode: Paper Execution (0.08% taker fee capitalized)`,
          ],
          badges: [
            { label: 'Executed', color: 'emerald' },
            { label: 'Safety Verified', color: 'indigo' },
          ],
          jumpRoute: '/orders',
          jumpLabel: 'View in Orders Desk →',
        };
      }
      if (receipt) {
        setChatHistory((hist) =>
          hist.map((item) => {
            if (item.actionProposal && item.actionProposal.type === 'order' && !item.actionProposal.executionReceipt) {
              return {
                ...item,
                actionProposal: { ...item.actionProposal, executionReceipt: receipt },
              };
            }
            return item;
          })
        );
      }
      return res;
    } else if (proposal.type === 'alert') {
      addAlert({
        asset: proposal.asset,
        type: proposal.alertType || 'above',
        value: proposal.value || 0,
        enabled: true,
        isRecurring: false,
        cooldownSec: 300,
      });
      receipt = {
        receiptId: 'rcpt_' + Math.random().toString(36).substring(2, 8),
        actionType: 'alert',
        title: `Volatility Alert Set: ${proposal.asset} (${proposal.alertType} $${proposal.value})`,
        summary: `Active price trigger registered on ${proposal.asset} with automatic cooldown monitoring.`,
        executedAt: Date.now(),
        details: [
          `Trigger Type: ${proposal.alertType}`,
          `Threshold Value: $${proposal.value?.toLocaleString()}`,
          `Current Spot: $${(marketsRef.current[proposal.asset]?.price || 0).toLocaleString()}`,
          `Cooldown: 300s`,
        ],
        badges: [
          { label: 'Armed', color: 'emerald' },
          { label: 'Real-time', color: 'indigo' },
        ],
        jumpRoute: '/alerts',
        jumpLabel: 'View in Alerts Desk →',
      };
      setChatHistory((hist) =>
        hist.map((item) => {
          if (item.actionProposal && item.actionProposal.type === 'alert' && !item.actionProposal.executionReceipt) {
            return {
              ...item,
              actionProposal: { ...item.actionProposal, executionReceipt: receipt },
            };
          }
          return item;
        })
      );
      return { ok: true };
    } else if (proposal.type === 'rebalance' || proposal.type === 'emergency_defend') {
      const steps = proposal.rebalanceSteps || [];
      let totalVolume = 0;
      let executedCount = 0;

      // First execute all sell orders to free up liquid cash
      const sells = steps.filter((s: any) => s.action === 'sell');
      const buys = steps.filter((s: any) => s.action === 'buy');

      for (const step of sells) {
        const res = order('sell', step.asset, step.amount, {
          auto: true,
          strategyName: proposal.type === 'emergency_defend' ? 'Sentinel Capital Defense' : 'Agentic Rebalancing',
        });
        if (res.ok) {
          executedCount++;
          totalVolume += step.estimatedNotional || 0;
        }
      }

      // Next execute buy orders using liquid cash
      for (const step of buys) {
        const res = order('buy', step.asset, step.amount, {
          auto: true,
          strategyName: proposal.type === 'emergency_defend' ? 'Sentinel Capital Defense' : 'Agentic Rebalancing',
        });
        if (res.ok) {
          executedCount++;
          totalVolume += step.estimatedNotional || 0;
        }
      }

      const isDefend = proposal.type === 'emergency_defend';
      triggerToast(
        isDefend ? 'Emergency Defense Executed' : 'Portfolio Rebalance Executed',
        `Executed ${executedCount} reallocation steps ($${totalVolume.toFixed(2)} total volume).`,
        'success'
      );

      receipt = {
        receiptId: 'rcpt_' + Math.random().toString(36).substring(2, 8),
        actionType: proposal.type,
        title: isDefend ? 'Sentinel Capital Defense Completed' : 'Portfolio Rebalance Completed',
        summary: `Successfully executed ${executedCount} reallocation steps ($${totalVolume.toFixed(2)} total volume) to optimize portfolio risk.`,
        executedAt: Date.now(),
        details: [
          `Executed Steps: ${executedCount} transactions`,
          `Total Rebalanced Volume: $${totalVolume.toFixed(2)}`,
          `Target Cash Buffer: ${proposal.cashTargetPct || 15}%`,
        ],
        badges: [
          { label: isDefend ? 'Defended' : 'Balanced', color: 'emerald' },
          { label: 'Two-Stage Execution', color: 'indigo' },
        ],
        jumpRoute: '/portfolio',
        jumpLabel: 'View in Portfolio Desk →',
      };

      setChatHistory((hist) =>
        hist.map((item) => {
          if (item.actionProposal && (item.actionProposal.type === 'rebalance' || item.actionProposal.type === 'emergency_defend') && !item.actionProposal.executionReceipt) {
            return {
              ...item,
              actionProposal: { ...item.actionProposal, executionReceipt: receipt },
            };
          }
          return item;
        })
      );
      return { ok: true };
    } else if (proposal.type === 'deploy_strategy') {
      const params = proposal.strategyParams;
      const id = 'strat_nexus_' + proposal.asset.toLowerCase() + '_' + Math.random().toString(36).substring(2, 7);
      const newStrategy: StrategyConfig = {
        id,
        asset: proposal.asset,
        kind: params?.kind || 'vwap_trend',
        name: params?.name || `${proposal.asset} Algorithmic Strategy`,
        enabled: true,
        maxAllocation: params?.maxAllocation ?? 0.25,
        cooldownSec: params?.cooldownSec ?? 25,
        tradesExecuted: 0,
        totalPnl: 0,
        realizedPnl: 0,
        feesPaid: 0,
        winCount: 0,
        lossCount: 0,
        targetProfitPct: params?.targetProfitPct,
        trailingStopPct: params?.trailingStopPct,
        params: params?.params || {},
      };

      setState((s) => ({
        ...s,
        strategies: [newStrategy, ...s.strategies],
      }));
      triggerToast('Strategy Deployed', `Active: ${newStrategy.name} is now evaluating live market ticks.`, 'success');

      receipt = {
        receiptId: 'rcpt_' + Math.random().toString(36).substring(2, 8),
        actionType: 'deploy_strategy',
        title: `Algorithmic Bot Deployed: ${newStrategy.name}`,
        summary: `Algorithmic engine ${newStrategy.kind.replace('_', ' ').toUpperCase()} active on 2.5s ticks with dynamic ATR profit brackets.`,
        executedAt: Date.now(),
        details: [
          `Bot ID: ${newStrategy.id}`,
          `Target Asset: ${newStrategy.asset}`,
          `Max Allocation: ${((newStrategy.maxAllocation || 0.25) * 100).toFixed(0)}%`,
          `Take-Profit Target: +${newStrategy.targetProfitPct || 5}%`,
          `Trailing Stop: -${newStrategy.trailingStopPct || 2}%`,
          `Evaluation Loop: Every 2.5s`,
        ],
        badges: [
          { label: 'Active & Live', color: 'emerald' },
          { label: 'Dynamic ATR', color: 'indigo' },
        ],
        jumpRoute: '/strategies',
        jumpLabel: 'View in Strategies Desk →',
      };

      setChatHistory((hist) =>
        hist.map((item) => {
          if (item.actionProposal && item.actionProposal.type === 'deploy_strategy' && !item.actionProposal.executionReceipt) {
            return {
              ...item,
              actionProposal: { ...item.actionProposal, executionReceipt: receipt },
            };
          }
          return item;
        })
      );
      return { ok: true };
    } else if (proposal.type === 'smart_dca') {
      const dca = proposal.dcaPlan;
      const id = 'strat_dca_' + proposal.asset.toLowerCase() + '_' + Math.random().toString(36).substring(2, 7);
      const dcaStrategy: StrategyConfig = {
        id,
        asset: proposal.asset,
        kind: 'dca',
        name: `${proposal.asset} Smart Value-Weighted DCA`,
        enabled: true,
        maxAllocation: 0.35,
        cooldownSec: 86400,
        tradesExecuted: 0,
        totalPnl: 0,
        realizedPnl: 0,
        feesPaid: 0,
        winCount: 0,
        lossCount: 0,
        targetProfitPct: dca?.targetProfitPct || 8.0,
        trailingStopPct: dca?.trailingStopPct || 2.5,
        params: {
          dcaAmountUsd: dca?.baseAmountUsd || 200,
          oversoldMultiplier: dca?.oversoldMultiplier || 1.6,
          pauseThresholdRsi: dca?.pauseThresholdRsi || 70,
        },
      };

      setState((s) => ({
        ...s,
        strategies: [dcaStrategy, ...s.strategies],
      }));
      triggerToast('Smart DCA Activated', `Autonomous DCA bot deployed for ${proposal.asset} ($${dca?.baseAmountUsd || 200}/period).`, 'success');

      receipt = {
        receiptId: 'rcpt_' + Math.random().toString(36).substring(2, 8),
        actionType: 'smart_dca',
        title: `Smart DCA Activated: ${proposal.asset}`,
        summary: `Dynamic Value-Weighted DCA deployed. Accumulates $${dca?.baseAmountUsd}/period, scales up to 1.6x on oversold dips, and pauses during euphoric tops.`,
        executedAt: Date.now(),
        details: [
          `Asset: ${proposal.asset}`,
          `Base Budget: $${dca?.baseAmountUsd}/interval`,
          `Dip Multiplier: 1.6x (when RSI < 35)`,
          `Peak Protection: Pauses when RSI > 70`,
          `Profit Target: +${dca?.targetProfitPct}%`,
        ],
        badges: [
          { label: 'Automated', color: 'emerald' },
          { label: 'Dip Scaling', color: 'indigo' },
        ],
        jumpRoute: '/strategies',
        jumpLabel: 'View in Strategies Desk →',
      };

      setChatHistory((hist) =>
        hist.map((item) => {
          if (item.actionProposal && item.actionProposal.type === 'smart_dca' && !item.actionProposal.executionReceipt) {
            return {
              ...item,
              actionProposal: { ...item.actionProposal, executionReceipt: receipt },
            };
          }
          return item;
        })
      );
      return { ok: true };
    } else if (proposal.type === 'stress_test') {
      triggerToast('Stress Test Executed', `Shock analysis complete for ${proposal.stressTest?.title || 'Portfolio'}.`, 'info');

      receipt = {
        receiptId: 'rcpt_' + Math.random().toString(36).substring(2, 8),
        actionType: 'stress_test',
        title: `Stress Test Completed: ${proposal.stressTest?.title}`,
        summary: `Simulated impact on portfolio: -${proposal.stressTest?.simulatedDrawdownPct}% drawdown ($${proposal.stressTest?.simulatedLossUsd.toLocaleString()}). Survivability rating: ${proposal.stressTest?.survivabilityRating}.`,
        executedAt: Date.now(),
        details: [
          `Scenario: ${proposal.stressTest?.title}`,
          `Projected Drawdown: -${proposal.stressTest?.simulatedDrawdownPct}%`,
          `Simulated Dollar Loss: $${proposal.stressTest?.simulatedLossUsd.toLocaleString()}`,
          `Post-Shock Valuation: $${proposal.stressTest?.postShockPortfolioVal.toLocaleString()}`,
          `Cushion Rating: ${proposal.stressTest?.survivabilityRating} (${proposal.stressTest?.survivabilityScore}/100)`,
        ],
        badges: [
          { label: proposal.stressTest?.survivabilityRating || 'Audit Complete', color: 'amber' },
          { label: 'VaR 95%', color: 'indigo' },
        ],
        jumpRoute: '/portfolio',
        jumpLabel: 'View in Portfolio Desk →',
      };

      setChatHistory((hist) =>
        hist.map((item) => {
          if (item.actionProposal && item.actionProposal.type === 'stress_test' && !item.actionProposal.executionReceipt) {
            return {
              ...item,
              actionProposal: { ...item.actionProposal, executionReceipt: receipt },
            };
          }
          return item;
        })
      );
      return { ok: true };
    } else if (proposal.type === 'token_compare') {
      triggerToast('Alpha Radar Complete', `Peer alpha analysis completed.`, 'info');

      receipt = {
        receiptId: 'rcpt_' + Math.random().toString(36).substring(2, 8),
        actionType: 'token_compare',
        title: `Alpha Radar Analysis Complete`,
        summary: proposal.tokenComparison?.verdict || 'Cross-asset statistical evaluation finished.',
        executedAt: Date.now(),
        details: (proposal.tokenComparison?.tokens || []).map(
          (t: any) => `${t.asset}: Sharpe ${t.sharpeEstimate}, Vol ${t.volAnnualizedPct}%, Beta ${t.betaToBtc}`
        ),
        badges: [
          { label: `Top: ${proposal.tokenComparison?.topAlphaAsset || 'BTC'}`, color: 'emerald' },
          { label: 'Cross-Sectional', color: 'indigo' },
        ],
        jumpRoute: '/markets',
        jumpLabel: 'View in Markets Desk →',
      };

      setChatHistory((hist) =>
        hist.map((item) => {
          if (item.actionProposal && item.actionProposal.type === 'token_compare' && !item.actionProposal.executionReceipt) {
            return {
              ...item,
              actionProposal: { ...item.actionProposal, executionReceipt: receipt },
            };
          }
          return item;
        })
      );
      return { ok: true };
    }

    return { ok: false, error: 'Unknown proposal type' };
  }, [pendingAIProposal, pendingAIValidation, order, addAlert, triggerToast]);

  const rejectPendingAIProposal = useCallback(() => {
    setPendingAIProposal(null);
    setPendingAIValidation(null);
    triggerToast('AI Proposal Dismissed', 'No trades were authorized.', 'info');
  }, [triggerToast]);

  const executeActionProposal = useCallback(
    (proposal: any) => {
      requestExecuteAIProposal(proposal);
      return { ok: true };
    },
    [requestExecuteAIProposal]
  );

  const reset = useCallback(
    (startingCash = 50000, mode: SimulationMode = 'clean') => {
      const s = resetState(startingCash, mode);
      setState(s);
      setAi(null);
      setChatHistory([
        {
          role: 'assistant',
          text: `Fresh ${mode === 'clean' ? 'clean slate' : 'seeded'} paper simulation initialized with $${startingCash.toLocaleString()} starting cash. Technical indicators and safety gates are armed.`,
          engine: 'Deterministic Algorithmic Engine (Local Mode)',
        },
      ]);
      triggerToast('Simulation Reset', `Fresh balance of $${startingCash.toLocaleString()} allocated.`, 'info');
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
      currentDataSource,
      ai,
      aiLoading,
      chatHistory,
      chatLoading,
      chatOpen,
      prefilledChatPrompt,
      openChat,
      closeChat,
      activeToast,
      dismissToast,
      setSelectedAsset,
      setTimeframe,
      toggleWatch,
      order,
      cancelPendingOrder,
      toggleStrategy,
      updateStrategy,
      addStrategy,
      removeStrategy,
      resetStrategyMetrics,
      addAlert,
      toggleAlert,
      removeAlert,
      setSettings,
      refreshAI,
      sendChat,
      pendingAIProposal,
      pendingAIValidation,
      requestExecuteAIProposal,
      confirmPendingAIProposal,
      rejectPendingAIProposal,
      executeActionProposal,
      reset,
      refreshMarkets,
    }),
    [
      state,
      markets,
      loading,
      marketError,
      currentDataSource,
      ai,
      aiLoading,
      chatHistory,
      chatLoading,
      chatOpen,
      prefilledChatPrompt,
      openChat,
      closeChat,
      activeToast,
      dismissToast,
      setSelectedAsset,
      setTimeframe,
      toggleWatch,
      order,
      cancelPendingOrder,
      toggleStrategy,
      updateStrategy,
      addStrategy,
      removeStrategy,
      resetStrategyMetrics,
      addAlert,
      toggleAlert,
      removeAlert,
      setSettings,
      refreshAI,
      sendChat,
      pendingAIProposal,
      pendingAIValidation,
      requestExecuteAIProposal,
      confirmPendingAIProposal,
      rejectPendingAIProposal,
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
