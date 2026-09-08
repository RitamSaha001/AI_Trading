import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { money, moneyINR } from './trading';
import { isIndianAsset } from './domain/portfolio';
import { resolveGemini3Model } from './gemini';
import { LatexRenderer } from './components/LatexRenderer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { go } from './Shell';

/**
 * High-speed token streaming typewriter animation for newly arrived assistant messages.
 * Displays thinking traces immediately, animates the response text with a glowing cursor,
 * and provides click-to-skip functionality.
 */
function TypewriterAssistantMessage({
  content,
  isLatest,
}: {
  content: string;
  isLatest: boolean;
}) {
  const safeContent = typeof content === 'string' ? content : (content ? String(content) : '');

  // Extract thinking block if present
  const { thinkingBlock, bodyContent } = useMemo(() => {
    const match = safeContent.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (match) {
      return {
        thinkingBlock: match[0],
        bodyContent: safeContent.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim(),
      };
    }
    return { thinkingBlock: '', bodyContent: safeContent };
  }, [safeContent]);

  // Keep track of messages that have already completed typing animation
  const typedMessagesRef = useRef<Set<string>>(new Set());
  const alreadyCompleted = !isLatest || typedMessagesRef.current.has(safeContent);

  const [displayedLength, setDisplayedLength] = useState(() =>
    alreadyCompleted ? (bodyContent?.length || 0) : 0
  );
  const [isTyping, setIsTyping] = useState(() => !alreadyCompleted && (bodyContent?.length || 0) > 0);

  useEffect(() => {
    if (!isLatest || typedMessagesRef.current.has(safeContent)) {
      setDisplayedLength(bodyContent?.length || 0);
      setIsTyping(false);
      return;
    }

    if (!bodyContent || bodyContent.length === 0) {
      setDisplayedLength(0);
      setIsTyping(false);
      typedMessagesRef.current.add(safeContent);
      return;
    }

    setDisplayedLength(0);
    setIsTyping(true);

    // Fast, fluid typing rate: 3 to 6 chars per tick (~16ms), finishes under ~1.8s
    const step = Math.max(3, Math.ceil(bodyContent.length / 55));
    const timer = setInterval(() => {
      setDisplayedLength((prev) => {
        const next = prev + step;
        if (next >= bodyContent.length) {
          clearInterval(timer);
          setIsTyping(false);
          typedMessagesRef.current.add(safeContent);
          return bodyContent.length;
        }
        return next;
      });
    }, 16);

    return () => clearInterval(timer);
  }, [safeContent, isLatest, bodyContent]);

  const handleSkip = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDisplayedLength(bodyContent?.length || 0);
    setIsTyping(false);
    typedMessagesRef.current.add(safeContent);
  };

  const currentBody = isTyping ? (bodyContent?.slice(0, displayedLength) || '') : (bodyContent || '');
  const renderContent = thinkingBlock
    ? `${thinkingBlock}\n\n${currentBody}`
    : currentBody;

  return (
    <div
      className={`relative ${isTyping ? 'cursor-pointer select-none' : ''}`}
      onClick={() => {
        if (isTyping) handleSkip();
      }}
      title={isTyping ? 'Click to show full message' : undefined}
    >
      <LatexRenderer content={renderContent} />

      {isTyping && (
        <span
          className="inline-block w-1.5 h-3.5 bg-indigo-600 rounded-xs animate-pulse ml-1 align-middle shadow-[0_0_8px_rgba(99,102,241,0.5)]"
          aria-hidden="true"
        />
      )}

      {isTyping && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleSkip}
            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
            title="Skip typing animation"
          >
            <span>Skip</span>
            <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Apple-grade Action Proposal Card with gradient status bars,
 * prominent direction badges, tactile confirmation controls, and dismiss capability.
 */
function ActionProposalCard({
  proposal,
  onExecute,
  onDismiss,
  isDismissed,
  onUndoDismiss,
  isIndian,
  currentPrice,
}: {
  proposal: any;
  index: number;
  onExecute: () => void;
  onDismiss: () => void;
  isDismissed: boolean;
  onUndoDismiss: () => void;
  isIndian: boolean;
  currentPrice?: number;
}) {
  if (isDismissed) {
    return (
      <div className="p-3.5 rounded-2xl bg-zinc-50/90 border border-zinc-200/70 text-xs text-zinc-500 flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-zinc-200/60 flex items-center justify-center text-zinc-500">
            <Check className="w-3 h-3" />
          </div>
          <span className="font-medium text-zinc-700">Proposal dismissed</span>
        </div>
        <button
          type="button"
          onClick={onUndoDismiss}
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          Undo
        </button>
      </div>
    );
  }

  const p = proposal;
  const isBuy = p.side === 'buy';
  const effectivePrice = p.price || currentPrice || 0;
  const notional = (p.amount || 0) * effectivePrice;

  // Gradient stripe per type
  const getGradient = () => {
    if (p.type === 'order') {
      return isBuy
        ? 'from-emerald-500 via-teal-400 to-emerald-600'
        : 'from-rose-500 via-red-500 to-amber-500';
    }
    if (p.type === 'deploy_strategy') return 'from-indigo-600 via-violet-600 to-purple-500';
    if (p.type === 'smart_dca') return 'from-emerald-500 via-teal-400 to-cyan-500';
    if (p.type === 'stress_test') return 'from-amber-500 via-orange-500 to-red-500';
    if (p.type === 'emergency_defend') return 'from-rose-600 via-red-600 to-orange-600';
    if (p.type === 'rebalance') return 'from-blue-600 via-indigo-600 to-cyan-500';
    if (p.type === 'token_compare') return 'from-violet-600 via-purple-600 to-pink-500';
    return 'from-amber-500 via-yellow-500 to-amber-400';
  };

  // Header Title and Icon
  const getHeaderInfo = () => {
    switch (p.type) {
      case 'emergency_defend':
        return {
          icon: ShieldAlert,
          iconColor: 'text-rose-600 bg-rose-50 border-rose-100',
          title: 'Sentinel Capital Defense',
          subtitle: 'Downside Volatility Mitigation Protocol',
          actionLabel: 'Inspect Defense in Safety Gate',
          actionIcon: ShieldAlert,
        };
      case 'stress_test':
        return {
          icon: Activity,
          iconColor: 'text-amber-600 bg-amber-50 border-amber-100',
          title: 'Portfolio Stress-Test Simulation',
          subtitle: 'Scenario Shock & Capital Drawdown Audit',
          actionLabel: 'Confirm Stress-Test Audit',
          actionIcon: Activity,
        };
      case 'deploy_strategy':
        return {
          icon: Zap,
          iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-100',
          title: 'Synthesize Autonomous Bot',
          subtitle: `${p.strategyParams?.kind || 'VWAP Momentum'} Fleet Execution`,
          actionLabel: 'Authorize & Deploy Fleet Bot',
          actionIcon: Zap,
        };
      case 'smart_dca':
        return {
          icon: TrendingUp,
          iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-100',
          title: 'Value-Weighted DCA Plan',
          subtitle: 'Dynamic RSI Dip Accumulation',
          actionLabel: 'Authorize & Deploy Smart DCA',
          actionIcon: TrendingUp,
        };
      case 'rebalance':
        return {
          icon: Scale,
          iconColor: 'text-blue-600 bg-blue-50 border-blue-100',
          title: 'Agentic Risk-Parity Rebalance',
          subtitle: 'Fractional Kelly Optimal Allocation',
          actionLabel: 'Review Rebalance in Safety Gate',
          actionIcon: Scale,
        };
      case 'token_compare':
        return {
          icon: Compass,
          iconColor: 'text-violet-600 bg-violet-50 border-violet-100',
          title: 'Multi-Token Alpha Radar',
          subtitle: 'Cross-Asset Factor & Sharpe Benchmark',
          actionLabel: 'Inspect in Trading Desk',
          actionIcon: ArrowUpRight,
        };
      case 'order':
        return {
          icon: LineChart,
          iconColor: isBuy ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100',
          title: isBuy ? 'Asymmetric Buy Order' : 'Take-Profit Sell Order',
          subtitle: 'Paper Bracket Execution Ticket',
          actionLabel: isBuy ? 'Authorize & Execute Buy Order' : 'Authorize & Execute Sell Order',
          actionIcon: ShieldCheck,
        };
      default:
        return {
          icon: Bell,
          iconColor: 'text-amber-600 bg-amber-50 border-amber-100',
          title: 'Adaptive Volatility Alert',
          subtitle: 'Real-Time Price Sentinel Trigger',
          actionLabel: 'Arm Volatility Alert',
          actionIcon: Bell,
        };
    }
  };

  const header = getHeaderInfo();
  const HeaderIcon = header.icon;
  const ActionIcon = header.actionIcon;

  return (
    <div className="relative rounded-2xl bg-white border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-200 animate-in fade-in zoom-in-[0.98]">
      {/* Top Accent Gradient Stripe */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${getGradient()}`} />

      <div className="p-4 space-y-3.5">
        {/* Proposal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-xl border flex items-center justify-center shadow-2xs ${header.iconColor}`}>
              <HeaderIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-900 tracking-tight leading-none">
                {header.title}
              </h3>
              <p className="text-[10.5px] text-zinc-400 font-normal leading-tight mt-0.5">
                {header.subtitle}
              </p>
            </div>
          </div>

          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200/80 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>{p.dangerLevel ? `${p.dangerLevel} Hazard` : 'Safety Gate'}</span>
          </span>
        </div>

        {/* Hero Card Content per Type */}
        {p.type === 'order' && (
          <div className="space-y-2.5">
            {/* Apple Wallet Style Asset Ticket */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-zinc-50 to-zinc-100/50 border border-zinc-200/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase ${
                  isBuy ? 'bg-emerald-500 text-white shadow-2xs' : 'bg-rose-500 text-white shadow-2xs'
                }`}>
                  {p.side}
                </span>
                <div>
                  <span className="text-xs font-bold text-zinc-900 font-mono tracking-tight block">
                    {p.amount} {p.asset}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {p.orderType ? `${p.orderType.toUpperCase()} Execution` : 'Paper Bracket Ticket'}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-zinc-900 font-mono block">
                  {notional > 0 ? (isIndian ? moneyINR(notional) : money(notional)) : 'Market Sized'}
                </span>
                <span className="text-[10px] text-zinc-400">Est. Notional</span>
              </div>
            </div>

            {/* Metric Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-xl bg-zinc-50/80 border border-zinc-200/60">
                <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider block font-sans">
                  Entry Price
                </span>
                <span className="font-semibold text-zinc-800">
                  {p.price ? (isIndian ? moneyINR(p.price) : money(p.price)) : (currentPrice ? (isIndian ? moneyINR(currentPrice) : money(currentPrice)) : 'Live Spot')}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-emerald-900">
                <span className="text-[9px] text-emerald-700 font-semibold uppercase tracking-wider block font-sans">
                  Take-Profit Bracket
                </span>
                <span className="font-semibold text-emerald-800">
                  {p.takeProfit ? (isIndian ? moneyINR(p.takeProfit) : money(p.takeProfit)) : '+2.8x ATR (+4.5%)'}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-rose-50/60 border border-rose-200/60 text-rose-900">
                <span className="text-[9px] text-rose-700 font-semibold uppercase tracking-wider block font-sans">
                  Trailing Stop-Loss
                </span>
                <span className="font-semibold text-rose-800">
                  {p.stopLoss ? (isIndian ? moneyINR(p.stopLoss) : money(p.stopLoss)) : '-1.5x ATR (-2.1%)'}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-50/80 border border-zinc-200/60">
                <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider block font-sans">
                  Risk / Reward
                </span>
                <span className="font-semibold text-indigo-700">
                  2.14 : 1 (Asymmetric)
                </span>
              </div>
            </div>
          </div>
        )}

        {p.type === 'deploy_strategy' && p.strategyParams && (
          <div className="space-y-2.5">
            <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50/70 to-purple-50/40 border border-indigo-100/90 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-950 font-sans block">
                  {p.strategyParams.name}
                </span>
                <span className="text-[10px] text-indigo-600 font-mono">
                  Autonomous {p.strategyParams.kind} Algorithm
                </span>
              </div>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-mono font-medium rounded-full">
                Active Fleet Slot
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-xl bg-zinc-50/80 border border-zinc-200/60">
                <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider block font-sans">
                  Max Allocation
                </span>
                <span className="font-semibold text-zinc-800">
                  {((p.strategyParams.maxAllocation || 0.25) * 100).toFixed(0)}% Portfolio
                </span>
              </div>
              <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-200/60">
                <span className="text-[9px] text-emerald-700 font-semibold uppercase tracking-wider block font-sans">
                  Target Profit
                </span>
                <span className="font-semibold text-emerald-800">
                  +{p.strategyParams.targetProfitPct || 5}%
                </span>
              </div>
              <div className="p-2 rounded-xl bg-rose-50/60 border border-rose-200/60">
                <span className="text-[9px] text-rose-700 font-semibold uppercase tracking-wider block font-sans">
                  Trailing Stop
                </span>
                <span className="font-semibold text-rose-800">
                  -{p.strategyParams.trailingStopPct || 2}%
                </span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-50/80 border border-zinc-200/60">
                <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider block font-sans">
                  Execution Loop
                </span>
                <span className="font-semibold text-zinc-800">
                  Live Tick (2.5s)
                </span>
              </div>
            </div>
          </div>
        )}

        {p.type === 'smart_dca' && p.dcaPlan && (
          <div className="space-y-2.5">
            <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-50/70 to-teal-50/40 border border-emerald-100/90 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-950 font-sans block">
                  Smart DCA Accumulator ({p.dcaPlan.asset})
                </span>
                <span className="text-[10px] text-emerald-700 font-mono">
                  ${p.dcaPlan.baseAmountUsd} every {p.dcaPlan.frequency}
                </span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-medium rounded-full">
                Value-Weighted
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-200/60">
                <span className="text-[9px] text-emerald-700 font-semibold uppercase tracking-wider block font-sans">
                  Dip Scaler
                </span>
                <span className="font-semibold text-emerald-800">
                  {p.dcaPlan.oversoldMultiplier}x on RSI &lt; 35
                </span>
              </div>
              <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-200/60">
                <span className="text-[9px] text-amber-700 font-semibold uppercase tracking-wider block font-sans">
                  Peak Safety Pause
                </span>
                <span className="font-semibold text-amber-800">
                  RSI &gt; {p.dcaPlan.pauseThresholdRsi}
                </span>
              </div>
            </div>
          </div>
        )}

        {p.type === 'stress_test' && p.stressTest && (
          <div className="space-y-2.5">
            <div className="p-3 rounded-xl bg-gradient-to-r from-amber-50/70 to-orange-50/40 border border-amber-100/90 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-950 font-sans block">
                  {p.stressTest.title}
                </span>
                <span className="text-[10px] text-amber-700 font-mono">
                  Simulated Macro Shock
                </span>
              </div>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-mono font-medium rounded-full">
                {p.stressTest.survivabilityRating} Cushion
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded-xl bg-rose-50/60 border border-rose-200/60 text-rose-900">
                <span className="text-[9px] text-rose-700 font-semibold uppercase tracking-wider block font-sans">
                  Drawdown Shock
                </span>
                <span className="font-semibold text-rose-800">
                  -{p.stressTest.simulatedDrawdownPct}%
                </span>
              </div>
              <div className="p-2 rounded-xl bg-zinc-50/80 border border-zinc-200/60">
                <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider block font-sans">
                  Projected Loss
                </span>
                <span className="font-semibold text-zinc-800">
                  ${p.stressTest.simulatedLossUsd.toLocaleString()}
                </span>
              </div>
            </div>

            {p.stressTest?.mitigationSteps && Array.isArray(p.stressTest.mitigationSteps) && p.stressTest.mitigationSteps.length > 0 && (
              <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-200/70 text-[11px] text-amber-900 flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                <span className="leading-snug">{p.stressTest.mitigationSteps[0]}</span>
              </div>
            )}
          </div>
        )}

        {p.type === 'token_compare' && p.tokenComparison && (
          <div className="space-y-2.5">
            <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 text-xs font-semibold text-purple-950">
              {p.tokenComparison.verdict}
            </div>
            <div className="space-y-1.5">
              {p.tokenComparison.tokens && Array.isArray(p.tokenComparison.tokens) && p.tokenComparison.tokens.map((t: any) => (
                <div key={t.asset} className="flex justify-between items-center text-[11px] font-mono p-2 rounded-xl bg-zinc-50 border border-zinc-200/60">
                  <span className="font-bold text-zinc-900">{t.asset}</span>
                  <span className="text-zinc-500 text-[10.5px]">
                    Sharpe {t.sharpeEstimate} • Vol {t.volAnnualizedPct}% • Beta {t.betaToBtc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {p.type === 'emergency_defend' && (
          <div className="space-y-2.5">
            {p.hazardSource && (
              <div className="p-2.5 rounded-xl bg-rose-50/80 border border-rose-200/70 text-xs text-rose-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">{p.hazardSource}</span>
                  <span className="text-[10.5px] text-rose-700">Immediate de-risking recommended</span>
                </div>
              </div>
            )}
            {p.rebalanceSteps && Array.isArray(p.rebalanceSteps) && p.rebalanceSteps.length > 0 && (
              <div className="p-2 rounded-xl bg-zinc-50 border border-zinc-200/60 space-y-1">
                <span className="text-[9px] font-mono uppercase text-zinc-400 block">Defensive Rebalancing:</span>
                {p.rebalanceSteps.slice(0, 3).map((step: any, sIdx: number) => (
                  <div key={sIdx} className="flex justify-between text-[11px] font-mono">
                    <span className="text-zinc-800">{step.action.toUpperCase()} {step.amount} {step.asset}</span>
                    <span className="text-zinc-500">${step.targetValueUsd?.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {p.type === 'rebalance' && (
          <div className="space-y-2.5">
            {p.rebalanceSteps && Array.isArray(p.rebalanceSteps) && p.rebalanceSteps.length > 0 && (
              <div className="p-2 rounded-xl bg-zinc-50 border border-zinc-200/60 space-y-1">
                <span className="text-[9px] font-mono uppercase text-zinc-400 block">Optimal Allocation Steps:</span>
                {p.rebalanceSteps.slice(0, 3).map((step: any, sIdx: number) => (
                  <div key={sIdx} className="flex justify-between text-[11px] font-mono">
                    <span className="text-zinc-800">{step.action.toUpperCase()} {step.amount} {step.asset}</span>
                    <span className="text-zinc-500">${step.targetValueUsd?.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {p.type === 'alert' && (
          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/60 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-900 font-mono block">
                {p.asset} {p.alertType}
              </span>
              <span className="text-[10px] text-zinc-400">Trigger Boundary</span>
            </div>
            <span className="text-xs font-bold text-amber-800 font-mono">
              ${p.value}
            </span>
          </div>
        )}

        {/* AI Rationale Quote */}
        {p.rationale && (
          <div className="p-2.5 rounded-xl bg-zinc-50/70 border border-zinc-200/50 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-500 leading-relaxed font-sans italic">
              &ldquo;{p.rationale}&rdquo;
            </p>
          </div>
        )}

        {/* Dual Action Controls: Primary + Dismiss */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onExecute}
            className="flex-1 py-2.5 px-4 text-xs font-semibold rounded-xl text-white bg-zinc-950 hover:bg-black active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 transition-all group"
          >
            <ActionIcon className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>{header.actionLabel}</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="py-2.5 px-3 rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 border border-zinc-200/80 active:scale-[0.98] transition-all flex items-center justify-center"
            title="Dismiss proposal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    chatHistory,
    sendChat,
    chatLoading,
    executeActionProposal,
    state,
    markets,
    prefilledChatPrompt,
  } = useLumen();
  const [text, setText] = useState('');
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [executedActions, setExecutedActions] = useState<Record<number, boolean>>({});
  const [dismissedProposals, setDismissedProposals] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedAsset = state?.selectedAsset || 'BTC';
  const isIndian = isIndianAsset(selectedAsset) || state?.accountMode === 'upstox';

  useEffect(() => {
    if (open) {
      try {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch {
        try {
          messagesEndRef.current?.scrollIntoView();
        } catch {}
      }
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
      prompt: `Synthesize an institutional VWAP momentum strategy bot for ${selectedAsset} with dynamic ATR profit brackets and deploy it.`,
    },
    {
      id: 'smart_dca',
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-600',
      title: 'Smart Value-Weighted DCA',
      desc: 'Automated accumulation with dip multipliers and peak pauses',
      prompt: `Create a Smart Value-Weighted DCA accumulation plan for ${selectedAsset} with dip buying multipliers.`,
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
      prompt: `Draft an asymmetric paper buy order for ${selectedAsset} with ATR-based Take-Profit and Trailing Stop-Loss brackets.`,
    },
    {
      id: 'alert',
      icon: Bell,
      color: 'from-amber-500 to-yellow-600',
      title: 'Adaptive Volatility Alert',
      desc: 'Set intelligent breakout and support/resistance triggers',
      prompt: `Set an intelligent volatility price alert for ${selectedAsset} based on its current Bollinger band levels.`,
    },
  ];

  const quantTools = useMemo(() => [
    { id: 'audit', label: 'Risk Audit', command: '/audit', icon: ShieldAlert, color: 'text-rose-600 bg-rose-50/80 hover:bg-rose-100 border-rose-200/80', badge: 'HHI' },
    { id: 'scan', label: isIndian ? 'NSE Radar' : 'Alpha Radar', command: isIndian ? '/scan nse' : '/scan', icon: Compass, color: 'text-violet-600 bg-violet-50/80 hover:bg-violet-100 border-violet-200/80', badge: 'R:R' },
    { id: 'bot', label: 'Strategy Bot', command: `/bot ${selectedAsset}`, icon: Zap, color: 'text-indigo-600 bg-indigo-50/80 hover:bg-indigo-100 border-indigo-200/80', badge: 'ATR' },
    { id: 'dca', label: 'Smart DCA', command: `/dca ${selectedAsset}`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50/80 hover:bg-emerald-100 border-emerald-200/80', badge: 'RSI' },
    { id: 'rebalance', label: 'Rebalance', command: '/rebalance', icon: Scale, color: 'text-blue-600 bg-blue-50/80 hover:bg-blue-100 border-blue-200/80', badge: 'Kelly' },
    { id: 'stress', label: 'Stress Test', command: '/stress', icon: Activity, color: 'text-amber-600 bg-amber-50/80 hover:bg-amber-100 border-amber-200/80', badge: 'VaR' },
  ], [isIndian, selectedAsset]);

  const slashCommands = useMemo(() => [
    { name: '/audit', title: 'Sentinel Risk & HHI Audit', desc: 'Concentration, liquidation, drawdown & cash reserve checks', icon: ShieldAlert },
    { name: isIndian ? '/scan nse' : '/scan', title: isIndian ? 'NSE Bluechips Alpha Radar' : 'Alpha Radar Multi-Asset Scan', desc: 'Scan asymmetric setups with >=2.5:1 R:R', icon: Compass },
    { name: `/bot ${selectedAsset}`, title: `Synthesize Bot (${selectedAsset})`, desc: 'Institutional VWAP momentum bot with ATR brackets', icon: Zap },
    { name: `/dca ${selectedAsset}`, title: `Smart DCA Plan (${selectedAsset})`, desc: 'Value-weighted accumulation with dip multipliers', icon: TrendingUp },
    { name: '/rebalance', title: 'Fractional Kelly Rebalance', desc: 'Two-stage cash-feasible risk parity optimization', icon: Scale },
    { name: '/stress', title: 'Portfolio Stress Test', desc: 'Simulate flash crashes, rate hikes, and 95% VaR', icon: Activity },
    { name: '/help', title: 'Quant Tools Cheat Sheet', desc: 'Interactive guide of all deterministic math tools', icon: Sparkles },
  ], [isIndian, selectedAsset]);

  const showSlashMenu = text.startsWith('/');
  const filteredSlashCommands = useMemo(() => {
    if (!showSlashMenu) return [];
    const query = text.toLowerCase();
    return slashCommands.filter(
      (cmd) => cmd.name.toLowerCase().includes(query) || cmd.title.toLowerCase().includes(query.slice(1))
    );
  }, [showSlashMenu, text, slashCommands]);

  const quickPrompts = isIndian
    ? [
        { label: 'Sentinel Danger Audit', prompt: 'Sense market danger across my Indian equities portfolio. Audit drawdowns, concentration risk, and downside volatility.' },
        { label: 'High-Probability NSE Setups', prompt: 'Scan top NSE Indian equities for asymmetric setups with at least 2.5:1 reward-to-risk ratio.' },
        { label: `Synthesize Bot (${state.selectedAsset})`, prompt: `Synthesize an institutional VWAP momentum strategy bot for ${state.selectedAsset} with dynamic ATR profit brackets and deploy it.` },
        { label: `Smart DCA (${state.selectedAsset})`, prompt: `Create a Smart Value-Weighted DCA plan for ${state.selectedAsset} with dip buying multipliers.` },
        { label: 'Kelly Rebalance', prompt: 'Compute optimal agentic portfolio rebalancing using Fractional Kelly optimization across Indian equities.' },
        { label: 'Compare RELIANCE vs TCS vs INFY', prompt: 'Compare RELIANCE, TCS, and INFY head-to-head on Alpha Radar, analyzing Sharpe ratios and momentum.' },
      ]
    : [
        { label: 'Sentinel Danger Audit', prompt: 'Sense market danger across my portfolio. Audit drawdowns, concentration risk, and downside volatility.' },
        { label: 'Stress Test (-20% BTC)', prompt: 'Run a portfolio stress test simulating a 20% Bitcoin flash crash.' },
        { label: 'Synthesize Strategy Bot', prompt: `Synthesize an institutional strategy bot for ${selectedAsset} with dynamic ATR profit brackets.` },
        { label: 'Smart DCA Plan', prompt: `Create a Smart Value-Weighted DCA plan for ${selectedAsset}.` },
        { label: 'Kelly Rebalance', prompt: 'Compute optimal agentic portfolio rebalancing using Fractional Kelly optimization.' },
        { label: 'Compare BTC vs ETH vs SOL', prompt: 'Compare BTC, ETH, and SOL head-to-head on Alpha Radar.' },
      ];

  return (
    <ErrorBoundary fallbackTitle="Nexus Intelligence Drawer" isDrawer={true} onClose={onClose}>
      <div
        className="fixed inset-0 z-50 flex justify-end bg-black/25 transition-opacity duration-300"
        onMouseDown={(e) => e.currentTarget === e.target && onClose()}
      >
        <aside className="relative flex flex-col w-full max-w-[540px] h-full bg-white border-l border-zinc-200/80 shadow-[-16px_0_48px_rgba(0,0,0,0.06)] text-zinc-900 animate-in slide-in-from-right duration-300 overflow-hidden">
        {/* Minimalist Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-white/95">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-zinc-950 text-white flex items-center justify-center shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-900">Nexus Intelligence</h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-800 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {state?.settings?.geminiApiKey ? 'Gemini 3 + Local Quant' : 'Local Quant AI (100% Offline)'}
                </span>
                {state?.settings?.geminiApiKey && (
                  <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">
                    {resolveGemini3Model(state?.settings?.geminiModel).replace('gemini-', '')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 tracking-tight">Quantitative Desk &amp; Risk Sentinel</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 flex items-center justify-center transition-all active:scale-95"
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
              <div className="w-11 h-11 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-xs mx-auto">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">Autonomous Financial Intelligence</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Institutional reasoning powered by Gemini 3 with offline local neural engine fallback.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-left">
                {quickPrompts.slice(0, 4).map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(q.prompt)}
                    className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100/90 border border-zinc-200/60 transition-all group space-y-1 text-left shadow-2xs active:scale-[0.99]"
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
                  <div className="w-6 h-6 rounded-lg bg-zinc-950 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-2xs">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}

                <div className={`${isUser ? 'max-w-[85%]' : 'w-full max-w-[94%]'} space-y-2.5`}>
                  <div
                    className={`text-[13px] leading-relaxed ${
                      isUser
                        ? 'p-3.5 bg-zinc-900 text-white rounded-2xl rounded-tr-xs ml-auto font-normal shadow-xs'
                        : 'p-4 sm:p-5 bg-white border border-zinc-200/90 text-zinc-800 rounded-2xl rounded-tl-xs shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-line">{m.text || ''}</div>
                    ) : (
                      <TypewriterAssistantMessage
                        content={m.text || ''}
                        isLatest={i === chatHistory.length - 1 && !isUser}
                      />
                    )}
                  </div>

                  {/* Quantitative Intelligence Telemetry Pill */}
                  {!isUser && m.telemetry && (
                    <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-[11px] font-mono space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap text-zinc-800">
                        <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-sans text-[11.5px]">{m.telemetry.aiMode}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500 text-[10px]">
                          <span>{m.telemetry.dataFreshnessSec}s freshness</span>
                          <span>•</span>
                          <span>{m.telemetry.dataQualityScore}% data quality</span>
                        </div>
                      </div>

                      {m.telemetry.toolsUsed && Array.isArray(m.telemetry.toolsUsed) && m.telemetry.toolsUsed.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          <span className="text-[10px] text-zinc-400 font-sans">Tools Used:</span>
                          {m.telemetry.toolsUsed.map((tool: any, tIdx: number) => (
                            <span
                              key={tIdx}
                              className="px-1.5 py-0.5 rounded-md bg-white border border-zinc-200/80 text-zinc-700 text-[9.5px] font-mono shadow-2xs"
                            >
                              {String(typeof tool === 'string' ? tool : tool?.name || tool?.tool || tool).replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-zinc-200/60">
                        <span className="text-zinc-500 font-sans">Portfolio Risk State:</span>
                        <span
                          className={`font-semibold ${
                            m.telemetry.portfolioRiskLabel === 'Conservative'
                              ? 'text-emerald-700'
                              : m.telemetry.portfolioRiskLabel === 'Moderate'
                              ? 'text-blue-700'
                              : m.telemetry.portfolioRiskLabel === 'Elevated'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {m.telemetry.portfolioRiskLabel} ({m.telemetry.portfolioRiskScore}/100)
                        </span>
                      </div>

                      {m.telemetry.counterArgument && (
                        <div className="mt-1 p-2 rounded-xl bg-amber-50/80 border border-amber-200/70 text-[10.5px] text-amber-900 space-y-0.5">
                          <div className="flex items-center gap-1 font-semibold text-amber-800 text-[10px]">
                            <ShieldAlert className="w-3 h-3 text-amber-600 flex-shrink-0" />
                            <span>Challenger Desk Counterargument:</span>
                          </div>
                          <p className="text-zinc-700 font-sans leading-snug">
                            {m.telemetry.counterArgument}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visual Execution Receipt ("What Nexus Did") - Apple Pay Style */}
                  {receipt && (
                    <div className="relative rounded-2xl bg-white border border-emerald-200/80 shadow-[0_4px_16px_rgba(16,185,129,0.08)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs tracking-tight">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Execution Verified</span>
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/15">
                            {receipt.executedAt ? new Date(receipt.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <h4 className="text-xs font-semibold text-zinc-900">{receipt.title}</h4>
                          <p className="text-[11.5px] text-zinc-500 leading-relaxed">{receipt.summary}</p>
                        </div>

                        {receipt.stateDiff && (
                          <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80 text-[11px] font-mono font-medium text-emerald-900 flex items-start gap-2 shadow-2xs">
                            <span className="text-emerald-700 font-bold whitespace-nowrap">State-Diff:</span>
                            <span className="leading-snug">{receipt.stateDiff}</span>
                          </div>
                        )}

                        {receipt.details && Array.isArray(receipt.details) && receipt.details.length > 0 && (
                          <div className="p-2.5 rounded-xl bg-zinc-50 border border-emerald-200/60 space-y-1 text-[11px] font-mono text-zinc-700 shadow-2xs">
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
                            className="w-full py-2 px-3 text-xs font-semibold text-emerald-800 bg-emerald-100/70 hover:bg-emerald-100 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
                          >
                            <span>{receipt.jumpLabel || 'Inspect in Desk'}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Interactive Action Proposal Card */}
                  {hasAction && p && !receipt && (
                    <ActionProposalCard
                      proposal={p}
                      index={i}
                      onExecute={() => handleActionClick(p, i)}
                      onDismiss={() => setDismissedProposals((prev) => ({ ...prev, [i]: true }))}
                      isDismissed={Boolean(dismissedProposals[i])}
                      onUndoDismiss={() => setDismissedProposals((prev) => ({ ...prev, [i]: false }))}
                      isIndian={isIndian}
                      currentPrice={
                        markets[p.asset as keyof typeof markets]?.price ||
                        (p.asset === selectedAsset ? markets[selectedAsset]?.price : undefined)
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-zinc-950 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div className="bg-zinc-50 border border-zinc-200/70 px-3.5 py-2 rounded-xl text-xs text-zinc-500 flex items-center gap-2 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-ping" />
                <span>Nexus is evaluating quantitative telemetry...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Capabilities Hub Menu (Opened via '+') */}
        {capabilitiesOpen && (
          <div className="mx-4 mb-2 p-3.5 bg-white rounded-2xl border border-zinc-200 shadow-xl space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
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
                    className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/60 text-left transition-all group flex flex-col justify-between shadow-2xs active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-white border border-zinc-200/80 text-zinc-800 flex items-center justify-center shadow-2xs">
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
        {!capabilitiesOpen && !showSlashMenu && (
          <div className="px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q.prompt)}
                className="flex-shrink-0 px-2.5 py-0.5 text-[10.5px] font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200/80 rounded-full transition-all active:scale-[0.98]"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        {/* 1-Click Instant Quant Tools Action Bar */}
        <div className="px-4 py-1.5 border-t border-zinc-100 bg-zinc-50/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider pl-0.5 pr-1 flex-shrink-0">
            <Zap className="w-3 h-3 text-indigo-500 fill-indigo-500" />
            <span>Quant</span>
          </div>
          {quantTools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSend(t.command)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 ${t.color}`}
                title={`Instant 1-click execution: ${t.command}`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
                <span className="text-[9px] font-mono px-1 rounded-sm bg-white/80 font-bold opacity-90 shadow-2xs">
                  {t.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Slash Command Autocomplete Popover */}
        {showSlashMenu && (
          <div className="mx-4 mb-2 p-2 bg-white/95 backdrop-blur-md rounded-2xl border border-zinc-200/90 shadow-xl space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150 z-20">
            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-zinc-500 border-b border-zinc-100 mb-1">
              <span className="flex items-center gap-1.5 text-zinc-800">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Deterministic Quant Tools
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">0-latency offline</span>
            </div>
            {filteredSlashCommands.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {filteredSlashCommands.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.name}
                      type="button"
                      onClick={() => handleSend(cmd.name)}
                      className="w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100/90 flex items-center justify-between text-left group transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-zinc-100 border border-zinc-200/80 flex items-center justify-center text-zinc-700 group-hover:text-indigo-600">
                          <Icon className="w-3 h-3" />
                        </div>
                        <div>
                          <span className="font-mono text-xs font-bold text-indigo-600 group-hover:text-indigo-700">
                            {cmd.name}
                          </span>
                          <span className="text-xs text-zinc-700 font-medium ml-2">
                            {cmd.title}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-normal line-clamp-1 ml-2">
                        {cmd.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-2 text-xs text-zinc-400 italic">
                No matching slash command. Type /help to see all available tools.
              </div>
            )}
          </div>
        )}

        {/* Input Bar with '+' Capabilities Button - Clean Minimalist Pill */}
        <div className="p-4 pt-1 border-t border-zinc-100 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center"
          >
            <div className="w-full bg-zinc-50 border border-zinc-200 rounded-full p-1.5 flex items-center gap-1.5 shadow-2xs focus-within:border-zinc-400 focus-within:bg-white transition-all">
              <button
                type="button"
                onClick={() => setCapabilitiesOpen(!capabilitiesOpen)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  capabilitiesOpen
                    ? 'bg-zinc-900 text-white rotate-45'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60'
                }`}
                title="Browse Capabilities"
              >
                <Plus className="w-4 h-4 transition-transform duration-200" />
              </button>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  isIndian
                    ? 'Ask Nexus: /audit, /scan nse, /bot RELIANCE, /dca...'
                    : 'Ask Nexus: /audit, /scan, /bot BTC, /stress...'
                }
                className="flex-1 bg-transparent border-none outline-none text-xs text-zinc-900 placeholder:text-zinc-400 px-3 py-1 font-normal"
              />
              <button
                type="submit"
                disabled={!text.trim() || chatLoading}
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-black disabled:opacity-20 text-white flex items-center justify-center transition-all active:scale-95 shadow-2xs"
                title="Send"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
    </ErrorBoundary>
  );
}


