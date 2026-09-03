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
  ArrowRight,
  RotateCcw,
  Zap,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { money } from './trading';

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
    { label: 'Analyze BTC Trend', prompt: 'Analyze current Bitcoin market momentum, RSI divergence, and resistance levels.' },
    { label: 'Risk Audit', prompt: 'Audit my overall portfolio risk, concentration risk, and cash buffer.' },
    { label: 'Check Momentum Signals', prompt: 'Check all active momentum and algorithmic trading signals across the market.' },
    { label: 'Draft 0.05 BTC Buy', prompt: 'Prepare a paper buy order for 0.05 BTC based on current quotes.' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm transition-all duration-300"
      onMouseDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <aside className="relative flex flex-col w-full max-w-[480px] h-full bg-white/85 backdrop-blur-2xl border-l border-white/60 shadow-2xl text-zinc-900 animate-in slide-in-from-right duration-300">
        {/* Apple Glass Drawer Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] bg-white/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-zinc-900">Lumen Copilot</h2>
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 rounded-full border border-indigo-500/20">
                  {state.settings.geminiModel ? state.settings.geminiModel.replace('gemini-', '') : 'AI Engine'}
                </span>
              </div>
              <p className="text-xs text-zinc-500">Technical indicators &amp; portfolio risk copilot</p>
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

            return (
              <div key={i} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[85%] space-y-2`}>
                  <div
                    className={`p-3.5 text-[13.5px] leading-relaxed rounded-2xl shadow-sm ${
                      isUser
                        ? 'bg-zinc-900 text-white rounded-tr-sm ml-auto'
                        : 'bg-white/90 text-zinc-800 border border-black/[0.06] rounded-tl-sm backdrop-blur-md'
                    }`}
                  >
                    <div className="whitespace-pre-line">{m.text}</div>
                  </div>

                  {/* Interactive Action Proposal Card */}
                  {hasAction && (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-500/[0.08] to-purple-500/[0.04] border border-indigo-500/20 backdrop-blur-md space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                        <span className="flex items-center gap-1.5">
                          {m.actionProposal.type === 'order' ? (
                            <TrendingUp className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Bell className="w-4 h-4 text-amber-600" />
                          )}
                          AI Recommendation: {m.actionProposal.type === 'order' ? 'Paper Trade' : 'Price Alert'}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 border border-amber-500/30">
                          Requires Approval
                        </span>
                      </div>

                      <div className="text-xs text-zinc-700 bg-white/70 p-2.5 rounded-xl border border-black/[0.04] space-y-1">
                        {m.actionProposal.type === 'order' ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Proposed Trade:</span>
                              <strong className="uppercase font-semibold text-zinc-900">
                                {m.actionProposal.side} {m.actionProposal.amount} {m.actionProposal.asset}
                              </strong>
                            </div>
                            {(m.actionProposal.rationale || m.actionProposal.reason) && (
                              <p className="text-[11px] text-zinc-500 pt-1 border-t border-black/[0.04]">
                                {m.actionProposal.rationale || m.actionProposal.reason}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Trigger Target:</span>
                              <strong className="font-semibold text-zinc-900">
                                {m.actionProposal.asset} {m.actionProposal.alertType} ${m.actionProposal.value}
                              </strong>
                            </div>
                            {(m.actionProposal.rationale || m.actionProposal.reason) && (
                              <p className="text-[11px] text-zinc-500 pt-1 border-t border-black/[0.04]">
                                {m.actionProposal.rationale || m.actionProposal.reason}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleActionClick(m.actionProposal, i)}
                        className="w-full py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-500/25"
                      >
                        <ShieldAlert className="w-4 h-4 text-amber-300" />
                        <span>Inspect in AI Safety Gate</span>
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
                Copilot is computing market intelligence...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Action Prompt Chips */}
        <div className="px-4 py-2 bg-white/40 border-t border-black/[0.04] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {quickPrompts.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(q.prompt)}
              className="flex-shrink-0 px-2.5 py-1 text-[11px] font-medium text-zinc-600 bg-white/80 hover:bg-white border border-black/[0.06] rounded-full shadow-xs transition-all hover:text-zinc-900"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-black/[0.06] bg-white/60">
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
              placeholder="Ask about live quotes, risks, or strategy..."
              className="flex-1 px-4 py-2.5 text-xs bg-white/90 border border-black/[0.08] rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 placeholder:text-zinc-400 transition-all shadow-xs"
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
