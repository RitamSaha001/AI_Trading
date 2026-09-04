import React, { useState } from 'react';
import {
  X,
  Wallet,
  CreditCard,
  QrCode,
  ArrowLeftRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Lock,
  Zap,
  ArrowRight,
  BookOpen,
} from 'lucide-react';

interface WalletGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletGuideModal({ isOpen, onClose }: WalletGuideModalProps) {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'cards' | 'upi' | 'allocation' | 'security' | 'web3'
  >('overview');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white/95 backdrop-blur-2xl border border-white/80 rounded-[32px] shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.06] bg-white/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                Sovereign Wallet Guide & Documentation
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  v1.0
                </span>
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                Complete user guide for Card & UPI funding, trading allocations, and security
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

        {/* Tab Navigation */}
        <div className="px-6 pt-3 pb-2 border-b border-black/[0.04] bg-zinc-50/50 flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: '1. Architecture', icon: Wallet },
            { id: 'cards', label: '2. Cards & 3DS', icon: CreditCard },
            { id: 'upi', label: '3. UPI & QR', icon: QrCode },
            { id: 'allocation', label: '4. Trading & Swap', icon: ArrowLeftRight },
            { id: 'security', label: '5. Privacy Vault', icon: ShieldCheck },
            { id: 'web3', label: '6. Web3 & DEX', icon: Zap },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeTab === t.id
                    ? 'bg-white text-zinc-900 shadow-sm border border-black/[0.06]'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-zinc-600 leading-relaxed">
          {activeTab === 'overview' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-100 text-zinc-800 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-indigo-900 text-sm">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Sovereign Treasury Segregation</span>
                </div>
                <p>
                  The Lumen Sovereign Wallet is completely independent from external exchanges like Binance. It operates on client-side state with an immutable cryptographic ledger, giving you full self-custodial control over your deposited fiat capital.
                </p>
              </div>

              <h4 className="font-bold text-zinc-900 text-sm pt-1">Key Principles:</h4>
              <ul className="space-y-2 list-disc pl-4 text-zinc-700">
                <li>
                  <strong>100% Free to Build & Run:</strong> Powered by an embedded zero-cost gateway adapter. No paid merchant fees, subscriptions, or Stripe/Razorpay accounts required to trade.
                </li>
                <li>
                  <strong>Multi-Currency Accounting:</strong> Deposit in INR (₹), USD ($), EUR (€), or GBP (£). The wallet maintains real-time FX conversions without hidden spreads.
                </li>
                <li>
                  <strong>Segregated Liquidity:</strong> Funds in the Sovereign Wallet are safe and isolated from market volatility until you explicitly allocate them to your Trading Desk.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'cards' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-100 text-zinc-800 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Credit & Debit Card Deposits</span>
                </div>
                <p>
                  Supports international and domestic Visa, Mastercard, RuPay, and American Express cards with real-time mathematical Luhn checksum validation.
                </p>
              </div>

              <h4 className="font-bold text-zinc-900 text-sm pt-1">Step-by-Step Deposit Flow:</h4>
              <ol className="space-y-2 list-decimal pl-4 text-zinc-700">
                <li>Click <strong>+ Deposit via Card</strong> on the Sovereign Wallet dashboard.</li>
                <li>Enter your card details (or use the instant 1-click test cards for Visa, Mastercard, or RuPay).</li>
                <li>Review the deposit amount and live USD equivalent conversion.</li>
                <li>Proceed to the <strong>3D-Secure Bank Verification</strong> challenge and enter the simulated SMS OTP (<code>123456</code>).</li>
                <li>Funds are immediately settled into your wallet and recorded with a SHA-256 transaction receipt.</li>
              </ol>
            </div>
          )}

          {activeTab === 'upi' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-100 text-zinc-800 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                  <QrCode className="w-4 h-4 text-amber-600" />
                  <span>UPI (Unified Payments Interface) Standard</span>
                </div>
                <p>
                  Conforms strictly to the National Payments Corporation of India (NPCI) standard for dynamic QR codes and VPA collect requests.
                </p>
              </div>

              <h4 className="font-bold text-zinc-900 text-sm pt-1">Two Flexible Payment Modes:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-sm space-y-1">
                  <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-indigo-600" />
                    <span>Dynamic Vector QR</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Scan the real-time generated SVG QR code with Google Pay, PhonePe, Paytm, or BHIM. Includes 5-minute security countdown.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-sm space-y-1">
                  <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-600" />
                    <span>UPI ID (VPA) Collect</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Enter your VPA (e.g. <code>trader@okhdfcbank</code>) to simulate an in-app push notification collect request.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'allocation' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-100 text-zinc-800 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-indigo-900 text-sm">
                  <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                  <span>Capital Deployment & Direct Spot Swaps</span>
                </div>
                <p>
                  Once money is in your Sovereign Wallet, you can put it to work immediately without friction.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1">
                  <div className="font-bold text-zinc-900">1. Allocate to Trading Desk</div>
                  <p className="text-[11px] text-zinc-600">
                    Move funds from your wallet into active trading cash. Your automated bot strategies and manual orders can immediately utilize this buying power.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1">
                  <div className="font-bold text-zinc-900">2. Recall Trading Profits</div>
                  <p className="text-[11px] text-zinc-600">
                    When your strategies close in profit, recall unencumbered cash back into your Sovereign Wallet to lock in gains and protect capital.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-zinc-200 space-y-1">
                  <div className="font-bold text-zinc-900">3. Direct Spot Crypto Swap</div>
                  <p className="text-[11px] text-zinc-600">
                    Execute 1-click spot buys of BTC, ETH, SOL, or AVAX directly from wallet cash at live mark-to-market prices.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Privacy-by-Design & Cryptographic Ledger</span>
                </div>
                <p className="text-zinc-300 text-xs">
                  Your financial privacy is cryptographically protected directly on your hardware.
                </p>
              </div>

              <ul className="space-y-2 list-disc pl-4 text-zinc-700">
                <li>
                  <strong>Zero Raw Card Storage:</strong> Card numbers and CVVs are discarded immediately after tokenization; only masked identifiers (<code>•••• 4242</code>) are kept.
                </li>
                <li>
                  <strong>Double-Entry Ledger:</strong> Every transaction generates a SHA-256 cryptographic receipt hash that can be exported as CSV for full accounting records.
                </li>
                <li>
                  <strong>Withdrawal Defense Sentinel:</strong> Configurable daily withdrawal caps ($10,000 / day default) and optional Security PIN authorization to prevent accidental or malicious drains.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'web3' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white space-y-1.5 shadow-md">
                <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Web3 Self-Custody Desk (Polygon & Arbitrum EVM)</span>
                </div>
                <p className="text-zinc-300 text-xs">
                  Trade on-chain decentralized liquidity pools without depositing capital to Binance or any centralized intermediary.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
                  <div className="font-bold text-zinc-900 text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Pure Client-Side Key Derivation
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Your 12-word BIP-39 mnemonic seed phrase and secp256k1 private keys are computed directly in your browser using the Web Crypto API. They are encrypted using AES-256-GCM and PBKDF2 (100,000 rounds) and never transmitted to any server.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
                  <div className="font-bold text-zinc-900 text-xs flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-indigo-600" />
                    Indian UPI Direct Bridging
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Deposit INR with 0% fee using any UPI app (GPay, PhonePe, Paytm, BHIM, CRED) or 12-digit UTR validation. The funds are instantly verified and can be deployed directly to your self-custodial wallet on Polygon or Arbitrum.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
                  <div className="font-bold text-zinc-900 text-xs flex items-center gap-1.5">
                    <ArrowLeftRight className="w-4 h-4 text-purple-600" />
                    DEX Spot Swaps with Gas & Slippage Safety Gate
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Spot trades execute against Uniswap V3 / DEX liquidity pools with a minimal 0.10% pool fee, bounded slippage protection (default 50 bps), preflight gas reserve verification, and auditable transaction receipts with block explorer links.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/[0.06] bg-white/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-md transition-all"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
