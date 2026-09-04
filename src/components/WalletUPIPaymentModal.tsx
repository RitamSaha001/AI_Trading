import React, { useState, useEffect } from 'react';
import { useLumen } from '../store';
import {
  QrCode,
  X,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Smartphone,
  AlertCircle,
  ExternalLink,
  Clock,
  ArrowRight,
} from 'lucide-react';
import {
  validateUPIVpa,
  buildUPIUrl,
  generateUPIQRCodeSvg,
  ZeroCostSandboxGateway,
} from '../services/paymentGateway';
import { convertCurrency } from '../domain/wallet';

interface WalletUPIPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletUPIPaymentModal({ isOpen, onClose }: WalletUPIPaymentModalProps) {
  const { depositToWallet, savePaymentMethod } = useLumen();

  const [activeTab, setActiveTab] = useState<'qr' | 'vpa'>('qr');
  const [amountINR, setAmountINR] = useState<string>('5000');
  const [vpa, setVpa] = useState('trader@okhdfcbank');
  const [saveVpa, setSaveVpa] = useState(true);
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(300); // 5 minutes
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const numericAmountINR = parseFloat(amountINR) || 0;
  const equivalentUSD = convertCurrency(numericAmountINR, 'INR', 'USD');

  // Countdown timer
  useEffect(() => {
    if (!isOpen || isSuccess) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isSuccess]);

  if (!isOpen) return null;

  const upiUri = buildUPIUrl({
    payeeVpa: 'lumen.desk@okhdfcbank',
    payeeName: 'Lumen Sovereign Treasury',
    amountINR: numericAmountINR,
    transactionNote: 'Lumen Wallet Deposit',
    transactionRefId: `UPI-${Date.now().toString().slice(-6)}`,
  });

  const qrSvg = generateUPIQRCodeSvg(upiUri);

  const handleCopyUri = () => {
    navigator.clipboard.writeText(upiUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuickAmount = (amt: number) => {
    setAmountINR(amt.toString());
    setErrorMessage('');
  };

  const handleSimulatePayment = async (selectedApp?: string) => {
    if (numericAmountINR <= 0) {
      setErrorMessage('Please enter a valid deposit amount.');
      return;
    }

    if (activeTab === 'vpa' && !validateUPIVpa(vpa)) {
      setErrorMessage('Please enter a valid UPI ID (e.g. user@okhdfcbank).');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      if (activeTab === 'vpa') {
        await ZeroCostSandboxGateway.initiateUPICollect(vpa, numericAmountINR);
      }

      // Simulate network / app authorization time
      await new Promise((resolve) => setTimeout(resolve, 600));

      const paymentVpa = activeTab === 'vpa' ? vpa : 'user@upi';

      await depositToWallet(
        numericAmountINR,
        'INR',
        'upi',
        {
          upiVpa: paymentVpa,
          referenceNumber: `UPI-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        },
        `UPI Deposit of ₹${numericAmountINR.toLocaleString()} via ${selectedApp || 'NPCI UPI QR'}`
      );

      if (saveVpa && activeTab === 'vpa') {
        savePaymentMethod({
          id: `upi_${Date.now()}`,
          type: 'upi',
          label: `UPI: ${vpa}`,
          vpa,
          createdAt: Date.now(),
          isDefault: false,
        });
      }

      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Payment simulation failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setErrorMessage('');
    setSecondsRemaining(300);
    onClose();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] bg-white/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                Deposit via UPI
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Instant & Free
                </span>
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                Google Pay, PhonePe, Paytm, BHIM, Cred
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
            <>
              {/* Amount Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-600">Amount (INR ₹)</label>
                  <span className="text-xs font-semibold text-indigo-600">
                    ≈ ${equivalentUSD.toFixed(2)} USD
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={amountINR}
                    onChange={(e) => setAmountINR(e.target.value)}
                    placeholder="5000"
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-base font-bold text-zinc-900 outline-none transition-all pl-8"
                  />
                  <span className="absolute left-3.5 top-2.5 text-base font-bold text-zinc-400">
                    ₹
                  </span>
                </div>

                {/* Quick amount pills */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[1000, 5000, 10000, 25000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleQuickAmount(amt)}
                      className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        numericAmountINR === amt
                          ? 'bg-zinc-900 text-white shadow-sm'
                          : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      ₹{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Selector */}
              <div className="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('qr')}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'qr'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan Dynamic QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('vpa')}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'vpa'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Enter UPI ID</span>
                </button>
              </div>

              {/* QR Code Tab */}
              {activeTab === 'qr' && (
                <div className="space-y-4 text-center">
                  <div className="relative p-4 bg-white border border-zinc-200 rounded-2xl shadow-inner max-w-[220px] mx-auto">
                    <div
                      className="w-full aspect-square"
                      dangerouslySetInnerHTML={{ __html: qrSvg }}
                    />
                    <div className="mt-2 text-[11px] font-semibold text-zinc-500 flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Expires in {formatTimer(secondsRemaining)}</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500">
                    Scan with any UPI app on your phone (Google Pay, PhonePe, Paytm, Cred)
                  </p>

                  {/* 1-Click Payment Simulation Trigger */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Simulate 1-Click Pay via App:
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {['Google Pay', 'PhonePe', 'Paytm'].map((app) => (
                        <button
                          key={app}
                          type="button"
                          onClick={() => handleSimulatePayment(app)}
                          disabled={isProcessing}
                          className="py-2 px-2 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold text-xs shadow-sm transition-all disabled:opacity-50"
                        >
                          {app}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyUri}
                    className="w-full py-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Copied UPI Intent URI</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-zinc-400" />
                        <span>Copy NPCI UPI Intent Link</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* VPA Collect Request Tab */}
              {activeTab === 'vpa' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-600">Your UPI ID (VPA)</label>
                    <input
                      type="text"
                      value={vpa}
                      onChange={(e) => setVpa(e.target.value)}
                      placeholder="username@okhdfcbank"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold outline-none"
                    />
                    <div className="flex gap-2 text-[11px] text-zinc-400 pt-0.5">
                      <span>Examples:</span>
                      <button
                        type="button"
                        onClick={() => setVpa('trader@okhdfcbank')}
                        className="text-indigo-600 hover:underline"
                      >
                        @okhdfcbank
                      </button>
                      <button
                        type="button"
                        onClick={() => setVpa('quant@oksbi')}
                        className="text-indigo-600 hover:underline"
                      >
                        @oksbi
                      </button>
                      <button
                        type="button"
                        onClick={() => setVpa('alpha@paytm')}
                        className="text-indigo-600 hover:underline"
                      >
                        @paytm
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveVpa}
                      onChange={(e) => setSaveVpa(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="text-xs font-medium text-zinc-700">
                      Save UPI ID safely in local device vault
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSimulatePayment()}
                    disabled={isProcessing}
                    className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending UPI Collect Request...</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-4 h-4" />
                        <span>Send Collect Request & Authorize</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-lg shadow-emerald-600/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900">UPI Payment Received!</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Successfully credited ₹{numericAmountINR.toLocaleString()} INR ($
                  {equivalentUSD.toFixed(2)} USD) to your Sovereign Wallet.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-600 text-left space-y-1">
                <div className="flex justify-between">
                  <span>Channel:</span>
                  <span className="font-semibold text-zinc-900">UPI (Unified Payments Interface)</span>
                </div>
                <div className="flex justify-between">
                  <span>Settlement:</span>
                  <span className="font-semibold text-emerald-600">Immediate Real-Time</span>
                </div>
                <div className="flex justify-between">
                  <span>Cryptographic Proof:</span>
                  <span className="font-mono text-zinc-500">SHA-256 Ledger Verified</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-md transition-all"
              >
                Done & View Wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
