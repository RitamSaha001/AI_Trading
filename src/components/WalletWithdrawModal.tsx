import React, { useState } from 'react';
import { useLumen } from '../store';
import {
  ArrowUpFromLine,
  X,
  CreditCard,
  Smartphone,
  Building2,
  Lock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { WalletCurrency, PaymentMethodType } from '../types';
import { PAPER_SIMULATION_FX_RATES_TO_USD, convertCurrency } from '../domain/wallet';
import { validateUPIVpa } from '../services/paymentGateway';

interface WalletWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletWithdrawModal({ isOpen, onClose }: WalletWithdrawModalProps) {
  const { nativeWallet, withdrawFromWallet } = useLumen();

  const [method, setMethod] = useState<PaymentMethodType>('upi');
  const [currency, setCurrency] = useState<WalletCurrency>('USD');
  const [amount, setAmount] = useState<string>('250');
  const [destination, setDestination] = useState('trader@okhdfcbank');
  const [enteredPin, setEnteredPin] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const amountUSD = currency === 'USD' ? numAmount : numAmount * PAPER_SIMULATION_FX_RATES_TO_USD[currency];
  const maxAvailableUSD = nativeWallet.balanceUSD;
  const maxAvailableInSelected = convertCurrency(maxAvailableUSD, 'USD', currency);

  const handleQuickPercent = (pct: number) => {
    const val = (maxAvailableInSelected * (pct / 100)).toFixed(2);
    setAmount(val);
    setErrorMessage('');
  };

  const handleSelectSavedMethod = (type: PaymentMethodType, dest: string) => {
    setMethod(type);
    setDestination(dest);
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (numAmount <= 0) {
      setErrorMessage('Please enter an amount greater than 0.');
      return;
    }

    if (amountUSD > maxAvailableUSD) {
      setErrorMessage(
        `Insufficient sovereign balance. Available: $${maxAvailableUSD.toFixed(2)} USD.`
      );
      return;
    }

    if (method === 'upi' && !validateUPIVpa(destination)) {
      setErrorMessage('Please enter a valid UPI VPA address (e.g. user@okhdfcbank).');
      return;
    }

    if (method === 'card' && destination.replace(/\D/g, '').length < 4) {
      setErrorMessage('Please enter valid card digits.');
      return;
    }

    if (nativeWallet.security.pinConfigured && !enteredPin) {
      setErrorMessage('Please enter your Security PIN to authorize withdrawal.');
      return;
    }

    setIsProcessing(true);
    try {
      await withdrawFromWallet(
        numAmount,
        currency,
        method,
        {
          upiVpa: method === 'upi' ? destination : undefined,
          cardLast4: method === 'card' ? destination.slice(-4) : undefined,
          referenceNumber: `WTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        },
        enteredPin
      );

      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Withdrawal failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setErrorMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] bg-white/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
              <ArrowUpFromLine className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                Withdraw Capital
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                Transfer funds back to your Card, UPI, or Bank
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Method Selector */}
              <div className="grid grid-cols-3 p-1 bg-zinc-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMethod('upi');
                    setDestination('trader@okhdfcbank');
                    setCurrency('INR');
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    method === 'upi'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>UPI</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMethod('card');
                    setDestination('•••• 4242');
                    setCurrency('USD');
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    method === 'card'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMethod('bank_transfer');
                    setDestination('HDFC Bank •••• 9812');
                    setCurrency('USD');
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    method === 'bank_transfer'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Bank Wire</span>
                </button>
              </div>

              {/* Saved Methods Quick Select */}
              {nativeWallet.savedPaymentMethods.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-zinc-400">Use Saved Method:</span>
                  <div className="flex flex-wrap gap-2">
                    {nativeWallet.savedPaymentMethods.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          handleSelectSavedMethod(m.type, m.vpa || m.last4 || m.label)
                        }
                        className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold transition-colors flex items-center gap-1"
                      >
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Amount & Currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-zinc-600">Amount</label>
                    <button
                      type="button"
                      onClick={() => handleQuickPercent(100)}
                      className="text-[11px] font-bold text-indigo-600 hover:underline"
                    >
                      Max: {maxAvailableInSelected.toFixed(2)}
                    </button>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="250"
                    className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-base font-bold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as WalletCurrency)}
                    className="w-full px-2.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs font-bold outline-none bg-white"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              {/* Destination Input */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">
                  {method === 'upi'
                    ? 'Destination UPI ID'
                    : method === 'card'
                    ? 'Card Details / Number'
                    : 'Bank Account / IBAN'}
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={
                    method === 'upi' ? 'trader@okhdfcbank' : 'Enter recipient details'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold outline-none"
                />
              </div>

              {/* Security PIN verification if enabled */}
              {nativeWallet.security.pinConfigured && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Security PIN</span>
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={enteredPin}
                    onChange={(e) => setEnteredPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 text-center font-mono text-lg tracking-widest outline-none"
                  />
                </div>
              )}

              {/* Daily Limit Notice */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Daily Withdrawal Limit:</span>
                <span className="font-semibold text-zinc-700">
                  ${nativeWallet.security.dailyWithdrawLimitUSD.toLocaleString()} USD
                </span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isProcessing || numAmount <= 0}
                className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Transfer...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpFromLine className="w-4 h-4" />
                    <span>Authorize Withdrawal</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-lg shadow-emerald-600/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900">Withdrawal Dispatched!</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Sent {numAmount.toFixed(2)} {currency} (${amountUSD.toFixed(2)} USD) to{' '}
                  <strong className="text-zinc-800">{destination}</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-md transition-all"
              >
                Done & View History
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
