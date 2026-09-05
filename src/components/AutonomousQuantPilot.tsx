import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Cpu,
  Zap,
  ArrowRight,
  Info,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Scale,
  Lock,
} from 'lucide-react';
import { useLumen } from '../store';
import { PILOT_PROFILES } from '../domain/autonomousPilot';
import { AutonomousPilotProfile, QuantitativeOpportunity } from '../types';
import { isIndianAsset, moneyINR, money, META } from '../domain/portfolio';

export function AutonomousQuantPilot() {
  const {
    state,
    markets,
    autonomousPilot,
    toggleAutonomousPilot,
    setPilotProfile,
    scanPilotOpportunities,
    executePilotRecommendation,
    resetPilotCircuitBreaker,
    currentDataSource,
  } = useLumen();

  const [viewMode, setViewMode] = useState<'beginner' | 'quant'>('beginner');
  const [isScanning, setIsScanning] = useState(false);

  const activeProfileKey = autonomousPilot?.profile || 'conservative';
  const profileConfig = PILOT_PROFILES[activeProfileKey];
  const isEnabled = autonomousPilot?.enabled || false;
  const isTripped = autonomousPilot?.circuitBreakerTripped || false;
  const opportunities = autonomousPilot?.activeOpportunities || [];

  // Auto-scan periodically when pilot is enabled
  useEffect(() => {
    if (!isEnabled) return;
    scanPilotOpportunities();
    const timer = setInterval(() => {
      scanPilotOpportunities();
    }, 15000);
    return () => clearInterval(timer);
  }, [isEnabled, scanPilotOpportunities]);

  const handleScanClick = () => {
    setIsScanning(true);
    scanPilotOpportunities();
    setTimeout(() => setIsScanning(false), 600);
  };

  const handleExecute = (opp: QuantitativeOpportunity) => {
    executePilotRecommendation(opp);
  };

  return (
    <div className="w-full liquid-glass rounded-3xl p-5 sm:p-6 border border-white/80 shadow-xs space-y-5 transition-all">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-900 via-indigo-700 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Cpu className="w-5 h-5 text-indigo-100" />
            </div>
            {isEnabled && !isTripped && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-zinc-950">
                Autonomous Local Quant Pilot
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-indigo-600" />
                100% Offline Deterministic AI
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Zero cloud latency &bull; Zero external API dependencies &bull; Capital protection &amp; anti-loss guardian
            </p>
          </div>
        </div>

        {/* Action Controls: Enable Switch & Mode Selector */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleScanClick}
            disabled={isScanning}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all apple-btn-tactile"
            title="Scan markets now"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* View Toggle: Beginner / Quant */}
          <div className="apple-segmented-track">
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

          {/* Pilot Power Toggle Button */}
          <button
            type="button"
            onClick={toggleAutonomousPilot}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-all apple-btn-tactile flex items-center gap-2 shadow-xs ${
              isEnabled
                ? 'bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-700'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${isEnabled ? 'text-emerald-200 animate-pulse' : 'text-zinc-400'}`} />
            <span>{isEnabled ? 'Auto-Pilot Active' : 'Engage Auto-Pilot'}</span>
          </button>
        </div>
      </div>

      {/* Circuit Breaker Alert (if tripped) */}
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

      {/* Strategy Profile Selection Bar */}
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
                <span className={`text-xs font-bold ${isSelected ? 'text-indigo-950' : 'text-zinc-800'}`}>
                  {pKey === 'conservative' && '🛡️ '}
                  {pKey === 'balanced' && '⚖️ '}
                  {pKey === 'momentum' && '🚀 '}
                  {cfg.name}
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
                <span>Max DD: {cfg.maxDrawdownCircuitBreakerPct}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Capital Protection Metrics Ribbon */}
      <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.04] flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold text-zinc-700">Anti-Loss Sentinel:</span>
          <span className="text-emerald-700 font-medium">
            Strict &le;{profileConfig.maxRiskPerTradePct}% Risk/Trade
          </span>
        </div>

        <div className="flex items-center gap-4 text-zinc-600">
          <div>
            <span className="text-zinc-400">Daily Drawdown: </span>
            <span className={`font-mono font-semibold ${autonomousPilot?.dailyDrawdownPct > 0 ? 'text-rose-600' : 'text-zinc-700'}`}>
              {(autonomousPilot?.dailyDrawdownPct || 0).toFixed(2)}%
            </span>
            <span className="text-zinc-400"> / {profileConfig.maxDrawdownCircuitBreakerPct}% limit</span>
          </div>

          <div>
            <span className="text-zinc-400">Executed Trades: </span>
            <span className="font-mono font-semibold text-zinc-800">
              {autonomousPilot?.totalAutopilotTradesExecuted || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Live Quantitative Opportunities Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold tracking-tight text-zinc-900 uppercase">
              High-Conviction Mathematical Setups ({opportunities.length})
            </span>
          </div>
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
              The Local Quant Engine will hold liquid capital until an optimal asymmetric setup is verified.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {opportunities.map((opp) => {
              const isIndian = isIndianAsset(opp.asset);
              const currSym = isIndian ? '₹' : '$';
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
                            ({opp.asset}{isIndian ? ' • NSE' : ''})
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
                      <span>Safe Execute</span>
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
                        {currSym}{opp.entryPrice.toLocaleString()}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-rose-50/50 border border-rose-100/60">
                      <span className="text-[10px] text-rose-600 block font-medium">Stop-Loss (Capped)</span>
                      <span className="font-bold font-mono text-rose-700">
                        {currSym}{opp.stopLossPrice.toLocaleString()}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-emerald-50/50 border border-emerald-100/60">
                      <span className="text-[10px] text-emerald-600 block font-medium">Target Profit</span>
                      <span className="font-bold font-mono text-emerald-700">
                        {currSym}{opp.takeProfitPrice.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Risk Budget Summary */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 pt-1">
                    <span>
                      Size: <strong className="text-zinc-800">{opp.recommendedUnits} units</strong>
                    </span>
                    <span>
                      Max Loss: <strong className="text-rose-600">{currSym}{opp.projectedLoss.toLocaleString()}</strong>
                    </span>
                    <span>
                      Target Gain: <strong className="text-emerald-600">+{currSym}{opp.projectedGain.toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
