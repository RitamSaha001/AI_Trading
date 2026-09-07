import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  RefreshCw,
  Scale,
  ArrowRight,
  Clock,
  Octagon,
  Trash2,
  AlertTriangle,
  Layers,
  Activity,
  CheckCircle2,
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
  const currentCash = state.accountMode === 'upstox'
    ? (state.upstoxAccount?.funds?.availableCash ??
        (state.upstoxAccount?.balances?.INR?.free !== undefined
          ? Number(state.upstoxAccount.balances.INR.free)
          : state.cash))
    : state.cash;
  const minCashFloorPct = Math.max(15, profileConfig.targetCashBufferPct);
  const minRequiredCash = pv * (minCashFloorPct / 100);
  const marketSession = isMarketSessionOpen();
  const isLiveUpstox = state.accountMode === 'upstox';

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
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Trailing SL
          </span>
        );
      case 'IN_POSITION':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            In Position
          </span>
        );
      case 'ORDER_PENDING':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Order Queued
          </span>
        );
      case 'COOLDOWN':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
            Cooldown
          </span>
        );
      case 'MONITORING':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Monitoring
          </span>
        );
    }
  };

  const getStrategyBadge = (strat?: string) => {
    switch (strat) {
      case 'Hurst Trend Rider':
        return 'bg-sky-50 text-sky-700 border-sky-200/70';
      case 'OU Mean Reversion':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
      case 'Value Accumulator':
        return 'bg-amber-50 text-amber-700 border-amber-200/70';
      case 'Titan Alpha Sentinel':
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/70';
    }
  };

  return (
    <div className="w-full liquid-glass rounded-3xl p-5 sm:p-6 border border-white/80 shadow-xs space-y-5 transition-all">
      {/* 1. Sleek Minimalist Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-1">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-zinc-950 text-white flex items-center justify-center shadow-sm">
              <Cpu className="w-5 h-5 text-zinc-100" />
            </div>
            {isEnabled && !isTripped && (
              <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                isLiveUpstox && !marketSession.isOpen ? 'bg-blue-500' : 'bg-emerald-500 animate-pulse'
              }`} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold tracking-tight text-zinc-950">
                Autonomous Quantitative Desk
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
                10 Nifty Bluechips
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                isEnabled
                  ? (isLiveUpstox && !marketSession.isOpen
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isEnabled
                    ? (isLiveUpstox && !marketSession.isOpen ? 'bg-blue-500' : 'bg-emerald-500')
                    : 'bg-zinc-400'
                }`} />
                {isEnabled
                  ? (isLiveUpstox && !marketSession.isOpen ? 'Armed (Standby • 09:15 Open)' : 'Active (Autonomous)')
                  : 'Standby (Disarmed)'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              100% Deterministic Local Quant &bull; Half-Kelly Capital Sizing &bull; Dynamic Stop-Loss &amp; Profit Harvest Brackets
            </p>
          </div>
        </div>

        {/* Master Control Action Group */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleScanClick}
            disabled={isScanning}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all border border-black/[0.06] apple-btn-tactile"
            title="Scan market for qualified quantitative setups"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Mode Switcher */}
          <div className="apple-segmented-track p-0.5 bg-black/[0.04] rounded-xl flex items-center text-xs">
            <button
              type="button"
              onClick={() => setPilotExecutionMode('full_autonomous')}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                executionMode === 'full_autonomous'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Full Autonomous: Automatically routes limit orders when setups qualify"
            >
              Full Auto
            </button>
            <button
              type="button"
              onClick={() => setPilotExecutionMode('semi_autonomous')}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                executionMode === 'semi_autonomous'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Semi-Auto: Scans setups and requires 1-click execution"
            >
              Semi-Auto
            </button>
          </div>

          {/* Master Toggle */}
          <button
            type="button"
            onClick={toggleAutonomousPilot}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all apple-btn-tactile flex items-center gap-1.5 shadow-xs ${
              isEnabled
                ? (isLiveUpstox && !marketSession.isOpen
                    ? 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-700'
                    : 'bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-700')
                : 'bg-zinc-950 text-white hover:bg-zinc-800'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${isEnabled ? (isLiveUpstox && !marketSession.isOpen ? 'text-blue-200' : 'text-emerald-200 animate-pulse') : 'text-zinc-400'}`} />
            <span>{isEnabled ? (isLiveUpstox && !marketSession.isOpen ? 'Armed (Standby)' : 'Pilot Active') : 'Engage Autopilot'}</span>
          </button>

          {/* Emergency Disarm */}
          {isEnabled && (
            <button
              type="button"
              onClick={emergencyDisarmPilot}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-xl transition-all apple-btn-tactile flex items-center gap-1 shrink-0"
              title="Instant emergency disarm and cancel open orders"
            >
              <Octagon className="w-3.5 h-3.5 text-rose-600" />
              <span>Disarm</span>
            </button>
          )}
        </div>
      </div>

      {/* Cloud Daemon Dual-Mode Status Indicator */}
      {isLiveUpstox && (() => {
        const isCloudDaemonConfirmed = Boolean(
          autonomousPilot?.cloudDaemonStatus &&
          autonomousPilot?.lastCloudSyncAt &&
          Date.now() - autonomousPilot.lastCloudSyncAt < 30_000
        );

        return (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isEnabled
                    ? (isCloudDaemonConfirmed ? 'bg-emerald-400' : 'bg-blue-400')
                    : 'bg-zinc-300'
                }`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isEnabled
                    ? (isCloudDaemonConfirmed ? 'bg-emerald-500' : 'bg-blue-500')
                    : 'bg-zinc-400'
                }`} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-zinc-900">
                  Execution Master:
                </span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                  isEnabled
                    ? (isCloudDaemonConfirmed
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200')
                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                }`}>
                  {!isEnabled
                    ? 'STANDBY • Ready to arm'
                    : isCloudDaemonConfirmed
                    ? 'CLOUD DAEMON ACTIVE • Safe to close browser tab'
                    : 'BROWSER PILOT ACTIVE • Keep tab open (Local master)'}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-zinc-500 flex items-center gap-2 flex-wrap">
              <span>
                Mode: <strong className="text-zinc-800 font-semibold">{isCloudDaemonConfirmed ? (autonomousPilot?.cloudDaemonStatus || 'BROWSER_LINKED') : 'BROWSER_LOCAL'}</strong>
              </span>
              <span>&bull;</span>
              <span>
                Host: <span className="font-mono text-zinc-700 font-medium">{isCloudDaemonConfirmed ? '87.76.191.49' : 'Local Browser Client'}</span>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Standby Banner when market is closed */}
      {isEnabled && isLiveUpstox && !marketSession.isOpen && (
        <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 text-blue-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <span className="text-xs font-bold text-blue-900">
                Armed in Standby &bull; Capital Safeguarded
              </span>
              <p className="text-xs text-blue-700 mt-0.5">
                Indian markets (NSE) are closed. All 10 bluechip models and Half-Kelly sizing circuits are armed in standby. No live orders will be routed tonight. Execution begins at <strong>09:15 AM IST tomorrow</strong>.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg inline-block border border-blue-200/60 shrink-0">
            Opens 09:15 AM IST
          </span>
        </div>
      )}

      {/* Disarmed Notice Banner */}
      {!isEnabled && (
        <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-zinc-500 shrink-0" />
            <span className="text-xs text-zinc-600">
              <strong>Autopilot on Standby:</strong> Local quantitative multi-factor scanning is idle. Click <strong>"Engage Autopilot"</strong> to arm automated model scanning and limit order routing.
            </span>
          </div>
          <button
            type="button"
            onClick={toggleAutonomousPilot}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs shrink-0 apple-btn-tactile flex items-center gap-1"
          >
            <Zap className="w-3 h-3 text-emerald-200" />
            <span>Engage</span>
          </button>
        </div>
      )}

      {/* 2. Executive Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Available Capital */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="font-medium flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Available Capital
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              100% Cash
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-zinc-950">
            {moneyINR(currentCash)}
          </div>
          <div className="text-[10px] text-zinc-400">
            Reserve floor: {moneyINR(minRequiredCash)}
          </div>
        </div>

        {/* Market Session */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              NSE Session
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
              marketSession.isOpen ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'
            }`}>
              {marketSession.isOpen ? 'Live' : 'Closed'}
            </span>
          </div>
          <div className="text-xs font-bold text-zinc-900 truncate">
            {marketSession.sessionDescription}
          </div>
          <div className="text-[10px] text-zinc-400">
            09:15 - 15:30 IST
          </div>
        </div>

        {/* Risk & Drawdown */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="font-medium flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              Drawdown Defense
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
              isTripped ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'
            }`}>
              {isTripped ? 'TRIPPED' : 'ARMED'}
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-zinc-950">
            {(autonomousPilot?.dailyDrawdownPct || 0).toFixed(2)}% <span className="text-[11px] font-normal text-zinc-400">/ {profileConfig.maxDrawdownCircuitBreakerPct}%</span>
          </div>
          <div className="text-[10px] text-zinc-400">
            Max loss cap: ₹{((currentCash * profileConfig.maxDrawdownCircuitBreakerPct) / 100).toFixed(0)}
          </div>
        </div>

        {/* Order Pacing */}
        <div className="p-3 rounded-2xl bg-white/70 border border-black/[0.05] shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="font-medium flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              Order Rate Pacing
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
              rateLimitStatus.isThrottled ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {rateLimitStatus.isThrottled ? 'Paced' : 'Optimal'}
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-zinc-950">
            {rateLimitStatus.requestsThisMinute} / {rateLimitStatus.maxPerMinute} <span className="text-[11px] font-normal text-zinc-500">orders/min</span>
          </div>
          <div className="text-[10px] text-zinc-400">
            &ge;1,500ms safety interval
          </div>
        </div>
      </div>

      {/* Circuit Breaker Alert */}
      {isTripped && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Capital Protection Circuit Breaker Tripped
              </h4>
              <p className="text-xs text-rose-600">
                {autonomousPilot?.tripReason || 'Daily drawdown limit reached. Order routing halted to safeguard capital.'}
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

      {/* 3. Strategy Profiles */}
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
                  ? 'bg-white border-zinc-900 shadow-sm ring-1 ring-zinc-900'
                  : 'bg-white/50 hover:bg-white border-black/[0.05] text-zinc-600'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold flex items-center gap-1.5 ${isSelected ? 'text-zinc-950' : 'text-zinc-800'}`}>
                  {pKey === 'conservative' && <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />}
                  {pKey === 'balanced' && <Scale className="w-3.5 h-3.5 text-emerald-600" />}
                  {pKey === 'momentum' && <TrendingUp className="w-3.5 h-3.5 text-blue-600" />}
                  <span>{cfg.name}</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-black/[0.04] text-zinc-600 font-semibold">
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

      {/* 4. Streamlined Institutional Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-black/[0.06] pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'fleet'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Active Model Fleet</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/20 text-white font-mono">
              10
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('opportunities')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'opportunities'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Actionable Setups</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
              activeTab === 'opportunities' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
            }`}>
              {opportunities.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Audit &amp; Execution Stream</span>
            {actionLogs.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                activeTab === 'logs' ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-700'
              }`}>
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

      {/* 5. TAB 1: ACTIVE MODEL FLEET */}
      {activeTab === 'fleet' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Autonomous desk monitoring <strong>10 liquid Indian Bluechips</strong> via local statistical models
            </span>
            <span className="text-[11px] text-zinc-400">
              Authoritative Upstox Quotes &bull; Zero Heuristic Jitter
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white/80 shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-zinc-500">
                  <th className="py-3 px-3.5">Asset / Company</th>
                  <th className="py-3 px-3">Spot Price</th>
                  <th className="py-3 px-3">Assigned Model</th>
                  <th className="py-3 px-3">Market Regime</th>
                  <th className="py-3 px-3">Desk Status</th>
                  <th className="py-3 px-3">Target Brackets (SL / TP)</th>
                  <th className="py-3 px-3.5 text-right">Position &amp; Net P&amp;L</th>
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
                    <tr key={asset} className="hover:bg-zinc-50/80 transition-colors">
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
                            <div className="font-bold text-zinc-950 flex items-center gap-1.5">
                              {asset}
                              <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                                {fleetItem?.sector || 'Equities'}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-normal">NSE</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[140px]">
                              {meta?.name || asset}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Authoritative Live Spot */}
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

                      {/* Assigned Quantitative Strategy */}
                      <td className="py-3 px-3">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border ${getStrategyBadge(strat)}`}>
                          {strat}
                        </span>
                        {fleetItem?.squeezeStatus === 'SQUEEZE_ON' && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Volatility Compression
                          </div>
                        )}
                        {fleetItem?.squeezeStatus === 'SQUEEZE_OFF' && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping" />
                            Expansion Breakout
                          </div>
                        )}
                      </td>

                      {/* Regime & Hurst */}
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

                      {/* Targets */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {unitsHeld > 0 && fleetItem?.stopLossPrice ? (
                          <div className="space-y-0.5">
                            <div className="text-rose-600 font-medium">
                              SL: {moneyINR(fleetItem.stopLossPrice)}
                            </div>
                            <div className="text-emerald-600 font-medium">
                              TP: {moneyINR(fleetItem.takeProfitPrice || price * 1.04)}
                            </div>
                          </div>
                        ) : (
                          <div className="text-zinc-400 text-[10px]">
                            Half-Kelly: <span className="font-semibold text-zinc-600">{(fleetItem?.kellyFraction || 1.0).toFixed(2)}x</span>
                          </div>
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

      {/* 6. TAB 2: ACTIONABLE SETUPS */}
      {activeTab === 'opportunities' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
            <span>
              High-conviction setups satisfying minimum {profileConfig.minRiskReward}:1 profit-to-risk threshold
            </span>
            {autonomousPilot?.lastScanAt && (
              <span className="text-[10px] text-zinc-400">
                Last scan: {new Date(autonomousPilot.lastScanAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {opportunities.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/50 border border-black/[0.05] text-center space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200/60">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-zinc-900">Capital 100% Preserved</h4>
              <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                No setups currently meet your minimum {profileConfig.minRiskReward}:1 risk-reward hurdle and liquidity filters. The engine holds liquid capital until an asymmetric edge is mathematically confirmed.
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
                    className="p-4 rounded-2xl bg-white/90 border border-black/[0.06] shadow-2xs space-y-3 hover:border-zinc-400/60 transition-all"
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
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-mono border border-emerald-200">
                              {opp.riskRewardRatio}:1 R:R
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {opp.confidenceLabel} ({opp.compositeScore}/100)
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isLiveUpstox && !marketSession.isOpen}
                        onClick={() => handleExecute(opp)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs apple-btn-tactile shrink-0 ${
                          isLiveUpstox && !marketSession.isOpen
                            ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                        }`}
                        title={isLiveUpstox && !marketSession.isOpen ? 'Indian markets are closed (09:15 - 15:30 IST). Orders unlock tomorrow morning.' : 'Execute setup'}
                      >
                        <span>{isLiveUpstox && !marketSession.isOpen ? 'Market Closed' : 'Execute Setup'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Description based on View Mode */}
                    {viewMode === 'beginner' ? (
                      <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/70 text-xs text-zinc-700 leading-relaxed">
                        <span className="font-bold text-zinc-900">Quantitative Edge: </span>
                        {opp.beginnerExplanation.why}
                      </div>
                    ) : (
                      <div className="space-y-1 text-xs">
                        <p className="text-zinc-600 text-[11px] leading-relaxed">
                          {opp.plainEnglishRationale}
                        </p>
                        <div className="grid grid-cols-4 gap-1.5 pt-1 font-mono text-[10px]">
                          <div className="p-1 rounded-md bg-black/[0.02]">
                            <span className="text-zinc-400 block">RSI(14)</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.rsi}</span>
                          </div>
                          <div className="p-1 rounded-md bg-black/[0.02]">
                            <span className="text-zinc-400 block">ATR</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.atr}</span>
                          </div>
                          <div className="p-1 rounded-md bg-black/[0.02]">
                            <span className="text-zinc-400 block">Regime</span>
                            <span className="font-semibold text-zinc-800">{opp.regime.split('_')[0]}</span>
                          </div>
                          <div className="p-1 rounded-md bg-black/[0.02]">
                            <span className="text-zinc-400 block">Volatility</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.volatilityPct}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mathematical Target Brackets Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-black/[0.04] text-xs">
                      <div className="p-2 rounded-xl bg-black/[0.02]">
                        <span className="text-[10px] text-zinc-400 block">Entry Spot</span>
                        <span className="font-bold font-mono text-zinc-950">
                          {currSym}{opp.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-100">
                        <span className="text-[10px] text-rose-600 block font-medium">Stop-Loss (Capped)</span>
                        <span className="font-bold font-mono text-rose-700">
                          {currSym}{opp.stopLossPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-100">
                        <span className="text-[10px] text-emerald-600 block font-medium">Target Profit</span>
                        <span className="font-bold font-mono text-emerald-700">
                          {currSym}{opp.takeProfitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Capital Sizing Summary */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 px-0.5 pt-0.5">
                      <span>
                        Size: <strong className="text-zinc-800">{opp.recommendedUnits} {isIndian ? 'shares' : 'units'}</strong>
                      </span>
                      <span>
                        Max Risk: <strong className="text-rose-600">{currSym}{opp.projectedLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                      <span>
                        Target Return: <strong className="text-emerald-600">+{currSym}{opp.projectedGain.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7. TAB 3: AUDIT & EXECUTION STREAM */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Deterministic execution &amp; safety invariant audit stream recorded in real time
            </span>
            <span className="text-[11px] text-zinc-400">
              SEBI Capital Protection Verifier
            </span>
          </div>

          {actionLogs.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/50 border border-black/[0.05] text-center space-y-2">
              <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <Clock className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-zinc-900">
                {isEnabled ? 'Monitoring Market Signals' : 'Desk on Standby'}
              </h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                {isEnabled
                  ? 'The engine is scanning the 10 bluechip fleet. When market setups qualify, entries, trailing ratchets, and profit harvests will be recorded here.'
                  : 'Autopilot is currently idle. Click "Engage Autopilot" to activate multi-factor quantitative scanning.'}
              </p>
              {!isEnabled && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={toggleAutonomousPilot}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs apple-btn-tactile inline-flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Engage Autopilot</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {actionLogs.map((log) => {
                let badgeStyle = 'bg-zinc-100 text-zinc-700';
                if (log.action === 'BUY_ENTRY') badgeStyle = 'bg-emerald-100 text-emerald-800 font-bold';
                if (log.action === 'TAKE_PROFIT') badgeStyle = 'bg-indigo-100 text-indigo-800 font-bold';
                if (log.action === 'PROFIT_HARVEST_T1') badgeStyle = 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300';
                if (log.action === 'PROFIT_HARVEST_T2') badgeStyle = 'bg-teal-100 text-teal-800 font-bold border border-teal-300';
                if (log.action === 'CHANDELIER_EXIT') badgeStyle = 'bg-purple-100 text-purple-800 font-bold border border-purple-300';
                if (log.action === 'STOP_LOSS') badgeStyle = 'bg-rose-100 text-rose-800 font-bold';
                if (log.action === 'TRAILING_RATCHET') badgeStyle = 'bg-teal-100 text-teal-800 font-bold';
                if (log.action === 'THROTTLED') badgeStyle = 'bg-amber-100 text-amber-800 font-bold';
                if (log.action === 'SECTOR_CAP_DEFENSE') badgeStyle = 'bg-amber-100 text-amber-900 font-bold border border-amber-300';
                if (log.action === 'STAGNATION_EXIT') badgeStyle = 'bg-zinc-200 text-zinc-800 font-bold';
                if (log.action === 'AUTONOMOUS_ENGAGED') badgeStyle = 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300';
                if (log.action === 'DISARMED') badgeStyle = 'bg-rose-100 text-rose-800 font-bold border border-rose-300';
                if (log.action === 'ALPHA_SCAN') badgeStyle = 'bg-sky-100 text-sky-800 font-bold border border-sky-300';
                if (log.action === 'SKIPPED') badgeStyle = 'bg-zinc-100 text-zinc-600 font-medium';

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