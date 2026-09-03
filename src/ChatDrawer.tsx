import React, { useState, useRef, useEffect } from 'react';
import { useLumen } from './store';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  TrendingUp,
  Bell,
  Scale,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Plus,
  Compass,
  LineChart,
  Flame,
  Activity,
  ArrowUpRight,
  Check,
  Layers,
  Sliders,
  PlayCircle,
  ExternalLink,
} from 'lucide-react';
import { money } from './trading';
import { resolveGemini3Model } from './gemini';
import { LatexRenderer } from './components/LatexRenderer';
import { go } from './Shell';

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    chatHistory,
    sendChat,
    chatLoading,
    executeActionProposal,
    state,
    prefilledChatPrompt,
  } = useLumen();
  const [text, setText] = useState('');
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [executedActions, setExecutedActions] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, chatHistory, chatLoading]);

  useEffect(() => {
    if (prefilledChatPrompt) {
      setText(prefilledChatPrompt);
    }
  }, [prefilledChatPrompt]);

  if (!open) return null;

  const handleSend = async (msgText?: string) => {
    const query = (msgText || text).trim();
    if (!query || chatLoading) return;
    setText('');
    setCapabilitiesOpen(false);
    await sendChat(query);
  };

  const handleActionClick = (proposal: any, index: number) => {
    const res = executeActionProposal(proposal);
    if (res.ok) {
      setExecutedActions((prev) => ({ ...prev, [index]: true }));
    }
  };

  const capabilities = [
    {
      id: 'defense',
      icon: ShieldAlert,
      color: 'from-rose-500 to-red-600',
      title: 'Sentinel Capital Defense',
      desc: 'Flash crash detection, hazard sensing & portfolio de-risking',
      prompt: 'Sense market danger across my portfolio. Audit drawdowns, concentration risk, and downside volatility.',
    },
    {
      id: 'stress_test',
      icon: Activity,
      color: 'from-amber-500 to-orange-600',
      title: 'Portfolio Stress-Test',
      desc: 'Simulate Bitcoin -20% crash, rate shocks, and 95% VaR losses',
      prompt: 'Run a portfolio stress test simulating a 20% Bitcoin flash crash and tell me my projected loss and survivability rating.',
    },
    {
      id: 'strategy_bot',
      icon: Zap,
      color: 'from-indigo-500 to-purple-600',
      title: 'Synthesize Strategy Bot',
      desc: 'Calibrate and deploy a VWAP or Grid bot on live ticks',
      prompt: `Synthesize an institutional VWAP momentum strategy bot for ${state.selectedAsset} with dynamic ATR profit brackets and deploy it.`,
    },
    {
      id: 'smart_dca',
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
      title: 'Smart Value-Weighted DCA',
      desc: 'Automated accumulation with dip multipliers and peak pauses',
      prompt: `Create a Smart Value-Weighted DCA accumulation plan for ${state.selectedAsset} with dip buying multipliers.`,
    },
    {
      id: 'rebalance',
      icon: Scale,
      color: 'from-blue-500 to-indigo-600',
      title: 'Agentic Rebalancing',
      desc: 'Fractional Kelly & inverse-volatility risk parity allocation',
      prompt: 'Compute optimal agentic portfolio rebalancing using inverse-volatility risk budgeting with two-stage execution.',
    },
    {
      id: 'alpha_radar',
      icon: Compass,
      color: 'from-violet-500 to-fuchsia-600',
      title: 'Multi-Token Alpha Radar',
      desc: 'Head-to-head comparison of Sharpe, beta, and momentum',
      prompt: 'Compare BTC, ETH, and SOL head-to-head on Alpha Radar, analyzing Sharpe ratios, volatility, and momentum score.',
    },
    {
      id: 'bracket_trade',
      icon: LineChart,
      color: 'from-cyan-500 to-blue-600',
      title: 'Asymmetric Bracket Trade',
      desc: 'Smart order ticket with 2.8x ATR Take-Profit and Trailing SL',
      prompt: `Draft an asymmetric paper buy order for ${state.selectedAsset} with ATR-based Take-Profit and Trailing Stop-Loss brackets.`,
    },
    {
      id: 'alert',
      icon: Bell,
      color: 'from-amber-500 to-yellow-600',
      title: 'Adaptive Volatility Alert',
      desc: 'Set intelligent breakout and support/resistance triggers',
      prompt: `Set an intelligent volatility price alert for ${state.selectedAsset} based on its current Bollinger band levels.`,
    },
  ];

  const quickPrompts = [
    { label: '🛡️ Sentinel Danger Audit', prompt: 'Sense market danger across my portfolio. Audit drawdowns, concentration risk, and downside volatility.' },
    { label: '🌪️ Stress Test (-20% BTC)', prompt: 'Run a portfolio stress test simulating a 20% Bitcoin flash crash.' },
    { label: '🤖 Synthesize Strategy Bot', prompt: `Synthesize an institutional strategy bot for ${state.selectedAsset} with dynamic ATR profit brackets.` },
    { label: '📈 Smart DCA Plan', prompt: `Create a Smart Value-Weighted DCA plan for ${state.selectedAsset}.` },
    { label: '⚖️ Kelly Rebalance', prompt: 'Compute optimal agentic portfolio rebalancing using Fractional Kelly optimization.' },
    { label: '🔬 Compare BTC vs ETH vs SOL', prompt: 'Compare BTC, ETH, and SOL head-to-head on Alpha Radar.' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-md transition-all duration-300"
      onMouseDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <aside className="relative flex flex-col w-full max-w-[550px] h-full liquid-glass border-l border-white/70 shadow-[-20px_0_60px_rgba(0,0,0,0.06)] text-zinc-900 animate-in slide-in-from-right duration-300 overflow-hidden">
        {/* Apple Minimalist Header */}
        <header className="flex items-center justify-between px-6 py-4.5 border-b border-black/[0.04] bg-white/40 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="w-9 h-9 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-sm relative z-10">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="absolute inset-0 rounded-2xl siri-aurora-glow scale-125 pointer-events-none" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-900">Nexus Intelligence</h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-800 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
                <span className="text-[10px] font-mono text-zinc-400 bg-black/[0.03] px-2 py-0.5 rounded-full border border-black/[0.04]">
                  {resolveGemini3Model(state.settings.geminiModel).replace('gemini-', '')}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 tracking-tight">Executive Autonomous Quant &amp; Risk Sentinel</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-black/[0.03] hover:bg-black/[0.08] text-zinc-400 hover:text-zinc-800 flex items-center justify-center transition-all active:scale-95"
              onClick={onClose}
              title="Close Nexus AI"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Messages Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Welcome State when fresh */}
          {chatHistory.length <= 1 && (
            <div className="my-auto py-8 px-2 text-center space-y-4 animate-in fade-in duration-300">
              <div className="relative inline-flex items-center justify-center">
                <div className="w-12 h-12 rounded-3xl bg-zinc-950 text-white flex items-center justify-center shadow-lg relative z-10">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="absolute inset-0 rounded-3xl siri-aurora-glow scale-150 pointer-events-none" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">Autonomous Financial Intelligence</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Institutional reasoning powered by Gemini 3 and deterministic quantitative risk algorithms.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-left">
                {quickPrompts.slice(0, 4).map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(q.prompt)}
                    className="p-3 rounded-2xl liquid-glass-subtle hover:bg-white/90 border border-white/80 hover:border-black/[0.08] transition-all group space-y-1 text-left shadow-xs active:scale-[0.99]"
                  >
                    <span className="text-xs font-semibold text-zinc-800 group-hover:text-zinc-950 flex items-center justify-between">
                      {q.label}
                      <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-800 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                    <p className="text-[10px] text-zinc-400 line-clamp-1">{q.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatHistory.map((m, i) => {
            const isUser = m.role === 'user';
            const hasAction = m.actionProposal && !isUser;
            const p = m.actionProposal;
            const receipt = p?.executionReceipt;

            return (
              <div key={i} className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-6 h-6 rounded-xl bg-zinc-950 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-xs">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}

                <div className="max-w-[88%] space-y-2.5">
                  <div
                    className={`p-4 text-[13px] leading-relaxed shadow-xs ${
                      isUser
                        ? 'bg-zinc-900 text-white rounded-[22px] rounded-tr-[4px] ml-auto font-normal'
                        : 'liquid-glass-subtle text-zinc-800 border border-white/85 rounded-[24px] rounded-tl-[4px]'
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-line">{m.text}</div>
                    ) : (
                      <LatexRenderer content={m.text} />
                    )}
                  </div>

                  {/* Visual Execution Receipt ("What Nexus Did") - Apple Pay Style */}
                  {receipt && (
                    <div className="p-4 rounded-[22px] bg-emerald-500/[0.04] border border-emerald-500/20 backdrop-blur-xl space-y-2.5 shadow-xs animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs tracking-tight">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Execution Verified</span>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/15">
                          {new Date(receipt.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-zinc-900">{receipt.title}</h4>
                        <p className="text-[11.5px] text-zinc-500 leading-relaxed">{receipt.summary}</p>
                      </div>

                      {receipt.details && receipt.details.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-white/75 border border-emerald-500/15 space-y-1 text-[11px] font-mono text-zinc-700">
                          {receipt.details.map((d: string, dIdx: number) => (
                            <div key={dIdx} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                              <span>{d}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {receipt.jumpRoute && (
                        <button
                          type="button"
                          onClick={() => {
                            go(receipt.jumpRoute as any);
                            onClose();
                          }}
                          className="w-full py-2 px-3 text-xs font-semibold text-emerald-800 bg-emerald-500/10 hover:bg-emerald-500/15 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
                        >
                          <span>{receipt.jumpLabel || 'Inspect in Desk'}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Interactive Action Proposal Card (Apple Widget Style) */}
                  {hasAction && p && !receipt && (
                    <div className="p-4 rounded-[24px] liquid-glass border border-white/95 shadow-sm space-y-3 animate-in fade-in duration-200">
                      {/* Proposal Header */}
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-2 text-zinc-900 tracking-tight">
                          <div className="w-6 h-6 rounded-lg bg-black/[0.04] text-zinc-800 flex items-center justify-center">
                            {p.type === 'emergency_defend' ? (
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            ) : p.type === 'stress_test' ? (
                              <Activity className="w-3.5 h-3.5 text-amber-600" />
                            ) : p.type === 'deploy_strategy' ? (
                              <Zap className="w-3.5 h-3.5 text-indigo-600" />
                            ) : p.type === 'smart_dca' ? (
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                            ) : p.type === 'rebalance' ? (
                              <Scale className="w-3.5 h-3.5 text-blue-600" />
                            ) : p.type === 'token_compare' ? (
                              <Compass className="w-3.5 h-3.5 text-violet-600" />
                            ) : p.type === 'order' ? (
                              <LineChart className="w-3.5 h-3.5 text-zinc-800" />
                            ) : (
                              <Bell className="w-3.5 h-3.5 text-amber-600" />
                            )}
                          </div>
                          <span>
                            {p.type === 'emergency_defend'
                              ? 'Capital Defense Protocol'
                              : p.type === 'stress_test'
                              ? 'Stress-Test Simulation'
                              : p.type === 'deploy_strategy'
                              ? 'Synthesized Strategy Bot'
                              : p.type === 'smart_dca'
                              ? 'Value-Weighted DCA Plan'
                              : p.type === 'rebalance'
                              ? 'Agentic Rebalancing Plan'
                              : p.type === 'token_compare'
                              ? 'Multi-Token Alpha Radar'
                              : p.type === 'order'
                              ? 'Asymmetric Bracket Order'
                              : 'Adaptive Volatility Alert'}
                          </span>
                        </span>

                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-black/[0.03] text-zinc-600 border border-black/[0.04]">
                          {p.dangerLevel ? `${p.dangerLevel} Hazard` : 'Requires Authorization'}
                        </span>
                      </div>

                      {/* Proposal Body Details */}
                      <div className="text-xs text-zinc-700 bg-white/70 p-3 rounded-2xl border border-black/[0.03] space-y-2">
                        {p.type === 'deploy_strategy' && p.strategyParams && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-zinc-900">{p.strategyParams.name}</span>
                              <span className="px-2 py-0.5 bg-black/[0.03] text-zinc-600 text-[10px] font-mono rounded-full">
                                {p.strategyParams.kind}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                              <div className="bg-black/[0.02] p-2 rounded-xl">
                                <span className="text-[9px] text-zinc-400 block uppercase font-medium">Max Allocation</span>
                                <span className="font-semibold text-zinc-800">
                                  {((p.strategyParams.maxAllocation || 0.25) * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="bg-emerald-500/[0.06] p-2 rounded-xl border border-emerald-500/10">
                                <span className="text-[9px] text-emerald-700 block uppercase font-medium">Take-Profit</span>
                                <span className="font-semibold text-emerald-800">+{p.strategyParams.targetProfitPct || 5}%</span>
                              </div>
                              <div className="bg-rose-500/[0.06] p-2 rounded-xl border border-rose-500/10">
                                <span className="text-[9px] text-rose-700 block uppercase font-medium">Trailing Stop</span>
                                <span className="font-semibold text-rose-800">-{p.strategyParams.trailingStopPct || 2}%</span>
                              </div>
                              <div className="bg-black/[0.02] p-2 rounded-xl">
                                <span className="text-[9px] text-zinc-400 block uppercase font-medium">Tick Frequency</span>
                                <span className="font-semibold text-zinc-800">Live (2.5s)</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">{p.rationale}</p>
                          </div>
                        )}

                        {p.type === 'stress_test' && p.stressTest && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-zinc-900">{p.stressTest.title}</span>
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-800 text-[10px] font-mono rounded-full">
                                {p.stressTest.survivabilityRating} Cushion
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                              <div className="bg-rose-500/[0.06] p-2 rounded-xl border border-rose-500/10">
                                <span className="text-[9px] text-rose-700 block uppercase font-medium">Drawdown</span>
                                <span className="font-semibold text-rose-800">-{p.stressTest.simulatedDrawdownPct}%</span>
                              </div>
                              <div className="bg-black/[0.02] p-2 rounded-xl">
                                <span className="text-[9px] text-zinc-400 block uppercase font-medium">Simulated Loss</span>
                                <span className="font-semibold text-zinc-800">${p.stressTest.simulatedLossUsd.toLocaleString()}</span>
                              </div>
                            </div>
                            {p.stressTest.mitigationSteps.length > 0 && (
                              <p className="text-[10.5px] text-zinc-600 bg-amber-500/[0.04] p-2 rounded-xl border border-amber-500/15">
                                🛡️ {p.stressTest.mitigationSteps[0]}
                              </p>
                            )}
                          </div>
                        )}

                        {p.type === 'smart_dca' && p.dcaPlan && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-zinc-900">Value-Weighted DCA ({p.dcaPlan.asset})</span>
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-800 text-[10px] font-mono rounded-full">
                                ${p.dcaPlan.baseAmountUsd}/{p.dcaPlan.frequency}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[10.5px] font-mono">
                              <span className="px-2 py-1 bg-emerald-500/[0.06] text-emerald-800 rounded-lg border border-emerald-500/10">
                                Dip Scaler: {p.dcaPlan.oversoldMultiplier}x on RSI &lt; 35
                              </span>
                              <span className="px-2 py-1 bg-amber-500/[0.06] text-amber-800 rounded-lg border border-amber-500/10">
                                Top Pause: RSI &gt; {p.dcaPlan.pauseThresholdRsi}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">{p.rationale}</p>
                          </div>
                        )}

                        {p.type === 'token_compare' && p.tokenComparison && (
                          <div className="space-y-2">
                            <p className="text-[11.5px] font-semibold text-zinc-900">{p.tokenComparison.verdict}</p>
                            <div className="space-y-1">
                              {p.tokenComparison.tokens.map((t: any) => (
                                <div key={t.asset} className="flex justify-between text-[11px] font-mono p-1.5 rounded-xl bg-black/[0.02]">
                                  <span className="font-bold text-zinc-900">{t.asset}</span>
                                  <span className="text-zinc-500">Sharpe {t.sharpeEstimate} • Vol {t.volAnnualizedPct}% • Beta {t.betaToBtc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {p.type === 'emergency_defend' && (
                          <div className="space-y-1.5">
                            {p.hazardSource && (
                              <div className="text-rose-700 font-medium text-[11.5px] flex items-start gap-1.5">
                                <span>⚠️</span>
                                <span>{p.hazardSource}</span>
                              </div>
                            )}
                            <p className="text-zinc-600 text-[11px] leading-relaxed">{p.rationale}</p>
                            {p.rebalanceSteps && p.rebalanceSteps.length > 0 && (
                              <div className="pt-1 border-t border-black/[0.04] space-y-1">
                                <span className="text-[10px] font-mono uppercase text-zinc-400">Defensive Maneuvers:</span>
                                {p.rebalanceSteps.slice(0, 3).map((step: any, sIdx: number) => (
                                  <div key={sIdx} className="flex justify-between text-[11px]">
                                    <span className="font-mono text-zinc-700">{step.action.toUpperCase()} {step.amount} {step.asset}</span>
                                    <span className="text-zinc-500 font-mono">${step.targetValueUsd?.toFixed(0)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {p.type === 'rebalance' && (
                          <div className="space-y-1.5">
                            <p className="text-zinc-600 text-[11px] leading-relaxed">{p.rationale}</p>
                            {p.rebalanceSteps && p.rebalanceSteps.length > 0 && (
                              <div className="pt-1 border-t border-black/[0.04] space-y-1">
                                <span className="text-[10px] font-mono uppercase text-zinc-400">Optimal Allocation Steps:</span>
                                {p.rebalanceSteps.slice(0, 3).map((step: any, sIdx: number) => (
                                  <div key={sIdx} className="flex justify-between text-[11px]">
                                    <span className="font-mono text-zinc-700">{step.action.toUpperCase()} {step.amount} {step.asset}</span>
                                    <span className="text-zinc-500 font-mono">${step.targetValueUsd?.toFixed(0)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {p.type === 'order' && (
                          <>
                            <div className="flex justify-between items-center text-[11.5px]">
                              <span className="text-zinc-500">Proposed Trade:</span>
                              <strong className="uppercase font-semibold text-zinc-900 font-mono">
                                {p.side} {p.amount} {p.asset}
                              </strong>
                            </div>
                            {p.rationale && (
                              <p className="text-[11px] text-zinc-500 pt-1 border-t border-black/[0.04] leading-relaxed">
                                {p.rationale}
                              </p>
                            )}
                          </>
                        )}

                        {p.type === 'alert' && (
                          <>
                            <div className="flex justify-between items-center text-[11.5px]">
                              <span className="text-zinc-500">Trigger Target:</span>
                              <strong className="font-semibold text-zinc-900 font-mono">
                                {p.asset} {p.alertType} ${p.value}
                              </strong>
                            </div>
                            {p.rationale && (
                              <p className="text-[11px] text-zinc-500 pt-1 border-t border-black/[0.04] leading-relaxed">
                                {p.rationale}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Safety Gate Action Trigger Button - Apple Obsidian Pill */}
                      <button
                        type="button"
                        onClick={() => handleActionClick(p, i)}
                        className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl text-white bg-zinc-950 hover:bg-black active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          {p.type === 'emergency_defend'
                            ? 'Inspect Defense in Safety Gate'
                            : p.type === 'deploy_strategy'
                            ? 'Authorize & Deploy Strategy Bot'
                            : p.type === 'smart_dca'
                            ? 'Authorize & Deploy Smart DCA'
                            : p.type === 'stress_test'
                            ? 'Confirm Stress Test Audit'
                            : p.type === 'rebalance'
                            ? 'Review Rebalance in Safety Gate'
                            : 'Inspect in AI Safety Gate'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-xl bg-zinc-950 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div className="liquid-glass-subtle px-4 py-3 rounded-2xl text-xs text-zinc-500 flex items-center gap-2.5 border border-white/80 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-ping" />
                <span>Nexus is computing quantitative telemetry &amp; risk bounds...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Capabilities Hub Menu (Opened via '+') */}
        {capabilitiesOpen && (
          <div className="mx-4 mb-2 p-4 liquid-glass-floating rounded-3xl border border-white/90 shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-zinc-900" />
                Nexus Capabilities
              </span>
              <button
                type="button"
                onClick={() => setCapabilitiesOpen(false)}
                className="text-[11px] font-medium text-zinc-400 hover:text-zinc-800 transition-colors"
              >
                Done
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
              {capabilities.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSend(c.prompt)}
                    className="p-3 rounded-2xl bg-white/70 hover:bg-white/95 border border-black/[0.04] hover:border-black/[0.08] text-left transition-all group flex flex-col justify-between shadow-xs active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 rounded-lg bg-black/[0.04] text-zinc-800 flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-zinc-900 group-hover:text-black leading-tight">
                        {c.title}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight line-clamp-2">{c.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Action Prompt Chips */}
        {!capabilitiesOpen && (
          <div className="px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q.prompt)}
                className="flex-shrink-0 px-3 py-1.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 bg-white/60 hover:bg-white/90 border border-black/[0.05] rounded-full shadow-xs transition-all active:scale-[0.98]"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar with '+' Capabilities Button - Apple Floating Pill */}
        <div className="p-4 pt-1 border-t border-black/[0.03] bg-white/30 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center"
          >
            <div className="w-full liquid-glass-floating rounded-full p-1.5 flex items-center gap-1.5 border border-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
              <button
                type="button"
                onClick={() => setCapabilitiesOpen(!capabilitiesOpen)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  capabilitiesOpen
                    ? 'bg-zinc-900 text-white rotate-45'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04]'
                }`}
                title="Browse Capabilities"
              >
                <Plus className="w-4 h-4 transition-transform duration-200" />
              </button>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask Nexus: models, stress-tests, bots..."
                className="flex-1 bg-transparent border-none outline-none text-xs text-zinc-900 placeholder:text-zinc-400 px-3 py-1 font-normal"
              />
              <button
                type="submit"
                disabled={!text.trim() || chatLoading}
                className="w-9 h-9 rounded-full bg-zinc-950 hover:bg-black disabled:opacity-20 text-white flex items-center justify-center transition-all active:scale-95 shadow-xs"
                title="Send"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}


