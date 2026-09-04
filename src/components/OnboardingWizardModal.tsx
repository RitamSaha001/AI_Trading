import React, { useState, useEffect } from 'react';
import { useLumen } from '../store';
import { decryptApiKey, isEncryptedApiKey } from '../services/keyVault';
import { SUPPORTED_MODELS, resolveGemini3Model } from '../gemini';
import {
  Sparkles,
  Shield,
  Coins,
  Cpu,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Sliders,
  Check,
  Zap,
  Lock,
  Compass,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface OnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OnboardingWizardModal({ isOpen, onClose }: OnboardingWizardModalProps) {
  const {
    state,
    setSettings,
    accountMode,
    setAccountMode,
    exchangeAccount,
    openExchangeDrawer,
    setLossPreventionMode,
    addStrategy,
    triggerToast,
  } = useLumen();

  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState(resolveGemini3Model(state.settings.geminiModel));
  const [starterBotDeployed, setStarterBotDeployed] = useState(false);

  useEffect(() => {
    let active = true;
    if (state.settings.geminiApiKey) {
      if (isEncryptedApiKey(state.settings.geminiApiKey)) {
        decryptApiKey(state.settings.geminiApiKey).then((dec) => {
          if (active && dec) setApiKey(dec);
        });
      } else {
        setApiKey(state.settings.geminiApiKey);
      }
    }
    return () => {
      active = false;
    };
  }, [state.settings.geminiApiKey]);

  if (!isOpen) return null;

  const totalSteps = 5;

  const handleFinish = () => {
    try {
      localStorage.setItem('lumen_onboarded_v1', 'true');
    } catch {
      // ignore
    }
    // Save any pending AI settings
    setSettings({
      geminiApiKey: apiKey.trim(),
      geminiModel: selectedModel,
    });
    onClose();
  };

  const handleDeployStarterBot = () => {
    addStrategy({
      asset: 'BTC',
      kind: 'titan_quantum',
      name: 'Bitcoin Titan Quantum Apex Sentinel (Starter)',
      enabled: true,
      maxAllocation: 0.25,
      cooldownSec: 120,
      targetProfitPct: 6.0,
      trailingStopPct: 2.0,
      zeroLossMode: true,
      scaleOutEnabled: true,
      quarantineActive: false,
      quarantineShadowWins: 0,
      params: {
        atrMultiplierTP: 3.6,
        atrMultiplierSL: 1.3,
        minAlphaScore: 35,
        regimeFilterEnabled: true,
        maxChoppinessThreshold: 60,
        minAdxThreshold: 18,
        scaleOutTp1AtrMult: 1.8,
      },
    });
    setStarterBotDeployed(true);
    triggerToast(
      'Starter Bot Deployed',
      'Bitcoin Titan Quantum Apex Sentinel armed with Zero-Loss capital defense.',
      'success'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Top Progress & Navigation Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] bg-white/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-zinc-950">Lumen Cockpit Setup</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 font-semibold">
                  Step {step} of {totalSteps}
                </span>
              </div>
              <p className="text-xs text-zinc-500">Quick interactive walkthrough &amp; platform calibration</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] transition-all"
            title="Close / Skip Guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="w-full h-1 bg-black/[0.04]">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* ========================================================================= */}
          {/* STEP 1: WELCOME & ARCHITECTURE OVERVIEW */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Institutional Quantitative Intelligence</span>
                </div>
                <h3 className="text-xl font-bold text-zinc-950 tracking-tight">
                  Welcome to Lumen Autonomous Trading
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Lumen combines <strong>real frontier LLM reasoning</strong> (Google Gemini 3 series) with{' '}
                  <strong>26 deterministic quantitative algorithms</strong> and strict risk validation gates. No
                  canned answers, no fabricated prices, and no uncontrolled trade execution.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.05] space-y-2 text-center sm:text-left">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto sm:mx-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900">Dual-Desk Engine</h4>
                  <p className="text-[11px] text-zinc-500 leading-tight">
                    Switch freely between a $50k paper sandbox and live Binance Spot execution with zero balance bleed.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.05] space-y-2 text-center sm:text-left">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto sm:mx-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900">Capital Defense</h4>
                  <p className="text-[11px] text-zinc-500 leading-tight">
                    Automated circuit breakers, dynamic ATR trailing stops, and a mandatory 15% cash liquidity floor.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.05] space-y-2 text-center sm:text-left">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto sm:mx-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900">Sub-Second Quotes</h4>
                  <p className="text-[11px] text-zinc-500 leading-tight">
                    Live Binance WebSocket feeds streaming real-time prices across 108 high-liquidity crypto markets.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: TRADING DESK MODE SELECTION */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h3 className="text-base font-bold text-zinc-950">Choose Your Trading Desk Mode</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  You can trade risk-free in paper simulation or connect your Binance exchange account.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Simulated Paper Desk Option */}
                <div
                  onClick={() => setAccountMode('paper')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    accountMode === 'paper'
                      ? 'border-zinc-900 bg-zinc-900/5 ring-1 ring-zinc-900'
                      : 'border-black/[0.08] hover:border-black/20 bg-white'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📊</span>
                        <h4 className="text-xs font-bold text-zinc-900">Simulated Paper Desk</h4>
                      </div>
                      {accountMode === 'paper' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-900 text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600">
                      $50,000 in virtual sandbox capital. Realistic liquidity slippage, fill simulation, and zero financial risk.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-black/[0.06] text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Recommended for new users &amp; backtesting</span>
                  </div>
                </div>

                {/* Binance Live Spot Desk Option */}
                <div
                  onClick={() => {
                    setAccountMode('exchange');
                    if (!exchangeAccount?.connected) {
                      openExchangeDrawer();
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    accountMode === 'exchange'
                      ? 'border-emerald-600 bg-emerald-50/20 ring-1 ring-emerald-600'
                      : 'border-black/[0.08] hover:border-black/20 bg-white'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-xs font-bold text-zinc-900">Binance Spot Bridge</h4>
                      </div>
                      {accountMode === 'exchange' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600">
                      Connect Binance Spot API for Testnet (safe live matching) or Mainnet execution with client-side AES-GCM encryption.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-black/[0.06] flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 font-medium">
                      {exchangeAccount?.connected ? '🟢 Keys Connected' : '⚪ Not Connected'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openExchangeDrawer();
                      }}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      {exchangeAccount?.connected ? 'Settings ⚙️' : 'Configure Keys →'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-tight">
                  <strong>Zero-Risk Storage:</strong> API secrets are never transmitted to any server. They remain exclusively inside your browser's Web Crypto vault encrypted with your master passphrase.
                </p>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: AI INTELLIGENCE ENGINE SELECTION */}
          {/* ========================================================================= */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h3 className="text-base font-bold text-zinc-950">Configure Intelligence Engine</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Lumen runs with a choice of frontier neural models or a 100% free local quant engine.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Frontier Gemini 3 Series */}
                <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-200/80 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-indigo-950">Frontier Gemini 3 Series</h4>
                  </div>
                  <p className="text-[11px] text-zinc-600 leading-tight">
                    Uses Gemini 3.8 Flash or 3.1 Pro for multi-turn hypothesis testing, adversarial self-check, and complex portfolio analysis.
                  </p>
                </div>

                {/* 100% Free Offline Local Quant */}
                <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200/80 space-y-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-emerald-950">100% Free Offline Quant Desk</h4>
                  </div>
                  <p className="text-[11px] text-zinc-600 leading-tight">
                    Runs client-side in your browser. 26 typed deterministic financial algorithms with 15/15 benchmark wins. Zero API keys required!
                  </p>
                </div>
              </div>

              {/* Gemini API Key & Model Configuration */}
              <div className="space-y-3 p-4 rounded-2xl bg-black/[0.02] border border-black/[0.05]">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">
                    Google Gemini API Key (Optional)
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy... (leave blank for 100% Free Local Mode)"
                    className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-zinc-400">
                    Get a key from <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline">Google AI Studio</a>. Free tier is supported.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">
                    Gemini Reasoning Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-white border border-black/[0.08] rounded-xl outline-none font-medium text-zinc-900"
                  >
                    {SUPPORTED_MODELS.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.displayName || m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 4: CAPITAL DEFENSE & RISK SENTINEL */}
          {/* ========================================================================= */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h3 className="text-base font-bold text-zinc-950">Calibrate Sentinel Risk Defense</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Select your capital defense policy. All algorithmic orders pass through this strict gate.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Strict Defense */}
                <button
                  type="button"
                  onClick={() => setLossPreventionMode('strict')}
                  className={`p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                    state.lossPreventionMode === 'strict'
                      ? 'border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-600'
                      : 'border-black/[0.06] bg-white hover:border-black/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-1">
                      <Shield className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Strict Defense</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Maximum capital preservation. Recommended for live trading.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-black/[0.04] text-[10px] space-y-0.5 text-zinc-600 font-mono">
                    <div>• 25% Cash Reserve Floor</div>
                    <div>• Max 35% Single Asset</div>
                    <div>• 1% Max Trade Risk</div>
                    <div>• 3% Circuit Breaker Cutoff</div>
                  </div>
                </button>

                {/* Balanced Quant */}
                <button
                  type="button"
                  onClick={() => setLossPreventionMode('balanced')}
                  className={`p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                    state.lossPreventionMode === 'balanced'
                      ? 'border-emerald-600 bg-emerald-50/30 ring-1 ring-emerald-600'
                      : 'border-black/[0.06] bg-white hover:border-black/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 mb-1">
                      <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Balanced Quant</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Optimal risk-adjusted Sharpe targeting balanced exposure.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-black/[0.04] text-[10px] space-y-0.5 text-zinc-600 font-mono">
                    <div>• 15% Cash Reserve Floor</div>
                    <div>• Max 50% Single Asset</div>
                    <div>• 2% Max Trade Risk</div>
                    <div>• 5% Circuit Breaker Cutoff</div>
                  </div>
                </button>

                {/* Alpha Seeker */}
                <button
                  type="button"
                  onClick={() => setLossPreventionMode('aggressive')}
                  className={`p-4 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                    state.lossPreventionMode === 'aggressive'
                      ? 'border-amber-600 bg-amber-50/30 ring-1 ring-amber-600'
                      : 'border-black/[0.06] bg-white hover:border-black/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-1">
                      <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                      <span>Alpha Seeker</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Higher momentum allocation for high-volatility bull regimes.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-black/[0.04] text-[10px] space-y-0.5 text-zinc-600 font-mono">
                    <div>• 10% Cash Reserve Floor</div>
                    <div>• Max 60% Single Asset</div>
                    <div>• 3.5% Max Trade Risk</div>
                    <div>• 8% Circuit Breaker Cutoff</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 5: AUTONOMOUS BOTS & LAUNCH COCKPIT */}
          {/* ========================================================================= */}
          {step === 5 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h3 className="text-base font-bold text-zinc-950">Autonomous Trading Strategies</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Lumen includes 6 algorithmic bot architectures ready to deploy on any market.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-950 text-white flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-950">Titan Quantum Apex Sentinel (BTC)</h4>
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      Flagship bot with dynamic ATR profit brackets, 2-stage scale-out, and Zero-Loss armor.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={starterBotDeployed}
                  onClick={handleDeployStarterBot}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                    starterBotDeployed
                      ? 'bg-emerald-600 text-white cursor-default'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-md'
                  }`}
                >
                  {starterBotDeployed ? '✓ Starter Bot Armed' : 'Deploy Starter Bot'}
                </button>
              </div>

              {/* Ready Checklist */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                  Cockpit Readiness Checklist
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/[0.02] border border-black/[0.04] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Desk: <strong>{accountMode === 'exchange' ? 'Binance' : 'Paper Desk'}</strong></span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/[0.02] border border-black/[0.04] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>AI: <strong>{apiKey ? 'Gemini 3' : 'Free Local Engine'}</strong></span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/[0.02] border border-black/[0.04] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Defense: <strong className="capitalize">{state.lossPreventionMode}</strong></span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/[0.02] border border-black/[0.04] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Markets: <strong>108 Active Streams</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Navigation Controls */}
        <div className="px-6 py-4 border-t border-black/[0.06] bg-white/60 flex items-center justify-between">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-950 hover:bg-black/[0.04] rounded-xl transition-all flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="text-xs text-zinc-400 hover:text-zinc-700 font-medium px-2 py-1"
              >
                Skip Walkthrough
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < totalSteps ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
                className="px-5 py-2.5 text-xs font-bold text-white bg-zinc-950 hover:bg-zinc-800 rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Launch Trading Cockpit</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
