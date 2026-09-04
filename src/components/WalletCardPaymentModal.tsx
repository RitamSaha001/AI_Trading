import React, { useState } from 'react';
import { useLumen } from '../store';
import {
  CreditCard,
  X,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import {
  validateCardLuhn,
  detectCardBrand,
  formatCardNumberSpacing,
  tokenizeCardLocally,
  ZeroCostSandboxGateway,
  CardPaymentSession,
} from '../services/paymentGateway';
import { WalletCurrency } from '../types';
import { FX_RATES_TO_USD } from '../domain/wallet';

interface WalletCardPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletCardPaymentModal({ isOpen, onClose }: WalletCardPaymentModalProps) {
  const { depositToWallet, savePaymentMethod, accountMode } = useLumen();

  const [step, setStep] = useState<'details' | '3ds' | 'success'>('details');
  const [currency, setCurrency] = useState<WalletCurrency>('USD');
  const [amount, setAmount] = useState<string>('500');
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('Alice Quant');
  const [expMonth, setExpMonth] = useState('12');
  const [expYear, setExpYear] = useState('28');
  const [cvv, setCvv] = useState('888');
  const [saveCard, setSaveCard] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 3DS Challenge State
  const [session3DS, setSession3DS] = useState<CardPaymentSession | null>(null);
  const [enteredOtp, setEnteredOtp] = useState('123456');

  if (!isOpen) return null;

  const cleanPan = cardNumber.replace(/\D/g, '');
  const brand = detectCardBrand(cleanPan);
  const isLuhnValid = cleanPan.length >= 13 && validateCardLuhn(cleanPan);
  const numericAmount = parseFloat(amount) || 0;
  const amountUSD = currency === 'USD' ? numericAmount : numericAmount * FX_RATES_TO_USD[currency];

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumberSpacing(e.target.value);
    setCardNumber(formatted);
    setErrorMessage('');
  };

  const handleFillDemoCard = (type: 'visa' | 'mastercard' | 'rupay') => {
    if (type === 'visa') {
      setCardNumber('4532 0151 1283 0366');
    } else if (type === 'mastercard') {
      setCardNumber('5425 2334 3010 9903');
    } else {
      setCardNumber('6069 8123 4567 8901');
    }
    setCardholderName('Alice Quant');
    setExpMonth('12');
    setExpYear('28');
    setCvv('789');
    setErrorMessage('');
  };

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (numericAmount <= 0) {
      setErrorMessage('Please enter a valid deposit amount greater than 0.');
      return;
    }

    if (!isLuhnValid) {
      setErrorMessage('Please enter a valid card number that passes Luhn checksum verification.');
      return;
    }

    if (cvv.length < 3) {
      setErrorMessage('Please enter a valid 3 or 4-digit CVV security code.');
      return;
    }

    setIsProcessing(true);
    try {
      const session = await ZeroCostSandboxGateway.initiateCardPayment({
        cardNumber,
        expMonth,
        expYear,
        cvv,
        cardholderName,
        amount: numericAmount,
        currency,
      });

      setSession3DS(session);
      setEnteredOtp(session.simulatedOtp);
      setStep('3ds');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Payment initiation failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerify3DS = async () => {
    if (!session3DS) return;
    setIsProcessing(true);
    setErrorMessage('');

    try {
      await ZeroCostSandboxGateway.verifyCard3DS(session3DS, enteredOtp);

      // Execute deposit in sovereign wallet
      await depositToWallet(
        numericAmount,
        currency,
        'card',
        {
          cardBrand: session3DS.cardBrand,
          cardLast4: session3DS.cardLast4,
          referenceNumber: `CARD-${session3DS.sessionId.slice(-6).toUpperCase()}`,
        },
        `Deposit via ${session3DS.cardBrand.toUpperCase()} (•••• ${session3DS.cardLast4})`
      );

      // Save tokenized card if enabled
      if (saveCard) {
        const tokenized = tokenizeCardLocally(cardNumber, expMonth, expYear, cardholderName);
        savePaymentMethod(tokenized);
      }

      setStep('success');
    } catch (err: any) {
      setErrorMessage(err?.message || '3DS Verification failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAndClose = () => {
    setStep('details');
    setErrorMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] bg-white/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                Deposit via Card
                <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${
                  accountMode === 'paper'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {accountMode === 'paper' ? 'Simulated Sandbox' : 'Live Capital Gate'}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                Credit & Debit Cards (Visa, Mastercard, RuPay, Amex)
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
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {step === 'details' && (
            <form onSubmit={handleSubmitDetails} className="space-y-4">
              {/* Card Visualizer */}
              <div className="relative p-5 rounded-2xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl overflow-hidden border border-white/10">
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-7 rounded-md bg-amber-300/80 border border-amber-200 flex items-center justify-center shadow-inner">
                    <div className="w-6 h-4 border border-amber-600/40 rounded-sm grid grid-cols-2" />
                  </div>
                  <span className="text-xs font-black tracking-widest uppercase text-white/80 bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                    {brand !== 'unknown' ? brand : 'CARD'}
                  </span>
                </div>

                <div className="font-mono text-lg sm:text-xl tracking-wider font-semibold text-white/90 mb-4 drop-shadow-sm">
                  {cardNumber || '•••• •••• •••• ••••'}
                </div>

                <div className="flex items-end justify-between text-xs text-white/70">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-white/50">Cardholder</div>
                    <div className="font-semibold text-white/90 truncate max-w-[160px]">
                      {cardholderName || 'YOUR NAME'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-white/50">Expires</div>
                    <div className="font-semibold text-white/90 font-mono">
                      {expMonth}/{expYear}
                    </div>
                  </div>
                </div>
              </div>

              {/* Demo Fill Shortcuts (Paper Mode Only) or PCI-DSS Compliance Badge */}
              {accountMode === 'paper' ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 font-medium text-[11px]">Fill Test Card:</span>
                  <button
                    type="button"
                    onClick={() => handleFillDemoCard('visa')}
                    className="px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-[11px] transition-colors"
                  >
                    Visa
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDemoCard('mastercard')}
                    className="px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-[11px] transition-colors"
                  >
                    Mastercard
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillDemoCard('rupay')}
                    className="px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-[11px] transition-colors"
                  >
                    RuPay
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 border border-zinc-200/70 text-[11px] text-zinc-600">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    <strong>PCI-DSS Certified:</strong> Client-side cryptographic tokenization ensures credentials are never stored unencrypted.
                  </span>
                </div>
              )}

              {/* Amount & Currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Deposit Amount</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="500"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold outline-none transition-all"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-zinc-400">
                      {currency}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as WalletCurrency)}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold outline-none bg-white transition-all"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              {currency !== 'USD' && (
                <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60 text-xs text-zinc-600 flex items-center justify-between">
                  <span>Standardized Wallet Credit:</span>
                  <span className="font-bold text-zinc-900">${amountUSD.toFixed(2)} USD</span>
                </div>
              )}

              {/* Card Inputs */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Card Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={23}
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      placeholder="4532 0151 1283 0366"
                      className={`w-full px-3.5 py-2.5 rounded-xl border font-mono text-sm font-semibold outline-none transition-all ${
                        cardNumber && !isLuhnValid
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                          : 'border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                      }`}
                    />
                    {isLuhnValid && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-3" />
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-600">Cardholder Name</label>
                  <input
                    type="text"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="Alice Quant"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Exp Month</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={expMonth}
                      onChange={(e) => setExpMonth(e.target.value)}
                      placeholder="12"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono text-center outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">Exp Year</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={expYear}
                      onChange={(e) => setExpYear(e.target.value)}
                      placeholder="28"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono text-center outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-600">CVV</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                      placeholder="•••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono text-center outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Privacy & Tokenization Guarantee */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[11px]">
                  Zero Raw Card Storage: Card credentials are tokenized client-side using Web Crypto AES-GCM-256.
                </span>
              </div>

              {/* Save Card Toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-zinc-700">
                  Save card safely in local encrypted device vault
                </span>
              </label>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Connecting Gateway...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Proceed to 3DS Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {step === '3ds' && session3DS && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-white text-indigo-600 mx-auto flex items-center justify-center shadow-sm">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-zinc-900 text-base">3D-Secure Bank Verification</h3>
                <p className="text-xs text-zinc-600 max-w-sm mx-auto">
                  A simulated OTP was dispatched for card ending in{' '}
                  <strong className="text-zinc-900">{session3DS.cardLast4}</strong> for{' '}
                  <strong className="text-zinc-900">
                    {session3DS.amount} {session3DS.currency}
                  </strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs flex items-center justify-between">
                <span>Simulated Sandbox Test OTP:</span>
                <span className="font-mono font-bold text-amber-900 bg-white/80 px-2 py-0.5 rounded border border-amber-200">
                  123456
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-700">Enter 6-digit OTP Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={enteredOtp}
                  onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-center font-mono text-xl font-bold tracking-widest outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="w-1/3 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleVerify3DS}
                  disabled={isProcessing || enteredOtp.length < 6}
                  className="w-2/3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Authorize Payment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-lg shadow-emerald-600/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900">Deposit Completed!</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Successfully credited {numericAmount.toFixed(2)} {currency} ($
                  {amountUSD.toFixed(2)} USD) to your Sovereign Wallet.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-600 text-left space-y-1">
                <div className="flex justify-between">
                  <span>Method:</span>
                  <span className="font-semibold text-zinc-900">Card ({brand.toUpperCase()})</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-emerald-600">Settled (Instant)</span>
                </div>
                <div className="flex justify-between">
                  <span>Audit Receipt:</span>
                  <span className="font-mono text-zinc-500">SHA-256 Verified</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-md transition-all"
              >
                Done & Return to Wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
