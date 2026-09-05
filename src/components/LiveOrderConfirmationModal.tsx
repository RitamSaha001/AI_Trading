import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  X,
  CheckCircle2,
  Lock,
  ArrowRight,
  TrendingUp,
  Percent,
} from 'lucide-react';

export interface LiveOrderProposalData {
  confirmationId: string;
  broker: string;
  symbol: string;
  instrumentKey: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  type: string;
  quantity: number;
  price: number;
  triggerPrice?: number;
  product: string;
  validity: string;
  disclosedQuantity?: number;
  slice?: boolean;
  estimatedNotional: number;
  currency: string;
  riskSnapshot: {
    singleOrderPct: number;
    projectedConcentrationPct: number;
    accountEquity: number;
    availableCash: number;
  };
  expiresAt: number;
  ttlSeconds: number;
}

interface LiveOrderConfirmationModalProps {
  isOpen: boolean;
  proposal: LiveOrderProposalData | null;
  onConfirm: (proposal: LiveOrderProposalData) => Promise<void>;
  onClose: () => void;
}

export function LiveOrderConfirmationModal({
  isOpen,
  proposal,
  onConfirm,
  onClose,
}: LiveOrderConfirmationModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !proposal) return;

    const calculateRemaining = () => {
      const remaining = Math.max(0, Math.floor((proposal.expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      return remaining;
    };

    calculateRemaining();
    const interval = setInterval(() => {
      const rem = calculateRemaining();
      if (rem <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, proposal]);

  if (!isOpen || !proposal) return null;

  const isExpired = secondsRemaining <= 0;
  const isBuy = proposal.side === 'BUY';
  const progressPercent = Math.min(100, Math.max(0, (secondsRemaining / (proposal.ttlSeconds || 60)) * 100));

  const handleConfirm = async () => {
    if (isExpired || isConfirming) return;
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm(proposal);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Live order execution failed');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Top High-Visibility Emergency Header */}
        <div className="bg-gradient-to-r from-amber-600/90 via-amber-500/90 to-red-600/90 px-6 py-4 flex items-center justify-between text-slate-950 font-bold">
          <div className="flex items-center space-x-3">
            <ShieldAlert className="w-7 h-7 animate-pulse text-slate-950" />
            <div>
              <h2 className="text-lg font-black tracking-wide uppercase">Live Upstox Order Authorization</h2>
              <p className="text-xs text-slate-900/90 font-semibold">Two-Step Server Verification Required</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="p-1 rounded-lg hover:bg-black/10 transition-colors text-slate-950"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* TTL Countdown Bar */}
        <div className="bg-slate-950 px-6 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-mono">
            <Clock className={`w-4 h-4 ${isExpired ? 'text-red-400' : 'text-amber-400'}`} />
            <span className={isExpired ? 'text-red-400 font-bold' : 'text-slate-300'}>
              {isExpired ? 'Proposal EXPIRED — Re-submit Required' : `Authorization expires in: ${secondsRemaining}s`}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">{proposal.confirmationId.slice(0, 16)}...</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              isExpired
                ? 'bg-red-500'
                : secondsRemaining < 15
                ? 'bg-red-500 animate-pulse'
                : 'bg-gradient-to-r from-amber-400 to-amber-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Warning Banner */}
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-start space-x-3 text-amber-200 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-300">REAL MONEY EXECUTION NOTICE</p>
            <p className="mt-0.5 text-slate-300">
              This action will dispatch an authoritative order to your connected Upstox broker account. Funds will be
              debited from your trading ledger. Review all parameters carefully.
            </p>
          </div>
        </div>

        {/* Order Breakdown Grid */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
            <div>
              <span className="text-xs text-slate-400 uppercase font-mono">Instrument</span>
              <div className="text-base font-bold text-white flex items-center space-x-1.5 mt-0.5">
                <span>{proposal.symbol}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {proposal.exchange}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{proposal.instrumentKey}</p>
            </div>

            <div>
              <span className="text-xs text-slate-400 uppercase font-mono">Side & Action</span>
              <div className="mt-0.5">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black tracking-wide ${
                    isBuy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {proposal.side}
                </span>
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 uppercase font-mono">Product Type</span>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">
                {proposal.product === 'D' || proposal.product === 'CNC' ? 'Cash Delivery (CNC)' : proposal.product}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 uppercase font-mono">Order Type</span>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">
                {proposal.type} {proposal.validity ? `(${proposal.validity})` : ''}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 uppercase font-mono">Quantity</span>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {proposal.quantity} shares
                {proposal.slice && (
                  <span className="ml-1.5 text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Auto-Sliced</span>
                )}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 uppercase font-mono">Order Price</span>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                ₹{proposal.price.toFixed(2)}
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-semibold uppercase">Estimated Notional</span>
              <span className="text-lg font-black text-amber-400 font-mono">
                ₹{proposal.estimatedNotional.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Risk Impact Snapshot */}
          <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center space-x-1">
                <Percent className="w-3.5 h-3.5 text-slate-400" />
                <span>Single Order Exposure</span>
              </span>
              <span className="font-mono text-slate-200">
                {(proposal.riskSnapshot.singleOrderPct * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center space-x-1">
                <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                <span>Projected Concentration</span>
              </span>
              <span className="font-mono text-slate-200">
                {(proposal.riskSnapshot.projectedConcentrationPct * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Cancel Proposal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isExpired || isConfirming}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm text-slate-950 flex items-center space-x-2 shadow-lg transition-all ${
              isExpired
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : isBuy
                ? 'bg-emerald-400 hover:bg-emerald-300 shadow-emerald-500/20'
                : 'bg-amber-400 hover:bg-amber-300 shadow-amber-500/20'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>{isConfirming ? 'Authorizing...' : 'CONFIRM LIVE ORDER'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
