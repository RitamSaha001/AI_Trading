import React, { useEffect, useState } from 'react';
import { listGeminiModels, SUPPORTED_MODELS, resolveGemini3Model } from './gemini';
import { useLumen } from './store';
import { SimulationMode } from './storage';
import { X, Sparkles, Key, Cpu, Volume2, RotateCcw, Check, Radio, Info, Shield, Sliders } from 'lucide-react';
import { OnboardingWizardModal } from './components/OnboardingWizardModal';
import { decryptApiKey, isEncryptedApiKey } from './services/keyVault';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { state, setSettings, reset, setLossPreventionMode } = useLumen();
  const [key, setKey] = useState('');
  const [models, setModels] = useState<any[]>(SUPPORTED_MODELS);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState(resolveGemini3Model(state.settings.geminiModel));
  const [sound, setSound] = useState(state.settings.soundEnabled ?? true);
  const [wsEnabled, setWsEnabled] = useState(state.settings.enableWebSocket ?? true);
  const [resetBalance, setResetBalance] = useState(50000);
  const [resetMode, setResetMode] = useState<SimulationMode>('clean');
  const [lossMode, setLossMode] = useState<'strict' | 'balanced' | 'aggressive'>(state.lossPreventionMode || 'balanced');
  const [slippageBps, setSlippageBps] = useState(state.settings.maxSlippageBps || 50);
  const [wizardOpen, setWizardOpen] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listGeminiModels(key);
      setModels(list);
    } catch (e: any) {
      setError(e.message || 'Unable to query live models.');
    } finally {
      setLoading(false);
    }
  };

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
    fetchModels();
    return () => {
      active = false;
    };
  }, []);

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
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-md animate-in fade-in duration-200"
      onMouseDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-2xl overflow-hidden text-zinc-900 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06] bg-white/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Cockpit Preferences</h2>
              <p className="text-xs text-zinc-500">Gemini intelligence &amp; paper simulator configurations</p>
            </div>
          </div>
          <button
            type="button"
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] transition-all"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Visual Setup Guide & Tour Launcher */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-white border border-indigo-200/80 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-indigo-950">Visual Setup Guide &amp; Tour</h4>
                <p className="text-[11px] text-zinc-500">Step-by-step walkthrough of desks, AI models &amp; defense</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all whitespace-nowrap"
            >
              Launch Tour
            </button>
          </div>
          {/* Gemini API Key */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <Key className="w-3.5 h-3.5 text-zinc-400" />
              Gemini API Key (Optional)
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIzaSy... (leave empty for 100% Free Local Mode)"
              className="w-full px-3.5 py-2.5 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 placeholder:text-zinc-400 transition-all font-mono"
            />
            <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100/80 text-[11px] text-indigo-950 flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Zero-Cost Offline Mode:</strong> If you do not enter a key, Lumen runs entirely for free using the client-side Deterministic Algorithmic Engine (computing SMA, EMA, RSI, Bollinger Bands, and risk budgets locally in your browser).
              </p>
            </div>
            {key && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setKey('')}
                  className="text-[11px] text-rose-600 hover:underline font-medium"
                >
                  Clear Key (Revert to Local Mode)
                </button>
              </div>
            )}
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                Gemini Model (Model 3 Series)
              </label>
              <button
                type="button"
                onClick={fetchModels}
                disabled={loading}
                className="text-[11px] text-indigo-600 hover:underline font-medium"
              >
                {loading ? 'Querying...' : 'Refresh Models'}
              </button>
            </div>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-white border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 transition-all font-medium"
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName || m.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500">
              Configured exclusively for Gemini 3 series models for fast technical analysis, risk scoring, and copilot reasoning.
            </p>
          </div>

          {/* Risk Policy Sentinel Policy Preset */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                <Shield className="w-3.5 h-3.5 text-zinc-400" />
                Capital Defense Policy Preset
              </label>
              <span className="text-[10px] font-mono text-zinc-400 uppercase font-semibold">
                Active: {lossMode}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['strict', 'balanced', 'aggressive'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLossMode(m)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    lossMode === m
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                      : 'bg-white border-black/[0.08] text-zinc-700 hover:bg-black/[0.02]'
                  }`}
                >
                  <div className="text-xs font-bold capitalize">{m}</div>
                  <div className={`text-[10px] mt-0.5 ${lossMode === m ? 'text-zinc-300' : 'text-zinc-500'}`}>
                    {m === 'strict' ? '25% Cash Floor' : m === 'balanced' ? '15% Cash Floor' : '10% Cash Floor'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Max Execution Slippage Tolerance */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                Max Execution Slippage Tolerance
              </label>
              <span className="text-xs font-mono font-semibold text-zinc-800">
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
              <span>Strict (10 bps / 0.1%)</span>
              <span>Standard (50 bps / 0.5%)</span>
              <span>Volatile (200 bps / 2%)</span>
            </div>
          </div>

          {/* Real-time WebSocket Feed */}
          <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.05] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white border border-black/[0.06] flex items-center justify-center text-zinc-600 shadow-xs">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-800">Real-Time WebSocket Stream</h4>
                <p className="text-[11px] text-zinc-500">Live sub-second Binance miniTicker stream updates</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWsEnabled(!wsEnabled)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                wsEnabled ? 'bg-indigo-600' : 'bg-zinc-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  wsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sound & Notifications */}
          <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.05] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white border border-black/[0.06] flex items-center justify-center text-zinc-600 shadow-xs">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-800">Acoustic Feedback</h4>
                <p className="text-[11px] text-zinc-500">Audio chimes on order execution and alert triggers</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSound(!sound)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                sound ? 'bg-indigo-600' : 'bg-zinc-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  sound ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Simulator Capital Reset */}
          <div className="p-4 rounded-2xl bg-rose-500/[0.04] border border-rose-500/15 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-800">
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              Paper Simulation Reset
            </div>
            <p className="text-[11px] text-zinc-600">
              Select your reset mode and starting balance:
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
                <div className="text-xs font-semibold text-zinc-900">Clean Slate</div>
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
                <div className="text-xs font-semibold text-zinc-900">Seeded Portfolio</div>
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
                    onClose();
                  }
                }}
                className="ml-auto px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all"
              >
                Reset Now
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-black/[0.06] bg-white/50">
          <button
            type="button"
            className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-black/[0.04] rounded-xl transition-all"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Saved!
              </>
            ) : (
              'Save Preferences'
            )}
          </button>
        </div>
      </div>
      {wizardOpen && <OnboardingWizardModal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
