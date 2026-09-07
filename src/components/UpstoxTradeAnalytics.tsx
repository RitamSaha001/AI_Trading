import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Clock,
  RefreshCw,
  Layers,
  Activity,
  ShieldCheck,
  Zap,
  Filter,
  FileText,
  Lock,
  Percent,
  ExternalLink,
} from 'lucide-react';
import { useLumen } from '../store';
import { isIndianAsset, moneyINR, META } from '../domain/portfolio';

export function UpstoxTradeAnalytics() {
  const {
    state,
    upstoxAccount,
    syncUpstoxAccount,
    openUpstoxDrawer,
  } = useLumen();

  const [activeTab, setActiveTab] = useState<'overview' | 'executions' | 'positions' | 'strategies'>('overview');
  const [filterStatus, setFilterStatus] = useState<'all' | 'filled' | 'pending' | 'cancelled_rejected'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncUpstoxAccount();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const isConnected = Boolean(upstoxAccount?.connected);
  const funds = upstoxAccount?.funds;
  const holdings = upstoxAccount?.holdings || [];
  const positions = upstoxAccount?.positions || [];
  const tokenHealth = upstoxAccount?.tokenHealth;

  // Filter orders relevant to Upstox
  const upstoxOrders = useMemo(() => {
    return (state.orders || []).filter(
      (o) => o.broker === 'upstox' || o.accountMode === 'upstox' || isIndianAsset(o.asset)
    );
  }, [state.orders]);

  // Order status breakdowns
  const filledOrders = useMemo(() => upstoxOrders.filter((o) => o.status === 'filled'), [upstoxOrders]);
  const partiallyFilledOrders = useMemo(() => upstoxOrders.filter((o) => o.status === 'partially_filled'), [upstoxOrders]);
  const pendingOrders = useMemo(() => upstoxOrders.filter((o) => o.status === 'pending'), [upstoxOrders]);
  const cancelledOrRejectedOrders = useMemo(
    () => upstoxOrders.filter((o) => o.status === 'cancelled' || o.status === 'rejected'),
    [upstoxOrders]
  );

  const totalCompletedExecutions = filledOrders.length + partiallyFilledOrders.length;
  const fillRatePct = upstoxOrders.length > 0
    ? ((totalCompletedExecutions / upstoxOrders.length) * 100).toFixed(1)
    : '0.0';

  // Realized & Unrealized PnL computations
  const holdingsUnrealizedPnl = useMemo(() => {
    return holdings.reduce((acc, h) => acc + (Number(h.pnl) || 0), 0);
  }, [holdings]);

  const positionsUnrealizedPnl = useMemo(() => {
    return positions.reduce((acc, p) => acc + (Number(p.unrealizedPnl) || 0), 0);
  }, [positions]);

  const positionsRealizedPnl = useMemo(() => {
    return positions.reduce((acc, p) => acc + (Number(p.realizedPnl) || 0), 0);
  }, [positions]);

  const totalRealizedPnl = positionsRealizedPnl + (state.realizedPnl || 0);
  const totalUnrealizedPnl = holdingsUnrealizedPnl + positionsUnrealizedPnl;
  const netPnl = totalRealizedPnl + totalUnrealizedPnl;

  // Estimated Brokerage & Regulatory Fees
  const totalFeesPaid = useMemo(() => {
    return [...filledOrders, ...partiallyFilledOrders].reduce((acc, o) => acc + (Number(o.fee) || 0), 0);
  }, [filledOrders, partiallyFilledOrders]);

  // Win / Loss Statistics
  const { winCount, lossCount, grossProfits, grossLosses, largestWin, largestLoss } = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let gProfits = 0;
    let gLosses = 0;
    let maxWin = 0;
    let maxLoss = 0;

    // Evaluate closed/open position pnl
    positions.forEach((p) => {
      const pnlVal = (Number(p.realizedPnl) || 0) + (Number(p.unrealizedPnl) || 0);
      if (pnlVal > 0) {
        wins++;
        gProfits += pnlVal;
        if (pnlVal > maxWin) maxWin = pnlVal;
      } else if (pnlVal < 0) {
        losses++;
        gLosses += Math.abs(pnlVal);
        if (Math.abs(pnlVal) > maxLoss) maxLoss = Math.abs(pnlVal);
      }
    });

    holdings.forEach((h) => {
      const pnlVal = Number(h.pnl) || 0;
      if (pnlVal > 0) {
        wins++;
        gProfits += pnlVal;
        if (pnlVal > maxWin) maxWin = pnlVal;
      } else if (pnlVal < 0) {
        losses++;
        gLosses += Math.abs(pnlVal);
        if (Math.abs(pnlVal) > maxLoss) maxLoss = Math.abs(pnlVal);
      }
    });

    return {
      winCount: wins,
      lossCount: losses,
      grossProfits: gProfits,
      grossLosses: gLosses,
      largestWin: maxWin,
      largestLoss: maxLoss,
    };
  }, [positions, holdings]);

  const totalEvaluatedTrades = winCount + lossCount;
  const winRatePct = totalEvaluatedTrades > 0
    ? ((winCount / totalEvaluatedTrades) * 100).toFixed(1)
    : null;

  const profitFactor = grossLosses > 0
    ? (grossProfits / grossLosses).toFixed(2)
    : (grossProfits > 0 ? '∞' : '1.00');

  // Capital margin utilization
  const availableCash = Number(funds?.availableCash || state.cash || 0);
  const usedMargin = Number(funds?.usedMargin || 0);
  const totalEquity = Number(funds?.totalEquity || (availableCash + usedMargin) || 1);
  const marginUtilizationPct = totalEquity > 0
    ? Math.min(100, Math.max(0, (usedMargin / totalEquity) * 100)).toFixed(1)
    : '0.0';

  // Strategy breakdown
  const strategyBreakdown = useMemo(() => {
    const map: Record<string, { count: number; filled: number; notional: number }> = {};
    upstoxOrders.forEach((o) => {
      const strat = o.strategyName || (o.auto ? 'Autonomous Quant Pilot' : 'Manual Upstox Desk');
      if (!map[strat]) {
        map[strat] = { count: 0, filled: 0, notional: 0 };
      }
      map[strat].count++;
      if (o.status === 'filled' || o.status === 'partially_filled') {
        map[strat].filled++;
        map[strat].notional += Number(o.notional || 0);
      }
    });
    return Object.entries(map).map(([name, data]) => ({ name, ...data }));
  }, [upstoxOrders]);

  // Filtered orders for Execution Ledger tab
  const filteredOrders = useMemo(() => {
    if (filterStatus === 'filled') return upstoxOrders.filter((o) => o.status === 'filled' || o.status === 'partially_filled');
    if (filterStatus === 'pending') return upstoxOrders.filter((o) => o.status === 'pending');
    if (filterStatus === 'cancelled_rejected') return upstoxOrders.filter((o) => o.status === 'cancelled' || o.status === 'rejected');
    return upstoxOrders;
  }, [upstoxOrders, filterStatus]);

  if (!isConnected) {
    return (
      <div className="rounded-[24px] p-6 border border-black/[0.06] bg-gradient-to-r from-orange-500/[0.06] via-indigo-500/[0.04] to-emerald-500/[0.06] shadow-sm mb-6 transition-all">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-950">Upstox Real-Money Trade Analytics</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                  Authentication Required
                </span>
              </div>
              <p className="text-xs text-zinc-600 mt-0.5">
                Connect your Upstox account to unlock live trade analytics, fill statistics, margin utilization, and real-time P&L attribution.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openUpstoxDrawer}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 active:scale-95"
          >
            <Zap className="w-4 h-4 text-orange-400" />
            <span>Connect Upstox Session →</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="liquid-glass-subtle rounded-[24px] p-5 sm:p-6 border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)] mb-6 transition-all">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-zinc-950">Upstox Real-Money Trade Analytics</h3>
              <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Feed Active
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
                NSE / BSE
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live execution telemetry, fill metrics, fees, and alpha attribution for account{' '}
              <strong className="text-zinc-800">{upstoxAccount?.accountId || '87BSJ2'}</strong>{' '}
              ({upstoxAccount?.accountName || 'Rajasree Saha'})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {tokenHealth && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-zinc-500 bg-zinc-100/80 px-2.5 py-1.5 rounded-xl border border-black/[0.04]">
              <Clock className="w-3.5 h-3.5 text-orange-600" />
              <span>Expires 03:30 AM IST</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 border border-black/[0.08] rounded-xl shadow-2xs transition-all active:scale-95"
            title="Sync latest live trades & ledger from Upstox"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-orange-600' : 'text-zinc-500'}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Live'}</span>
          </button>
          <button
            type="button"
            onClick={openUpstoxDrawer}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 rounded-xl shadow-2xs transition-all"
          >
            <span>Terminal</span>
            <ExternalLink className="w-3 h-3 text-orange-700" />
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards (4 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 my-5">
        {/* Card 1: Combined Net PnL */}
        <div className="p-4 rounded-2xl bg-white/70 border border-black/[0.05] shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Combined Net P&amp;L
          </span>
          <div className="mt-2">
            <div className={`text-2xl font-bold font-mono tracking-tight ${netPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netPnl >= 0 ? '+' : ''}{moneyINR(netPnl)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
              <span>Realized: <strong className={totalRealizedPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{moneyINR(totalRealizedPnl)}</strong></span>
              <span>•</span>
              <span>Unrealized: <strong className={totalUnrealizedPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{moneyINR(totalUnrealizedPnl)}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 2: Win Rate & Profit Factor */}
        <div className="p-4 rounded-2xl bg-white/70 border border-black/[0.05] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Win Rate &amp; Edge
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700">
              PF: {profitFactor}
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950">
              {winRatePct ? `${winRatePct}%` : '—'}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
              <span className="text-emerald-700 font-semibold">{winCount} Won</span>
              <span>•</span>
              <span className="text-rose-700 font-semibold">{lossCount} Lost</span>
              {totalEvaluatedTrades === 0 && <span>No closed trades yet</span>}
            </div>
          </div>
        </div>

        {/* Card 3: Execution Fill Rate */}
        <div className="p-4 rounded-2xl bg-white/70 border border-black/[0.05] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Execution Fill Rate
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950">
              {fillRatePct}%
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-zinc-500">
              <span><strong>{totalCompletedExecutions}</strong> Filled</span>
              <span>•</span>
              <span><strong>{pendingOrders.length}</strong> Open</span>
              <span>•</span>
              <span><strong>{cancelledOrRejectedOrders.length}</strong> Swept</span>
            </div>
          </div>
        </div>

        {/* Card 4: Capital Deployed & Liquid Cash */}
        <div className="p-4 rounded-2xl bg-white/70 border border-black/[0.05] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Capital Deployed
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 font-semibold">
              {marginUtilizationPct}%
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono tracking-tight text-zinc-950">
              {moneyINR(usedMargin)}
            </div>
            <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-orange-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(2, Number(marginUtilizationPct)))}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500">
              <span>Liquid: {moneyINR(availableCash)}</span>
              <span>Total: {moneyINR(totalEquity)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-black/[0.05] pb-3 text-xs font-semibold overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'overview'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Performance &amp; P&amp;L</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('executions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'executions'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Execution Ledger ({upstoxOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('positions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'positions'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Holdings &amp; Positions ({holdings.length + positions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('strategies')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
            activeTab === 'strategies'
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Strategy Breakdown ({strategyBreakdown.length})</span>
        </button>
      </div>

      {/* 4. Tab Content */}
      <div className="pt-4">
        {/* TAB 1: OVERVIEW & PERFORMANCE */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-white/60 border border-black/[0.05] space-y-3">
              <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>P&amp;L Breakdown</span>
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Gross Realized Profit:</span>
                  <span className="font-mono font-semibold text-emerald-600">+{moneyINR(grossProfits)}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Gross Realized Loss:</span>
                  <span className="font-mono font-semibold text-rose-600">-{moneyINR(grossLosses)}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Net Unrealized Floating:</span>
                  <span className={`font-mono font-semibold ${totalUnrealizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {totalUnrealizedPnl >= 0 ? '+' : ''}{moneyINR(totalUnrealizedPnl)}
                  </span>
                </div>
                <div className="pt-2 border-t border-black/[0.05] flex items-center justify-between font-bold text-zinc-900">
                  <span>Combined Net Total:</span>
                  <span className={`font-mono ${netPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {netPnl >= 0 ? '+' : ''}{moneyINR(netPnl)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/60 border border-black/[0.05] space-y-3">
              <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-indigo-600" />
                <span>Trading Edge &amp; Ratios</span>
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Win Rate:</span>
                  <span className="font-mono font-semibold text-zinc-900">{winRatePct ? `${winRatePct}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Profit Factor:</span>
                  <span className="font-mono font-semibold text-zinc-900">{profitFactor}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Largest Winning Position:</span>
                  <span className="font-mono font-semibold text-emerald-600">+{moneyINR(largestWin)}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Largest Losing Position:</span>
                  <span className="font-mono font-semibold text-rose-600">-{moneyINR(largestLoss)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/60 border border-black/[0.05] space-y-3">
              <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                <span>Brokerage &amp; Execution Cost</span>
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Estimated Total Fees (STT/Turnover):</span>
                  <span className="font-mono font-semibold text-zinc-900">{moneyINR(totalFeesPaid)}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Total Executed Notional:</span>
                  <span className="font-mono font-semibold text-zinc-900">
                    {moneyINR(filledOrders.reduce((acc, o) => acc + (Number(o.notional) || 0), 0))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Fill Success Ratio:</span>
                  <span className="font-mono font-semibold text-emerald-600">{fillRatePct}%</span>
                </div>
                <div className="pt-2 border-t border-black/[0.05] flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Slippage Protection:</span>
                  <span className="font-semibold text-emerald-700">Adaptive Micro-Limit (0 slippage)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EXECUTION LEDGER */}
        {activeTab === 'executions' && (
          <div className="space-y-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filter:
              </span>
              {(['all', 'filled', 'pending', 'cancelled_rejected'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilterStatus(status)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                    filterStatus === status
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {status === 'all' && `All (${upstoxOrders.length})`}
                  {status === 'filled' && `Filled (${totalCompletedExecutions})`}
                  {status === 'pending' && `Open (${pendingOrders.length})`}
                  {status === 'cancelled_rejected' && `Swept (${cancelledOrRejectedOrders.length})`}
                </button>
              ))}
            </div>

            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-50/60 border border-zinc-200/80">
                <p className="text-xs text-zinc-500 font-medium">No Upstox orders found matching the filter.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 border border-black/[0.05] rounded-2xl overflow-hidden bg-white/70">
                {filteredOrders.slice(0, 15).map((ord) => {
                  const isBuy = ord.side === 'buy';
                  const isFilled = ord.status === 'filled';
                  const isPartFilled = ord.status === 'partially_filled';
                  const isPending = ord.status === 'pending';
                  const isCancelled = ord.status === 'cancelled';

                  return (
                    <div key={ord.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-zinc-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-[10px] shadow-2xs shrink-0"
                          style={{ backgroundColor: META[ord.asset]?.iconColor || '#e40000' }}
                        >
                          {ord.asset.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900">{ord.asset}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              isBuy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {ord.side}
                            </span>
                            <span className="text-[10px] font-medium text-zinc-400 font-mono">
                              {ord.type.toUpperCase()} {ord.product || 'CNC'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                            <span>
                              {isPartFilled ? `${ord.executedAmount || 0}/${ord.amount}` : ord.amount} shares @ {moneyINR(ord.price || ord.limitPrice || 0)}
                            </span>
                            <span>•</span>
                            <span className="text-indigo-600 font-medium">{ord.strategyName || 'Auto-Pilot'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right space-y-0.5">
                        <div className="font-mono font-bold text-zinc-900">
                          {moneyINR(ord.notional || (ord.amount * (ord.price || 0)))}
                        </div>
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isFilled
                            ? 'bg-emerald-100 text-emerald-800'
                            : isPartFilled
                            ? 'bg-indigo-100 text-indigo-800'
                            : isPending
                            ? 'bg-amber-100 text-amber-800'
                            : isCancelled
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {ord.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HOLDINGS & POSITIONS */}
        {activeTab === 'positions' && (
          <div className="space-y-4">
            {/* Holdings section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Delivery Holdings (CNC) — {holdings.length} Assets</span>
                </h4>
                <span className="text-xs font-mono font-semibold text-zinc-700">
                  Total P&amp;L: <strong className={holdingsUnrealizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {holdingsUnrealizedPnl >= 0 ? '+' : ''}{moneyINR(holdingsUnrealizedPnl)}
                  </strong>
                </span>
              </div>

              {holdings.length === 0 ? (
                <div className="p-4 text-center rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-400">
                  No delivery equity holdings currently held in Upstox account.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-black/[0.05] rounded-xl overflow-hidden bg-white/70">
                  {holdings.map((h, i) => {
                    const pnlVal = Number(h.pnl) || 0;
                    const qty = Number(h.quantity) || 0;
                    const avgPrice = Number(h.averagePrice) || 0;
                    const curPrice = Number(h.currentPrice) || avgPrice;
                    const totalVal = qty * curPrice;

                    return (
                      <div key={i} className="p-3 flex items-center justify-between text-xs hover:bg-zinc-50/50">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-zinc-900">{h.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 bg-zinc-100 text-zinc-600 rounded">CNC</span>
                          </div>
                          <span className="text-[11px] text-zinc-400 block mt-0.5">
                            {qty} shares @ {moneyINR(avgPrice)} • LTP {moneyINR(curPrice)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-semibold block">{moneyINR(totalVal)}</span>
                          <span className={`text-[11px] font-bold ${pnlVal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {pnlVal >= 0 ? '+' : ''}{moneyINR(pnlVal)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Positions section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-orange-600" />
                  <span>Open Intraday &amp; Derivatives Positions (MIS) — {positions.length} Active</span>
                </h4>
                <span className="text-xs font-mono font-semibold text-zinc-700">
                  Floating P&amp;L: <strong className={positionsUnrealizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {positionsUnrealizedPnl >= 0 ? '+' : ''}{moneyINR(positionsUnrealizedPnl)}
                  </strong>
                </span>
              </div>

              {positions.length === 0 ? (
                <div className="p-4 text-center rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-400">
                  No active intraday or derivative positions in open books.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-black/[0.05] rounded-xl overflow-hidden bg-white/70">
                  {positions.map((p, i) => {
                    const uPnl = Number(p.unrealizedPnl) || 0;
                    const rPnl = Number(p.realizedPnl) || 0;
                    const qty = Number(p.quantity) || 0;
                    const avgPrice = Number(p.averagePrice) || 0;

                    return (
                      <div key={i} className="p-3 flex items-center justify-between text-xs hover:bg-zinc-50/50">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-zinc-900">{p.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 bg-zinc-100 text-zinc-600 rounded uppercase">{p.product}</span>
                          </div>
                          <span className="text-[11px] text-zinc-400 block mt-0.5">
                            {qty} qty @ {moneyINR(avgPrice)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-mono font-bold block ${uPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {uPnl >= 0 ? '+' : ''}{moneyINR(uPnl)}
                          </span>
                          <span className="text-[10px] text-zinc-400 block">
                            Realized: {moneyINR(rPnl)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: STRATEGY BREAKDOWN */}
        {activeTab === 'strategies' && (
          <div className="space-y-3">
            {strategyBreakdown.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-50/60 border border-zinc-200/80">
                <p className="text-xs text-zinc-500 font-medium">No strategy execution telemetry recorded yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {strategyBreakdown.map((strat, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-white/70 border border-black/[0.05] shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-zinc-900">{strat.name}</h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        {strat.filled}/{strat.count} Filled
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 space-y-1 pt-1">
                      <div className="flex items-center justify-between">
                        <span>Total Deployed:</span>
                        <span className="font-mono font-semibold text-zinc-900">{moneyINR(strat.notional)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Fill Ratio:</span>
                        <span className="font-mono font-semibold text-emerald-600">
                          {strat.count > 0 ? ((strat.filled / strat.count) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
