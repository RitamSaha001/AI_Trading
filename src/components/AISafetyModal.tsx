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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isDefend
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : isStress
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : isStrategy
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                  : isDca
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
              }`}
            >
              {isDefend ? <AlertTriangle className="w-5 h-5" /> : isRebalance ? <Scale className="w-5 h-5 text-indigo-400" /> : <Shield className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-base">
                  {isDefend
                    ? 'Sentinel Capital Defense Protocol'
                    : isStrategy
                    ? 'Algorithmic Strategy Deployment Gate'
                    : isStress
                    ? 'Portfolio Stress-Test Verification'
                    : isDca
                    ? 'Smart DCA Plan Deployment Gate'
                    : 'AI Safety Authorization Gate'}
                </h3>
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${
                    isDefend
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  }`}
                >
                  {isDefend ? 'High Priority' : 'Verification Required'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Independent risk validation required before executing any paper actions.
              </p>
            </div>
          </div>
          <button
            onClick={onReject}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Proposal Summary Card */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">AI Proposed Action:</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                    isDefend
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : isRebalance
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : isStrategy
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : isStress
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : isDca
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : proposal.side === 'buy'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : proposal.side === 'sell'
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
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
              <span className="text-xs text-slate-400">
                Confidence: <strong className="text-slate-200 capitalize">{proposal.confidence}</strong>
              </span>
            </div>

            {proposal.hazardSource && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span><strong>Hazard Identified:</strong> {proposal.hazardSource}</span>
              </div>
            )}

            <p className="text-xs text-slate-300 leading-relaxed italic border-l-2 border-slate-600 pl-3">
              "{proposal.rationale}"
            </p>

            {/* LaTeX Formula Display */}
            {proposal.formulaLatex && (
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/50">
                <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Mathematical Formulation:</span>
                <LatexRenderer content={`$$${proposal.formulaLatex}$$`} />
              </div>
            )}
          </div>

          {/* Rebalance / Emergency Defense Steps */}
          {(isRebalance || isDefend) && proposal.rebalanceSteps && proposal.rebalanceSteps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Execution Steps ({proposal.rebalanceSteps.length} Operations)</span>
                {proposal.cashTargetPct && (
                  <span className="text-emerald-400 lowercase font-mono">Target Cash: {proposal.cashTargetPct}%</span>
                )}
              </h4>
              <div className="divide-y divide-slate-800 rounded-xl bg-slate-800/40 border border-slate-700/40 overflow-hidden">
                {proposal.rebalanceSteps.map((step, sIdx) => (
                  <div key={sIdx} className="p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded uppercase ${
                          step.action === 'sell'
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {step.action}
                      </span>
                      <span className="font-semibold text-slate-200">
                        {step.amount} {step.asset}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-100">~{money(step.estimatedNotional)}</div>
                      <div className="text-[10px] text-slate-400">@ {money(step.estimatedPrice)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strategy Deployment Preview */}
          {isStrategy && proposal.strategyParams && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Strategy Parameters &amp; ATR Risk Controls
              </h4>
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Engine Kind</span>
                  <span className="font-semibold text-slate-100">{proposal.strategyParams.kind}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Max Portfolio Allocation</span>
                  <span className="font-semibold text-indigo-400">{((proposal.strategyParams.maxAllocation || 0.25) * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Target Take-Profit</span>
                  <span className="font-semibold text-emerald-400">+{proposal.strategyParams.targetProfitPct || 5}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Trailing Stop-Loss</span>
                  <span className="font-semibold text-rose-400">-{proposal.strategyParams.trailingStopPct || 2}%</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-700/60 text-slate-400 text-[11px]">
                  Execution Loop: Continuously evaluated on 2.5-second live ticker intervals.
                </div>
              </div>
            </div>
          )}

          {/* Stress Test Preview */}
          {isStress && proposal.stressTest && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Simulated Drawdown &amp; Capital Cushion
              </h4>
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Projected Portfolio Loss</span>
                  <span className="font-bold text-rose-400">-${proposal.stressTest.simulatedLossUsd.toLocaleString()} (-{proposal.stressTest.simulatedDrawdownPct}%)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Survivability Rating</span>
                  <span className="font-bold text-amber-400">{proposal.stressTest.survivabilityRating} ({proposal.stressTest.survivabilityScore}/100)</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-700/60 text-slate-300 text-[11px]">
                  {proposal.stressTest.description}
                </div>
              </div>
            </div>
          )}

          {/* Smart DCA Preview */}
          {isDca && proposal.dcaPlan && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Value-Weighted DCA Schedule
              </h4>
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Base Allocation</span>
                  <span className="font-semibold text-emerald-400">${proposal.dcaPlan.baseAmountUsd}/{proposal.dcaPlan.frequency}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Dip Multiplier</span>
                  <span className="font-semibold text-indigo-400">{proposal.dcaPlan.oversoldMultiplier}x (when RSI &lt; 35)</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-700/60 text-slate-300 text-[11px]">
                  Peak Protection: Automatically suspends buys when RSI &gt; {proposal.dcaPlan.pauseThresholdRsi} to prevent buying cycle tops.
                </div>
              </div>
            </div>
          )}

          {/* Validation Result Messages */}
          {validation.errors.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Safety Gate Violations (Execution Blocked)</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-rose-300">
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                <Info className="w-4 h-4" />
                <span>Risk Warnings</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-300">
                {validation.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Execution Simulation Preview */}
          {preview && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Transparent Execution Preview
              </h4>
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs">
                <div>
                  <span className="text-slate-400">Est. Execution Price:</span>
                  <p className="font-semibold text-slate-100">{money(preview.estPrice)}</p>
                </div>
                <div>
                  <span className="text-slate-400">Modeled Slippage:</span>
                  <p className="font-semibold text-amber-300">{preview.slippage.toFixed(3)}%</p>
                </div>
                <div>
                  <span className="text-slate-400">Estimated Fee (0.08%):</span>
                  <p className="font-semibold text-slate-100">{money(preview.estFee)}</p>
                </div>
                <div>
                  <span className="text-slate-400">Total Notional:</span>
                  <p className="font-semibold text-slate-100">{money(preview.notional)}</p>
                </div>
                <div className="border-t border-slate-700/60 pt-2 col-span-2 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400">Cash Impact:</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-300">{money(preview.currentCash)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className={preview.side === 'buy' ? 'text-amber-300' : 'text-emerald-300'}>
                        {money(preview.resultingCash)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Resulting Allocation:</span>
                    <p className="font-semibold text-slate-200">{preview.allocationPct.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-end gap-3">
          <button
            onClick={onReject}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 transition-colors"
          >
            Reject Proposal
          </button>
          <button
            onClick={onConfirm}
            disabled={!validation.valid}
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              validation.valid
                ? isDefend
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>
              {isDefend
                ? 'Authorize Emergency Defense'
                : isStrategy
                ? 'Authorize & Deploy Strategy Bot'
                : isDca
                ? 'Authorize & Deploy Smart DCA'
                : isStress
                ? 'Acknowledge Stress Test'
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
