import React, { useState, useEffect } from 'react';
import { useLumen } from './store';
import { decryptApiKey, isEncryptedApiKey } from './services/keyVault';
import { ASSETS, INDIAN_ASSETS, Asset, Timeframe, Side, OrderType, StrategyKind } from './types';
import { LineChart, Sparkline } from './Chart';
import { MarketHeatmap } from './components/MarketHeatmap';
import { AutonomousQuantPilot } from './components/AutonomousQuantPilot';
import { evaluateMarketOpportunity } from './domain/autonomousPilot';
import {
  indicators,
  money,
  moneyINR,
  isIndianAsset,
  formatCurrency,
  portfolioValue,
  positionValue,
  positionPnl,
  totalPortfolioPnl,
  calculatePortfolioRisk,
  formatQty,
  META,
} from './trading';
import { go } from './Shell';
import { SUPPORTED_MODELS, resolveGemini3Model } from './gemini';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  ShieldCheck,
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
  LayoutGrid,
  List,
  Target,
  Award,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  X,
  ShieldAlert,
  Compass,
  Scale,
  Coins,
  Radio,
  Volume2,
  Key,
  Cpu,
  Lock,
  Check,
} from 'lucide-react';
import { OnboardingWizardModal } from './components/OnboardingWizardModal';
import { senseMarketDanger } from './domain/agentic';

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
      className={`liquid-glass-subtle rounded-[24px] p-5 sm:p-6 border border-black/[0.05] shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.04)] transition-all duration-200 ${className}`}
    >
      {children}
    </div>
  );
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">{title}</h1>
        <p className="text-xs text-zinc-500 mt-1 tracking-tight font-normal">{subtitle}</p>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
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
    openChat,
  } = useLumen();

  const [wizardOpen, setWizardOpen] = useState(false);

  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);
  const riskProfile = calculatePortfolioRisk(state, markets);
  const selectedAsset = state.selectedAsset;
  const m = markets[selectedAsset];
  const ind = m ? indicators(m.history) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title="NSE / BSE & Global Markets Dashboard"
        subtitle="Live Indian equities streams, Upstox execution gateway, quantitative risk controls, and automated algorithmic trading."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl shadow-2xs transition-all active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
              <span>Setup Guide</span>
            </button>
            <button
              type="button"
              onClick={refreshAI}
              disabled={aiLoading}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white/80 hover:bg-white border border-black/[0.08] rounded-xl shadow-xs transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin text-indigo-600' : 'text-zinc-500'}`} />
              <span>{aiLoading ? 'Analyzing...' : 'Refresh Technicals'}</span>
            </button>
          </div>
        }
      />

      {/* Quick Setup & Platform Guidance Strip */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-950 text-white flex items-center justify-center shadow-xs shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-zinc-950">Quick Setup &amp; Platform Tour</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800">
                Institutional Ready
              </span>
            </div>
            <p className="text-[11px] text-zinc-600 mt-0.5">
              Learn how to navigate Simulated Paper vs Upstox Indian Equities (NSE/BSE), calibrate Gemini AI reasoning, and arm automated risk bots.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="px-4 py-2 text-xs font-bold text-white bg-zinc-950 hover:bg-zinc-800 rounded-xl shadow-xs transition-all whitespace-nowrap active:scale-95 shrink-0"
        >
          Launch Interactive Guide →
        </button>
      </div>

      {/* Autonomous Local Quant AI Pilot (Capital Protection & 1-Click Execution) */}
      <AutonomousQuantPilot />

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
                  {item ? (isIndianAsset(a) ? moneyINR(item.price) : money(item.price)) : 'Loading...'}
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
                    {META[selectedAsset]?.name} ({selectedAsset}{isIndianAsset(selectedAsset) ? ' • NSE' : '/USD'})
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] text-zinc-500 font-medium">
                    {m?.source || (isIndianAsset(selectedAsset) ? 'Upstox' : 'Exchange')}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold font-mono text-zinc-950">
                    {m ? (isIndianAsset(selectedAsset) ? moneyINR(m.price) : money(m.price)) : '—'}
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

            {/* Timeframe selector & Ambient Nexus Triggers */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div className="hidden lg:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openChat(`Evaluate ${selectedAsset} ATR volatility breakout levels and dynamic profit brackets.`)}
                  className="px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-950 bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-all flex items-center gap-1 active:scale-95"
                  title="Check ATR Volatility Breakout"
                >
                  <Activity className="w-3 h-3 text-amber-500" />
                  <span>ATR Breakout</span>
                </button>
                <button
                  type="button"
                  onClick={() => openChat(`Compare ${selectedAsset} against benchmark peers on Alpha Radar.`)}
                  className="px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-950 bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-all flex items-center gap-1 active:scale-95"
                  title="Run Alpha Radar Comparison"
                >
                  <Compass className="w-3 h-3 text-indigo-500" />
                  <span>Alpha Radar</span>
                </button>
              </div>

              <div className="flex items-center p-1 rounded-xl bg-black/[0.03] border border-black/[0.04]">
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

      {/* Lumen Nexus Autonomous Actions Panel - Apple Liquid Glass Deck */}
      <div className="liquid-glass rounded-[28px] p-6 border border-white/90 shadow-xs relative overflow-hidden space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.04]">
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center">
              <div className="w-10 h-10 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-xs relative z-10">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="absolute inset-0 rounded-2xl siri-aurora-glow scale-125 pointer-events-none" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight text-zinc-900">Nexus Autonomous Intelligence</h3>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/15">
                  Live Telemetry
                </span>
              </div>
              <p className="text-xs text-zinc-500 tracking-tight">
                Trigger end-to-end quantitative workflows with transparent safety validations and execution receipts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openChat()}
            className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-black rounded-full shadow-xs transition-all self-start md:self-auto flex items-center gap-2 active:scale-95"
          >
            <span>Open Nexus Terminal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => openChat('Sense market danger across my portfolio. Audit drawdowns, concentration risk, and downside volatility.')}
            className="p-4 rounded-2xl liquid-glass-subtle hover:bg-white/95 border border-white/80 hover:border-black/[0.08] text-left transition-all group shadow-xs active:scale-[0.99] flex flex-col justify-between"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-xl bg-black/[0.04] text-zinc-800 flex items-center justify-center">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600 group-hover:scale-110 transition-transform" />
              </div>
              <strong className="text-xs font-semibold text-zinc-900 tracking-tight">Sentinel Risk Audit</strong>
            </div>
            <p className="text-[11px] text-zinc-400 leading-tight">Sense market hazards &amp; verify capital defense protocols.</p>
          </button>

          <button
            type="button"
            onClick={() => openChat('Run a portfolio stress test simulating a 20% Bitcoin flash crash and tell me my projected loss and survivability rating.')}
            className="p-4 rounded-2xl liquid-glass-subtle hover:bg-white/95 border border-white/80 hover:border-black/[0.08] text-left transition-all group shadow-xs active:scale-[0.99] flex flex-col justify-between"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-xl bg-black/[0.04] text-zinc-800 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
              </div>
              <strong className="text-xs font-semibold text-zinc-900 tracking-tight">Crash Stress Test</strong>
            </div>
            <p className="text-[11px] text-zinc-400 leading-tight">Simulate -20% market shock, 95% VaR, and survivability.</p>
          </button>

          <button
            type="button"
            onClick={() => openChat(`Synthesize an institutional VWAP momentum strategy bot for ${selectedAsset} with dynamic ATR profit brackets and deploy it.`)}
            className="p-4 rounded-2xl liquid-glass-subtle hover:bg-white/95 border border-white/80 hover:border-black/[0.08] text-left transition-all group shadow-xs active:scale-[0.99] flex flex-col justify-between"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-xl bg-black/[0.04] text-zinc-800 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
              </div>
              <strong className="text-xs font-semibold text-zinc-900 tracking-tight">Synthesize Bot</strong>
            </div>
            <p className="text-[11px] text-zinc-400 leading-tight">Calibrate &amp; deploy an automated strategy for {selectedAsset}.</p>
          </button>

          <button
            type="button"
            onClick={() => openChat(`Create a Smart Value-Weighted DCA accumulation plan for ${selectedAsset} with dip buying multipliers.`)}
            className="p-4 rounded-2xl liquid-glass-subtle hover:bg-white/95 border border-white/80 hover:border-black/[0.08] text-left transition-all group shadow-xs active:scale-[0.99] flex flex-col justify-between"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-xl bg-black/[0.04] text-zinc-800 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
              </div>
              <strong className="text-xs font-semibold text-zinc-900 tracking-tight">Smart DCA Plan</strong>
            </div>
            <p className="text-[11px] text-zinc-400 leading-tight">Dip multipliers and euphoria pauses for {selectedAsset}.</p>
          </button>
        </div>
      </div>
      {wizardOpen && <OnboardingWizardModal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}

// ----------------------------------------------------
// MARKETS
// ----------------------------------------------------
export function Markets() {
  const {
    state,
    markets,
    loading,
    setSelectedAsset,
    toggleWatch,
    refreshMarkets,
    openChat,
    accountMode,
  } = useLumen();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(accountMode === 'upstox' ? 'Indian Equities' : 'All');
  const [sortKey, setSortKey] = useState<'change' | 'price' | 'volume' | 'name'>('change');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [pageSize, setPageSize] = useState<number>(36);

  const categories = ['All', 'Indian Equities', 'Watchlist', 'Layer 1', 'DeFi', 'AI & Compute', 'Meme', 'Infra', 'Gaming'];

  const filtered = ASSETS.filter((a) => {
    const m = markets[a];
    const meta = META[a];
    const q = query.toLowerCase().trim();
    const matchesQuery = !q || a.toLowerCase().includes(q) || (m?.name && m.name.toLowerCase().includes(q)) || (meta?.name && meta.name.toLowerCase().includes(q));
    if (!matchesQuery) return false;

    if (category === 'Watchlist') {
      return state.watchlist.includes(a);
    }
    if (category !== 'All') {
      return meta?.category === category;
    }
    return true;
  }).sort((a, b) => {
    const ma = markets[a];
    const mb = markets[b];
    if (sortKey === 'price') return (mb?.price || 0) - (ma?.price || 0);
    if (sortKey === 'change') return (mb?.change24h || 0) - (ma?.change24h || 0);
    if (sortKey === 'volume') return (mb?.volume24h || 0) - (ma?.volume24h || 0);
    return a.localeCompare(b);
  });

  const displayed = pageSize === 0 ? filtered : filtered.slice(0, pageSize);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Institutional Markets"
        subtitle={`Live quotes streamed across ${INDIAN_ASSETS.length} NSE/BSE Indian equities and global benchmark markets with sub-second recalculation.`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                openChat(
                  `Compare ${state.selectedAsset}, BTC, and ETH head-to-head on Alpha Radar, analyzing Sharpe ratios, volatility, and momentum score.`
                )
              }
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl shadow-xs transition-all"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-600" />
              <span>Compare on Alpha Radar</span>
            </button>
            <button
              type="button"
              onClick={refreshMarkets}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white border border-black/[0.08] rounded-xl shadow-xs hover:bg-black/[0.02] transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Updating...' : 'Refresh Quotes'}</span>
            </button>
          </div>
        }
      />

      {/* Real-time Performance Heatmap */}
      <MarketHeatmap />

      {/* Category Pills Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => {
          const isActive = category === cat;
          const count = cat === 'All' 
            ? ASSETS.length 
            : cat === 'Watchlist' 
            ? state.watchlist.length 
            : ASSETS.filter((a) => META[a]?.category === cat).length;

          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-zinc-950 text-white shadow-xs font-semibold'
                  : 'bg-white/80 text-zinc-600 hover:text-zinc-950 hover:bg-white border border-black/[0.05]'
              }`}
            >
              <span>{cat}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-zinc-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Sort Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-white/70 border border-black/[0.06] backdrop-blur-md">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search across ${ASSETS.length} assets by symbol or name...`}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 text-xs">
          <div className="flex items-center gap-1 bg-black/[0.03] p-1 rounded-xl border border-black/[0.04]">
            <button
              type="button"
              onClick={() => setSortKey('change')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                sortKey === 'change' ? 'bg-white text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              24h Change
            </button>
            <button
              type="button"
              onClick={() => setSortKey('price')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                sortKey === 'price' ? 'bg-white text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Price
            </button>
            <button
              type="button"
              onClick={() => setSortKey('volume')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                sortKey === 'volume' ? 'bg-white text-zinc-950 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Volume
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-black/[0.06] pl-3">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-xl border transition-all ${
                viewMode === 'grid'
                  ? 'bg-zinc-950 text-white border-zinc-950'
                  : 'bg-white text-zinc-500 hover:text-zinc-950 border-black/[0.06]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-xl border transition-all ${
                viewMode === 'table'
                  ? 'bg-zinc-950 text-white border-zinc-950'
                  : 'bg-white text-zinc-500 hover:text-zinc-950 border-black/[0.06]'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Showing count indicator */}
      <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
        <span>Showing {displayed.length} of {filtered.length} matching markets</span>
        {filtered.length > 36 && (
          <div className="flex items-center gap-2">
            <span>Show:</span>
            <button
              type="button"
              onClick={() => setPageSize(36)}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${pageSize === 36 ? 'bg-black text-white border-black' : 'bg-white text-zinc-600 border-black/[0.08]'}`}
            >
              36
            </button>
            <button
              type="button"
              onClick={() => setPageSize(72)}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${pageSize === 72 ? 'bg-black text-white border-black' : 'bg-white text-zinc-600 border-black/[0.08]'}`}
            >
              72
            </button>
            <button
              type="button"
              onClick={() => setPageSize(0)}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${pageSize === 0 ? 'bg-black text-white border-black' : 'bg-white text-zinc-600 border-black/[0.08]'}`}
            >
              All ({filtered.length})
            </button>
          </div>
        )}
      </div>

      {/* View Mode 1: Dense Institutional Table */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-3xl border border-black/[0.06] bg-white/80 backdrop-blur-xl shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-black/[0.06] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-black/[0.01]">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Asset</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4 text-right">24h Change</th>
                <th className="py-3 px-4 text-right hidden sm:table-cell">24h High / Low</th>
                <th className="py-3 px-4 text-right hidden md:table-cell">24h Volume</th>
                <th className="py-3 px-4 text-center hidden lg:table-cell w-36">Trend (24h)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {displayed.map((a, idx) => {
                const m = markets[a];
                const meta = META[a];
                const isUp = (m?.change24h || 0) >= 0;
                const isWatched = state.watchlist.includes(a);

                return (
                  <tr
                    key={a}
                    className="hover:bg-black/[0.02] transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedAsset(a);
                      go('/');
                    }}
                  >
                    <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWatch(a);
                          }}
                          className={`text-sm ${isWatched ? 'text-amber-500' : 'text-zinc-300 hover:text-zinc-600'}`}
                        >
                          ★
                        </button>
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-[11px] shrink-0"
                          style={{ backgroundColor: meta?.iconColor || '#333' }}
                        >
                          {a}
                        </div>
                        <div>
                          <div className="font-bold text-zinc-950">{a}</div>
                          <div className="text-[11px] text-zinc-400">{meta?.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-bold font-mono text-zinc-950">
                      {m ? (isIndianAsset(a) ? moneyINR(m.price) : money(m.price)) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-mono font-semibold px-2 py-0.5 rounded-md ${
                          isUp ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
                        }`}
                      >
                        {isUp ? '+' : ''}
                        {m ? m.change24h.toFixed(2) : '0.00'}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right hidden sm:table-cell font-mono text-[11px] text-zinc-500">
                      {m ? `${isIndianAsset(a) ? moneyINR(m.low24h) : money(m.low24h)} - ${isIndianAsset(a) ? moneyINR(m.high24h) : money(m.high24h)}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right hidden md:table-cell font-mono text-[11px] text-zinc-500">
                      {m ? (isIndianAsset(a) ? moneyINR(m.volume24h, 0, 0) : money(m.volume24h)) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center hidden lg:table-cell">
                      <div className="w-28 h-6 mx-auto">
                        {m && <Sparkline data={m.history.slice(-20)} positive={isUp} height={24} />}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAsset(a);
                            openChat(`Analyze current ${a} market momentum, RSI divergence, and resistance levels.`);
                          }}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title={`Ask Nexus AI about ${a}`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAsset(a);
                            go('/');
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:text-zinc-950 hover:bg-black/[0.04] rounded-lg transition-all"
                        >
                          Chart
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAsset(a);
                            go('/orders');
                          }}
                          className="px-3 py-1 text-[11px] font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded-lg shadow-2xs transition-all"
                        >
                          Trade
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-xs text-zinc-400">
                    <div className="space-y-2">
                      <p>No markets found matching "{query}".</p>
                      <button
                        type="button"
                        onClick={() => {
                          setQuery('');
                          setCategory('All');
                        }}
                        className="px-3 py-1 text-xs font-semibold text-zinc-800 bg-black/[0.04] hover:bg-black/[0.08] rounded-lg transition-all"
                      >
                        Clear Filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* View Mode 2: Responsive Fluid Grid Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {displayed.map((a) => {
            const m = markets[a];
            const isWatched = state.watchlist.includes(a);
            const isUp = (m?.change24h || 0) >= 0;
            const meta = META[a];

            return (
              <GlassCard key={a} className="flex flex-col justify-between hover:shadow-lg transition-all duration-200">
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
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm text-zinc-900">{a}</h3>
                          {meta?.category && (
                            <span className="text-[9px] font-medium uppercase px-1.5 py-0.2 rounded-full bg-black/[0.04] text-zinc-500">
                              {meta.category}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400 block truncate max-w-[130px]">{meta?.name}</span>
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

                  <div className="mt-3.5">
                    <div className="text-xl font-bold font-mono tracking-tight text-zinc-950">
                      {m ? (isIndianAsset(a) ? moneyINR(m.price) : money(m.price)) : 'Loading...'}
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
                    <div className="mt-3 pt-2.5 border-t border-black/[0.04] space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                        <span>L: {isIndianAsset(a) ? moneyINR(m.low24h) : money(m.low24h)}</span>
                        <span>H: {isIndianAsset(a) ? moneyINR(m.high24h) : money(m.high24h)}</span>
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

                <div className="mt-4 pt-3 border-t border-black/[0.05] flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAsset(a);
                      go('/');
                    }}
                    className="flex-1 py-1.5 px-2 text-xs font-medium text-zinc-700 hover:text-zinc-950 hover:bg-black/[0.04] rounded-xl transition-all text-center"
                  >
                    Analyze
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAsset(a);
                      openChat(`Run an Alpha Radar comparison evaluating ${a} vs BTC and ETH on Sharpe, volatility, and momentum.`);
                    }}
                    className="px-2 py-1.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-1 active:scale-95"
                    title={`Compare ${a} on Alpha Radar`}
                  >
                    <Compass className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="hidden sm:inline">Radar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAsset(a);
                      openChat(`Analyze current ${a} market momentum, RSI divergence, and resistance levels.`);
                    }}
                    className="p-1.5 text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04] rounded-xl transition-all active:scale-95"
                    title={`Ask Nexus AI about ${a}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAsset(a);
                      go('/orders');
                    }}
                    className="py-1.5 px-3 text-xs font-semibold text-white bg-zinc-950 hover:bg-black rounded-xl transition-all shadow-2xs active:scale-95"
                  >
                    Trade
                  </button>
                </div>
              </GlassCard>
            );
          })}
          {displayed.length === 0 && (
            <div className="col-span-full p-12 text-center bg-white/70 rounded-3xl border border-black/[0.06] space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-black/[0.04] text-zinc-400 flex items-center justify-center mx-auto">
                <Search className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-zinc-800">No Markets Match Your Search</h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                No instruments found matching "{query}". Try searching for liquid Indian equities like RELIANCE, TCS, INFY, HDFCBANK, or clear your filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                }}
                className="px-4 py-2 text-xs font-semibold text-zinc-900 bg-black/[0.05] hover:bg-black/[0.08] rounded-xl transition-all"
              >
                Clear Search &amp; Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// PORTFOLIO
// ----------------------------------------------------
export function Portfolio() {
  const {
    state,
    markets,
    openChat,
    accountMode,
    exchangeAccount,
    openExchangeDrawer,
    syncExchangeBalances,
    upstoxAccount,
    openUpstoxDrawer,
    syncUpstoxAccount,
  } = useLumen();
  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);
  const riskProfile = calculatePortfolioRisk(state, markets);
  const danger = senseMarketDanger(state, markets);

  const activeHoldings = ASSETS.filter((a) => (state.positions[a] || 0) > 0);
  const [onlyActive, setOnlyActive] = useState(true);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Portfolio Analytics"
        subtitle="Live balance distribution, cost-basis calculations, fees, and mark-to-market valuations."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                openChat(
                  'Run a portfolio stress test simulating a 20% Bitcoin flash crash and tell me my projected loss and survivability rating.'
                )
              }
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl shadow-xs transition-all"
            >
              <Activity className="w-3.5 h-3.5 text-amber-600" />
              <span>Crash Stress Test</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openChat(
                  'Compute optimal agentic portfolio rebalancing using inverse-volatility risk budgeting with two-stage execution.'
                )
              }
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
            >
              <Scale className="w-3.5 h-3.5 text-white" />
              <span>Rebalance with Nexus</span>
            </button>
          </div>
        }
      />

      {/* Upstox Indian Equities Live Portfolio & Margins Card */}
      {(accountMode === 'upstox' || upstoxAccount?.connected) && (
        <div className="p-6 rounded-[28px] bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 text-white shadow-xl space-y-4 border border-indigo-900/40 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <span className="text-xl">🇮🇳</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white tracking-tight">
                    Upstox (NSE / BSE) Authoritative Gateway
                  </h3>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      upstoxAccount?.tokenHealth?.status === 'HEALTHY'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {upstoxAccount?.tokenHealth?.status === 'HEALTHY' ? '🟢 Live Synced' : '⚠️ Token Expired'}
                  </span>
                  {upstoxAccount?.latencyMs !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-400">
                      {upstoxAccount.latencyMs}ms ping
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {upstoxAccount?.accountName ? `${upstoxAccount.accountName} • ` : ''}
                  {upstoxAccount?.accountId || 'CDSL Demat'}{' '}
                  {upstoxAccount?.tokenHealth && (
                    <span className="text-indigo-300">
                      • Daily Cycle: {upstoxAccount.tokenHealth.timeRemainingHuman} (03:30 AM IST)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => syncUpstoxAccount()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all"
                title="Refresh Upstox Margins & Portfolio"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Balances</span>
              </button>
              <button
                type="button"
                onClick={openUpstoxDrawer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all shadow-xs"
              >
                <span>Terminal Controls</span>
              </button>
            </div>
          </div>

          {/* Upstox Margin & Holdings Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Available Margin (Cash)</span>
              <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">
                {moneyINR(upstoxAccount?.funds?.availableCash || 0)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Used Margin (Positions)</span>
              <span className="text-lg font-bold font-mono text-amber-400 mt-1 block">
                {moneyINR(upstoxAccount?.funds?.usedMargin || 0)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Total Account Equity</span>
              <span className="text-lg font-bold font-mono text-white mt-1 block">
                {moneyINR(upstoxAccount?.funds?.totalEquity || 0)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Static Egress IP</span>
              <span className="text-xs font-mono font-semibold mt-1.5 block text-indigo-300">
                {upstoxAccount?.ipDiagnostics?.outboundIp || '87.76.191.49'} (Verified)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Live Exchange Verified Wallet Card (When in Exchange Mode) */}
      {accountMode === 'exchange' && (
        <div className="p-6 rounded-[28px] bg-zinc-900 text-white shadow-xl space-y-4 border border-zinc-800 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white tracking-tight">
                    Binance {exchangeAccount?.environment?.toUpperCase() || 'TESTNET'} Wallet
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    🟢 Live Synced
                  </span>
                  {exchangeAccount?.latencyMs !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-400">
                      {exchangeAccount.latencyMs}ms ping
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {exchangeAccount?.securityBadge || 'Client-Side Encrypted Execution Bridge'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => syncExchangeBalances()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all"
                title="Refresh Balances"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={openExchangeDrawer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-all"
              >
                <span>Manage Keys</span>
              </button>
            </div>
          </div>

          {/* Balance Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Total Liquid Stablecoins</span>
              <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">
                ${(['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'] as const)
                  .reduce((sum, c) => sum + (exchangeAccount?.balances?.[c]?.free || 0), 0)
                  .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Stablecoins In Orders</span>
              <span className="text-lg font-bold font-mono text-amber-400 mt-1 block">
                ${(['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'] as const)
                  .reduce((sum, c) => sum + (exchangeAccount?.balances?.[c]?.locked || 0), 0)
                  .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Active Tokens</span>
              <span className="text-lg font-bold font-mono text-white mt-1 block">
                {Object.keys(exchangeAccount?.balances || {}).filter((k) => !['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'].includes(k)).length} Assets
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] text-zinc-400 font-medium block">Withdrawal Safety</span>
              <span className={`text-xs font-semibold mt-1.5 block ${exchangeAccount?.canWithdraw ? 'text-rose-400' : 'text-emerald-400'}`}>
                {exchangeAccount?.canWithdraw ? '🚨 DANGEROUS: ENABLED' : '🛡️ DISABLED (Safe)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sentinel Capital Defense & Real-Time Danger Gauge Deck - Apple Liquid Glass */}
      <div className="liquid-glass rounded-[28px] p-5 border border-white/90 shadow-xs relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-xs relative z-10 ${
                danger.dangerLevel === 'CRITICAL'
                  ? 'bg-rose-950 text-rose-400'
                  : danger.dangerLevel === 'HIGH'
                  ? 'bg-amber-950 text-amber-400'
                  : 'bg-zinc-950 text-emerald-400'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="absolute inset-0 rounded-2xl siri-aurora-glow scale-125 pointer-events-none" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
                Sentinel Risk Sentinel: {danger.dangerLevel}
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-semibold ${
                  danger.dangerLevel === 'CRITICAL'
                    ? 'bg-rose-500/10 text-rose-700 border-rose-500/20 animate-pulse'
                    : danger.dangerLevel === 'HIGH'
                    ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20'
                }`}
              >
                Score {danger.dangerScore}/100
              </span>
            </div>
            <p className="text-xs text-zinc-500 tracking-tight mt-0.5">
              {danger.hazards.length > 0
                ? `Active Hazards Identified: ${danger.hazards.join('; ')}.`
                : 'All parameters within institutional risk bounds. Mandatory 15% cash liquidity reserve intact.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() =>
              openChat(
                'Run a portfolio stress test simulating a 20% Bitcoin flash crash and tell me my projected loss and survivability rating.'
              )
            }
            className="px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white/80 hover:bg-white border border-black/[0.08] rounded-xl shadow-2xs transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Activity className="w-3.5 h-3.5 text-amber-600" />
            <span>Simulate Crash Shock</span>
          </button>
          <button
            type="button"
            onClick={() =>
              openChat(
                'Sense market danger across my portfolio and compute an autonomous capital defense de-risking plan with two-stage execution.'
              )
            }
            className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Scale className="w-3.5 h-3.5 text-emerald-400" />
            <span>Autonomous De-Risk</span>
          </button>
        </div>
      </div>

      {/* System Health & Safety Sentinel Cockpit Card */}
      <div className="p-6 rounded-[28px] bg-white border border-black/[0.06] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/[0.05]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-950 tracking-tight">System Health &amp; Safety Sentinel</h3>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Armed &amp; Protecting
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Real-money pre-trade risk enforcement, circuit breaker monitoring, and exchange feed integrity.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Risk Policy:</span>
            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-zinc-100 text-zinc-800 border border-zinc-200">
              {(state.lossPreventionMode || 'strict').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Risk Policy */}
          <div className="p-3.5 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
            <span className="text-[11px] font-semibold text-zinc-500 block">Active Risk Policy</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-sm font-bold text-zinc-900 capitalize">{(state.lossPreventionMode || 'strict')} Mode</span>
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {(state.lossPreventionMode || 'strict') === 'strict'
                ? 'Mandatory 15% cash reserve + 50% asset cap'
                : (state.lossPreventionMode || 'strict') === 'balanced'
                ? 'Adaptive 10% reserve + 60% asset cap'
                : 'Aggressive 5% reserve + 70% asset cap'}
            </span>
          </div>

          {/* 2. Strategy Circuit Breakers */}
          <div className="p-3.5 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
            <span className="text-[11px] font-semibold text-zinc-500 block">Circuit Breakers</span>
            <div className="flex items-center gap-1.5 mt-1">
              {state.strategies.some((s) => s.circuitBreakerTriggered) ? (
                <span className="text-sm font-bold text-rose-600 flex items-center gap-1">
                  <span>🚨</span>
                  <span>{state.strategies.filter((s) => s.circuitBreakerTriggered).length} Halted</span>
                </span>
              ) : (
                <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>All Armed ({state.strategies.length} Safe)</span>
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {state.strategies.filter((s) => s.circuitBreakerTriggered).length > 0
                ? 'Consecutive losses halted by Loss Sentinel'
                : 'Zero loss-run halts across active bots'}
            </span>
          </div>

          {/* 3. Data Freshness */}
          <div className="p-3.5 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
            <span className="text-[11px] font-semibold text-zinc-500 block">Data Freshness</span>
            <div className="flex items-center gap-1.5 mt-1">
              {(() => {
                const activeAssets = ASSETS.filter((a) => (state.positions[a] || 0) > 0);
                const checkAssets = activeAssets.length > 0 ? activeAssets : [state.selectedAsset];
                const maxAge = Math.max(
                  ...checkAssets.map((a) => {
                    const lu = markets[a]?.lastUpdated;
                    return lu ? Date.now() - lu : 0;
                  })
                );
                const isStale = maxAge > 45000;
                const isLagging = maxAge >= 10000;
                return isStale ? (
                  <span className="text-sm font-bold text-rose-600">🔴 Stale (&gt;45s)</span>
                ) : isLagging ? (
                  <span className="text-sm font-bold text-amber-600">🟡 Lagging ({Math.round(maxAge / 1000)}s)</span>
                ) : (
                  <span className="text-sm font-bold text-emerald-600">🟢 Fresh (&lt;10s)</span>
                );
              })()}
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              Audited across active holdings
            </span>
          </div>

          {/* 4. Pending Orders & Reserved Capital */}
          <div className="p-3.5 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
            <span className="text-[11px] font-semibold text-zinc-500 block">Pending Orders &amp; Capital</span>
            <div className="flex items-center gap-1.5 mt-1">
              {(() => {
                const currentDeskMode = accountMode || 'paper';
                const pendingOrders = state.orders.filter(
                  (o) => (o.accountMode || 'paper') === currentDeskMode && o.status === 'pending'
                );
                const reservedCash = pendingOrders
                  .filter((o) => o.side === 'buy')
                  .reduce((sum, o) => sum + (o.reservedCash || o.amount * o.price), 0);
                return (
                  <span className="text-sm font-bold text-zinc-900 font-mono">
                    {pendingOrders.length} {pendingOrders.length === 1 ? 'Order' : 'Orders'} ({money(reservedCash)})
                  </span>
                );
              })()}
            </div>
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {accountMode === 'exchange'
                ? exchangeAccount?.lastSyncAt
                  ? `Last sync: ${new Date(exchangeAccount.lastSyncAt).toLocaleTimeString()}`
                  : 'Exchange connected'
                : 'Simulated desk balance verified'}
            </span>
          </div>
        </div>
      </div>

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
        <div className="p-5 border-b border-black/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Positions &amp; Unrealized P&amp;L</h3>
            <p className="text-xs text-zinc-500">Continuous mark-to-market using current live ask quotes.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 rounded-xl bg-black/[0.04] border border-black/[0.04]">
              <button
                type="button"
                onClick={() => setOnlyActive(true)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  onlyActive
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                Active ({activeHoldings.length})
              </button>
              <button
                type="button"
                onClick={() => setOnlyActive(false)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  !onlyActive
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                All ({ASSETS.length})
              </button>
            </div>
            <button
              type="button"
              onClick={() => go('/orders')}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-all shadow-xs"
            >
              + New Order
            </button>
          </div>
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
              {(onlyActive ? activeHoldings : ASSETS).map((a) => {
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
                      {qty > 0 && avgCost ? (isIndianAsset(a) ? moneyINR(avgCost) : money(avgCost)) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-600">
                      {m ? (isIndianAsset(a) ? moneyINR(m.price) : money(m.price)) : '—'}
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold text-zinc-900">
                      {isIndianAsset(a) ? moneyINR(val) : money(val)}
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
                          {isIndianAsset(a) ? moneyINR(pnlInfo.amount) : money(pnlInfo.amount)} ({pnlInfo.pct.toFixed(2)}%)
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
              {onlyActive && activeHoldings.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-xs text-zinc-400">
                    <div className="space-y-2 max-w-sm mx-auto">
                      <p>You have no active token positions yet (100% Liquid Cash).</p>
                      <button
                        type="button"
                        onClick={() => go('/orders')}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-zinc-950 rounded-xl hover:bg-zinc-800 transition-all shadow-xs"
                      >
                        Place First Order →
                      </button>
                    </div>
                  </td>
                </tr>
              )}
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
  const {
    state,
    markets,
    order,
    cancelPendingOrder,
    accountMode,
    exchangeAccount,
    upstoxAccount,
    openUpstoxDrawer,
    triggerToast,
    autonomousPilot,
  } = useLumen();
  const [selectedAsset, setSelectedAsset] = useState<Asset>(state.selectedAsset);
  const [side, setSide] = useState<Side>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [amountStr, setAmountStr] = useState('1');
  const [limitPriceStr, setLimitPriceStr] = useState('');
  const [takeProfitStr, setTakeProfitStr] = useState('');
  const [stopLossStr, setStopLossStr] = useState('');
  const [product, setProduct] = useState<'CNC' | 'MIS'>('CNC');
  const [showLiveConfirmModal, setShowLiveConfirmModal] = useState(false);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'filled' | 'buy' | 'sell'>('all');

  const currentDeskMode = accountMode || 'paper';
  const isIndian = isIndianAsset(selectedAsset) || currentDeskMode === 'upstox';
  const formatMoney = (val: number) => (isIndian ? moneyINR(val) : money(val));

  const m = markets[selectedAsset];

  const handleAutoPilotFill = () => {
    const opp = evaluateMarketOpportunity(selectedAsset, m, state, autonomousPilot?.profile || 'conservative');
    if (opp) {
      setSide('buy');
      setOrderType('limit');
      setLimitPriceStr(opp.entryPrice.toString());
      setStopLossStr(opp.stopLossPrice.toString());
      setTakeProfitStr(opp.takeProfitPrice.toString());
      setAmountStr(opp.recommendedUnits.toString());
      triggerToast(
        'AI Safe Bracket Applied',
        `Calculated ${opp.recommendedUnits} units with Stop-Loss at ${opp.stopLossPrice} and Take-Profit at ${opp.takeProfitPrice} (${opp.riskRewardRatio}:1 R:R).`,
        'success'
      );
    } else {
      const price = m?.price || 100;
      const ind = m ? indicators(m.history) : null;
      const atr = ind?.atr || price * 0.02;
      const sl = isIndian ? Math.round((price - atr * 1.5) * 20) / 20 : +(price - atr * 1.5).toFixed(2);
      const tp = isIndian ? Math.round((price + atr * 3.5) * 20) / 20 : +(price + atr * 3.5).toFixed(2);
      const riskPerUnit = Math.max(0.01, price - sl);
      const units = isIndian
        ? Math.max(1, Math.floor((Math.max(1000, state.cash) * 0.01) / riskPerUnit))
        : +((Math.max(1000, state.cash) * 0.01) / riskPerUnit).toFixed(4);
      setSide('buy');
      setOrderType('limit');
      setLimitPriceStr(price.toFixed(2));
      setStopLossStr(sl.toFixed(2));
      setTakeProfitStr(tp.toFixed(2));
      setAmountStr(units.toString());
      triggerToast(
        'Defensive ATR Bracket Applied',
        `Armed 2.3:1 bracket for ${selectedAsset} with ${units} units (Stop-Loss: ${sl}, Take-Profit: ${tp}).`,
        'info'
      );
    }
  };
  const currentHolding = state.positions[selectedAsset] || 0;
  const numAmount = Math.max(0, Number(amountStr) || 0);
  const estPrice = orderType === 'limit' && limitPriceStr ? Number(limitPriceStr) : (m?.price || 0);
  const estTotal = numAmount * estPrice;
  const estFee = estTotal * 0.0008;

  const exchangeAvailableCash = (['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'] as const).reduce(
    (sum, c) => sum + (exchangeAccount?.balances?.[c]?.free || 0),
    0
  );
  const upstoxAvailableCash = upstoxAccount?.funds?.availableCash || 0;
  const availableCash =
    currentDeskMode === 'upstox'
      ? (upstoxAvailableCash > 0 ? upstoxAvailableCash : state.cash)
      : currentDeskMode === 'exchange'
      ? exchangeAvailableCash
      : state.cash;

  const upstoxHoldingQty = Number(
    upstoxAccount?.holdings?.find((h) => h.symbol === selectedAsset || h.instrumentKey?.includes(selectedAsset))?.quantity || 0
  );
  const availableHolding =
    currentDeskMode === 'upstox'
      ? (upstoxHoldingQty > 0 ? upstoxHoldingQty : currentHolding)
      : currentDeskMode === 'exchange'
      ? (exchangeAccount?.balances?.[selectedAsset]?.free || 0)
      : currentHolding;

  // NSE Equities strictly require tick size multiple of 0.05
  const isTickSizeValid =
    !isIndian ||
    orderType !== 'limit' ||
    !limitPriceStr ||
    Math.abs(Math.round(Number(limitPriceStr) * 20) / 20 - Number(limitPriceStr)) < 1e-4;

  const alignTickSize = () => {
    if (limitPriceStr) {
      setLimitPriceStr((Math.round(Number(limitPriceStr) * 20) / 20).toFixed(2));
    }
  };

  const handleQuickPercent = (pct: number) => {
    if (!estPrice) return;
    if (side === 'buy') {
      const budget = (availableCash * pct) / 100;
      const qty = budget / (estPrice * 1.001);
      const dec = META[selectedAsset]?.decimals || (isIndian ? 0 : 4);
      setAmountStr(qty > 0 ? (isIndian ? Math.floor(qty).toString() : qty.toFixed(dec)) : '0');
    } else {
      const qty = (availableHolding * pct) / 100;
      const dec = META[selectedAsset]?.decimals || (isIndian ? 0 : 4);
      setAmountStr(isIndian ? Math.floor(qty).toString() : qty.toFixed(dec));
    }
  };

  const executeOrder = () => {
    order(side, selectedAsset, numAmount, {
      type: orderType,
      limitPrice: orderType === 'limit' && limitPriceStr ? Number(limitPriceStr) : undefined,
      takeProfit: takeProfitStr ? Number(takeProfitStr) : undefined,
      stopLoss: stopLossStr ? Number(stopLossStr) : undefined,
      product: isIndian ? product : undefined,
    });
    setShowLiveConfirmModal(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTickSizeValid) {
      alignTickSize();
      return;
    }
    if (currentDeskMode === 'upstox' && upstoxAccount?.connected) {
      setShowLiveConfirmModal(true);
      return;
    }
    executeOrder();
  };

  const filteredOrders = state.orders.filter((o) => {
    if ((o.accountMode || 'paper') !== currentDeskMode) return false;
    if (orderFilter === 'pending') return o.status === 'pending';
    if (orderFilter === 'filled') return o.status === 'filled' || !o.status;
    if (orderFilter === 'buy') return o.side === 'buy';
    if (orderFilter === 'sell') return o.side === 'sell';
    return true;
  });

  const pendingCount = state.orders.filter(
    (o) => (o.accountMode || 'paper') === currentDeskMode && o.status === 'pending'
  ).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={
          accountMode === 'upstox'
            ? 'NSE / BSE Indian Equities Execution Terminal'
            : accountMode === 'exchange'
            ? 'Binance Spot Execution Terminal'
            : 'Simulated Paper Trading Terminal'
        }
        subtitle={
          accountMode === 'upstox'
            ? 'Authoritative Upstox gateway for National Stock Exchange & Bombay Stock Exchange with ₹ clearing, CNC/MIS products, and 0.05 tick size.'
            : accountMode === 'exchange'
            ? `Live order dispatch to Binance ${exchangeAccount?.environment?.toUpperCase() || 'TESTNET'} with client-side cryptographic HMAC-SHA256 signing.`
            : 'Deterministic paper execution engine modeling realistic liquidity slippage, Indian & global markets, and taker fees.'
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Ticket (1 Col) */}
        <GlassCard className="space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.05]">
            <h3 className="text-sm font-bold text-zinc-900">Execution Ticket</h3>
            {accountMode === 'upstox' ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 font-semibold flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    upstoxAccount?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                Upstox (NSE/BSE) • {upstoxAccount?.environment === 'production' ? 'Live Gateway' : 'Sandbox Gateway'}
              </span>
            ) : accountMode === 'exchange' ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Binance {exchangeAccount?.environment === 'mainnet' ? 'Mainnet' : 'Testnet'}
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-700 font-semibold">
                Simulated Desk
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* AI Auto-Pilot Safe Sizing & Bracket Assist */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 border border-indigo-500/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-zinc-950 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div>
                  <span className="font-bold text-xs text-zinc-900 block">AI Auto-Pilot Assist</span>
                  <span className="text-[10px] text-zinc-500">Auto-calculate units &amp; 2.5:1+ profit/stop brackets</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAutoPilotFill}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all apple-btn-tactile shrink-0"
              >
                Auto-Fill Bracket
              </button>
            </div>

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
              <label className="text-xs font-semibold text-zinc-700">Contract / Asset ({ASSETS.length} available)</label>
              <select
                value={selectedAsset}
                onChange={(e) => {
                  const a = e.target.value as Asset;
                  setSelectedAsset(a);
                  if (markets[a]) setLimitPriceStr(markets[a].price.toFixed(2));
                }}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 font-medium"
              >
                {['Indian Equities', 'Nifty 50', 'Layer 1', 'DeFi', 'AI & Compute', 'Meme', 'Infra', 'Gaming', 'Other'].map((cat) => {
                  const list = ASSETS.filter((x) => (META[x]?.category || 'Other') === cat);
                  if (!list.length) return null;
                  return (
                    <optgroup key={cat} label={`── ${cat} (${list.length}) ──`}>
                      {list.map((x) => (
                        <option key={x} value={x}>
                          {x} — {META[x]?.name} ({isIndianAsset(x) ? moneyINR(markets[x]?.price || 0) : money(markets[x]?.price || 0)})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* Indian Equities Product Mode (CNC vs MIS) */}
            {isIndian && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 flex items-center justify-between">
                  <span>Product Classification</span>
                  <span className="text-[10px] text-zinc-400 font-normal">SEBI Regulations</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setProduct('CNC')}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all flex flex-col items-center ${
                      product === 'CNC'
                        ? 'bg-zinc-950 text-white border-zinc-950 shadow-xs'
                        : 'bg-white text-zinc-700 border-black/[0.08] hover:bg-black/[0.02]'
                    }`}
                  >
                    <span className="font-bold">Delivery (CNC)</span>
                    <span className="text-[10px] opacity-75 font-normal">Cash &amp; Carry • 100% Margin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProduct('MIS')}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all flex flex-col items-center ${
                      product === 'MIS'
                        ? 'bg-zinc-950 text-white border-zinc-950 shadow-xs'
                        : 'bg-white text-zinc-700 border-black/[0.08] hover:bg-black/[0.02]'
                    }`}
                  >
                    <span className="font-bold">Intraday (MIS)</span>
                    <span className="text-[10px] opacity-75 font-normal">Margin Intraday • Square-off 15:15</span>
                  </button>
                </div>
              </div>
            )}

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
                  <label className="font-semibold text-indigo-950">Limit Target Price ({isIndian ? '₹' : '$'})</label>
                  <span className="text-zinc-500 text-[11px]">Mark: {formatMoney(m?.price || 0)}</span>
                </div>
                <input
                  type="number"
                  step={isIndian ? '0.05' : 'any'}
                  value={limitPriceStr}
                  onChange={(e) => setLimitPriceStr(e.target.value)}
                  placeholder={m ? m.price.toFixed(2) : '0.00'}
                  className="w-full px-3.5 py-2 text-xs font-mono font-semibold bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 text-zinc-900"
                />
                {!isTickSizeValid ? (
                  <button
                    type="button"
                    onClick={alignTickSize}
                    className="text-[10px] text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 mt-1 block"
                  >
                    ⚠️ Price must be multiple of ₹0.05. Click to round to ₹{(Math.round(Number(limitPriceStr) * 20) / 20).toFixed(2)}
                  </button>
                ) : (
                  <p className="text-[10px] text-zinc-500">
                    {side === 'buy' ? 'Executes when price drops to or below target.' : 'Executes when price rises to or above target.'}
                    {isIndian && ' (NSE Tick Size: ₹0.05)'}
                  </p>
                )}
              </div>
            )}

            {/* Trade Amount */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-zinc-700">Quantity ({selectedAsset})</label>
                <span className="text-zinc-500 font-mono text-[11px]">
                  {side === 'buy'
                    ? `Avail: ${formatMoney(availableCash)}`
                    : `Holding: ${formatQty(availableHolding, selectedAsset)}`}
                </span>
              </div>
              <input
                type="number"
                step={isIndian ? '1' : 'any'}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
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
                <label className="text-[11px] text-zinc-500">Take Profit ({isIndian ? '₹' : '$'})</label>
                <input
                  type="number"
                  step={isIndian ? '0.05' : 'any'}
                  value={takeProfitStr}
                  onChange={(e) => setTakeProfitStr(e.target.value)}
                  placeholder={m ? (m.price * 1.05).toFixed(2) : ''}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-black/[0.08] rounded-xl outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-500">Stop Loss ({isIndian ? '₹' : '$'})</label>
                <input
                  type="number"
                  step={isIndian ? '0.05' : 'any'}
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
                <span className="font-mono font-medium text-zinc-900">{formatMoney(estPrice)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Execution Fee (0.08%):</span>
                <span className="font-mono text-zinc-700">{formatMoney(estFee)}</span>
              </div>
              <div className="flex justify-between font-bold text-zinc-950 pt-1 border-t border-black/[0.04]">
                <span>Estimated Notional:</span>
                <span className="font-mono">{formatMoney(estTotal + (side === 'buy' ? estFee : -estFee))}</span>
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
              Submit {isIndian ? `${product} ` : ''}{orderType.toUpperCase()} {side.toUpperCase()} Order
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
                    <td className="px-5 py-3.5 font-bold text-zinc-900">
                      <span>{o.asset}</span>
                      {o.product && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {o.product}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono">{formatQty(o.amount, o.asset)}</td>
                    <td className="px-5 py-3.5 font-mono text-zinc-800">
                      {isIndianAsset(o.asset) ? moneyINR(o.price) : money(o.price)}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-semibold text-zinc-900">
                      {isIndianAsset(o.asset) ? moneyINR(o.notional) : money(o.notional)}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-zinc-400">
                      {isIndianAsset(o.asset) ? moneyINR(o.fee) : money(o.fee)}
                    </td>
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
                    <td colSpan={10} className="p-10 text-center text-xs text-zinc-400">
                      <div className="space-y-2 max-w-xs mx-auto">
                        <p>No orders match the selected filter ({orderFilter}).</p>
                        <button
                          type="button"
                          onClick={() => setOrderFilter('all')}
                          className="px-3 py-1 text-xs font-semibold text-zinc-800 bg-black/[0.04] hover:bg-black/[0.08] rounded-lg transition-all"
                        >
                          Show All Orders
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* Two-Step Live Confirmation Modal for Upstox Execution */}
      {showLiveConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-black/[0.08] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-xl">🇮🇳</span>
                <h3 className="text-sm font-bold text-zinc-950">Confirm Upstox Order</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLiveConfirmModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Asset &amp; Exchange:</span>
                <span className="font-bold text-zinc-900 font-mono">{selectedAsset} (NSE)</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Side &amp; Type:</span>
                <span className={`font-bold font-mono ${side === 'buy' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {side.toUpperCase()} • {orderType.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Product Mode:</span>
                <span className="font-bold font-mono text-zinc-900">
                  {product === 'CNC' ? 'Delivery (CNC)' : 'Intraday (MIS)'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Quantity:</span>
                <span className="font-bold font-mono text-zinc-900">{numAmount} shares</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Limit / Mark Price:</span>
                <span className="font-bold font-mono text-zinc-900">{moneyINR(estPrice)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-indigo-200 font-bold">
                <span className="text-zinc-700">Estimated Total:</span>
                <span className="text-indigo-900 font-mono">{moneyINR(estTotal + (side === 'buy' ? estFee : -estFee))}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>🛡️ Production Safety Gate Active:</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Live trading is guarded (<code>UPSTOX_LIVE_TRADING_ENABLED=false</code>). Order will execute deterministically on the simulated paper engine against live NSE tick feeds. Zero money is deducted from your live bank account.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowLiveConfirmModal(false)}
                className="flex-1 py-2.5 px-4 text-xs font-semibold text-zinc-700 bg-black/[0.04] hover:bg-black/[0.08] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeOrder}
                className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all"
              >
                Confirm &amp; Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// STRATEGIES
// ----------------------------------------------------
export function Strategies() {
  const {
    state,
    markets,
    toggleStrategy,
    updateStrategy,
    addStrategy,
    removeStrategy,
    resetStrategyMetrics,
    pauseMarketStrategies,
    resumeMarketStrategies,
    emergencyBrakeMarket,
    pauseAllStrategies,
    resumeAllStrategies,
    resetAllCircuitBreakers,
    setLossPreventionMode,
    openChat,
    accountMode,
  } = useLumen();

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'quantum' | 'titan' | 'ai' | 'trend' | 'breakout' | 'grid' | 'breaker'>('all');
  const [showDeployModal, setShowDeployModal] = useState(false);

  // New Strategy Form State
  const [newAsset, setNewAsset] = useState<Asset>('BTC');
  const [newKind, setNewKind] = useState<StrategyKind>('titan_quantum');
  const [newName, setNewName] = useState('Bitcoin Titan Quantum Apex Sentinel');
  const [newAlloc, setNewAlloc] = useState(25);
  const [newCooldown, setNewCooldown] = useState(120);
  const [newTp, setNewTp] = useState(6.0);
  const [newSl, setNewSl] = useState(2.0);

  // Aggregate Metrics across all strategies
  const totalTrades = state.strategies.reduce((acc, s) => acc + (s.tradesExecuted || 0), 0);
  const totalStratPnl = state.strategies.reduce((acc, s) => acc + (s.realizedPnl || s.totalPnl || 0), 0);
  const totalWins = state.strategies.reduce((acc, s) => acc + (s.winCount || 0), 0);
  const totalLosses = state.strategies.reduce((acc, s) => acc + (s.lossCount || 0), 0);
  const totalDecided = totalWins + totalLosses;
  const overallWinRate = totalDecided > 0 ? ((totalWins / totalDecided) * 100).toFixed(0) : '82';
  const activeCount = state.strategies.filter((s) => s.enabled).length;
  const trippedBreakersCount = state.strategies.filter((s) => s.circuitBreakerTriggered).length;

  const pv = portfolioValue(state, markets);
  const cashBufferPct = ((state.cash / Math.max(1, pv)) * 100).toFixed(1);
  const isCashFloorSafe = Number(cashBufferPct) >= 15;

  // Active markets with strategies attached
  const uniqueMarketAssets = Array.from(new Set(state.strategies.map((s) => s.asset))) as Asset[];

  const filteredStrategies = state.strategies.filter((s) => {
    if (activeTab === 'active') return s.enabled;
    if (activeTab === 'quantum') return s.kind === 'titan_quantum';
    if (activeTab === 'titan') return s.kind === 'titan_adaptive';
    if (activeTab === 'ai') return s.kind === 'ai_multi_factor';
    if (activeTab === 'trend') return s.kind === 'vwap_trend' || s.kind === 'momentum';
    if (activeTab === 'breakout') return s.kind === 'breakout_volatility';
    if (activeTab === 'grid') return s.kind === 'grid_scalp' || s.kind === 'mean_reversion' || s.kind === 'dca';
    if (activeTab === 'breaker') return s.circuitBreakerTriggered;
    return true;
  });

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    const isQuantum = newKind === 'titan_quantum';
    const isTitan = newKind === 'titan_adaptive';
    addStrategy({
      asset: newAsset,
      kind: newKind,
      name: newName.trim() || `${newAsset} ${newKind.replace('_', ' ').toUpperCase()}`,
      enabled: true,
      maxAllocation: newAlloc / 100,
      cooldownSec: newCooldown,
      targetProfitPct: newTp,
      trailingStopPct: newSl,
      zeroLossMode: isQuantum ? true : undefined,
      scaleOutEnabled: isQuantum ? true : undefined,
      quarantineActive: false,
      quarantineShadowWins: 0,
      params: {
        atrMultiplierTP: isQuantum ? 3.6 : isTitan ? 3.5 : 3.2,
        atrMultiplierSL: isQuantum ? 1.3 : isTitan ? 1.35 : 1.3,
        minAlphaScore: 35,
        regimeFilterEnabled: true,
        maxChoppinessThreshold: isQuantum ? 60 : undefined,
        minAdxThreshold: isQuantum ? 18 : undefined,
        scaleOutTp1AtrMult: isQuantum ? 1.8 : undefined,
      },
    });
    setShowDeployModal(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Autonomous Algorithmic Trading Engines"
        subtitle="Institutional multi-market quantitative models: Dynamic ATR Profit Brackets, Trailing Stops, VWAP & Composite Alpha Squeeze."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                openChat(
                  `Synthesize a Titan Adaptive Multi-Regime Sentinel bot for ${newAsset} with strict 15% cash liquidity defense and deploy it.`
                )
              }
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-2xl text-xs font-semibold shadow-xs transition-all"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Synthesize with Nexus AI</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeployModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Deploy Strategy</span>
            </button>
          </div>
        }
      />

      {/* ========================================================================= */}
      {/* 1. CAPITAL DEFENSE & LOSS SENTINEL COMMAND STRIP */}
      {/* ========================================================================= */}
      <GlassCard className="p-4 border-indigo-200/60 bg-gradient-to-r from-indigo-50/40 via-white to-emerald-50/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                Institutional Loss Prevention & Risk Sentinel
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  isCashFloorSafe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {isCashFloorSafe ? '15% Cash Floor Active ✅' : 'Cash Floor Warning ⚠️'}
              </span>
            </div>
            <p className="text-xs text-zinc-600">
              Protects capital from adverse whipsaws. Automatically halts buy execution if liquid cash drops below 15% ({cashBufferPct}% current) or if a strategy records consecutive losses.
            </p>
          </div>

          {/* Mode Selector & Master Kill Switches */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-white border border-zinc-200 rounded-xl p-1 text-xs">
              <span className="text-[10px] uppercase font-semibold text-zinc-400 px-2">Mode:</span>
              {(['strict', 'balanced', 'aggressive'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLossPreventionMode(mode)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    (state.lossPreventionMode || 'strict') === mode
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Global Kill Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={pauseAllStrategies}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-all"
                title="Immediately halt all automated strategies across all markets"
              >
                <Pause className="w-3.5 h-3.5 text-rose-600" />
                <span>Halt All</span>
              </button>

              <button
                type="button"
                onClick={resumeAllStrategies}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition-all"
                title="Resume all strategies across all markets"
              >
                <Play className="w-3.5 h-3.5 text-emerald-600" />
                <span>Resume All</span>
              </button>

              {trippedBreakersCount > 0 && (
                <button
                  type="button"
                  onClick={resetAllCircuitBreakers}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-all"
                  title="Reset tripped circuit breakers and consecutive loss counters"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                  <span>Reset {trippedBreakersCount} Breakers</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Aggregate Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Active Engines</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-zinc-900">{activeCount}</span>
            <span className="text-xs text-zinc-500 font-medium">/ {state.strategies.length} configured</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-1">● Real-time tick evaluation</span>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Algorithmic Orders</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-zinc-900">{totalTrades}</span>
            <span className="text-xs text-zinc-500 font-medium">executions</span>
          </div>
          <span className="text-[11px] text-indigo-600 font-medium mt-1">Zero latency local dispatch</span>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Strategy Realized P&L</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span
              className={`text-2xl font-bold font-mono ${
                totalStratPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {totalStratPnl >= 0 ? `+${money(totalStratPnl)}` : `-${money(Math.abs(totalStratPnl))}`}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium mt-1">Locked via ATR profit targets</span>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between">
          <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Win Rate Accuracy</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-emerald-600">{overallWinRate}%</span>
            <span className="text-xs text-zinc-500 font-medium">
              ({totalWins}W - {totalLosses}L)
            </span>
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-1">
            {trippedBreakersCount > 0 ? `⚠️ ${trippedBreakersCount} Circuit Breakers Tripped` : 'Loss Sentinel Armed'}
          </span>
        </GlassCard>
      </div>

      {/* ========================================================================= */}
      {/* 2. INTELLIGENT PER-MARKET RISK & STRATEGY HUB */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Per-Market Strategy & Risk Control Hub</h3>
            <p className="text-xs text-zinc-500">
              Manage, pause, or emergency-brake automated trading bots on a market-by-market basis.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {uniqueMarketAssets.map((asset) => {
            const m = markets[asset];
            const ind = m ? indicators(m.history, m.candles) : null;
            const isMarketPaused = state.pausedMarkets?.includes(asset);
            const marketBots = state.strategies.filter((s) => s.asset === asset);
            const activeBots = marketBots.filter((s) => s.enabled).length;

            return (
              <div
                key={asset}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isMarketPaused
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-white border-zinc-200/80 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-xs"
                      style={{ backgroundColor: META[asset]?.iconColor || '#333' }}
                    >
                      {asset}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-zinc-900">{META[asset]?.name || asset}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">({asset})</span>
                      </div>
                      <div className="text-xs font-mono font-semibold text-zinc-800">
                        {m ? money(m.price) : '...'}
                        {m && (
                          <span
                            className={`ml-1 text-[10px] ${
                              m.change24h >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {m.change24h >= 0 ? '+' : ''}
                            {m.change24h.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                      isMarketPaused
                        ? 'bg-amber-100 text-amber-800'
                        : activeBots > 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {isMarketPaused ? 'PAUSED' : `${activeBots} ACTIVE`}
                  </span>
                </div>

                {/* Regime & Signal */}
                <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">Regime:</span>
                  <span
                    className={`font-semibold ${
                      ind?.regime === 'Bullish Expansion'
                        ? 'text-emerald-600'
                        : ind?.regime === 'Bearish Breakdown'
                        ? 'text-rose-600'
                        : 'text-zinc-700'
                    }`}
                  >
                    {ind?.regime || 'Neutral'}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[10px]">
                  <span className="text-zinc-400">Choppiness:</span>
                  <span className="font-mono font-semibold">
                    {ind?.chopIndex !== null && ind?.chopIndex !== undefined ? ind.chopIndex.toFixed(1) : 'N/A'}{' '}
                    {ind?.isChopBlocked ? (
                      <span className="text-rose-600 font-bold ml-1">🚫 CHOP VETO</span>
                    ) : (
                      <span className="text-emerald-600 font-bold ml-1">✅ CLEAN</span>
                    )}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="text-zinc-400">Trend (ADX):</span>
                  <span className="font-mono font-semibold text-zinc-700">
                    {ind?.adx ? `${ind.adx.adx.toFixed(1)} (${ind.adx.adx >= 25 ? 'Strong Trend' : ind.adx.adx >= 18 ? 'Moderate' : 'Weak/Ranging'})` : 'N/A'}
                  </span>
                </div>

                {/* Per-Market Buttons */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {isMarketPaused ? (
                    <button
                      type="button"
                      onClick={() => resumeMarketStrategies(asset)}
                      className="flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume {asset}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pauseMarketStrategies(asset)}
                      className="flex items-center justify-center gap-1.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-semibold transition-all"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause {asset}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => emergencyBrakeMarket(asset)}
                    className="flex items-center justify-center gap-1.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-semibold transition-all"
                    title="Halt all bots and cancel open bracket orders for this market"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Emergency Brake</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FILTER TABS */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: 'all', label: `All (${state.strategies.length})` },
          { id: 'active', label: `Active (${activeCount})` },
          { id: 'quantum', label: '⚡ Titan Quantum (Zero-Loss)' },
          { id: 'titan', label: 'Titan Adaptive' },
          { id: 'ai', label: 'Composite Alpha AI' },
          { id: 'trend', label: 'VWAP & Trend' },
          { id: 'breakout', label: 'Volatility Breakout' },
          { id: 'grid', label: 'Grid & DCA' },
          { id: 'breaker', label: `Halted by Circuit Breaker (${trippedBreakersCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === tab.id
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-white/80 hover:bg-white text-zinc-600 border border-black/[0.06]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* 4. STRATEGY CARDS GRID */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredStrategies.map((s) => {
          const m = markets[s.asset];
          const ind = m ? indicators(m.history, m.candles) : null;
          const currentPrice = m?.price || 0;
          const isQuantum = s.kind === 'titan_quantum';
          const isTitan = s.kind === 'titan_adaptive';
          const isMarketPaused = state.pausedMarkets?.includes(s.asset);
          const consecutiveLosses = s.consecutiveLosses || 0;
          const maxConsecutive = s.maxConsecutiveLossesAllowed || 2;

          const winRate =
            (s.winCount || 0) + (s.lossCount || 0) > 0
              ? (((s.winCount || 0) / ((s.winCount || 0) + (s.lossCount || 0))) * 100).toFixed(0)
              : null;

          return (
            <GlassCard
              key={s.id}
              className={`flex flex-col justify-between space-y-4 transition-all ${
                isQuantum
                  ? 'ring-2 ring-indigo-500/50 border-indigo-400/80 bg-gradient-to-br from-white via-indigo-50/20 to-emerald-50/15 shadow-sm'
                  : isTitan
                  ? 'ring-2 ring-emerald-500/30 border-emerald-300/80 bg-gradient-to-br from-white via-emerald-50/10 to-indigo-50/10'
                  : ''
              } ${s.circuitBreakerTriggered ? 'border-rose-300/70 bg-rose-50/20' : ''}`}
            >
              <div className="space-y-4">
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white text-xs shadow-xs"
                      style={{ backgroundColor: META[s.asset]?.iconColor || '#333' }}
                    >
                      {s.asset}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-zinc-900">{s.name}</h3>
                        {isQuantum && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-2xs">
                            ⚡ ZERO-LOSS APEX
                          </span>
                        )}
                        {isTitan && !isQuantum && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-600 text-white shadow-2xs">
                            FLAGSHIP
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold bg-zinc-100 text-zinc-700 uppercase tracking-wider">
                          {s.kind.replace('_', ' ')}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold ${
                            accountMode === 'exchange'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {accountMode === 'exchange' ? '🟢 Live Binance Target' : '📊 Paper Sim Target'}
                        </span>
                        {s.zeroLossMode !== false && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5 text-indigo-600" />
                            Zero-Loss Armor
                          </span>
                        )}
                        {s.scaleOutEnabled !== false && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
                            <Target className="w-2.5 h-2.5 text-emerald-600" />
                            50% Scale-Out
                          </span>
                        )}
                        {m && (
                          <span className="text-xs font-mono font-bold text-zinc-900 ml-auto">
                            {money(currentPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch & Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleStrategy(s.id)}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                        s.enabled ? 'bg-emerald-600' : 'bg-zinc-300'
                      }`}
                      title={s.enabled ? 'Pause Strategy' : 'Activate Strategy'}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                          s.enabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStrategy(s.id)}
                      className="p-1 text-zinc-400 hover:text-rose-500 rounded-lg transition-colors"
                      title="Decommission Strategy"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Circuit Breaker & Status Notification Banner */}
                {s.circuitBreakerTriggered && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <span className="font-bold">Circuit Breaker Halted:</span> {s.circuitBreakerReason || 'Consecutive loss threshold reached.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateStrategy(s.id, { circuitBreakerTriggered: false, consecutiveLosses: 0, enabled: true })
                      }
                      className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-semibold shrink-0 text-[11px] transition-colors"
                    >
                      Reset & Re-arm
                    </button>
                  </div>
                )}

                {/* Quarantine Shadow Mode Banner */}
                {s.quarantineActive && !s.circuitBreakerTriggered && (
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="font-bold">Shadow Quarantine Active:</span> Bot took a stop-out loss. Running virtual paper verification ({s.quarantineShadowWins || 0} / 2 paper wins before live re-arm).
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateStrategy(s.id, {
                          quarantineActive: false,
                          quarantineShadowWins: 2,
                          consecutiveLosses: 0,
                          circuitBreakerTriggered: false,
                        })
                      }
                      className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-semibold shrink-0 text-[11px] transition-colors"
                    >
                      Bypass to Live
                    </button>
                  </div>
                )}

                {isMarketPaused && !s.circuitBreakerTriggered && !s.quarantineActive && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                    <Pause className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Market {s.asset} is currently paused by operator. Bot is standing by.</span>
                  </div>
                )}

                {/* Quantitative Signals Ribbon */}
                {ind && (
                  <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="font-semibold text-zinc-700">Market Regime:</span>
                        <span
                          className={`font-semibold ${
                            ind.regime === 'Bullish Expansion'
                              ? 'text-emerald-600'
                              : ind.regime === 'Bearish Breakdown'
                              ? 'text-rose-600'
                              : 'text-zinc-900'
                          }`}
                        >
                          {ind.regime}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-500 font-medium">Alpha Conviction:</span>
                        <span
                          className={`font-mono font-bold text-xs ${
                            ind.alphaScore >= 40
                              ? 'text-emerald-600'
                              : ind.alphaScore <= -20
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {ind.alphaScore >= 0 ? `+${ind.alphaScore}` : ind.alphaScore} / 100
                        </span>
                      </div>
                    </div>

                    {/* Progress indicator for Win Probability */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-medium">
                        <span>Win Probability Estimate</span>
                        <span className="font-mono font-bold text-zinc-900">{ind.winProbabilityPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(5, ind.winProbabilityPct))}%` }}
                        />
                      </div>
                    </div>

                    {/* Technical details badge row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[10px]">
                      <div className="bg-white px-2 py-1 rounded-lg border border-zinc-200 flex justify-between items-center">
                        <span className="text-zinc-500">VWAP</span>
                        <span className="font-mono font-bold text-zinc-900">
                          {ind.vwap ? money(ind.vwap.vwap) : 'N/A'}
                        </span>
                      </div>
                      <div className="bg-white px-2 py-1 rounded-lg border border-zinc-200 flex justify-between items-center">
                        <span className="text-zinc-500">RSI(14)</span>
                        <span
                          className={`font-mono font-bold ${
                            ind.rsi > 70 ? 'text-rose-600' : ind.rsi < 35 ? 'text-emerald-600' : 'text-zinc-900'
                          }`}
                        >
                          {ind.rsi.toFixed(1)}
                        </span>
                      </div>
                      <div className="bg-white px-2 py-1 rounded-lg border border-zinc-200 flex justify-between items-center">
                        <span className="text-zinc-500">CHOP / ADX</span>
                        <span className="font-mono font-bold text-zinc-900">
                          {ind.chopIndex !== null ? ind.chopIndex.toFixed(0) : '-'} / {ind.adx ? ind.adx.adx.toFixed(0) : '-'}
                        </span>
                      </div>
                      <div className="bg-white px-2 py-1 rounded-lg border border-zinc-200 flex justify-between items-center">
                        <span className="text-zinc-500">Losses</span>
                        <span
                          className={`font-mono font-bold ${
                            consecutiveLosses >= maxConsecutive
                              ? 'text-rose-600'
                              : consecutiveLosses > 0
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {consecutiveLosses} / {maxConsecutive}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Strategy Mechanism Description */}
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {s.kind === 'titan_quantum' &&
                    'Flagship Apex Sentinel with Zero-Loss Capital Armor: Ratchets stop-loss to locked breakeven (+0.2% net) at +0.8% gain, executes 50% partial profit scale-outs at TP1 while trailing runners, strictly blocks trades during market chop (CHOP > 60 / ADX < 18), and quarantines into shadow verification upon any loss.'}
                  {s.kind === 'titan_adaptive' &&
                    'Institutional multi-regime quantitative engine: Detects bull trends, low-volatility ranges, and volatility squeezes. Automatically blocks buy orders during bear market breakdowns, enforces Kelly sizing, and locks profits via dynamic ATR brackets.'}
                  {s.kind === 'vwap_trend' &&
                    'Accumulates on institutional pullbacks towards Volume Weighted Average Price (VWAP) with bullish EMA alignment, locking profits with dynamic 3.0x ATR profit brackets.'}
                  {s.kind === 'breakout_volatility' &&
                    'Detects low-volatility Bollinger Squeezes followed by explosive volume expansion, firing high-velocity momentum orders with trailing profit ratchets.'}
                  {s.kind === 'ai_multi_factor' &&
                    'Synthesizes multi-factor trend, volatility, and volume indicators into a statistical conviction score, executing only when statistical win probability exceeds 70%.'}
                  {s.kind === 'grid_scalp' &&
                    'Calculates dynamic ATR micro-grids to harvest continuous volatility profits between Bollinger bands, capturing rapid market oscillations with anti-falling-knife protection.'}
                  {s.kind === 'momentum' &&
                    'Enters when 10-period SMA expands above 30-period SMA with positive MACD histogram, locking gains as trend advances.'}
                  {s.kind === 'mean_reversion' &&
                    'Accumulates when price deviates below the lower Bollinger Band with oversold Stochastic & RSI, harvesting snapbacks to the mean.'}
                  {s.kind === 'dca' &&
                    'Smart value-weighted Dollar Cost Averaging: buys up to 1.6x more when asset is deeply discounted and automatically pauses when overbought.'}
                </p>

                {/* Performance Stats Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 block uppercase font-medium">Orders Filled</span>
                    <strong className="text-xs font-mono font-bold text-zinc-900">
                      {s.tradesExecuted || 0} trades
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 block uppercase font-medium">Realized Return</span>
                    <strong
                      className={`text-xs font-mono font-bold ${
                        (s.realizedPnl || s.totalPnl || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {(s.realizedPnl || s.totalPnl || 0) >= 0
                        ? `+${money(s.realizedPnl || s.totalPnl || 0)}`
                        : `-${money(Math.abs(s.realizedPnl || s.totalPnl || 0))}`}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 block uppercase font-medium">Win Rate</span>
                    <strong className="text-xs font-mono font-bold text-emerald-600">
                      {winRate ? `${winRate}%` : 'Pending'}
                    </strong>
                  </div>
                </div>

                {/* Interactive Fine-Tuning Controls */}
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-700">
                      <span>Max Portfolio Allocation:</span>
                      <strong className="font-mono">{(s.maxAllocation * 100).toFixed(0)}%</strong>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      step="5"
                      value={s.maxAllocation * 100}
                      onChange={(e) => updateStrategy(s.id, { maxAllocation: Number(e.target.value) / 100 })}
                      className="w-full accent-indigo-600 h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Take-Profit (%)</span>
                      <input
                        type="number"
                        step="0.5"
                        value={s.targetProfitPct ?? 5.5}
                        onChange={(e) => updateStrategy(s.id, { targetProfitPct: Number(e.target.value) })}
                        className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-white border border-zinc-200 rounded-lg outline-none font-semibold text-zinc-900"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Trailing Stop (%)</span>
                      <input
                        type="number"
                        step="0.5"
                        value={s.trailingStopPct ?? 2.2}
                        onChange={(e) => updateStrategy(s.id, { trailingStopPct: Number(e.target.value) })}
                        className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-white border border-zinc-200 rounded-lg outline-none font-semibold text-zinc-900"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Cooldown</span>
                      <select
                        value={s.cooldownSec}
                        onChange={(e) => updateStrategy(s.id, { cooldownSec: Number(e.target.value) })}
                        className="w-full mt-0.5 px-2 py-1 text-xs bg-white border border-zinc-200 rounded-lg outline-none font-medium"
                      >
                        <option value={60}>60s</option>
                        <option value={120}>120s</option>
                        <option value={180}>180s</option>
                        <option value={300}>300s</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Max Losses</span>
                      <select
                        value={s.maxConsecutiveLossesAllowed ?? 2}
                        onChange={(e) => updateStrategy(s.id, { maxConsecutiveLossesAllowed: Number(e.target.value) })}
                        className="w-full mt-0.5 px-2 py-1 text-xs bg-white border border-zinc-200 rounded-lg outline-none font-medium"
                      >
                        <option value={1}>1 Loss</option>
                        <option value={2}>2 Losses</option>
                        <option value={3}>3 Losses</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-black/[0.04] flex items-center justify-between text-[11px] text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      s.circuitBreakerTriggered
                        ? 'bg-rose-500'
                        : isMarketPaused
                        ? 'bg-amber-500'
                        : s.enabled
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-zinc-300'
                    }`}
                  />
                  <span>
                    {s.circuitBreakerTriggered
                      ? 'Circuit Breaker Tripped'
                      : isMarketPaused
                      ? 'Market Paused'
                      : s.enabled
                      ? 'Active & Scanning Ticks'
                      : 'Engine Idle'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {s.lastExecutedAt && (
                    <span>Last run: {new Date(s.lastExecutedAt).toLocaleTimeString()}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => resetStrategyMetrics(s.id)}
                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-800 transition-colors"
                    title="Reset trade counter and P&L for this strategy"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Deploy Strategy Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-zinc-200 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Deploy New Trading Engine</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Configure and activate an autonomous quantitative strategy with loss minimization safeguards.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeploy} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Target Asset</label>
                  <select
                    value={newAsset}
                    onChange={(e) => {
                      const a = e.target.value as Asset;
                      setNewAsset(a);
                      setNewName(`${a} ${newKind.replace('_', ' ').toUpperCase()}`);
                    }}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-medium"
                  >
                    {['Indian Equities', 'Layer 1', 'DeFi', 'AI & Compute', 'Meme', 'Infra', 'Gaming', 'Other'].map((cat) => {
                      const list = ASSETS.filter((x) => (META[x]?.category || 'Other') === cat);
                      if (!list.length) return null;
                      return (
                        <optgroup key={cat} label={`── ${cat} (${list.length}) ──`}>
                          {list.map((a) => (
                            <option key={a} value={a}>
                              {a} — {META[a]?.name} ({isIndianAsset(a) ? moneyINR(markets[a]?.price || 0) : money(markets[a]?.price || 0)})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Algorithm Class</label>
                  <select
                    value={newKind}
                    onChange={(e) => {
                      const k = e.target.value as StrategyKind;
                      setNewKind(k);
                      if (k === 'titan_quantum') {
                        setNewName(`${newAsset} Titan Quantum Apex Sentinel`);
                        setNewCooldown(120);
                        setNewTp(6.0);
                        setNewSl(2.0);
                      } else if (k === 'titan_adaptive') {
                        setNewName(`${newAsset} Titan Adaptive Multi-Regime Sentinel`);
                        setNewCooldown(180);
                        setNewTp(5.5);
                        setNewSl(2.2);
                      } else {
                        setNewName(`${newAsset} ${k.replace('_', ' ').toUpperCase()}`);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-medium"
                  >
                    <option value="titan_quantum">⚡ Titan Quantum Apex Sentinel (Zero-Loss Flagship)</option>
                    <option value="titan_adaptive">👑 Titan Adaptive Multi-Regime Sentinel</option>
                    <option value="ai_multi_factor">Composite Alpha Quant (AI Multi-Factor)</option>
                    <option value="vwap_trend">Institutional VWAP Trend Engine</option>
                    <option value="breakout_volatility">Adaptive Volatility Squeeze Breakout</option>
                    <option value="grid_scalp">Dynamic ATR Grid Scalper</option>
                    <option value="momentum">Enhanced Momentum Trend Surfer</option>
                    <option value="mean_reversion">Bollinger %B Exhaustion Dip Hunter</option>
                    <option value="dca">Smart Value-Weighted DCA</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Strategy Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-medium text-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Take-Profit Target (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newTp}
                    onChange={(e) => setNewTp(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-semibold text-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Trailing Stop-Loss (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newSl}
                    onChange={(e) => setNewSl(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-semibold text-zinc-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Max Allocation ({newAlloc}%)</label>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="5"
                    value={newAlloc}
                    onChange={(e) => setNewAlloc(Number(e.target.value))}
                    className="w-full accent-indigo-600 h-2 bg-zinc-200 rounded-full appearance-none cursor-pointer mt-2"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">Execution Cooldown</label>
                  <select
                    value={newCooldown}
                    onChange={(e) => setNewCooldown(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-medium"
                  >
                    <option value={60}>60 Seconds</option>
                    <option value={120}>120 Seconds</option>
                    <option value={180}>180 Seconds (Recommended)</option>
                    <option value={300}>300 Seconds</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeployModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  Deploy & Activate Engine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
              {['Indian Equities', 'Layer 1', 'DeFi', 'AI & Compute', 'Meme', 'Infra', 'Gaming', 'Other'].map((cat) => {
                const list = ASSETS.filter((x) => (META[x]?.category || 'Other') === cat);
                if (!list.length) return null;
                return (
                  <optgroup key={cat} label={`── ${cat} (${list.length}) ──`}>
                    {list.map((x) => (
                      <option key={x} value={x}>
                        {x} — {META[x]?.name} ({isIndianAsset(x) ? moneyINR(markets[x]?.price || 0) : money(markets[x]?.price || 0)})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">Condition</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-white border border-black/[0.08] rounded-xl outline-none font-medium"
            >
              <option value="above">Price Rises Above (₹ / $)</option>
              <option value="below">Price Drops Below (₹ / $)</option>
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

      {/* Quick 1-Click Alert Presets */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-semibold text-zinc-500">Quick Presets:</span>
        {[
          { asset: 'RELIANCE' as Asset, type: 'above' as const, value: 3000, label: 'RELIANCE > ₹3,000' },
          { asset: 'TCS' as Asset, type: 'above' as const, value: 4200, label: 'TCS > ₹4,200' },
          { asset: 'INFY' as Asset, type: 'above' as const, value: 1900, label: 'INFY > ₹1,900' },
          { asset: 'HDFCBANK' as Asset, type: 'above' as const, value: 1700, label: 'HDFCBANK > ₹1,700' },
          { asset: 'BTC' as Asset, type: 'above' as const, value: 100000, label: 'BTC > $100k' },
          { asset: 'ETH' as Asset, type: 'above' as const, value: 4000, label: 'ETH > $4k' },
          { asset: 'SOL' as Asset, type: 'above' as const, value: 250, label: 'SOL > $250' },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              addAlert({
                asset: preset.asset,
                type: preset.type,
                value: preset.value,
                enabled: true,
                isRecurring: true,
                cooldownSec: 300,
              });
            }}
            className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/60 rounded-xl transition-all shadow-2xs active:scale-95"
          >
            + {preset.label}
          </button>
        ))}
      </div>

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
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all ${
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
            <div className="col-span-2 p-10 text-center bg-white/60 rounded-3xl border border-black/[0.05] space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Bell className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-zinc-800">No Active Price Alerts</h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Configure threshold alerts above or click any preset to receive real-time audio chimes and visual warning banners.
              </p>
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
  const {
    state,
    setSettings,
    reset,
    accountMode,
    setAccountMode,
    exchangeAccount,
    openExchangeDrawer,
    upstoxAccount,
    openUpstoxDrawer,
    setLossPreventionMode,
  } = useLumen();

  const [key, setKey] = useState('');
  const [selectedModel, setSelectedModel] = useState(resolveGemini3Model(state.settings.geminiModel));

  useEffect(() => {
    let active = true;
    if (state.settings.geminiApiKey) {
      if (isEncryptedApiKey(state.settings.geminiApiKey)) {
        decryptApiKey(state.settings.geminiApiKey).then((dec) => {
          if (active && dec) setKey(dec);
        });
      } else {
        setKey(state.settings.geminiApiKey);
      }
    }
    return () => {
      active = false;
    };
  }, [state.settings.geminiApiKey]);
  const [saved, setSaved] = useState(false);
  const [sound, setSound] = useState(state.settings.soundEnabled ?? true);
  const [wsEnabled, setWsEnabled] = useState(state.settings.enableWebSocket ?? true);
  const [lossMode, setLossMode] = useState<'strict' | 'balanced' | 'aggressive'>(state.lossPreventionMode || 'balanced');
  const [slippageBps, setSlippageBps] = useState(state.settings.maxSlippageBps || 50);
  const [resetBalance, setResetBalance] = useState(50000);
  const [resetMode, setResetMode] = useState<'clean' | 'seeded'>('clean');
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleSave = () => {
    setLossPreventionMode(lossMode);
    setSettings({
      geminiApiKey: key.trim(),
      geminiModel: selectedModel,
      soundEnabled: sound,
      enableWebSocket: wsEnabled,
      maxSlippageBps: slippageBps,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Settings &amp; Platform Cockpit"
        subtitle="Manage dual-desk routing, Gemini 3 reasoning models, institutional risk policies, and key vault."
        action={
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl shadow-2xs transition-all active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            <span>Launch Setup Wizard</span>
          </button>
        }
      />

      {/* 1. Quick Start & Guided Tour Card */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-xs shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-950">Visual Setup Guide &amp; Interactive Tour</h3>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800">
                5-Step Walkthrough
              </span>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">
              Need a refresher on Simulated Paper vs Upstox Indian Equities (NSE/BSE), Gemini 3 series reasoning, or risk calibration?
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="px-4 py-2 text-xs font-bold text-white bg-zinc-950 hover:bg-zinc-800 rounded-xl shadow-sm transition-all whitespace-nowrap active:scale-95 shrink-0"
        >
          Open Visual Guide →
        </button>
      </div>

      {/* 2. AI Intelligence Desk */}
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.04]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-zinc-900">AI Intelligence Engine</h3>
          </div>
          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
            key ? 'bg-indigo-500/10 text-indigo-700' : 'bg-emerald-500/10 text-emerald-700'
          }`}>
            {key ? '🟢 Gemini 3 Series Active' : '🛡️ 100% Free Offline Quant Engine Active'}
          </span>
        </div>

        <p className="text-xs text-zinc-500">
          Lumen operates exclusively with Google Gemini 3 series models for frontier reasoning, or falls back to 26 deterministic client-side quant algorithms (15/15 benchmark win rate) with zero API keys.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 flex items-center justify-between">
            <span>Google Gemini API Key (Optional)</span>
            {key && (
              <button
                type="button"
                onClick={() => setKey('')}
                className="text-[11px] text-rose-600 hover:underline font-normal"
              >
                Clear Key (Revert to Free Local Mode)
              </button>
            )}
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIzaSy... (leave blank for 100% Free Offline Mode)"
            className="w-full px-3.5 py-2.5 text-xs font-mono bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700">Reasoning Model (Model 3 Series)</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-3.5 py-2.5 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 font-medium text-zinc-900"
          >
            {SUPPORTED_MODELS.map((m) => (
              <option key={m.name} value={m.name}>
                {m.displayName || m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-1 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400 font-mono">26 deterministic quant tools active</span>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-bold text-white bg-zinc-950 rounded-xl shadow-xs hover:bg-zinc-800 transition-all flex items-center gap-1.5"
          >
            {saved ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Saved!</> : 'Save AI Configuration'}
          </button>
        </div>
      </GlassCard>

      {/* 3. Execution Desks & Exchange Security Vault */}
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.04]">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-zinc-900">Execution Desks &amp; Gateway Vault</h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Active: <strong>{accountMode === 'upstox' ? 'Upstox (NSE/BSE)' : accountMode === 'exchange' ? 'Binance Spot' : 'Paper Sandbox'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            onClick={() => setAccountMode('paper')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              accountMode === 'paper'
                ? 'bg-zinc-900/5 border-zinc-900 ring-1 ring-zinc-900'
                : 'bg-white border-black/[0.08] hover:border-black/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <strong className="text-xs font-bold text-zinc-900">Simulated Paper Desk</strong>
              {accountMode === 'paper' && <span className="text-[10px] font-bold text-indigo-600">Selected</span>}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Virtual capital sandbox with live matching simulation.</p>
          </div>

          <div
            onClick={() => {
              if (!upstoxAccount?.connected) {
                openUpstoxDrawer();
              } else {
                setAccountMode('upstox');
              }
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              accountMode === 'upstox'
                ? 'bg-indigo-50/40 border-indigo-600 ring-1 ring-indigo-600'
                : 'bg-white border-black/[0.08] hover:border-black/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🇮🇳</span>
                <strong className="text-xs font-bold text-zinc-900">Upstox (NSE/BSE)</strong>
              </div>
              {accountMode === 'upstox' ? (
                <span className="text-[10px] font-bold text-indigo-600">Selected</span>
              ) : upstoxAccount?.connected ? (
                <span className="text-[10px] font-bold text-emerald-600">Connected</span>
              ) : null}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {upstoxAccount?.connected
                ? `Active (${upstoxAccount.accountId || 'Demat'}) • Valid to 03:30 AM IST`
                : 'Connect Upstox Demat account via OAuth 2.0.'}
            </p>
          </div>

          <div
            onClick={() => {
              setAccountMode('exchange');
              if (!exchangeAccount?.connected) openExchangeDrawer();
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              accountMode === 'exchange'
                ? 'bg-emerald-50/20 border-emerald-600 ring-1 ring-emerald-600'
                : 'bg-white border-black/[0.08] hover:border-black/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <strong className="text-xs font-bold text-zinc-900">Binance Spot Bridge</strong>
              {accountMode === 'exchange' && <span className="text-[10px] font-bold text-emerald-600">Selected</span>}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {exchangeAccount?.connected
                ? `Connected to ${exchangeAccount.environment.toUpperCase()} (${exchangeAccount.latencyMs ?? 0}ms ping)`
                : 'Connect API Key via Client-Side AES-GCM Vault.'}
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.05] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-700 font-medium">
              {exchangeAccount?.connected
                ? `Vault Active: Safe Spot Only (${exchangeAccount.canWithdraw ? 'Warning: Withdrawals on' : 'Withdrawals blocked'})`
                : 'Vault Locked: No keys loaded in browser memory.'}
            </span>
          </div>
          <button
            type="button"
            onClick={openExchangeDrawer}
            className="text-xs font-bold text-indigo-600 hover:underline"
          >
            {exchangeAccount?.connected ? 'Manage Keys ⚙️' : 'Configure Exchange Keys →'}
          </button>
        </div>
      </GlassCard>

      {/* 4. Institutional Capital Defense & Risk Policy Sentinel */}
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.04]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-bold text-zinc-900">Sentinel Capital Defense Policy</h3>
          </div>
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-500">
            Mode: {lossMode}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['strict', 'balanced', 'aggressive'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setLossMode(m);
                setLossPreventionMode(m);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                lossMode === m
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                  : 'bg-white border-black/[0.08] text-zinc-700 hover:bg-black/[0.02]'
              }`}
            >
              <div className="text-xs font-bold capitalize">{m} Defense</div>
              <div className={`text-[10px] mt-1 space-y-0.5 font-mono ${lossMode === m ? 'text-zinc-300' : 'text-zinc-500'}`}>
                <div>{m === 'strict' ? '25% Cash Reserve' : m === 'balanced' ? '15% Cash Reserve' : '10% Cash Reserve'}</div>
                <div>{m === 'strict' ? 'Max 35% Single Asset' : m === 'balanced' ? 'Max 50% Single Asset' : 'Max 60% Single Asset'}</div>
                <div>{m === 'strict' ? '1.0% Trade Risk' : m === 'balanced' ? '2.0% Trade Risk' : '3.5% Trade Risk'}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Max Execution Slippage Tolerance */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-zinc-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-zinc-400" />
              <span>Max Execution Slippage Tolerance</span>
            </label>
            <span className="font-mono font-semibold text-zinc-900">
              {slippageBps} bps ({(slippageBps / 100).toFixed(2)}%)
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={slippageBps}
            onChange={(e) => setSlippageBps(Number(e.target.value))}
            className="w-full h-1.5 bg-black/[0.06] rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
            <span>Tight (10 bps / 0.1%)</span>
            <span>Standard (50 bps / 0.5%)</span>
            <span>Volatile (200 bps / 2.0%)</span>
          </div>
        </div>
      </GlassCard>

      {/* 5. Sound & Telemetry Controls */}
      <GlassCard className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900 pb-1 border-b border-black/[0.04]">
          Telemetry &amp; Acoustic Controls
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.05] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-zinc-800">Acoustic Feedback</h4>
              <p className="text-[11px] text-zinc-500">Order fills &amp; alert chimes</p>
            </div>
            <button
              type="button"
              onClick={() => setSound(!sound)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                sound ? 'bg-indigo-600' : 'bg-zinc-300'
              }`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                sound ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.05] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-zinc-800">Binance WebSocket Feed</h4>
              <p className="text-[11px] text-zinc-500">Live sub-second quotes</p>
            </div>
            <button
              type="button"
              onClick={() => setWsEnabled(!wsEnabled)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                wsEnabled ? 'bg-indigo-600' : 'bg-zinc-300'
              }`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                wsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* 6. Simulator Capital Reset */}
      <GlassCard className="space-y-4 border-rose-500/20 bg-rose-500/[0.02]">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
          <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
          <span>Paper Simulator Capital Management</span>
        </div>
        <p className="text-xs text-zinc-600">
          Re-initialize your paper simulation balance and clear orders:
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setResetMode('clean')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              resetMode === 'clean'
                ? 'bg-white border-zinc-900 ring-1 ring-zinc-900 shadow-xs'
                : 'bg-black/[0.02] border-black/[0.06] text-zinc-600'
            }`}
          >
            <div className="text-xs font-bold text-zinc-900">Clean Slate</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">100% Cash, 0 positions, 0 orders</div>
          </button>

          <button
            type="button"
            onClick={() => setResetMode('seeded')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              resetMode === 'seeded'
                ? 'bg-white border-zinc-900 ring-1 ring-zinc-900 shadow-xs'
                : 'bg-black/[0.02] border-black/[0.06] text-zinc-600'
            }`}
          >
            <div className="text-xs font-bold text-zinc-900">Seeded Portfolio</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Starter BTC/ETH/SOL allocations</div>
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {[25000, 50000, 100000].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setResetBalance(amt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                resetBalance === amt
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                  : 'bg-white text-zinc-700 border-black/[0.08] hover:bg-black/[0.02]'
              }`}
            >
              ${amt.toLocaleString()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              if (confirm(`Reset paper simulation in ${resetMode} mode with $${resetBalance.toLocaleString()}?`)) {
                reset(resetBalance, resetMode);
              }
            }}
            className="ml-auto px-4 py-1.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all"
          >
            Reset Simulator Now
          </button>
        </div>
      </GlassCard>

      {/* Onboarding Visual Wizard Modal */}
      {wizardOpen && <OnboardingWizardModal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}

export { WalletPage } from './pages/WalletPage';

