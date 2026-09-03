import React, { useState } from 'react';
import { useLumen } from './store';
import { ASSETS, Asset, Timeframe, Side, OrderType, StrategyKind } from './types';
import { LineChart, Sparkline } from './Chart';
import { MarketHeatmap } from './components/MarketHeatmap';
import {
  indicators,
  money,
  portfolioValue,
  positionValue,
  positionPnl,
  totalPortfolioPnl,
  calculatePortfolioRisk,
  formatQty,
  META,
} from './trading';
import { go } from './Shell';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Zap,
  Sliders,
  Bell,
  RefreshCw,
  Search,
  CheckCircle2,
  DollarSign,
  PieChart,
  Activity,
  ArrowRight,
  Filter,
  Plus,
  Trash2,
} from 'lucide-react';

function GlassCard({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`bg-white/80 backdrop-blur-xl border border-black/[0.06] rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all ${className}`}
    >
      {children}
    </div>
  );
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">{title}</h1>
        <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ----------------------------------------------------
// DASHBOARD
// ----------------------------------------------------
export function Dashboard() {
  const {
    state,
    markets,
    marketError,
    setSelectedAsset,
    setTimeframe,
    ai,
    aiLoading,
    refreshAI,
    executeActionProposal,
    order,
  } = useLumen();

  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);
  const riskProfile = calculatePortfolioRisk(state, markets);
  const selectedAsset = state.selectedAsset;
  const m = markets[selectedAsset];
  const ind = m ? indicators(m.history) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title="Algorithmic Trading Dashboard"
        subtitle="Live cryptocurrency market streams, quantitative risk controls, and automated paper execution."
        action={
          <button
            type="button"
            onClick={refreshAI}
            disabled={aiLoading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white/80 hover:bg-white border border-black/[0.08] rounded-xl shadow-xs transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin text-indigo-600' : 'text-zinc-500'}`} />
            <span>{aiLoading ? 'Analyzing Indicators...' : 'Refresh Technical Intelligence'}</span>
          </button>
        }
      />

      {marketError && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>{marketError}</span>
        </div>
      )}

      {/* Top Portfolio Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Net Worth */}
        <GlassCard className="flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-500">Total Paper Portfolio</span>
            <div className="text-3xl font-bold font-mono tracking-tight text-zinc-950 mt-1">
              {money(pv)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  pnl.amount >= 0 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
                }`}
              >
                {pnl.amount >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {pnl.amount >= 0 ? '+' : ''}
                {pnl.pct.toFixed(2)}% ({money(pnl.amount)})
              </span>
              <span className="text-[11px] text-zinc-400">All-time P&amp;L</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-black/[0.05] flex items-center justify-between text-xs text-zinc-500">
            <span>Liquid Cash: {money(state.cash)}</span>
            <span className="font-medium text-zinc-800">
              {((state.cash / Math.max(pv, 1)) * 100).toFixed(1)}% Liquid
            </span>
          </div>
        </GlassCard>

        {/* Risk & Exposure Meter */}
        <GlassCard className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Portfolio Risk Score</span>
              <Shield className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <div className="text-3xl font-bold font-mono tracking-tight text-zinc-950">
                {riskProfile.portfolioRiskScore}
              </div>
              <span
                className={`text-xs font-semibold ${
                  riskProfile.portfolioRiskScore >= 70
                    ? 'text-rose-600'
                    : riskProfile.portfolioRiskScore >= 40
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                {riskProfile.riskLabel}
              </span>
            </div>
            {/* Risk Bar */}
            <div className="w-full h-2 bg-black/[0.05] rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(98, Math.max(5, riskProfile.portfolioRiskScore))}%` }}
              />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-black/[0.05] flex items-center justify-between text-xs text-zinc-500">
            <span>
              Top: {riskProfile.topAsset || 'None'} ({riskProfile.topAssetConcentrationPct.toFixed(0)}%)
            </span>
            <button type="button" onClick={() => go('/portfolio')} className="text-indigo-600 hover:underline font-medium">
              View Allocations →
            </button>
          </div>
        </GlassCard>

        {/* Algorithmic Execution Engine */}
        <GlassCard className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Algorithmic Engine</span>
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-3xl font-bold font-mono tracking-tight text-zinc-950 mt-1">
              {state.strategies.filter((s) => s.enabled).length}{' '}
              <span className="text-sm font-normal text-zinc-400">/ {state.strategies.length} active</span>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Momentum Crossover, Mean Reversion &amp; DCA automation monitoring live ticks.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-black/[0.05] flex items-center justify-between text-xs">
            <span className="text-emerald-600 font-medium">● Auto-trading online</span>
            <button type="button" onClick={() => go('/strategies')} className="text-indigo-600 hover:underline font-medium">
              Manage Rules →
            </button>
          </div>
        </GlassCard>
      </div>

      {/* Watchlist Tickers Carousel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">Watchlist &amp; Market Stream</h2>
          <button type="button" onClick={() => go('/markets')} className="text-xs text-indigo-600 hover:underline font-medium">
            All Markets ({ASSETS.length}) →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {state.watchlist.map((a) => {
            const item = markets[a];
            const isSelected = a === selectedAsset;
            const isPositive = (item?.change24h || 0) >= 0;

            return (
              <button
                key={a}
                type="button"
                onClick={() => setSelectedAsset(a)}
                className={`p-4 rounded-2xl text-left border transition-all ${
                  isSelected
                    ? 'bg-white border-zinc-900 shadow-md ring-1 ring-zinc-900'
                    : 'bg-white/60 hover:bg-white border-black/[0.06] shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-zinc-900">{a}</span>
                    <span className="text-[10px] text-zinc-400 truncate max-w-[60px]">{META[a]?.name}</span>
                  </div>
                  <span
                    className={`text-[11px] font-semibold ${
                      isPositive ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {item ? item.change24h.toFixed(2) : '0.00'}%
                  </span>
                </div>
                <div className="text-base font-bold font-mono text-zinc-950">
                  {item ? money(item.price) : 'Loading...'}
                </div>
                <div className="mt-2 h-6">
                  {item && <Sparkline data={item.history.slice(-20)} positive={isPositive} height={24} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Terminal Split: Interactive Chart + AI Insight Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Terminal (2 Cols) */}
        <GlassCard className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-black/[0.04]">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm"
                style={{ backgroundColor: META[selectedAsset]?.iconColor || '#333' }}
              >
                {selectedAsset}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-zinc-950">
                    {META[selectedAsset]?.name} ({selectedAsset}/USD)
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] text-zinc-500 font-medium">
                    {m?.source || 'Exchange'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold font-mono text-zinc-950">
                    {m ? money(m.price) : '—'}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      (m?.change24h || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {(m?.change24h || 0) >= 0 ? '+' : ''}
                    {m ? m.change24h.toFixed(2) : '0.00'}% 24h
                  </span>
                </div>
              </div>
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center p-1 rounded-xl bg-black/[0.03] border border-black/[0.04] self-start sm:self-auto">
              {(['1H', '1D', '1W', '1M', '1Y'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                    state.timeframe === tf
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Chart */}
          <div className="pt-2">
            <LineChart
              data={m?.history || []}
              candles={m?.candles || []}
              height={290}
              positive={(m?.change24h || 0) >= 0}
            />
          </div>

          {/* 24h High/Low/Vol Range */}
          <div className="pt-4 border-t border-black/[0.04] grid grid-cols-3 gap-4 text-center">
            <div className="p-2.5 rounded-2xl bg-black/[0.02]">
              <span className="text-[11px] text-zinc-400 block">24h High</span>
              <strong className="text-xs font-mono font-semibold text-zinc-800">
                {m ? money(m.high24h) : '—'}
              </strong>
            </div>
            <div className="p-2.5 rounded-2xl bg-black/[0.02]">
              <span className="text-[11px] text-zinc-400 block">24h Low</span>
              <strong className="text-xs font-mono font-semibold text-zinc-800">
                {m ? money(m.low24h) : '—'}
              </strong>
            </div>
            <div className="p-2.5 rounded-2xl bg-black/[0.02]">
              <span className="text-[11px] text-zinc-400 block">24h Volume</span>
              <strong className="text-xs font-mono font-semibold text-zinc-800">
                {m ? money(m.volume24h, 0, 0) : '—'}
              </strong>
            </div>
          </div>
        </GlassCard>

        {/* AI Quantitative Intelligence Card (1 Col) */}
        <GlassCard className="flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.05]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900">AI Signal Analysis</h4>
                  <span className="text-[10px] text-zinc-400">{ai?.engine || 'Quantitative Heuristic'}</span>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  ai?.direction === 'bullish'
                    ? 'bg-emerald-500/15 text-emerald-700'
                    : ai?.direction === 'bearish'
                    ? 'bg-rose-500/15 text-rose-700'
                    : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {ai?.direction || 'NEUTRAL'}
              </span>
            </div>

            {/* Confidence Gauge */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-500">Model Conviction</span>
                <span className="font-bold text-zinc-900 font-mono">{ai?.confidence || 68}%</span>
              </div>
              <div className="w-full h-2 bg-black/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
                  style={{ width: `${ai?.confidence || 68}%` }}
                />
              </div>
            </div>

            {/* Technical Confluence Signals */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Confluence Indicators
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(ai?.signals || [
                  { label: 'Momentum', value: ind?.s10 && ind?.s30 && ind.s10 > ind.s30 ? 'Bullish' : 'Neutral' },
                  { label: 'RSI (14)', value: ind?.rsi ? `${ind.rsi.toFixed(1)}` : '50.0' },
                  { label: '24h Variance', value: m ? `${m.change24h.toFixed(2)}%` : '0.0%' },
                  { label: 'Volatility', value: ind ? `${(ind.vol * 100).toFixed(2)}%` : '1.8%' },
                ]).map((s: any, idx: number) => (
                  <div key={idx} className="p-2 rounded-xl bg-black/[0.02] border border-black/[0.04]">
                    <span className="text-[10px] text-zinc-400 block">{s.label}</span>
                    <strong className="text-xs font-semibold text-zinc-800 truncate block">{s.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Quantitative Rationale */}
            <div className="p-3 rounded-2xl bg-indigo-500/[0.04] border border-indigo-500/15">
              <p className="text-xs leading-relaxed text-zinc-700">
                {ai?.rationale || 'Synthesizing moving average crossovers, RSI momentum, and price volatility...'}
              </p>
            </div>
          </div>

          {/* Safety Gate Execution Proposal */}
          <div className="pt-2 border-t border-black/[0.04] space-y-2">
            {ai?.proposals?.[0] ? (
              <button
                type="button"
                onClick={() => executeActionProposal(ai.proposals[0])}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span>Review in AI Safety Gate ({ai.proposals[0].type})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => go('/orders')}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Trade {selectedAsset} Now</span>
              </button>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Quick Launchpad Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => go('/orders')}
          className="p-4 rounded-2xl bg-white/70 hover:bg-white border border-black/[0.06] text-left transition-all hover:shadow-md group"
        >
          <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <DollarSign className="w-4 h-4" />
          </div>
          <strong className="text-xs font-bold text-zinc-900 block">Paper Trading Terminal</strong>
          <span className="text-[11px] text-zinc-500">Market &amp; limit execution with stop-loss</span>
        </button>

        <button
          type="button"
          onClick={() => go('/strategies')}
          className="p-4 rounded-2xl bg-white/70 hover:bg-white border border-black/[0.06] text-left transition-all hover:shadow-md group"
        >
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Sliders className="w-4 h-4" />
          </div>
          <strong className="text-xs font-bold text-zinc-900 block">Algorithmic Suite</strong>
          <span className="text-[11px] text-zinc-500">Configure trend following &amp; DCA rules</span>
        </button>

        <button
          type="button"
          onClick={() => go('/alerts')}
          className="p-4 rounded-2xl bg-white/70 hover:bg-white border border-black/[0.06] text-left transition-all hover:shadow-md group"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <Bell className="w-4 h-4" />
          </div>
          <strong className="text-xs font-bold text-zinc-900 block">Threshold Alerts</strong>
          <span className="text-[11px] text-zinc-500">Proximity gauges &amp; acoustic triggers</span>
        </button>

        <button
          type="button"
          onClick={() => go('/portfolio')}
          className="p-4 rounded-2xl bg-white/70 hover:bg-white border border-black/[0.06] text-left transition-all hover:shadow-md group"
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
            <PieChart className="w-4 h-4" />
          </div>
          <strong className="text-xs font-bold text-zinc-900 block">Exposure Analytics</strong>
          <span className="text-[11px] text-zinc-500">Position weighting &amp; P&amp;L breakdown</span>
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// MARKETS
// ----------------------------------------------------
export function Markets() {
  const { state, markets, loading, setSelectedAsset, toggleWatch, refreshMarkets } = useLumen();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'price' | 'change' | 'name'>('change');

  const filtered = ASSETS.filter((a) => {
    const m = markets[a];
    const q = query.toLowerCase();
    return a.toLowerCase().includes(q) || (m?.name && m.name.toLowerCase().includes(q));
  }).sort((a, b) => {
    const ma = markets[a];
    const mb = markets[b];
    if (sortKey === 'price') return (mb?.price || 0) - (ma?.price || 0);
    if (sortKey === 'change') return (mb?.change24h || 0) - (ma?.change24h || 0);
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Cryptocurrency Markets"
        subtitle="Live prices streamed from institutional public gateways with sub-second recalculation."
        action={
          <button
            type="button"
            onClick={refreshMarkets}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-800 bg-white border border-black/[0.08] rounded-xl shadow-xs hover:bg-black/[0.02]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh Quotes'}</span>
          </button>
        }
      />

      {/* Real-time Performance Heatmap */}
      <MarketHeatmap />

      {/* Filter and Sort Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/70 border border-black/[0.06] backdrop-blur-md">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or name..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
          <span className="text-zinc-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Sort:
          </span>
          <button
            type="button"
            onClick={() => setSortKey('change')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
              sortKey === 'change' ? 'bg-black text-white shadow-xs' : 'text-zinc-600 hover:bg-black/[0.04]'
            }`}
          >
            24h Gainers/Losers
          </button>
          <button
            type="button"
            onClick={() => setSortKey('price')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
              sortKey === 'price' ? 'bg-black text-white shadow-xs' : 'text-zinc-600 hover:bg-black/[0.04]'
            }`}
          >
            Highest Price
          </button>
        </div>
      </div>

      {/* Asset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filtered.map((a) => {
          const m = markets[a];
          const isWatched = state.watchlist.includes(a);
          const isUp = (m?.change24h || 0) >= 0;
          const meta = META[a];

          return (
            <GlassCard key={a} className="flex flex-col justify-between hover:shadow-lg transition-all">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-xs"
                      style={{ backgroundColor: meta?.iconColor || '#222' }}
                    >
                      {a}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-zinc-900">{a}</h3>
                      <span className="text-[11px] text-zinc-400">{meta?.name}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleWatch(a)}
                    className={`p-1.5 rounded-xl transition-all ${
                      isWatched ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-300 hover:text-zinc-600'
                    }`}
                    title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  >
                    ★
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-xl font-bold font-mono tracking-tight text-zinc-950">
                    {m ? money(m.price) : 'Loading...'}
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 text-xs font-semibold mt-1 ${
                      isUp ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {isUp ? '+' : ''}
                    {m ? m.change24h.toFixed(2) : '0.00'}% 24h
                  </div>
                </div>

                <div className="mt-3 h-10">
                  {m && <Sparkline data={m.history.slice(-24)} positive={isUp} height={36} />}
                </div>

                {/* 24h Range Indicator */}
                {m && (
                  <div className="mt-4 pt-3 border-t border-black/[0.04] space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>L: {money(m.low24h)}</span>
                      <span>H: {money(m.high24h)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{
                          width: `${Math.max(
                            5,
                            Math.min(
                              100,
                              ((m.price - m.low24h) / Math.max(m.high24h - m.low24h, 1e-6)) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-black/[0.05] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAsset(a);
                    go('/');
                  }}
                  className="flex-1 py-1.5 px-3 text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-black/[0.04] rounded-xl transition-all text-center"
                >
                  Analyze
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAsset(a);
                    go('/orders');
                  }}
                  className="py-1.5 px-3.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-all shadow-xs"
                >
                  Trade
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// PORTFOLIO
// ----------------------------------------------------
export function Portfolio() {
  const { state, markets } = useLumen();
  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);
  const riskProfile = calculatePortfolioRisk(state, markets);

  const activeHoldings = ASSETS.filter((a) => (state.positions[a] || 0) > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Portfolio Analytics"
        subtitle="Live balance distribution, cost-basis calculations, fees, and mark-to-market valuations."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <GlassCard>
          <span className="text-xs font-medium text-zinc-500">Net Portfolio Value</span>
          <div className="text-2xl font-bold font-mono text-zinc-950 mt-1">{money(pv)}</div>
          <span
            className={`text-xs font-semibold mt-1 inline-block ${
              pnl.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {pnl.amount >= 0 ? '+' : ''}
            {pnl.pct.toFixed(2)}% total return
          </span>
        </GlassCard>

        <GlassCard>
          <span className="text-xs font-medium text-zinc-500">Realized P&amp;L</span>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${
              state.realizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {state.realizedPnl >= 0 ? '+' : ''}
            {money(state.realizedPnl)}
          </div>
          <span className="text-xs text-zinc-500 mt-1 inline-block">
            Fees Paid: {money(state.totalFees || 0)}
          </span>
        </GlassCard>

        <GlassCard>
          <span className="text-xs font-medium text-zinc-500">Liquid Cash</span>
          <div className="text-2xl font-bold font-mono text-zinc-950 mt-1">{money(state.cash)}</div>
          <span className="text-xs text-zinc-500 mt-1 inline-block">
            {((state.cash / Math.max(pv, 1)) * 100).toFixed(1)}% of total capital
          </span>
        </GlassCard>

        <GlassCard>
          <span className="text-xs font-medium text-zinc-500">Risk Profile</span>
          <div className="text-2xl font-bold font-mono text-zinc-950 mt-1">
            {riskProfile.portfolioRiskScore} <span className="text-sm font-normal text-zinc-400">/ 100</span>
          </div>
          <span
            className={`text-xs font-semibold mt-1 inline-block ${
              riskProfile.portfolioRiskScore >= 70
                ? 'text-rose-600'
                : riskProfile.portfolioRiskScore >= 40
                ? 'text-amber-600'
                : 'text-emerald-600'
            }`}
          >
            {riskProfile.riskLabel} ({riskProfile.topAsset || 'None'} {riskProfile.topAssetConcentrationPct.toFixed(0)}%)
          </span>
        </GlassCard>
      </div>

      {/* Asset Allocation Bar */}
      <GlassCard className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-800">
          <span>Capital Allocation Breakdown</span>
          <span>Cash: {((state.cash / Math.max(pv, 1)) * 100).toFixed(1)}%</span>
        </div>
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-black/[0.04]">
          {/* Cash slice */}
          <div
            className="h-full bg-zinc-300"
            style={{ width: `${(state.cash / Math.max(pv, 1)) * 100}%` }}
            title={`Cash: ${money(state.cash)}`}
          />
          {activeHoldings.map((a) => {
            const val = (state.positions[a] || 0) * (markets[a]?.price || 0);
            const pct = (val / Math.max(pv, 1)) * 100;
            return (
              <div
                key={a}
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: META[a]?.iconColor || '#4f46e5',
                }}
                title={`${a}: ${pct.toFixed(1)}% (${money(val)})`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
            <span className="text-zinc-600">Cash ({((state.cash / Math.max(pv, 1)) * 100).toFixed(1)}%)</span>
          </div>
          {activeHoldings.map((a) => {
            const val = (state.positions[a] || 0) * (markets[a]?.price || 0);
            const pct = (val / Math.max(pv, 1)) * 100;
            return (
              <div key={a} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: META[a]?.iconColor || '#4f46e5' }}
                />
                <span className="text-zinc-600">
                  {a} ({pct.toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Positions Table */}
      <GlassCard className="overflow-hidden p-0">
        <div className="p-5 border-b border-black/[0.05] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Positions &amp; Unrealized P&amp;L</h3>
            <p className="text-xs text-zinc-500">Continuous mark-to-market using current live ask quotes.</p>
          </div>
          <button
            type="button"
            onClick={() => go('/orders')}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-all shadow-xs"
          >
            + New Order
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/[0.02] text-zinc-500 font-semibold border-b border-black/[0.04]">
              <tr>
                <th className="px-6 py-3.5">Asset</th>
                <th className="px-6 py-3.5">Units</th>
                <th className="px-6 py-3.5">Avg Cost</th>
                <th className="px-6 py-3.5">Price</th>
                <th className="px-6 py-3.5">Total Value</th>
                <th className="px-6 py-3.5">Allocation</th>
                <th className="px-6 py-3.5">Unrealized P&amp;L</th>
                <th className="px-6 py-3.5 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {ASSETS.map((a) => {
                const qty = state.positions[a] || 0;
                const m = markets[a];
                const val = qty * (m?.price || 0);
                const alloc = pv > 0 ? (val / pv) * 100 : 0;
                const pnlInfo = positionPnl(state, markets, a);
                const avgCost = state.avgBuyPrice?.[a];

                return (
                  <tr key={a} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-xs"
                          style={{ backgroundColor: META[a]?.iconColor || '#333' }}
                        >
                          {a}
                        </div>
                        <div>
                          <span className="font-bold text-zinc-900 block">{a}</span>
                          <span className="text-[11px] text-zinc-400">{META[a]?.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-zinc-800">
                      {formatQty(qty, a)}
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-500">
                      {qty > 0 && avgCost ? money(avgCost) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-600">
                      {m ? money(m.price) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold text-zinc-900">
                      {money(val)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-600">{alloc.toFixed(1)}%</span>
                        <div className="w-16 h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-800 rounded-full" style={{ width: `${Math.min(100, alloc * 3)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {qty > 0 ? (
                        <span
                          className={`font-semibold font-mono ${
                            pnlInfo.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {pnlInfo.amount >= 0 ? '+' : ''}
                          {money(pnlInfo.amount)} ({pnlInfo.pct.toFixed(2)}%)
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => go('/orders')}
                        className="px-3 py-1 text-xs font-semibold text-zinc-700 hover:text-zinc-950 hover:bg-black/[0.05] rounded-lg transition-all"
                      >
                        Trade {a}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

// ----------------------------------------------------
// ORDERS & EXECUTION
// ----------------------------------------------------
export function Orders() {
  const { state, markets, order, cancelPendingOrder } = useLumen();
  const [selectedAsset, setSelectedAsset] = useState<Asset>(state.selectedAsset);
  const [side, setSide] = useState<Side>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [amountStr, setAmountStr] = useState('0.1');
  const [limitPriceStr, setLimitPriceStr] = useState('');
  const [takeProfitStr, setTakeProfitStr] = useState('');
  const [stopLossStr, setStopLossStr] = useState('');
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'filled' | 'buy' | 'sell'>('all');

  const m = markets[selectedAsset];
  const currentHolding = state.positions[selectedAsset] || 0;
  const numAmount = Math.max(0, Number(amountStr) || 0);
  const estPrice = orderType === 'limit' && limitPriceStr ? Number(limitPriceStr) : (m?.price || 0);
  const estTotal = numAmount * estPrice;
  const estFee = estTotal * 0.0008;

  const handleQuickPercent = (pct: number) => {
    if (!estPrice) return;
    if (side === 'buy') {
      const budget = (state.cash * pct) / 100;
      const qty = budget / (estPrice * 1.001);
      setAmountStr(qty > 0 ? qty.toFixed(META[selectedAsset]?.decimals || 4) : '0');
    } else {
      const qty = (currentHolding * pct) / 100;
      setAmountStr(qty.toFixed(META[selectedAsset]?.decimals || 4));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    order(side, selectedAsset, numAmount, {
      type: orderType,
      limitPrice: orderType === 'limit' && limitPriceStr ? Number(limitPriceStr) : undefined,
      takeProfit: takeProfitStr ? Number(takeProfitStr) : undefined,
      stopLoss: stopLossStr ? Number(stopLossStr) : undefined,
    });
  };

  const filteredOrders = state.orders.filter((o) => {
    if (orderFilter === 'pending') return o.status === 'pending';
    if (orderFilter === 'filled') return o.status === 'filled' || !o.status;
    if (orderFilter === 'buy') return o.side === 'buy';
    if (orderFilter === 'sell') return o.side === 'sell';
    return true;
  });

  const pendingCount = state.orders.filter((o) => o.status === 'pending').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Paper Trading Terminal"
        subtitle="Deterministic paper execution engine modeling realistic liquidity slippage and taker fees."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Ticket (1 Col) */}
        <GlassCard className="space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.05]">
            <h3 className="text-sm font-bold text-zinc-900">Execution Ticket</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-semibold">
              Paper Mode
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Buy / Sell Tabs */}
            <div className="grid grid-cols-2 p-1 rounded-2xl bg-black/[0.04] border border-black/[0.04]">
              <button
                type="button"
                onClick={() => setSide('buy')}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  side === 'buy'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Buy (Long)
              </button>
              <button
                type="button"
                onClick={() => setSide('sell')}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  side === 'sell'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Sell (Short/Close)
              </button>
            </div>

            {/* Asset Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Contract / Asset</label>
              <select
                value={selectedAsset}
                onChange={(e) => {
                  const a = e.target.value as Asset;
                  setSelectedAsset(a);
                  if (markets[a]) setLimitPriceStr(markets[a].price.toFixed(2));
                }}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 font-medium"
              >
                {ASSETS.map((x) => (
                  <option key={x} value={x}>
                    {x} — {META[x]?.name} ({money(markets[x]?.price || 0)})
                  </option>
                ))}
              </select>
            </div>

            {/* Order Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Order Style</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderType('market')}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    orderType === 'market'
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white text-zinc-700 border-black/[0.08] hover:bg-black/[0.02]'
                  }`}
                >
                  Market (Instant)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderType('limit');
                    if (!limitPriceStr && m) setLimitPriceStr(m.price.toFixed(2));
                  }}
                  className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                    orderType === 'limit'
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white text-zinc-700 border-black/[0.08] hover:bg-black/[0.02]'
                  }`}
                >
                  Limit Order
                </button>
              </div>
            </div>

            {/* Limit Price Input if limit order */}
            {orderType === 'limit' && (
              <div className="space-y-1.5 p-3 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/15">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-indigo-950">Limit Target Price ($)</label>
                  <span className="text-zinc-500 text-[11px]">Mark: {money(m?.price || 0)}</span>
                </div>
                <input
                  type="number"
                  step="any"
                  value={limitPriceStr}
                  onChange={(e) => setLimitPriceStr(e.target.value)}
                  placeholder={m ? m.price.toFixed(2) : '0.00'}
                  className="w-full px-3.5 py-2 text-xs font-mono font-semibold bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 text-zinc-900"
                />
                <p className="text-[10px] text-zinc-500">
                  {side === 'buy' ? 'Executes when price drops to or below target.' : 'Executes when price rises to or above target.'}
                </p>
              </div>
            )}

            {/* Trade Amount */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-zinc-700">Quantity ({selectedAsset})</label>
                <span className="text-zinc-500">
                  {side === 'buy'
                    ? `Avail: ${money(state.cash)}`
                    : `Holding: ${formatQty(currentHolding, selectedAsset)}`}
                </span>
              </div>
              <input
                type="number"
                step="any"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 text-xs font-mono font-semibold bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900"
              />

              {/* Quick % buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleQuickPercent(pct)}
                    className="py-1 text-[11px] font-medium text-zinc-600 bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-all"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Take Profit / Stop Loss */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500">Take Profit ($)</label>
                <input
                  type="number"
                  step="any"
                  value={takeProfitStr}
                  onChange={(e) => setTakeProfitStr(e.target.value)}
                  placeholder={m ? (m.price * 1.05).toFixed(2) : ''}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-black/[0.08] rounded-xl outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500">Stop Loss ($)</label>
                <input
                  type="number"
                  step="any"
                  value={stopLossStr}
                  onChange={(e) => setStopLossStr(e.target.value)}
                  placeholder={m ? (m.price * 0.95).toFixed(2) : ''}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-black/[0.08] rounded-xl outline-none"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.04] space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-500">
                <span>Indicative Price:</span>
                <span className="font-mono font-medium text-zinc-900">{money(estPrice)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Paper Fee (0.08%):</span>
                <span className="font-mono text-zinc-700">{money(estFee)}</span>
              </div>
              <div className="flex justify-between font-bold text-zinc-950 pt-1 border-t border-black/[0.04]">
                <span>Estimated Notional:</span>
                <span className="font-mono">{money(estTotal + (side === 'buy' ? estFee : -estFee))}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={numAmount <= 0}
              className={`w-full py-3 px-4 text-xs font-bold text-white rounded-xl shadow-md transition-all ${
                side === 'buy'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
              }`}
            >
              Submit {orderType.toUpperCase()} {side.toUpperCase()} Order
            </button>
          </form>
        </GlassCard>

        {/* Execution Log & Orders */}
        <GlassCard className="lg:col-span-2 overflow-hidden p-0 flex flex-col">
          <div className="p-5 border-b border-black/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Execution Audit Log</h3>
              <p className="text-xs text-zinc-500">Complete transaction history with timestamped fills and fees.</p>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/[0.03]">
              {(['all', 'pending', 'filled', 'buy', 'sell'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOrderFilter(f)}
                  className={`px-3 py-1 text-xs font-semibold capitalize rounded-lg transition-all ${
                    orderFilter === f ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {f}
                  {f === 'pending' && pendingCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px]">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-black/[0.02] text-zinc-500 font-semibold border-b border-black/[0.04] sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Side</th>
                  <th className="px-5 py-3">Asset</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Fill/Target</th>
                  <th className="px-5 py-3">Notional</th>
                  <th className="px-5 py-3">Fee</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-5 py-3.5 text-zinc-400 font-mono text-[11px]">
                      {new Date(o.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          o.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-700'
                            : o.status === 'cancelled'
                            ? 'bg-zinc-200 text-zinc-600'
                            : 'bg-emerald-500/10 text-emerald-700'
                        }`}
                      >
                        {o.status || 'filled'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-500 uppercase font-mono text-[11px]">
                      {o.type || 'market'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          o.side === 'buy' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
                        }`}
                      >
                        {o.side}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-zinc-900">{o.asset}</td>
                    <td className="px-5 py-3.5 font-mono">{formatQty(o.amount, o.asset)}</td>
                    <td className="px-5 py-3.5 font-mono text-zinc-800">{money(o.price)}</td>
                    <td className="px-5 py-3.5 font-mono font-semibold text-zinc-900">{money(o.notional)}</td>
                    <td className="px-5 py-3.5 font-mono text-zinc-400">{money(o.fee)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {o.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => cancelPendingOrder(o.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-all"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                            o.auto ? 'bg-indigo-500/10 text-indigo-700' : 'bg-black/[0.04] text-zinc-600'
                          }`}
                        >
                          {o.auto ? 'Algo' : 'Manual'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-xs text-zinc-400">
                      No paper orders match the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// STRATEGIES
// ----------------------------------------------------
export function Strategies() {
  const { state, toggleStrategy, updateStrategy } = useLumen();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Algorithmic Strategy Suite"
        subtitle="Automated quantitative models running locally against real-time market data feeds."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {state.strategies.map((s) => (
          <GlassCard key={s.id} className="flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-xs"
                    style={{ backgroundColor: META[s.asset]?.iconColor || '#333' }}
                  >
                    {s.asset}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900">{s.name}</h3>
                    <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
                      {s.kind.replace('_', ' ')} ENGINE
                    </span>
                  </div>
                </div>

                {/* Apple Switch Toggle */}
                <button
                  type="button"
                  onClick={() => toggleStrategy(s.id)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                    s.enabled ? 'bg-emerald-600' : 'bg-zinc-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      s.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">
                {s.kind === 'momentum' &&
                  'Enters when 10-period SMA expands above 30-period SMA with RSI < 70. Dynamically trims exposure on trend exhaustion.'}
                {s.kind === 'mean_reversion' &&
                  'Accumulates when price deviates below lower Bollinger Band with RSI < 35. Harvests profit on snapback to the mean.'}
                {s.kind === 'dca' &&
                  'Executes periodic fixed capital allocations, eliminating market timing anxiety while enforcing risk caps.'}
              </p>

              {/* Telemetry Stats */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-3 rounded-2xl bg-black/[0.02] border border-black/[0.04]">
                  <span className="text-[10px] text-zinc-400 block uppercase font-medium">Orders Triggered</span>
                  <strong className="text-sm font-mono font-bold text-zinc-900">
                    {s.tradesExecuted || 0} trades
                  </strong>
                </div>
                <div className="p-3 rounded-2xl bg-black/[0.02] border border-black/[0.04]">
                  <span className="text-[10px] text-zinc-400 block uppercase font-medium">Simulated Return</span>
                  <strong className="text-sm font-mono font-bold text-emerald-600">
                    +{money(s.totalPnl || 0)}
                  </strong>
                </div>
              </div>

              {/* Controls */}
              <div className="pt-2 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-700">
                    <span>Max Allocation Ceiling:</span>
                    <strong className="font-mono">{(s.maxAllocation * 100).toFixed(0)}% of Portfolio</strong>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="5"
                    value={s.maxAllocation * 100}
                    onChange={(e) => updateStrategy(s.id, { maxAllocation: Number(e.target.value) / 100 })}
                    className="w-full accent-indigo-600 h-1.5 bg-black/[0.05] rounded-full appearance-none cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-700">
                  <span>Evaluation Cooldown:</span>
                  <select
                    value={s.cooldownSec}
                    onChange={(e) => updateStrategy(s.id, { cooldownSec: Number(e.target.value) })}
                    className="px-2.5 py-1 text-xs bg-white border border-black/[0.08] rounded-lg outline-none font-medium"
                  >
                    <option value={15}>15 Seconds</option>
                    <option value={30}>30 Seconds</option>
                    <option value={60}>60 Seconds</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-black/[0.04] flex items-center justify-between text-[11px] text-zinc-400">
              <span>Status: {s.enabled ? 'Monitoring Order Flow' : 'Engine Idle'}</span>
              {s.lastExecutedAt && <span>Last fire: {new Date(s.lastExecutedAt).toLocaleTimeString()}</span>}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// ALERTS
// ----------------------------------------------------
export function Alerts() {
  const { state, markets, addAlert, toggleAlert, removeAlert } = useLumen();
  const [asset, setAsset] = useState<Asset>('BTC');
  const [type, setType] = useState<'above' | 'below' | 'changeUp' | 'changeDown'>('above');
  const [valueStr, setValueStr] = useState('72000');

  const currentPrice = markets[asset]?.price || 0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(valueStr);
    if (!Number.isFinite(val) || val <= 0) return;
    addAlert({
      asset,
      type,
      value: val,
      enabled: true,
      isRecurring: true,
      cooldownSec: 300,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Price Threshold Alerts"
        subtitle="Continuous monitoring with sound alerts, banners, and proximity indicators."
      />

      {/* Creator Form */}
      <GlassCard className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-900">Create New Trigger Rule</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">Target Asset</label>
            <select
              value={asset}
              onChange={(e) => {
                const a = e.target.value as Asset;
                setAsset(a);
                const p = markets[a]?.price || 100;
                setValueStr(Math.round(p * 1.05).toString());
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-black/[0.08] rounded-xl outline-none font-medium"
            >
              {ASSETS.map((x) => (
                <option key={x} value={x}>
                  {x} ({money(markets[x]?.price || 0)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">Condition</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-white border border-black/[0.08] rounded-xl outline-none font-medium"
            >
              <option value="above">Price Rises Above ($)</option>
              <option value="below">Price Drops Below ($)</option>
              <option value="changeUp">24h Gain Exceeds (%)</option>
              <option value="changeDown">24h Loss Exceeds (%)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">Threshold Value</label>
            <input
              type="number"
              step="any"
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-black/[0.08] rounded-xl outline-none font-semibold text-zinc-900"
            />
          </div>

          <button
            type="submit"
            className="py-2.5 px-4 text-xs font-bold text-white bg-zinc-950 hover:bg-zinc-800 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Alert Rule
          </button>
        </form>
      </GlassCard>

      {/* Alerts Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900 px-1">Configured Alert Rules</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.alerts.map((al) => {
            const m = markets[al.asset];
            const p = m?.price || 0;
            const diffPct =
              al.type === 'above' || al.type === 'below'
                ? ((al.value - p) / Math.max(p, 1e-6)) * 100
                : 0;

            return (
              <GlassCard key={al.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-xs"
                    style={{ backgroundColor: META[al.asset]?.iconColor || '#333' }}
                  >
                    {al.asset}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-zinc-900">{al.asset}</span>
                      <span className="text-[11px] text-zinc-500 capitalize">
                        {al.type === 'above' && 'Crosses Above'}
                        {al.type === 'below' && 'Crosses Below'}
                        {al.type === 'changeUp' && '24h Gain >'}
                        {al.type === 'changeDown' && '24h Loss >'}
                      </span>
                      <strong className="text-xs font-mono font-semibold text-zinc-950">
                        {al.type.includes('change') ? `${al.value}%` : money(al.value)}
                      </strong>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Current: {money(p)} ·{' '}
                      {Math.abs(diffPct) > 0 && (
                        <span className="text-zinc-600 font-medium">
                          {diffPct > 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`} away
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAlert(al.id)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                      al.enabled
                        ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                        : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                    }`}
                  >
                    {al.enabled ? 'Active' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAlert(al.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                    title="Delete Alert"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </GlassCard>
            );
          })}

          {state.alerts.length === 0 && (
            <div className="col-span-2 p-8 text-center text-xs text-zinc-400 bg-white/50 rounded-2xl border border-black/[0.05]">
              No alerts active. Create a threshold above to receive acoustic and visual notifications.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SETTINGS PAGE
// ----------------------------------------------------
export function SettingsPage() {
  const { state, setSettings, reset } = useLumen();
  const [key, setKey] = useState(state.settings.geminiApiKey || '');

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Settings &amp; Environment"
        subtitle="Configure Gemini model endpoints, audio cues, and local paper balances."
      />

      <GlassCard className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-900">Gemini AI Configuration</h3>
        <p className="text-xs text-zinc-500">
          The app calls server-side endpoints proxied to Google GenAI. Providing a key will route requests with your credentials.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700">Custom Gemini API Key</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIzaSy... (leave blank to use server environment default)"
            className="w-full px-3.5 py-2.5 text-xs font-mono bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500"
          />
        </div>

        <button
          type="button"
          onClick={() => setSettings({ geminiApiKey: key.trim() })}
          className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 rounded-xl shadow-xs hover:bg-zinc-800 transition-all"
        >
          Save API Key
        </button>
      </GlassCard>

      <GlassCard className="space-y-4 border-rose-500/20 bg-rose-500/[0.02]">
        <h3 className="text-sm font-bold text-rose-900">Reset Simulator</h3>
        <p className="text-xs text-zinc-600">
          Resetting will clear paper order history and re-initialize with $50,000 in paper cash.
        </p>
        <button
          type="button"
          onClick={() => {
            if (confirm('Reset the entire simulator to fresh starting balances?')) {
              reset(50000);
            }
          }}
          className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all"
        >
          Reset Simulator Now
        </button>
      </GlassCard>
    </div>
  );
}
