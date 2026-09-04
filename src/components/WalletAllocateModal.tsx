import React, { useState } from 'react';
import { useLumen } from '../store';
import {
  ArrowLeftRight,
  X,
  Wallet,
  Cpu,
  CheckCircle2,
  AlertCircle,
  ArrowDown,
  Sparkles,
} from 'lucide-react';
import { formatCurrencyAmount } from '../domain/walletLedger';

interface WalletAllocateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'allocate' | 'recall';
}

export function WalletAllocateModal({
  isOpen,
  onClose,
  defaultMode = 'allocate',
}: WalletAllocateModalProps) {
  const {
    nativeWallet,
    state,
    allocateWalletToTrading,
    recallTradingToWallet,
  } = useLumen();

  const [mode, setMode] = useState<'allocate' | 'recall'>(defaultMode);
  const [amountUSD, setAmountUSD] = useState<string>('1000');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const numAmount = parseFloat(amountUSD) || 0;
  const maxAvailable =
    mode === 'allocate' ? nativeWallet.balanceUSD : state.cash;

  const handleQuickPercent = (pct: number) => {
    const val = (maxAvailable * (pct / 100)).toFixed(2);
    setAmountUSD(val);
    setErrorMessage('');
  };

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'allocate' ? 'recall' : 'allocate'));
    setAmountUSD('1000');
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (numAmount <= 0) {
      setErrorMessage('Please enter an amount greater than $0.');
      return;
    }

    if (numAmount > maxAvailable) {
      setErrorMessage(
        `Insufficient funds. Maximum available to ${mode} is $${maxAvailable.toFixed(2)}.`
      );
      return;
    }

    setIsProcessing(true);
    try {
      if (mode === 'allocate') {
        await allocateWalletToTrading(numAmount);
      } else {
        await recallTradingToWallet(numAmount);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Transfer failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] bg-white/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                {mode === 'allocate'
                  ? 'Deploy Funds to Trading'
                  : 'Recall Trading Profits'}
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                {mode === 'allocate'
                  ? 'Transfer capital into active trading cash'
                  : 'Safeguard trading cash back into sovereign wallet'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Transfer Visual Direction */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center text-indigo-600">
                  {mode === 'allocate' ? <Wallet className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-zinc-400">Source</div>
                  <div className="font-bold text-zinc-900">
                    {mode === 'allocate' ? 'Sovereign Wallet' : 'Trading Desk Cash'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-zinc-400">Available</div>
                <div className="font-bold text-zinc-900 font-mono">
                  ${maxAvailable.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleToggleMode}
                className="px-3 py-1 rounded-full bg-white hover:bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-700 shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                <span>Switch Direction</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-200/60">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center text-emerald-600">
                  {mode === 'allocate' ? <Cpu className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-zinc-400">Destination</div>
                  <div className="font-bold text-zinc-900">
                    {mode === 'allocate' ? 'Trading Desk Cash' : 'Sovereign Wallet'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-zinc-400">Current</div>
                <div className="font-bold text-zinc-900 font-mono">
                  ${(mode === 'allocate' ? state.cash : nativeWallet.balanceUSD).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-600">Transfer Amount (USD)</label>
              <button
                type="button"
                onClick={() => handleQuickPercent(100)}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                Max: ${maxAvailable.toFixed(2)}
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="1"
                max={maxAvailable}
                value={amountUSD}
                onChange={(e) => setAmountUSD(e.target.value)}
                placeholder="1000"
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-base font-bold outline-none pl-8"
              />
              <span className="absolute left-3 top-2.5 text-base font-bold text-zinc-400">
                $
              </span>
            </div>

            {/* Quick Percentage Pills */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleQuickPercent(pct)}
                  className="py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Impact Preview */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-zinc-600 space-y-1">
            <div className="flex justify-between">
              <span>Sovereign Wallet After:</span>
              <span className="font-mono font-bold text-zinc-900">
                $
                {(mode === 'allocate'
                  ? nativeWallet.balanceUSD - numAmount
                  : nativeWallet.balanceUSD + numAmount
                ).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Trading Desk Cash After:</span>
              <span className="font-mono font-bold text-zinc-900">
                $
                {(mode === 'allocate'
                  ? state.cash + numAmount
                  : state.cash - numAmount
                ).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isProcessing || numAmount <= 0 || numAmount > maxAvailable}
            className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Executing Transfer...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Confirm {mode === 'allocate' ? 'Allocation' : 'Recall'} of ${numAmount.toFixed(2)}
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
