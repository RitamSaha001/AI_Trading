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
      className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm transition-all duration-300"
      onMouseDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <aside className="relative flex flex-col w-full max-w-[540px] h-full bg-white/95 backdrop-blur-2xl border-l border-white/60 shadow-2xl text-zinc-900 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] bg-white/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-zinc-900">Lumen Nexus</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Agentic Active
                </span>
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 rounded-full border border-indigo-500/20">
                  {resolveGemini3Model(state.settings.geminiModel).replace('gemini-', '')}
                </span>
              </div>
              <p className="text-xs text-zinc-500">Autonomous Financial Intelligence &amp; Quantitative Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] transition-all"
              onClick={onClose}
              title="Close Nexus AI"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Chat Messages Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {chatHistory.map((m, i) => {
            const isUser = m.role === 'user';
            const hasAction = m.actionProposal && !isUser;
            const p = m.actionProposal;
            const receipt = p?.executionReceipt;

            return (
              <div key={i} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className="max-w-[88%] space-y-2.5">
                  <div
                    className={`p-4 text-[13.5px] leading-relaxed rounded-2xl shadow-sm ${
                      isUser
                        ? 'bg-zinc-900 text-white rounded-tr-sm ml-auto'
                        : 'bg-white/95 text-zinc-800 border border-black/[0.06] rounded-tl-sm backdrop-blur-md'
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-line">{m.text}</div>
                    ) : (
                      <LatexRenderer content={m.text} />
                    )}
                  </div>

                  {/* Visual Execution Receipt ("What Nexus Did") */}
                  {receipt && (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.03] to-teal-500/[0.05] border border-emerald-500/30 backdrop-blur-md space-y-3 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Nexus Execution Receipt</span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          {new Date(receipt.executedAt).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-zinc-900">{receipt.title}</h4>
                        <p className="text-[11.5px] text-zinc-600 leading-relaxed">{receipt.summary}</p>
                      </div>

                      {receipt.details && receipt.details.length > 0 && (
                        <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-500/20 space-y-1 text-[11px]">
                          {receipt.details.map((d: string, dIdx: number) => (
                            <div key={dIdx} className="flex items-center gap-1.5 text-zinc-700 font-mono">
                              <span className="text-emerald-500 font-bold">•</span>
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
                          className="w-full py-2 px-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl flex items-center justify-center gap-1.5 transition-all"
                        >
                          <span>{receipt.jumpLabel || 'Inspect in Desk →'}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Interactive Action Proposal Card (when pending execution) */}
                  {hasAction && p && !receipt && (
                    <div
                      className={`p-3.5 rounded-2xl backdrop-blur-md space-y-3 transition-all ${
                        p.type === 'emergency_defend'
                          ? 'bg-rose-500/[0.08] border border-rose-500/30'
                          : p.type === 'stress_test'
                          ? 'bg-amber-500/[0.08] border border-amber-500/30'
                          : p.type === 'deploy_strategy'
                          ? 'bg-indigo-500/[0.08] border border-indigo-500/30'
                          : p.type === 'smart_dca'
                          ? 'bg-emerald-500/[0.08] border border-emerald-500/30'
                          : p.type === 'rebalance'
                          ? 'bg-indigo-500/[0.08] border border-indigo-500/30'
                          : 'bg-gradient-to-br from-indigo-500/[0.08] to-purple-500/[0.04] border border-indigo-500/20'
                      }`}
                    >
                      {/* Proposal Header */}
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-1.5 text-zinc-900">
                          {p.type === 'emergency_defend' ? (
                            <>
                              <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                              <span className="text-rose-900 font-bold">Sentinel: Capital Defense Trigger</span>
                            </>
                          ) : p.type === 'stress_test' ? (
                            <>
                              <Activity className="w-4 h-4 text-amber-600" />
                              <span className="text-amber-900 font-bold">Portfolio Stress-Test Scenario</span>
                            </>
                          ) : p.type === 'deploy_strategy' ? (
                            <>
                              <Zap className="w-4 h-4 text-indigo-600" />
                              <span className="text-indigo-900 font-bold">Synthesized Algorithmic Bot</span>
                            </>
                          ) : p.type === 'smart_dca' ? (
                            <>
                              <TrendingUp className="w-4 h-4 text-emerald-600" />
                              <span className="text-emerald-900 font-bold">Smart Value-Weighted DCA Plan</span>
                            </>
                          ) : p.type === 'rebalance' ? (
                            <>
                              <Scale className="w-4 h-4 text-indigo-600" />
                              <span className="text-indigo-900 font-bold">Agentic Rebalancing Plan</span>
                            </>
                          ) : p.type === 'token_compare' ? (
                            <>
                              <Compass className="w-4 h-4 text-violet-600" />
                              <span className="text-violet-900 font-bold">Multi-Token Alpha Radar</span>
                            </>
                          ) : p.type === 'order' ? (
                            <>
                              <TrendingUp className="w-4 h-4 text-indigo-600" />
                              <span>AI Paper Order Proposal</span>
                            </>
                          ) : (
                            <>
                              <Bell className="w-4 h-4 text-amber-600" />
                              <span>AI Price Alert Proposal</span>
                            </>
                          )}
                        </span>

                        <span
                          className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-md border ${
                            p.type === 'emergency_defend'
                              ? 'bg-rose-500/20 text-rose-800 border-rose-500/30 font-bold'
                              : 'bg-indigo-500/15 text-indigo-800 border-indigo-500/30 font-semibold'
                          }`}
                        >
                          {p.dangerLevel ? `${p.dangerLevel} DANGER` : 'Requires Gate Approval'}
                        </span>
                      </div>

                      {/* Proposal Body Details */}
                      <div className="text-xs text-zinc-700 bg-white/80 p-3 rounded-xl border border-black/[0.04] space-y-2">
                        {p.type === 'deploy_strategy' && p.strategyParams && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-zinc-900">{p.strategyParams.name}</span>
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-mono rounded-md">
                                {p.strategyParams.kind}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                              <div className="bg-black/[0.02] p-1.5 rounded-lg">
                                <span className="text-[9px] text-zinc-400 block uppercase">Max Allocation</span>
                                <span className="font-semibold text-zinc-800">
                                  {((p.strategyParams.maxAllocation || 0.25) * 100).toFixed(0)}% of portfolio
                                </span>
                              </div>
                              <div className="bg-emerald-500/10 p-1.5 rounded-lg">
                                <span className="text-[9px] text-emerald-700 block uppercase font-bold">Take-Profit</span>
                                <span className="font-bold text-emerald-700">+{p.strategyParams.targetProfitPct || 5}%</span>
                              </div>
                              <div className="bg-rose-500/10 p-1.5 rounded-lg">
                                <span className="text-[9px] text-rose-700 block uppercase font-bold">Trailing Stop</span>
                                <span className="font-bold text-rose-700">-{p.strategyParams.trailingStopPct || 2}%</span>
                              </div>
                              <div className="bg-black/[0.02] p-1.5 rounded-lg">
                                <span className="text-[9px] text-zinc-400 block uppercase">Tick Frequency</span>
                                <span className="font-semibold text-zinc-800">Every 2.5s</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-zinc-500">{p.rationale}</p>
                          </div>
                        )}

                        {p.type === 'stress_test' && p.stressTest && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-zinc-900">{p.stressTest.title}</span>
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-mono rounded-md">
                                {p.stressTest.survivabilityRating} Cushion
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                              <div className="bg-rose-500/10 p-1.5 rounded-lg">
                                <span className="text-[9px] text-rose-700 block uppercase font-bold">Projected Drawdown</span>
                                <span className="font-bold text-rose-700">-{p.stressTest.simulatedDrawdownPct}%</span>
                              </div>
                              <div className="bg-black/[0.02] p-1.5 rounded-lg">
                                <span className="text-[9px] text-zinc-400 block uppercase">Simulated Loss</span>
                                <span className="font-semibold text-zinc-800">${p.stressTest.simulatedLossUsd.toLocaleString()}</span>
                              </div>
                            </div>
                            {p.stressTest.mitigationSteps.length > 0 && (
                              <p className="text-[10.5px] text-zinc-600 bg-amber-500/[0.06] p-2 rounded-lg border border-amber-500/20">
                                🛡️ {p.stressTest.mitigationSteps[0]}
                              </p>
                            )}
                          </div>
                        )}

                        {p.type === 'smart_dca' && p.dcaPlan && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-zinc-900">Value-Weighted DCA ({p.dcaPlan.asset})</span>
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-mono rounded-md">
                                ${p.dcaPlan.baseAmountUsd}/{p.dcaPlan.frequency}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[10.5px] font-mono">
                              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                                Dip Scaler: {p.dcaPlan.oversoldMultiplier}x on RSI &lt; 35
                              </span>
                              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md border border-amber-100">
                                Peak Pause: RSI &gt; {p.dcaPlan.pauseThresholdRsi}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500">{p.rationale}</p>
                          </div>
                        )}

                        {p.type === 'token_compare' && p.tokenComparison && (
                          <div className="space-y-2">
                            <p className="text-[11.5px] font-semibold text-indigo-700">{p.tokenComparison.verdict}</p>
                            <div className="space-y-1">
                              {p.tokenComparison.tokens.map((t: any) => (
                                <div key={t.asset} className="flex justify-between text-[11px] font-mono p-1 rounded bg-black/[0.02]">
                                  <span className="font-bold text-zinc-900">{t.asset}</span>
                                  <span className="text-zinc-500">Sharpe: {t.sharpeEstimate} • Vol: {t.volAnnualizedPct}% • Beta: {t.betaToBtc}</span>
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
                                    <span className="font-semibold text-rose-700">SELL {step.amount} {step.asset}</span>
                                    <span className="text-zinc-500">~${money(step.estimatedNotional)} to cash buffer</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {p.type === 'rebalance' && (
                          <div className="space-y-2">
                            <p className="text-zinc-600 text-[11.5px] leading-relaxed">{p.rationale}</p>
                            {p.rebalanceTargets && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {Object.entries(p.rebalanceTargets)
                                  .filter(([, w]) => Number(w) > 0)
                                  .map(([asset, weight]) => (
                                    <span
                                      key={asset}
                                      className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-mono text-[10px] rounded-md border border-indigo-100"
                                    >
                                      {asset}: {String(weight)}%
                                    </span>
                                  ))}
                                {p.cashTargetPct && (
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-mono text-[10px] rounded-md border border-emerald-100">
                                    Cash: {p.cashTargetPct}%
                                  </span>
                                )}
                              </div>
                            )}
                            {p.rebalanceSteps && p.rebalanceSteps.length > 0 && (
                              <div className="pt-1.5 border-t border-black/[0.04] space-y-1">
                                <span className="text-[10px] font-mono uppercase text-zinc-400">
                                  Execution Sequence ({p.rebalanceSteps.length} steps):
                                </span>
                                {p.rebalanceSteps.slice(0, 3).map((step: any, sIdx: number) => (
                                  <div key={sIdx} className="flex justify-between text-[11px]">
                                    <span className={step.action === 'sell' ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
                                      {step.action.toUpperCase()} {step.amount} {step.asset}
                                    </span>
                                    <span className="text-zinc-500">~${money(step.estimatedNotional)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {p.type === 'order' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Proposed Trade:</span>
                              <strong className="uppercase font-semibold text-zinc-900">
                                {p.side} {p.amount} {p.asset}
                              </strong>
                            </div>
                            {p.rationale && (
                              <p className="text-[11px] text-zinc-500 pt-1 border-t border-black/[0.04]">
                                {p.rationale}
                              </p>
                            )}
                          </>
                        )}

                        {p.type === 'alert' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Trigger Target:</span>
                              <strong className="font-semibold text-zinc-900">
                                {p.asset} {p.alertType} ${p.value}
                              </strong>
                            </div>
                            {p.rationale && (
                              <p className="text-[11px] text-zinc-500 pt-1 border-t border-black/[0.04]">
                                {p.rationale}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Safety Gate Action Trigger Button */}
                      <button
                        type="button"
                        onClick={() => handleActionClick(p, i)}
                        className={`w-full py-2.5 px-3 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm ${
                          p.type === 'emergency_defend'
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                            : p.type === 'deploy_strategy'
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                            : p.type === 'smart_dca'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-zinc-900/20'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 text-amber-300" />
                        <span>
                          {p.type === 'emergency_defend'
                            ? 'Inspect Defense Protocol in Safety Gate'
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

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 bg-white/80 border border-black/[0.06] rounded-2xl text-xs text-zinc-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                Lumen Nexus is computing quantitative telemetry &amp; execution gates...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Capabilities Hub Menu (Opened via '+') */}
        {capabilitiesOpen && (
          <div className="p-4 bg-white/95 border-t border-black/[0.08] shadow-xl backdrop-blur-xl animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Nexus Agentic Capabilities Hub
              </span>
              <button
                type="button"
                onClick={() => setCapabilitiesOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xs font-semibold"
              >
                Close
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
                    className="p-2.5 rounded-xl border border-black/[0.06] bg-white hover:bg-indigo-50/50 hover:border-indigo-200 text-left transition-all group flex flex-col justify-between"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${c.color} text-white flex items-center justify-center shadow-xs`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11.5px] font-semibold text-zinc-900 group-hover:text-indigo-700 leading-tight">
                        {c.title}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">{c.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Action Prompt Chips */}
        {!capabilitiesOpen && (
          <div className="px-4 py-2 bg-white/50 border-t border-black/[0.04] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q.prompt)}
                className="flex-shrink-0 px-3 py-1.5 text-[11px] font-medium text-zinc-700 bg-white/90 hover:bg-white hover:text-indigo-600 border border-black/[0.08] rounded-full shadow-xs transition-all"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar with '+' Capabilities Button */}
        <div className="p-4 border-t border-black/[0.06] bg-white/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => setCapabilitiesOpen(!capabilitiesOpen)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-xs border ${
                capabilitiesOpen
                  ? 'bg-indigo-600 text-white border-indigo-600 rotate-45'
                  : 'bg-white hover:bg-zinc-100 text-zinc-700 border-black/[0.08]'
              }`}
              title="Browse Agentic Capabilities"
            >
              <Plus className="w-4 h-4 transition-transform duration-200" />
            </button>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask Nexus: stress tests, deploy bots, DCA, rebalance..."
              className="flex-1 px-4 py-2.5 text-xs bg-white/95 border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 placeholder:text-zinc-400 transition-all shadow-xs"
            />
            <button
              type="submit"
              disabled={!text.trim() || chatLoading}
              className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-sm"
              title="Send to Nexus"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

