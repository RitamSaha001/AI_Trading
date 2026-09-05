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
  FileCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  validateUPIVpa,
  buildUPIUrl,
  generatePaperModeUPIQRCodeSvg,
  ZeroCostSandboxGateway,
} from '../services/paymentGateway';
import { ApiClient } from '../services/apiClient';
import {
  generateUPIAppIntents,
  validateIndianUTR,
  buildOnmetaWidgetUrl,
  buildTransakWidgetUrl,
  calculateCryptoFromINR,
} from '../services/fiatOnRamp';
import { convertCurrency } from '../domain/wallet';

interface WalletUPIPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletUPIPaymentModal({ isOpen, onClose }: WalletUPIPaymentModalProps) {
  const { depositToWallet, savePaymentMethod, web3Account, accountMode } = useLumen();

  const [activeTab, setActiveTab] = useState<'qr' | 'vpa' | 'utr' | 'onramp'>('qr');
  const [amountINR, setAmountINR] = useState<string>('5000');
  const [vpa, setVpa] = useState('trader@okhdfcbank');
  const [utrNumber, setUtrNumber] = useState('');
  const [saveVpa, setSaveVpa] = useState(true);
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(300); // 5 minutes
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const numericAmountINR = parseFloat(amountINR) || 0;
  const equivalentUSD = convertCurrency(numericAmountINR, 'INR', 'USD');
  const cryptoConversion = calculateCryptoFromINR(numericAmountINR);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || isSuccess) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isSuccess]);

  if (!isOpen) return null;

  const payeeVpa = 'lumen.desk@okhdfcbank';
  const payeeName = 'Lumen Sovereign Treasury';
  const transactionRefId = `UPI-${Date.now().toString().slice(-6)}`;

  const upiUri = buildUPIUrl({
    payeeVpa,
    payeeName,
    amountINR: numericAmountINR,
    transactionNote: 'Lumen Trading Deposit',
    transactionRefId,
  });

  const qrSvg = generatePaperModeUPIQRCodeSvg(upiUri);
  const appIntents = generateUPIAppIntents({
    payeeVpa,
    payeeName,
    amountINR: numericAmountINR,
    transactionNote: 'Lumen Trading Deposit',
    transactionRefId,
  });

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
      if (accountMode === 'exchange') {
        const intentRes = await ApiClient.createPaymentIntent({
          amountMinor: Math.round(numericAmountINR * 100),
          currency: 'INR',
          method: 'upi',
          idempotencyKey: crypto.randomUUID(),
        });

        if (!intentRes.ok) {
          throw new Error(intentRes.error || 'Failed to create payment intent');
        }

        if (intentRes.data?.intent?.checkoutUrl) {
          window.location.href = intentRes.data.intent.checkoutUrl;
          return;
        }

        if (intentRes.data?.intent?.upiIntentUri) {
          window.location.href = intentRes.data.intent.upiIntentUri;
          return;
        }
        
        setSuccessReceipt({
          channel: 'UPI Direct / Intent (Live Production)',
          ref: intentRes.data?.intent?.orderId || `UPI-${Date.now()}`,
          status: 'AWAITING_PROVIDER_SETTLEMENT',
          note: 'Payment order created. Complete payment in your banking app. Sovereign balance will be credited via provider webhook.',
        });
        setIsSuccess(true);
        return;
      }

      if (activeTab === 'vpa') {
        await ZeroCostSandboxGateway.initiateUPICollect(vpa, numericAmountINR);
      }

      await new Promise((resolve) => setTimeout(resolve, 600));

      const paymentVpa = activeTab === 'vpa' ? vpa : 'user@upi';
      const refNumber = `UPI-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      await depositToWallet(
        numericAmountINR,
        'INR',
        'upi',
        {
          upiVpa: paymentVpa,
          referenceNumber: refNumber,
        },
        `[PAPER] UPI Deposit of ₹${numericAmountINR.toLocaleString()} via ${selectedApp || 'NPCI UPI QR'}`
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

      setSuccessReceipt({
        channel: 'UPI Direct / Intent [PAPER / SIMULATION]',
        ref: refNumber,
        app: selectedApp || 'NPCI UPI QR',
      });
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Payment processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyUTR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utrNumber || !validateIndianUTR(utrNumber)) {
      setErrorMessage('Please enter a valid 12-digit numeric Indian UTR Number (e.g. 423589123456).');
      return;
    }
    if (numericAmountINR <= 0) {
      setErrorMessage('Please enter a valid deposit amount.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      if (accountMode === 'exchange') {
        // LIVE PRODUCTION MODE: Submit UTR to server for institutional compliance & settlement verification
        const res = await ApiClient.submitUTR({
          utr: utrNumber.trim(),
          amountINR: numericAmountINR,
        });

        if (!res.ok) {
          throw new Error(res.error || 'Failed to submit UTR for verification');
        }

        setSuccessReceipt({
          channel: 'Authoritative Bank UTR Verification',
          ref: utrNumber.trim(),
          status: 'PENDING_MANUAL_SETTLEMENT',
          note: 'Submitted to banking compliance desk. In strict accordance with institutional guidelines, wallet balance will be credited to your double-entry ledger only after bank statement confirmation.',
        });
        setIsSuccess(true);
        return;
      }

      // SIMULATION / PAPER MODE ONLY
      const verification = await ZeroCostSandboxGateway.verifyUPIUTR(utrNumber.trim(), numericAmountINR);

      await depositToWallet(
        numericAmountINR,
        'INR',
        'upi',
        {
          upiVpa: 'verified@utr',
          referenceNumber: utrNumber.trim(),
        },
        `[PAPER] Verified 12-Digit Indian UTR Deposit: ${utrNumber.trim()}`
      );

      setSuccessReceipt({
        channel: '12-Digit Indian UTR [PAPER / SIMULATION]',
        ref: utrNumber.trim(),
        sha256Proof: verification.settlementRef,
        settlement: 'Instant Simulation Match',
      });
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'UTR verification failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setSuccessReceipt(null);
    setErrorMessage('');
    setUtrNumber('');
    setSecondsRemaining(300);
    onClose();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const recipientEvmAddress = web3Account?.address || '0x71C...498B';
  const onmetaUrl = buildOnmetaWidgetUrl({
    walletAddress: recipientEvmAddress,
    fiatAmountINR: numericAmountINR,
    cryptoSymbol: 'USDC',
  });
  const transakUrl = buildTransakWidgetUrl({
    walletAddress: recipientEvmAddress,
    fiatAmount: numericAmountINR,
    cryptoCurrency: 'USDC',
  });

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
                Deposit via Indian UPI
                <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${
                  accountMode === 'paper' 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {accountMode === 'paper' ? '🧪 Sandbox Mode — Simulated UPI' : 'Live Mode'}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                GPay, PhonePe, Paytm, BHIM, CRED & 12-Digit UTR
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
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!isSuccess ? (
            <>
              {/* Amount Selection & Live Conversion */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-600">Amount (INR ₹)</label>
                  <span className="text-xs font-semibold text-indigo-600">
                    ≈ ${equivalentUSD.toFixed(2)} USD ({cryptoConversion.formattedCrypto})
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
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {[500, 1000, 5000, 10000, 25000].map((amt) => (
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
                      ₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4-Tab Selector */}
              <div className="grid grid-cols-4 p-1 bg-zinc-100 rounded-xl text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('qr');
                    setErrorMessage('');
                  }}
                  className={`py-2 rounded-lg transition-all text-center ${
                    activeTab === 'qr' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  QR / App
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('vpa');
                    setErrorMessage('');
                  }}
                  className={`py-2 rounded-lg transition-all text-center ${
                    activeTab === 'vpa' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Collect
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('utr');
                    setErrorMessage('');
                  }}
                  className={`py-2 rounded-lg transition-all text-center ${
                    activeTab === 'utr' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Enter UTR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('onramp');
                    setErrorMessage('');
                  }}
                  className={`py-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                    activeTab === 'onramp' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>Web3</span>
                </button>
              </div>

              {/* QR Code Tab */}
              {activeTab === 'qr' && (
                <div className="space-y-4 text-center">
                  {accountMode === 'paper' ? (
                    <>
                      <div className="relative p-4 bg-white border border-zinc-200 rounded-2xl shadow-inner max-w-[210px] mx-auto">
                        <div
                          className="w-full aspect-square"
                          dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                        <div className="mt-2 text-[11px] font-semibold text-zinc-500 flex items-center justify-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span>Expires in {formatTimer(secondsRemaining)}</span>
                        </div>
                      </div>

                      {/* App Intent Launchers */}
                      <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-left">
                          1-Tap Pay via Mobile App:
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {appIntents.map((app) => (
                            <a
                              key={app.appName}
                              href={app.intentUrl}
                              onClick={() => handleSimulatePayment(app.appName)}
                              className="py-2 px-1 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold text-[10px] shadow-xs text-center block transition-all"
                            >
                              {app.appName}
                            </a>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyUri}
                        className="w-full py-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600" />
                            <span>Copied UPI Intent URI</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 text-zinc-400" />
                            <span>Copy NPCI `upi://pay` URI</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="py-8">
                      <button
                        type="button"
                        onClick={() => handleSimulatePayment()}
                        disabled={isProcessing}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Connecting Gateway...</span>
                          </>
                        ) : (
                          <>
                            <QrCode className="w-4 h-4" />
                            <span>Pay securely via PhonePe</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
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
                    {accountMode === 'paper' && (
                      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400 pt-0.5">
                        <span>Handles:</span>
                        {['@okhdfcbank', '@oksbi', '@paytm', '@ybl'].map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => setVpa(`trader${h}`)}
                            className="text-indigo-600 hover:underline"
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    )}
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
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending UPI Collect Request...</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-4 h-4" />
                        <span>{accountMode === 'exchange' ? 'Proceed with PhonePe' : `Send Collect Request to ${vpa || 'App'}`}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* 12-Digit UTR Verification Tab */}
              {activeTab === 'utr' && (
                <form onSubmit={handleVerifyUTR} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-1">
                    <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                      <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                      Direct Bank Reference (UTR) Validation
                    </div>
                    <p className="text-[11px] text-indigo-700 leading-relaxed">
                      Transferred money via netbanking, IMPS, or your UPI app? Paste the 12-digit numeric UTR/Ref number to verify and credit instantly.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700">12-Digit Indian UTR Number</label>
                    <input
                      type="text"
                      maxLength={12}
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 423589123456"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono font-bold tracking-wider outline-none"
                    />
                    <p className="text-[10px] text-zinc-400">
                      Found in SMS or transaction details of Google Pay, PhonePe, Paytm, or HDFC/SBI/ICICI app.
                    </p>
                    {accountMode === 'exchange' && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-amber-600 font-medium">
                          ⚠️ Manual Bank Transfer: Your wallet will NOT be credited immediately.
                        </p>
                        <p className="text-[10px] text-amber-600 font-medium">
                          Funds will be credited after bank statement reconciliation (1-3 business days).
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing || utrNumber.length !== 12}
                    className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-black text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying with Gateway...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Verify UTR & Credit ₹{numericAmountINR.toLocaleString()}</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Direct Web3 On-Ramp Tab */}
              {activeTab === 'onramp' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                      <Sparkles className="w-3.5 h-3.5" />
                      Direct Self-Custody EVM On-Ramp
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Want crypto directly deposited to your self-custody Web3 wallet address? Use zero-fee public on-ramp widgets:
                    </p>
                    <div className="text-[10px] font-mono text-zinc-600 bg-white/70 p-2 rounded-lg break-all">
                      Target: {recipientEvmAddress}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <a
                      href={onmetaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full p-3.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 flex items-center justify-between transition-all group shadow-xs"
                    >
                      <div>
                        <div className="text-xs font-bold text-zinc-900 group-hover:text-indigo-600 flex items-center gap-1.5">
                          <span>Onmeta India UPI Widget</span>
                          <ExternalLink className="w-3 h-3 text-zinc-400" />
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Direct Indian UPI → Polygon/Arbitrum USDC
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                        0% Gateway Fee
                      </span>
                    </a>

                    <a
                      href={transakUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full p-3.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 flex items-center justify-between transition-all group shadow-xs"
                    >
                      <div>
                        <div className="text-xs font-bold text-zinc-900 group-hover:text-indigo-600 flex items-center gap-1.5">
                          <span>Transak Global Card / UPI</span>
                          <ExternalLink className="w-3 h-3 text-zinc-400" />
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Visa, Mastercard, RuPay & UPI
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                        Multi-Currency
                      </span>
                    </a>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Success / Pending Receipt Screen */
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              {successReceipt?.status === 'PENDING_MANUAL_SETTLEMENT' ? (
                <>
                  <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 mx-auto flex items-center justify-center shadow-lg shadow-amber-600/10">
                    <Clock className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">UTR Submitted for Verification</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      UTR ref <span className="font-mono font-bold text-zinc-800">{successReceipt?.ref}</span> registered with treasury desk. Wallet balance will be credited authoritatively upon bank statement clearing.
                    </p>
                  </div>
                </>
              ) : successReceipt?.status === 'AWAITING_PROVIDER_SETTLEMENT' ? (
                <>
                  <div className="w-16 h-16 rounded-3xl bg-blue-100 text-blue-600 mx-auto flex items-center justify-center shadow-lg shadow-blue-600/10">
                    <Clock className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Awaiting Provider Settlement</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Payment order registered. Please complete the authorization in your banking app. The balance will update automatically upon webhook receipt.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-lg shadow-emerald-600/10">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">UPI Payment Confirmed!</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Successfully credited ₹{numericAmountINR.toLocaleString()} INR ($
                      {equivalentUSD.toFixed(2)} USD) to your Sovereign Wallet.
                    </p>
                  </div>
                </>
              )}

              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 text-left space-y-1.5">
                <div className="flex justify-between">
                  <span>Channel:</span>
                  <span className="font-semibold text-zinc-900">{successReceipt?.channel || 'UPI'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Reference ID:</span>
                  <span className="font-mono font-bold text-zinc-900">{successReceipt?.ref}</span>
                </div>
                {successReceipt?.status && (
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="font-mono font-bold text-amber-600">{successReceipt.status}</span>
                  </div>
                )}
                {successReceipt?.sha256Proof && (
                  <div className="flex justify-between">
                    <span>Ledger Hash:</span>
                    <span className="font-mono text-indigo-600">{successReceipt.sha256Proof}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Settlement:</span>
                  <span className={`font-semibold ${successReceipt?.status ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {successReceipt?.status === 'PENDING_MANUAL_SETTLEMENT' ? 'Pending Bank Reconciliation' : successReceipt?.status === 'AWAITING_PROVIDER_SETTLEMENT' ? 'Awaiting Webhook' : 'Immediate Real-Time'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs shadow-md transition-all"
              >
                Done & View Balance
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
