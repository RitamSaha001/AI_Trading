import React from 'react';
import { AIActionProposal, AISafetyValidation } from '../types';
import { money } from '../domain/portfolio';
import { AlertTriangle, CheckCircle, Shield, X, ArrowRight, Info, Scale, ShieldAlert } from 'lucide-react';
import { LatexRenderer } from './LatexRenderer';

interface Props {
  proposal: AIActionProposal;
  validation: AISafetyValidation;
  onConfirm: () => void;
  onReject: () => void;
}

export const AISafetyModal: React.FC<Props> = ({
  proposal,
  validation,
  onConfirm,
  onReject,
}) => {
  const isOrder = proposal.type === 'order';
  const isAlert = proposal.type === 'alert';
  const isRebalance = proposal.type === 'rebalance';
  const isDefend = proposal.type === 'emergency_defend';
  const isStrategy = proposal.type === 'deploy_strategy';
  const isStress = proposal.type === 'stress_test';
  const isDca = proposal.type === 'smart_dca';
  const isCompare = proposal.type === 'token_compare';
  const preview = validation.preview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="liquid-glass border border-white/90 rounded-[28px] shadow-[0_24px_64px_rgba(0,0,0,0.12)] max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] text-zinc-900">
        {/* Apple Minimalist Header */}
        <div className="px-6 py-4.5 border-b border-black/[0.04] bg-white/40 backdrop-blur-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-950 text-white flex items-center justify-center shadow-xs">
              {isDefend ? (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              ) : isRebalance ? (
                <Scale className="w-4 h-4 text-blue-400" />
              ) : (
                <Shield className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-900 text-sm tracking-tight">
                  {isDefend
                    ? 'Sentinel Capital Defense Protocol'
                    : isStrategy
                    ? 'Algorithmic Strategy Deployment Gate'
                    : isStress
                    ? 'Portfolio Stress-Test Verification'
                    : isDca
                    ? 'Smart DCA Plan Deployment Gate'
                    : 'Nexus Security Authorization'}
                </h3>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/[0.03] text-zinc-600 border border-black/[0.04]">
                  {isDefend ? 'Hazard Alert' : 'Verification Required'}
                </span>
              </div>
              <p className="text-[11.5px] text-zinc-400 tracking-tight">
                Independent risk boundary validation before execution.
              </p>
            </div>
          </div>
          <button
            onClick={onReject}
            className="w-8 h-8 rounded-full bg-black/[0.03] hover:bg-black/[0.07] text-zinc-400 hover:text-zinc-800 flex items-center justify-center transition-all active:scale-95"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-sm">
          {/* Proposal Summary Card */}
          <div className="p-4.5 rounded-2xl bg-white/70 border border-black/[0.04] space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Action:</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-black/[0.04] text-zinc-800 border border-black/[0.04]">
                  {isDefend
                    ? `Emergency Capital Defense (${proposal.dangerLevel || 'CRITICAL'})`
                    : isRebalance
                    ? 'Autonomous Portfolio Rebalance'
                    : isStrategy
                    ? `Deploy Bot: ${proposal.strategyParams?.name || proposal.asset}`
                    : isStress
                    ? `Simulate Shock: ${proposal.stressTest?.title || 'Market Crash'}`
                    : isDca
                    ? `Deploy Smart DCA for ${proposal.asset}`
                    : isOrder
                    ? `${proposal.side} ${proposal.amount} ${proposal.asset}`
                    : `Set Alert on ${proposal.asset}`}
                </span>
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                Confidence: <strong className="text-zinc-800 capitalize font-sans">{proposal.confidence}</strong>
              </span>
            </div>

            {proposal.hazardSource && (
              <div className="p-2.5 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                <span><strong>Hazard Identified:</strong> {proposal.hazardSource}</span>
              </div>
            )}

            <p className="text-xs text-zinc-600 leading-relaxed italic border-l-2 border-zinc-300 pl-3">
              "{proposal.rationale}"
            </p>

            {/* LaTeX Formula Display */}
            {proposal.formulaLatex && (
              <div className="p-3 rounded-xl bg-black/[0.02] border border-black/[0.04]">
                <span className="text-[9px] uppercase font-mono text-zinc-400 block mb-1">Mathematical Formulation:</span>
                <LatexRenderer content={`$$${proposal.formulaLatex}$$`} />
              </div>
            )}
          </div>

          {/* Rebalance / Emergency Defense Steps */}
          {(isRebalance || isDefend) && proposal.rebalanceSteps && proposal.rebalanceSteps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center justify-between">
                <span>Execution Sequence ({proposal.rebalanceSteps.length} Operations)</span>
                {proposal.cashTargetPct && (
                  <span className="text-emerald-700 font-mono text-[11px]">Target Cash Buffer: {proposal.cashTargetPct}%</span>
                )}
              </h4>
              <div className="divide-y divide-black/[0.04] rounded-2xl bg-white/70 border border-black/[0.04] overflow-hidden shadow-xs">
                {proposal.rebalanceSteps.map((step, sIdx) => (
                  <div key={sIdx} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-md uppercase ${
                          step.action === 'sell'
                            ? 'bg-rose-500/10 text-rose-700 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
                        }`}
                      >
                        {step.action}
                      </span>
                      <span className="font-semibold text-zinc-800">
                        {step.amount} {step.asset}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-zinc-900 font-mono">~{money(step.estimatedNotional)}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">@ {money(step.estimatedPrice)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strategy Deployment Preview */}
          {isStrategy && proposal.strategyParams && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Strategy Parameters &amp; ATR Risk Brackets
              </h4>
              <div className="grid grid-cols-2 gap-2.5 p-4 rounded-2xl bg-white/70 border border-black/[0.04] text-xs font-mono shadow-xs">
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Engine Architecture</span>
                  <span className="font-semibold text-zinc-900">{proposal.strategyParams.kind}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Max Portfolio Allocation</span>
                  <span className="font-semibold text-zinc-900">{((proposal.strategyParams.maxAllocation || 0.25) * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Target Take-Profit</span>
                  <span className="font-semibold text-emerald-700">+{proposal.strategyParams.targetProfitPct || 5}%</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Trailing Stop-Loss</span>
                  <span className="font-semibold text-rose-700">-{proposal.strategyParams.trailingStopPct || 2}%</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-black/[0.04] text-zinc-500 text-[11px] font-sans">
                  Evaluation Loop: Evaluated autonomously on 2.5-second live ticker intervals.
                </div>
              </div>
            </div>
          )}

          {/* Stress Test Preview */}
          {isStress && proposal.stressTest && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Simulated Drawdown &amp; Capital Cushion
              </h4>
              <div className="grid grid-cols-2 gap-2.5 p-4 rounded-2xl bg-white/70 border border-black/[0.04] text-xs font-mono shadow-xs">
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Projected Portfolio Loss</span>
                  <span className="font-semibold text-rose-700">-${proposal.stressTest.simulatedLossUsd.toLocaleString()} (-{proposal.stressTest.simulatedDrawdownPct}%)</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Survivability Rating</span>
                  <span className="font-semibold text-amber-700">{proposal.stressTest.survivabilityRating} ({proposal.stressTest.survivabilityScore}/100)</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-black/[0.04] text-zinc-500 text-[11px] font-sans">
                  {proposal.stressTest.description}
                </div>
              </div>
            </div>
          )}

          {/* Smart DCA Preview */}
          {isDca && proposal.dcaPlan && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Value-Weighted DCA Schedule
              </h4>
              <div className="grid grid-cols-2 gap-2.5 p-4 rounded-2xl bg-white/70 border border-black/[0.04] text-xs font-mono shadow-xs">
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Base Allocation</span>
                  <span className="font-semibold text-emerald-800">${proposal.dcaPlan.baseAmountUsd}/{proposal.dcaPlan.frequency}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[9px] uppercase font-medium">Dip Multiplier</span>
                  <span className="font-semibold text-zinc-900">{proposal.dcaPlan.oversoldMultiplier}x on RSI &lt; 35</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-black/[0.04] text-zinc-500 text-[11px] font-sans">
                  Peak Protection: Automatically pauses accumulation when RSI &gt; {proposal.dcaPlan.pauseThresholdRsi} to prevent buying cycle tops.
                </div>
              </div>
            </div>
          )}

          {/* Validation Result Messages */}
          {validation.errors.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-500/[0.06] border border-rose-500/20 space-y-2 text-rose-800">
              <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Safety Gate Violations (Execution Blocked)</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 space-y-2 text-amber-800">
              <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider">
                <Info className="w-4 h-4 text-amber-600" />
                <span>Risk Warnings</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                {validation.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Execution Simulation Preview */}
          {preview && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Execution Preview
              </h4>
              <div className="grid grid-cols-2 gap-2.5 p-4 rounded-2xl bg-white/70 border border-black/[0.04] text-xs font-mono shadow-xs">
                <div>
                  <span className="text-zinc-400 font-sans block text-[10px]">Est. Price:</span>
                  <p className="font-semibold text-zinc-900">{money(preview.estPrice)}</p>
                </div>
                <div>
                  <span className="text-zinc-400 font-sans block text-[10px]">Modeled Slippage:</span>
                  <p className="font-semibold text-zinc-800">{preview.slippage.toFixed(3)}%</p>
                </div>
                <div>
                  <span className="text-zinc-400 font-sans block text-[10px]">Estimated Fee (0.08%):</span>
                  <p className="font-semibold text-zinc-900">{money(preview.estFee)}</p>
                </div>
                <div>
                  <span className="text-zinc-400 font-sans block text-[10px]">Total Notional:</span>
                  <p className="font-semibold text-zinc-900">{money(preview.notional)}</p>
                </div>
                <div className="border-t border-black/[0.04] pt-2.5 col-span-2 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-400 font-sans block text-[10px]">Cash Impact:</span>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="text-zinc-600">{money(preview.currentCash)}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-400" />
                      <span className="font-semibold text-zinc-900">
                        {money(preview.resultingCash)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-400 font-sans block text-[10px]">Allocation:</span>
                    <p className="font-semibold text-zinc-900">{preview.allocationPct.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Apple Minimalist Footer Actions */}
        <div className="px-6 py-4 border-t border-black/[0.04] bg-white/40 backdrop-blur-xl flex items-center justify-end gap-2.5">
          <button
            onClick={onReject}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-black/[0.04] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!validation.valid}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all text-white bg-zinc-950 hover:bg-black active:scale-[0.98] shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {isDefend
                ? 'Authorize Defense Protocol'
                : isStrategy
                ? 'Deploy Strategy Bot'
                : isDca
                ? 'Deploy Smart DCA'
                : isStress
                ? 'Confirm Audit'
                : isRebalance
                ? 'Authorize Rebalance'
                : 'Authorize & Execute'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
