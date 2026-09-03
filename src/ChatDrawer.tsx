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
} from 'lucide-react';
import { money } from './trading';
import { resolveGemini3Model } from './gemini';
import { LatexRenderer } from './components/LatexRenderer';

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { chatHistory, sendChat, chatLoading, executeActionProposal, state } = useLumen();
  const [text, setText] = useState('');
  const [executedActions, setExecutedActions] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, chatHistory, chatLoading]);

  if (!open) return null;

  const handleSend = async (msgText?: string) => {
    const query = (msgText || text).trim();
    if (!query || chatLoading) return;
    setText('');
    await sendChat(query);
  };

  const handleActionClick = (proposal: any, index: number) => {
    const res = executeActionProposal(proposal);
    if (res.ok) {
      setExecutedActions((prev) => ({ ...prev, [index]: true }));
    }
  };

  const quickPrompts = [
    { label: '🛡️ Sense Market Danger', prompt: 'Sense market danger across my portfolio. Audit drawdowns, concentration risk, and downside volatility.' },
    { label: '⚖️ Rebalance Portfolio', prompt: 'Compute optimal agentic portfolio rebalancing using inverse-volatility risk budgeting.' },
    { label: '📐 Derive Kelly Formula', prompt: 'Derive the Kelly criterion formula with full LaTeX math and explain how to apply it to crypto position sizing.' },
    { label: '⚡ BTC Trend & Momentum', prompt: 'Analyze current Bitcoin market momentum, RSI divergence, and resistance levels.' },
    { label: '📋 Draft 0.05 BTC Buy', prompt: 'Prepare a paper buy order for 0.05 BTC based on current quotes.' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm transition-all duration-300"
      onMouseDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <aside className="relative flex flex-col w-full max-w-[500px] h-full bg-white/90 backdrop-blur-2xl border-l border-white/60 shadow-2xl text-zinc-900 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] bg-white/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-zinc-900">Lumen Copilot</h2>
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 rounded-full border border-indigo-500/20">
                  {resolveGemini3Model(state.settings.geminiModel).replace('gemini-', '')}
                </span>
              </div>
              <p className="text-xs text-zinc-500">Autonomous Sentinel &amp; LaTeX Quantitative Reasoner</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] transition-all"
              onClick={onClose}
              title="Close Copilot"
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
            const isExecuted = executedActions[i];
            const p = m.actionProposal;

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

                  {/* Interactive Action Proposal Card */}
                  {hasAction && p && (
                    <div
                      className={`p-3.5 rounded-2xl backdrop-blur-md space-y-3 transition-all ${
                        p.type === 'emergency_defend'
                          ? 'bg-rose-500/[0.08] border border-rose-500/30'
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
                          ) : p.type === 'rebalance' ? (
                            <>
                              <Scale className="w-4 h-4 text-indigo-600" />
                              <span className="text-indigo-900 font-bold">Agentic Rebalancing Plan</span>
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
                              : 'bg-amber-500/15 text-amber-800 border-amber-500/30 font-semibold'
                          }`}
                        >
                          {p.dangerLevel ? `${p.dangerLevel} DANGER` : 'Requires Gate Approval'}
                        </span>
                      </div>

                      {/* Proposal Body Details */}
                      <div className="text-xs text-zinc-700 bg-white/80 p-3 rounded-xl border border-black/[0.04] space-y-2">
                        {p.type === 'emergency_defend' && (
                          <div className="space-y-1.5">
                            {p.hazardSource && (
                              <div className="text-rose-700 font-medium text-[11.5px] flex items-start gap-1.5">
                                <span>⚠️</span>
                                <span>{p.hazardSource}</span>
                              </div>
                            )}
                            <p className="text-zinc-600 text-[11px] leading-relaxed">
                              {p.rationale}
                            </p>
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
                                {p.rebalanceSteps.length > 3 && (
                                  <div className="text-[10px] text-zinc-400 italic">
                                    + {p.rebalanceSteps.length - 3} additional rebalance operations
                                  </div>
                                )}
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
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                        }`}
                      >
                        <ShieldAlert className="w-4 h-4 text-amber-300" />
                        <span>
                          {p.type === 'emergency_defend'
                            ? 'Inspect Defense Protocol in Safety Gate'
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
                Lumen Copilot is running quantitative calculations...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Action Prompt Chips */}
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

        {/* Input Bar */}
        <div className="p-4 border-t border-black/[0.06] bg-white/70">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask for mathematical models, danger sensing, or rebalancing..."
              className="flex-1 px-4 py-2.5 text-xs bg-white/95 border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 placeholder:text-zinc-400 transition-all shadow-xs"
            />
            <button
              type="submit"
              disabled={!text.trim() || chatLoading}
              className="w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-sm"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

