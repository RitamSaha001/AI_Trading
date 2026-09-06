import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  RefreshCw,
  Sliders,
  Scale,
  Lock,
  ArrowRight,
  CheckCircle2,
  Activity,
  Clock,
  Flame,
  Octagon,
  Trash2,
  AlertTriangle,
  Layers,
  Radio,
} from 'lucide-react';
import { useLumen } from '../store';
import {
  PILOT_PROFILES,
  UPSTOX_FLEET_ASSETS,
  isMarketSessionOpen,
  initializeFleetStatus,
  createDefaultRateLimitStatus,
} from '../domain/autonomousPilot';
import {
  AutonomousPilotProfile,
  QuantitativeOpportunity,
  Asset,
  FleetAssetLifecycle,
} from '../types';
import { isIndianAsset, moneyINR, META, portfolioValue } from '../domain/portfolio';

export function AutonomousQuantPilot() {
  const {
    state,
    markets,
    autonomousPilot,
    toggleAutonomousPilot,
    setPilotProfile,
    setPilotExecutionMode,
    emergencyDisarmPilot,
    clearPilotLogs,
    scanPilotOpportunities,
    executePilotRecommendation,
    resetPilotCircuitBreaker,
  } = useLumen();

  const [activeTab, setActiveTab] = useState<'fleet' | 'opportunities' | 'logs'>('fleet');
  const [viewMode, setViewMode] = useState<'beginner' | 'quant'>('beginner');
  const [isScanning, setIsScanning] = useState(false);

  const activeProfileKey = autonomousPilot?.profile || 'conservative';
  const profileConfig = PILOT_PROFILES[activeProfileKey];
  const isEnabled = autonomousPilot?.enabled || false;
  const executionMode = autonomousPilot?.executionMode || 'full_autonomous';
  const isTripped = autonomousPilot?.circuitBreakerTripped || false;
  const opportunities = autonomousPilot?.activeOpportunities || [];
  const activeFleet = autonomousPilot?.activeFleet || initializeFleetStatus();
  const rateLimitStatus = autonomousPilot?.rateLimitStatus || createDefaultRateLimitStatus();
  const actionLogs = autonomousPilot?.actionLogs || [];

  const pv = portfolioValue(state, markets);
  const currentCash = state.accountMode === 'upstox' && state.upstoxAccount?.funds
    ? state.upstoxAccount.funds.availableCash
    : state.cash;
  const minCashFloorPct = Math.max(15, profileConfig.targetCashBufferPct);
  const minRequiredCash = pv * (minCashFloorPct / 100);
  const marketSession = isMarketSessionOpen();

  // Periodic scan to keep telemetry fresh
  useEffect(() => {
    scanPilotOpportunities();
    const timer = setInterval(() => {
      scanPilotOpportunities();
    }, 15000);
    return () => clearInterval(timer);
  }, [scanPilotOpportunities]);

  const handleScanClick = () => {
    setIsScanning(true);
    scanPilotOpportunities();
    setTimeout(() => setIsScanning(false), 600);
  };

  const handleExecute = (opp: QuantitativeOpportunity) => {
    executePilotRecommendation(opp);
  };

  const getLifecycleBadge = (lifecycleState?: FleetAssetLifecycle) => {
    switch (lifecycleState) {
      case 'TRAILING_PROFIT':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Zero-Risk Trailing
          </span>
        );
      case 'IN_POSITION':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            In Position
          </span>
        );
      case 'ORDER_PENDING':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping" />
            Pacing Queue
          </span>
        );
      case 'COOLDOWN':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
            Cooldown
          </span>
        );
      case 'MONITORING':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Monitoring Edge
          </span>
        );
    }
  };

  const getStrategyBadge = (strat?: string) => {
    switch (strat) {
      case 'Hurst Trend Rider':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'OU Mean Reversion':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Value Accumulator':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Titan Alpha Sentinel':
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
  };

  return (
    <div className="w-full liquid-glass rounded-3xl p-5 sm:p-6 border border-white/80 shadow-xs space-y-5 transition-all">
      {/* 1. Master Cockpit Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-950 via-indigo-800 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Cpu className="w-6 h-6 text-indigo-100" />
            </div>
            {isEnabled && !isTripped && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold tracking-tight text-zinc-950">
                Autonomous Local Quant Cockpit
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1 shadow-2xs">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                100% Offline Local Quant &bull; Zero Gemini
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                NIFTY 10 Fleet
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Multi-Asset Quantitative Fleet &bull; Upstox Rate-Paced Orders &bull; Dynamic Trailing Ratchets &bull; 15% Liquidity Floor
            </p>
          </div>
        </div>

        {/* Master Control Matrix */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleScanClick}
            disabled={isScanning}
            className="p-2.5 rounded-xl text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04] transition-all apple-btn-tactile border border-black/[0.05]"
            title="Force refresh quantitative scans"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Execution Mode Selector: Full Autonomous vs Semi-Autonomous */}
          <div className="apple-segmented-track p-1 bg-black/[0.04] rounded-xl flex items-center">
            <button
              type="button"
              onClick={() => setPilotExecutionMode('full_autonomous')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                executionMode === 'full_autonomous'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="Autonomous system undertakes all strategies and executes orders without manual intervention"
            >
              Full Auto
            </button>
            <button
              type="button"
              onClick={() => setPilotExecutionMode('semi_autonomous')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                executionMode === 'semi_autonomous'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="System analyzes and proposes setups, requiring 1-click execution"
            >
              Semi-Auto
            </button>
          </div>

          {/* Master Pilot Toggle */}
          <button
            type="button"
            onClick={toggleAutonomousPilot}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all apple-btn-tactile flex items-center gap-2 shadow-xs ${
              isEnabled
                ? 'bg-emerald-600 text-white shadow-emerald-500/25 hover:bg-emerald-700 ring-2 ring-emerald-600/30'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${isEnabled ? 'text-emerald-200 animate-pulse' : 'text-zinc-400'}`} />
            <span>{isEnabled ? 'Pilot Engaged' : 'Engage Pilot'}</span>
          </button>

          {/* Emergency Disarm Button */}
          {isEnabled && (
            <button
              type="button"
              onClick={emergencyDisarmPilot}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-xl transition-all apple-btn-tactile flex items-center gap-1.5 shrink-0"
              title="Instant emergency disarm and order cancel"
            >
              <Octagon className="w-3.5 h-3.5 text-rose-600" />
              <span>Disarm</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Safety & Operational Health Status Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Rate Limiter Status */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1 font-medium">
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              Upstox Rate Limit
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              rateLimitStatus.isThrottled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {rateLimitStatus.isThrottled ? 'Paced' : 'Optimal'}
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-zinc-950">
            {rateLimitStatus.requestsThisMinute} / {rateLimitStatus.maxPerMinute} <span className="text-[11px] font-normal text-zinc-500">orders/min</span>
          </div>
          <div className="text-[10px] text-zinc-400">
            &ge;1,500ms pacing &bull; Rolling window
          </div>
        </div>

        {/* Mandatory Cash Buffer */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Cash Liquidity Floor
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
              &ge;{minCashFloorPct}% Guard
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-zinc-950">
            {moneyINR(currentCash)}
          </div>
          <div className="text-[10px] text-zinc-400">
            Floor: {moneyINR(minRequiredCash)} reserve
          </div>
        </div>

        {/* Market Session & NSE Hours */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1 font-medium">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              NSE Trading Session
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              marketSession.isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'
            }`}>
              {marketSession.isOpen ? 'Session Active' : 'Closed'}
            </span>
          </div>
          <div className="text-xs font-bold text-zinc-900 truncate">
            {marketSession.sessionDescription}
          </div>
          <div className="text-[10px] text-zinc-400">
            09:15 - 15:30 IST &bull; 15:00 MIS Cutoff
          </div>
        </div>

        {/* Drawdown Circuit Breaker */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              Circuit Breaker
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
              isTripped ? 'bg-rose-100 text-rose-800' : 'bg-zinc-100 text-zinc-700'
            }`}>
              {isTripped ? 'TRIPPED' : 'ARMED'}
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-zinc-950">
            {(autonomousPilot?.dailyDrawdownPct || 0).toFixed(2)}% <span className="text-[11px] font-normal text-zinc-400">/ {profileConfig.maxDrawdownCircuitBreakerPct}%</span>
          </div>
          <div className="text-[10px] text-zinc-400">
            Trades Executed: {autonomousPilot?.totalAutopilotTradesExecuted || 0}
          </div>
        </div>
      </div>

      {/* Circuit Breaker Alert Banner */}
      {isTripped && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Capital Protection Circuit Breaker Tripped
              </h4>
              <p className="text-xs text-rose-600">
                {autonomousPilot?.tripReason || 'Daily drawdown limit reached. Trading halted to protect cash.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetPilotCircuitBreaker}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs shrink-0"
          >
            Reset Circuit Breaker
          </button>
        </div>
      )}

      {/* 3. Strategy Profile Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['conservative', 'balanced', 'momentum'] as AutonomousPilotProfile[]).map((pKey) => {
          const cfg = PILOT_PROFILES[pKey];
          const isSelected = activeProfileKey === pKey;
          return (
            <button
              key={pKey}
              type="button"
              onClick={() => setPilotProfile(pKey)}
              className={`p-3.5 rounded-2xl border text-left transition-all apple-btn-tactile ${
                isSelected
                  ? 'bg-white border-indigo-600/60 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-600/30'
                  : 'bg-white/50 hover:bg-white border-black/[0.05] text-zinc-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold flex items-center gap-1.5 ${isSelected ? 'text-indigo-950' : 'text-zinc-800'}`}>
                  {pKey === 'conservative' && <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />}
                  {pKey === 'balanced' && <Scale className="w-3.5 h-3.5 text-emerald-600" />}
                  {pKey === 'momentum' && <TrendingUp className="w-3.5 h-3.5 text-blue-600" />}
                  <span>{cfg.name}</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-black/[0.04] text-zinc-600 font-semibold">
                  Min {cfg.minRiskReward}:1 R:R
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                {cfg.tagline}
              </p>
              <div className="mt-2 pt-2 border-t border-black/[0.04] flex items-center justify-between text-[10px] text-zinc-400">
                <span>Max Risk: {cfg.maxRiskPerTradePct}%/trade</span>
                <span>Buffer: {cfg.targetCashBufferPct}% Cash</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 4. Cockpit View Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-black/[0.06] pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'fleet'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Fleet Command Matrix</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 text-white font-mono">
              10
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('opportunities')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'opportunities'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Premier Setups</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 font-mono">
              {opportunities.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Activity Audit Stream</span>
            {actionLogs.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-200 text-zinc-700 font-mono">
                {actionLogs.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'opportunities' && (
          <div className="apple-segmented-track text-xs">
            <button
              type="button"
              onClick={() => setViewMode('beginner')}
              className={`apple-segmented-item ${viewMode === 'beginner' ? 'active' : 'text-zinc-500'}`}
            >
              Plain English
            </button>
            <button
              type="button"
              onClick={() => setViewMode('quant')}
              className={`apple-segmented-item ${viewMode === 'quant' ? 'active' : 'text-zinc-500'}`}
            >
              Quant Math
            </button>
          </div>
        )}

        {activeTab === 'logs' && actionLogs.length > 0 && (
          <button
            type="button"
            onClick={clearPilotLogs}
            className="text-[11px] text-zinc-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear Logs
          </button>
        )}
      </div>

      {/* 5. TAB CONTENT PANELS */}

      {/* TAB 1: FLEET COMMAND MATRIX */}
      {activeTab === 'fleet' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Autonomous desk monitoring <strong>10 Indian Bluechips</strong> across 4 local quantitative strategies
            </span>
            <span className="text-[11px] text-zinc-400">
              Live IST Price Feed &bull; Upstox API Paced
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white/80 shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-zinc-500">
                  <th className="py-3 px-3.5">Asset / Company</th>
                  <th className="py-3 px-3">Live Spot</th>
                  <th className="py-3 px-3">Assigned Strategy</th>
                  <th className="py-3 px-3">Regime / Hurst</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Targets (SL / TP)</th>
                  <th className="py-3 px-3.5 text-right">Position &amp; P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {UPSTOX_FLEET_ASSETS.map((asset) => {
                  const meta = META[asset];
                  const mkt = markets[asset];
                  const price = mkt?.price || meta.basePrice;
                  const fleetItem = activeFleet[asset];
                  const strat = fleetItem?.assignedStrategy || 'Titan Alpha Sentinel';
                  const hurst = fleetItem?.hurst ?? 0.50;
                  const unitsHeld = state.positions[asset] || fleetItem?.unitsHeld || 0;
                  const avgPrice = state.avgBuyPrice?.[asset] || fleetItem?.entryPrice || price;
                  const pnlAmt = unitsHeld > 0 ? (price - avgPrice) * unitsHeld : 0;
                  const pnlPct = unitsHeld > 0 && avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : 0;

                  return (
                    <tr key={asset} className="hover:bg-indigo-50/20 transition-colors">
                      {/* Asset & Name */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-2xs shrink-0"
                            style={{ backgroundColor: meta?.iconColor || '#4f46e5' }}
                          >
                            {asset.slice(0, 3)}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-950 flex items-center gap-1">
                              {asset}
                              <span className="text-[10px] text-zinc-400 font-normal">NSE</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[130px]">
                              {meta?.name || asset}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Live Spot */}
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-zinc-900">
                          {moneyINR(price)}
                        </div>
                        <div className={`text-[10px] font-mono ${
                          (mkt?.change24h || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {(mkt?.change24h || 0) >= 0 ? '+' : ''}{(mkt?.change24h || 0).toFixed(2)}%
                        </div>
                      </td>

                      {/* Assigned Strategy */}
                      <td className="py-3 px-3">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border ${getStrategyBadge(strat)}`}>
                          {strat}
                        </span>
                      </td>

                      {/* Regime / Hurst */}
                      <td className="py-3 px-3">
                        <div className="text-zinc-800 font-medium text-[11px]">
                          {fleetItem?.regimeLabel || 'Calibrating'}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          Hurst H={hurst.toFixed(2)}
                        </div>
                      </td>

                      {/* Lifecycle Status */}
                      <td className="py-3 px-3">
                        {getLifecycleBadge(fleetItem?.state)}
                      </td>

                      {/* Stop-Loss & Target Brackets */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {unitsHeld > 0 && fleetItem?.stopLossPrice ? (
                          <div className="space-y-0.5">
                            <div className="text-rose-600 font-medium">
                              SL: {moneyINR(fleetItem.stopLossPrice)}
                              {fleetItem.state === 'TRAILING_PROFIT' && (
                                <span className="ml-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">RATCHET</span>
                              )}
                            </div>
                            <div className="text-emerald-600 font-medium">
                              TP: {moneyINR(fleetItem.takeProfitPrice || price * 1.05)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-[10px]">&mdash;</span>
                        )}
                      </td>

                      {/* Position & P&L */}
                      <td className="py-3 px-3.5 text-right font-mono">
                        {unitsHeld > 0 ? (
                          <div>
                            <div className="font-bold text-zinc-900">
                              {unitsHeld} shares
                            </div>
                            <div className={`text-[10px] font-semibold ${pnlAmt >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {pnlAmt >= 0 ? '+' : ''}{moneyINR(pnlAmt)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-[11px]">0 shares</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PREMIER QUANTITATIVE SETUPS */}
      {activeTab === 'opportunities' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
            <span>
              High-conviction setups satisfying strict {profileConfig.minRiskReward}:1 reward-to-risk and local composite filters
            </span>
            {autonomousPilot?.lastScanAt && (
              <span className="text-[10px] text-zinc-400">
                Scanned: {new Date(autonomousPilot.lastScanAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {opportunities.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/40 border border-black/[0.04] text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-zinc-900">Capital 100% Protected</h4>
              <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                No markets currently satisfy your strict {profileConfig.minRiskReward}:1 profit-to-risk threshold and safety filters.
                The Local Quant Engine holds liquid capital until an optimal asymmetric setup is verified.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {opportunities.map((opp) => {
                const isIndian = isIndianAsset(opp.asset);
                const currSym = '₹';
                const assetMeta = META[opp.asset];

                return (
                  <div
                    key={opp.id}
                    className="p-4 rounded-2xl bg-white/90 border border-black/[0.06] shadow-xs space-y-3 hover:border-indigo-500/40 transition-all"
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-2xs"
                          style={{ backgroundColor: assetMeta?.iconColor || '#4f46e5' }}
                        >
                          {opp.asset.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-zinc-950">
                              {assetMeta?.name || opp.asset}
                            </span>
                            <span className="text-[10px] font-semibold text-zinc-500">
                              ({opp.asset} &bull; NSE)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono">
                              {opp.riskRewardRatio}:1 R:R
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                              {opp.confidenceLabel} CONVICTION ({opp.compositeScore}/100)
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleExecute(opp)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs apple-btn-tactile shrink-0"
                      >
                        <span>Execute</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Body Content based on View Mode */}
                    {viewMode === 'beginner' ? (
                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100/60 text-indigo-950">
                          <span className="font-bold">Why Trade This: </span>
                          <span className="text-zinc-600 leading-relaxed">
                            {opp.beginnerExplanation.why}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-emerald-50/40 border border-emerald-100/60 text-emerald-950">
                          <span className="font-bold">Safety Guarantee: </span>
                          <span className="text-zinc-600 leading-relaxed">
                            {opp.beginnerExplanation.safeguardNotice}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <p className="text-zinc-600 text-[11px] leading-relaxed">
                          {opp.plainEnglishRationale}
                        </p>
                        <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
                          <div className="p-1.5 rounded-lg bg-black/[0.03]">
                            <span className="text-zinc-400 block">RSI(14)</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.rsi}</span>
                          </div>
                          <div className="p-1.5 rounded-lg bg-black/[0.03]">
                            <span className="text-zinc-400 block">ATR</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.atr}</span>
                          </div>
                          <div className="p-1.5 rounded-lg bg-black/[0.03]">
                            <span className="text-zinc-400 block">Regime</span>
                            <span className="font-semibold text-zinc-800">{opp.regime.split('_')[0]}</span>
                          </div>
                          <div className="p-1.5 rounded-lg bg-black/[0.03]">
                            <span className="text-zinc-400 block">Vol</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.volatilityPct}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mathematical Levels Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-black/[0.04] text-xs">
                      <div className="p-2 rounded-xl bg-black/[0.02]">
                        <span className="text-[10px] text-zinc-400 block">Entry Spot</span>
                        <span className="font-bold font-mono text-zinc-950">
                          {currSym}{opp.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-rose-50/50 border border-rose-100/60">
                        <span className="text-[10px] text-rose-600 block font-medium">Stop-Loss (Capped)</span>
                        <span className="font-bold font-mono text-rose-700">
                          {currSym}{opp.stopLossPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-emerald-50/50 border border-emerald-100/60">
                        <span className="text-[10px] text-emerald-600 block font-medium">Target Profit</span>
                        <span className="font-bold font-mono text-emerald-700">
                          {currSym}{opp.takeProfitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Risk Budget Summary */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 pt-1">
                      <span>
                        Size: <strong className="text-zinc-800">{opp.recommendedUnits} {isIndian ? 'shares' : 'units'}</strong>
                      </span>
                      <span>
                        Max Loss: <strong className="text-rose-600">{currSym}{opp.projectedLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                      <span>
                        Target Gain: <strong className="text-emerald-600">+{currSym}{opp.projectedGain.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUTONOMOUS AUDIT & ACTIVITY STREAM */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Live chronological activity stream recorded by the Autonomous Local Quant Pilot
            </span>
            <span className="text-[11px] text-zinc-400">
              Deterministic Invariant Verification
            </span>
          </div>

          {actionLogs.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/40 border border-black/[0.04] text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <Clock className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-zinc-900">Activity Log Clean</h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                When the pilot undertakes entries, adjusts trailing ratchets, or paces orders against Upstox limits, events will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {actionLogs.map((log) => {
                let badgeStyle = 'bg-zinc-100 text-zinc-700';
                if (log.action === 'BUY_ENTRY') badgeStyle = 'bg-emerald-100 text-emerald-800 font-bold';
                if (log.action === 'TAKE_PROFIT') badgeStyle = 'bg-indigo-100 text-indigo-800 font-bold';
                if (log.action === 'STOP_LOSS') badgeStyle = 'bg-rose-100 text-rose-800 font-bold';
                if (log.action === 'TRAILING_RATCHET') badgeStyle = 'bg-teal-100 text-teal-800 font-bold';
                if (log.action === 'THROTTLED') badgeStyle = 'bg-amber-100 text-amber-800 font-bold';

                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-white/90 border border-black/[0.05] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-md ${badgeStyle}`}>
                        {log.action.replace('_', ' ')}
                      </span>
                      <span className="font-bold text-zinc-900">
                        {log.asset}
                      </span>
                      <span className="text-zinc-600">
                        {log.detail}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-zinc-400">
                      {log.price > 0 && (
                        <span className="font-mono text-zinc-700 font-medium">
                          {moneyINR(log.price)}
                        </span>
                      )}
                      <span>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
