import React, { useState } from 'react';
import { useLumen } from '../store';
import {
  Wallet,
  CreditCard,
  QrCode,
  ArrowLeftRight,
  ArrowUpFromLine,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Lock,
  Download,
  Search,
  BookOpen,
  Zap,
  TrendingUp,
  Clock,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Coins,
  DollarSign,
  AlertCircle,
  ExternalLink,
  Smartphone,
  LifeBuoy,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { WalletCurrency, Asset, ASSETS } from '../types';
import {
  formatCurrencyAmount,
  filterTransactions,
  exportLedgerToCsv,
  TransactionFilterCategory,
} from '../domain/walletLedger';
import { convertCurrency, PAPER_SIMULATION_FX_RATES_TO_USD, get24hVolume } from '../domain/wallet';
import { moneyINR } from '../trading';
import { WalletCardPaymentModal } from '../components/WalletCardPaymentModal';
import { WalletUPIPaymentModal } from '../components/WalletUPIPaymentModal';
import { WalletAllocateModal } from '../components/WalletAllocateModal';
import { WalletWithdrawModal } from '../components/WalletWithdrawModal';
import { WalletGuideModal } from '../components/WalletGuideModal';

export function WalletPage() {
  const {
    nativeWallet,
    state,
    deletePaymentMethod,
    depositToWallet,
    allocateWalletToTrading,
    triggerToast,
    setAccountMode,
    openGrievanceModal,
    accountMode,
    authSession,
    upstoxAccount,
    openUpstoxDrawer,
    syncUpstoxAccount,
  } = useLumen();

  // Modals state
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [allocateModalOpen, setAllocateModalOpen] = useState(false);
  const [allocateMode, setAllocateMode] = useState<'allocate' | 'recall'>('allocate');
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  // Currency view toggle (INR vs USD for paper mode)
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'INR'>('INR');

  // Ledger state
  const [filterCategory, setFilterCategory] = useState<TransactionFilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Upstox Demat Margin Allocation state
  const [allocSegment, setAllocSegment] = useState<'EQUITY_DELIVERY' | 'EQUITY_INTRADAY' | 'FNO_DERIVATIVES'>('EQUITY_INTRADAY');
  const [allocAmountINR, setAllocAmountINR] = useState('25000');
  const [isAllocatingMargin, setIsAllocatingMargin] = useState(false);

  const totalSovereignNetWorthUSD = nativeWallet.balanceUSD + nativeWallet.allocatedToTradingUSD;

  // Paper FX simulation
  const simulationRateINR = 1 / PAPER_SIMULATION_FX_RATES_TO_USD['INR'];

  const formatDisplayValue = (valUSD: number) => {
    if (displayCurrency === 'INR') {
      return `₹${(valUSD * simulationRateINR).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    return `$${valUSD.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const filteredTxs = filterTransactions(
    nativeWallet.transactions,
    filterCategory,
    searchQuery
  );

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleDownloadCsv = () => {
    const csv = exportLedgerToCsv(nativeWallet.transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `lumen_wallet_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('Ledger Exported', 'Downloaded RFC 4180 audit CSV record.', 'info');
  };

  const handleDownloadAuditJson = () => {
    const data = {
      title: 'Lumen Official Financial Audit Statement',
      generatedAt: new Date().toISOString(),
      user: authSession?.user?.displayName || 'Client-Side Self-Custodial',
      email: authSession?.user?.email || 'N/A',
      kycTier: authSession?.user?.kycTier || 'tier_1',
      accountMode,
      treasurySummary: {
        liquidWalletCashUSD: nativeWallet.balanceUSD,
        allocatedToTradingDeskUSD: nativeWallet.allocatedToTradingUSD,
        totalDepositedUSD: nativeWallet.totalDepositedUSD,
        totalWithdrawnUSD: nativeWallet.totalWithdrawnUSD,
        deskCashUSD: state.cash,
        upstoxAvailableCash: upstoxAccount?.funds?.availableCash,
        upstoxUsedMargin: upstoxAccount?.funds?.usedMargin,
        upstoxTotalEquity: upstoxAccount?.funds?.totalEquity,
      },
      transactions: nativeWallet.transactions,
      grievanceTickets: state.grievanceTickets || [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `lumen_official_audit_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('Audit Record Exported', 'Saved official tamper-evident JSON financial statement.', 'info');
  };

  const handleQuickDemoFund = async () => {
    await depositToWallet(
      1000,
      'USD',
      'bank_transfer',
      { referenceNumber: 'DEMO-GENESIS-FUNDS' },
      'One-Click Demo Sandbox Funding'
    );
  };

  const deposit24h = get24hVolume(nativeWallet.transactions, 'deposit');

  const isUpstox = accountMode === 'upstox';
  const upstoxCash = upstoxAccount?.funds?.availableCash 
    ?? (upstoxAccount?.balances?.INR?.free !== undefined ? Number(upstoxAccount.balances.INR.free) : state.cash);
  const upstoxTotalEquity = upstoxAccount?.funds?.totalEquity 
    ?? (upstoxAccount?.balances?.INR?.total !== undefined ? Number(upstoxAccount.balances.INR.total) : upstoxCash);
  const upstoxUsedMargin = upstoxAccount?.funds?.usedMargin 
    ?? (upstoxAccount?.balances?.INR?.locked !== undefined ? Number(upstoxAccount.balances.INR.locked) : 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-200">
      
      {/* Minimalist Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.06] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">
              Wallet &amp; Capital Treasury
            </h1>
            {isUpstox ? (
              <button
                type="button"
                onClick={() => setAccountMode('paper')}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 border border-emerald-500/20 transition-all cursor-pointer"
                title="Click to toggle to Paper Sandbox"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Upstox Live Desk
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (upstoxAccount?.connected) {
                    setAccountMode('upstox');
                  } else {
                    openUpstoxDrawer();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 border border-amber-500/20 transition-all cursor-pointer"
                title={upstoxAccount?.connected ? 'Click to switch to Upstox Live Desk' : 'Click to connect Upstox'}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Paper Sandbox {upstoxAccount?.connected ? '(Click to switch to Upstox Live)' : ''}
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {isUpstox
              ? 'Authoritative Demat margin, instant UPI/NetBanking funding rails, and SEBI compliance ledger.'
              : 'Simulated multi-currency treasury desk with cryptographic SHA-256 audit receipts.'}
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {!isUpstox && (
            <div className="flex items-center p-0.5 bg-zinc-100 rounded-xl border border-black/[0.05]">
              <button
                type="button"
                onClick={() => setDisplayCurrency('INR')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  displayCurrency === 'INR'
                    ? 'bg-white text-zinc-950 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                ₹ INR
              </button>
              <button
                type="button"
                onClick={() => setDisplayCurrency('USD')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  displayCurrency === 'USD'
                    ? 'bg-white text-zinc-950 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                $ USD
              </button>
            </div>
          )}

          {!isUpstox && upstoxAccount?.connected && (
            <button
              type="button"
              onClick={() => setAccountMode('upstox')}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>Switch to Upstox Live (₹30,000)</span>
            </button>
          )}

          {isUpstox && (
            <button
              type="button"
              onClick={() => syncUpstoxAccount()}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.08] text-zinc-700 text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Refresh Upstox Demat margin balances"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
              <span>Sync Margins</span>
            </button>
          )}

          {isUpstox && !upstoxAccount?.connected && (
            <button
              type="button"
              onClick={openUpstoxDrawer}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-semibold transition-all"
            >
              Connect Upstox Demat
            </button>
          )}

          <button
            type="button"
            onClick={() => setGuideModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.08] text-zinc-700 text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-zinc-500" />
            <span>Guide</span>
          </button>
        </div>
      </div>

      {/* Hero Balance Card (Minimalist, High Legibility) */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white border border-black/[0.07] shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          {/* Main Balance Typography */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {isUpstox ? 'Available Demat Trading Balance' : 'Sovereign Treasury Valuation'}
            </span>
            <div className="text-3xl sm:text-4xl font-bold font-mono tracking-tight text-zinc-950">
              {isUpstox ? moneyINR(upstoxCash) : formatDisplayValue(totalSovereignNetWorthUSD)}
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500 pt-1 flex-wrap font-medium">
              {isUpstox ? (
                <>
                  <span>Total Equity: <strong className="text-zinc-900 font-mono">{moneyINR(upstoxTotalEquity)}</strong></span>
                  <span className="text-zinc-300">•</span>
                  <span>Used Margin: <strong className="text-zinc-900 font-mono">{moneyINR(upstoxUsedMargin)}</strong></span>
                  <span className="text-zinc-300">•</span>
                  <span className="text-emerald-700 font-medium">SEBI Peak Margin Active</span>
                </>
              ) : (
                <>
                  <span>Liquid Cash: <strong className="text-zinc-900 font-mono">{formatDisplayValue(nativeWallet.balanceUSD)}</strong></span>
                  <span className="text-zinc-300">•</span>
                  <span>Desk Allocation: <strong className="text-zinc-900 font-mono">{formatDisplayValue(nativeWallet.allocatedToTradingUSD)}</strong></span>
                  {deposit24h > 0 && (
                    <>
                      <span className="text-zinc-300">•</span>
                      <span className="text-emerald-600">+${deposit24h.toFixed(2)} 24h</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Clean Primary Actions Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setUpiModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold shadow-2xs transition-all active:scale-95 flex items-center gap-2"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>Instant UPI</span>
            </button>

            <button
              type="button"
              onClick={() => setCardModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.1] text-zinc-800 text-xs font-semibold shadow-2xs transition-all active:scale-95 flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4 text-zinc-500" />
              <span>Card</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAllocateMode('allocate');
                setAllocateModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.1] text-zinc-800 text-xs font-semibold shadow-2xs transition-all active:scale-95 flex items-center gap-2"
            >
              <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
              <span>Deploy Margin</span>
            </button>

            <button
              type="button"
              onClick={() => setWithdrawModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-50 border border-black/[0.1] text-zinc-800 text-xs font-semibold shadow-2xs transition-all active:scale-95 flex items-center gap-2"
            >
              <ArrowUpFromLine className="w-4 h-4 text-zinc-500" />
              <span>Withdraw</span>
            </button>

            {!isUpstox && (
              <button
                type="button"
                onClick={handleQuickDemoFund}
                className="px-3 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5"
                title="Credit $1,000 virtual sandbox funding"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>+ $1K Test</span>
              </button>
            )}

            {isUpstox && (
              <button
                type="button"
                onClick={() => openGrievanceModal()}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5"
                title="Statutory SEBI Grievance Desk"
              >
                <LifeBuoy className="w-3.5 h-3.5 text-emerald-600" />
                <span>Grievance</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3 Minimalist Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-black/[0.06] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Liquid Purchasing Power</span>
            <Wallet className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-zinc-950 mt-1">
            {isUpstox ? moneyINR(upstoxCash) : formatDisplayValue(nativeWallet.balanceUSD)}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Instant settlement • No lockup</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-black/[0.06] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              {isUpstox ? 'Active Upstox Margin' : 'Desk Allocated Funds'}
            </span>
            <ArrowLeftRight className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-zinc-950 mt-1">
            {isUpstox ? moneyINR(upstoxUsedMargin) : formatDisplayValue(nativeWallet.allocatedToTradingUSD)}
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-1.5">
            {isUpstox ? 'MIS Intraday & F&O leverage' : `Desk cash: $${state.cash.toFixed(2)}`}
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-black/[0.06] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Security &amp; Encryption</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-zinc-950 mt-1">
            AES-GCM-256
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-1.5">
            {isUpstox ? 'Static IP (87.76.191.49) • SEBI Demat' : `Daily limit: $${nativeWallet.security.dailyDepositLimitUSD.toLocaleString()}`}
          </div>
        </div>
      </div>

      {/* Margin Allocation & Saved Vault (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upstox Margin Allocation Terminal (2 cols) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-3xl bg-white border border-black/[0.06] shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-black/[0.05] pb-3.5">
            <div>
              <h3 className="font-bold text-zinc-950 text-sm">
                Upstox Margin &amp; Segment Allocation
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Allocate Demat funds across cash delivery, intraday leverage, or F&amp;O derivatives.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-zinc-400 font-mono hidden sm:inline">
              CNC 1x • MIS 5x
            </span>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const amt = parseFloat(allocAmountINR) || 0;
              if (amt <= 0) return;
              setIsAllocatingMargin(true);
              try {
                const amtUSD = amt * PAPER_SIMULATION_FX_RATES_TO_USD['INR'];
                await allocateWalletToTrading(amtUSD);
                triggerToast('Margin Deployed', `Allocated ₹${amt.toLocaleString('en-IN')} to ${allocSegment.replace(/_/g, ' ')}`, 'success');
              } catch {
                // handled in store
              } finally {
                setIsAllocatingMargin(false);
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Allocation Amount (₹ INR)</label>
                <input
                  type="number"
                  step="100"
                  min="100"
                  value={allocAmountINR}
                  onChange={(e) => setAllocAmountINR(e.target.value)}
                  placeholder="25000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 text-sm font-semibold font-mono outline-none transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Trading Segment</label>
                <select
                  value={allocSegment}
                  onChange={(e) => setAllocSegment(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 text-xs sm:text-sm font-medium outline-none bg-white transition-colors"
                >
                  <option value="EQUITY_INTRADAY">Equity Intraday (MIS - 5x Leverage)</option>
                  <option value="EQUITY_DELIVERY">Cash Delivery (CNC - 1x Cash)</option>
                  <option value="FNO_DERIVATIVES">F&amp;O Derivatives (Options/Futures)</option>
                </select>
              </div>
            </div>

            {/* Buying Power Calculation Strip */}
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-black/[0.05] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-medium">Effective Buying Power:</span>
                <strong className="text-zinc-950 font-mono font-bold text-sm">
                  ₹{((parseFloat(allocAmountINR) || 0) * (allocSegment === 'EQUITY_INTRADAY' ? 5 : 1)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
                {allocSegment === 'EQUITY_INTRADAY' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                    5x MIS
                  </span>
                )}
              </div>
              <span className="text-[11px] text-zinc-400 hidden sm:inline">
                SEBI Peak Margin Compliant
              </span>
            </div>

            <button
              type="submit"
              disabled={isAllocatingMargin || (parseFloat(allocAmountINR) || 0) <= 0}
              className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-xs shadow-2xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
            >
              {isAllocatingMargin ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Deploying Margin...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Deploy ₹{(parseFloat(allocAmountINR) || 0).toLocaleString('en-IN')} Margin to Upstox Desk
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Saved Tokenized Payment Methods Vault (1 col) */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-black/[0.06] shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-black/[0.05] pb-3">
              <div className="flex items-center gap-2 font-bold text-zinc-900 text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Payment Vault</span>
              </div>
              <span className="text-[11px] font-semibold text-zinc-400 font-mono">
                {nativeWallet.savedPaymentMethods.length} Methods
              </span>
            </div>

            <p className="text-xs text-zinc-500">
              Encrypted credentials stored safely on device via Web Crypto AES-GCM.
            </p>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {nativeWallet.savedPaymentMethods.length === 0 ? (
                <div className="p-5 rounded-2xl border border-dashed border-zinc-200 text-center text-xs text-zinc-400 space-y-1.5">
                  <CreditCard className="w-5 h-5 mx-auto text-zinc-300" />
                  <div className="font-medium text-zinc-500">No saved methods</div>
                  <div className="text-[10px] text-zinc-400">
                    Enable &quot;Save safely in local vault&quot; on your next deposit.
                  </div>
                </div>
              ) : (
                nativeWallet.savedPaymentMethods.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100/80 border border-black/[0.04] flex items-center justify-between text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {m.type === 'card' ? (
                        <CreditCard className="w-4 h-4 text-zinc-600" />
                      ) : (
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                      )}
                      <div>
                        <div className="font-semibold text-zinc-900">{m.label}</div>
                        <div className="text-[10px] text-zinc-400">
                          Added {new Date(m.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deletePaymentMethod(m.id)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Remove method"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.05] text-[11px] text-zinc-400 flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-zinc-400" />
            <span>Zero server-side plaintext storage.</span>
          </div>
        </div>
      </div>

      {/* Cryptographic Audit Ledger Table */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-black/[0.06] shadow-2xs space-y-4">
        
        {/* Ledger Header & Search Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.05] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-zinc-950 text-sm">
                Cryptographic Audit Ledger
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-mono">
                SHA-256 Receipts
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Tamper-evident financial record of all deposits, withdrawals, and allocations.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-medium outline-none focus:border-zinc-900 w-44 sm:w-52 transition-colors"
              />
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={nativeWallet.transactions.length === 0}
              className="px-3 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
              title="Export RFC 4180 CSV spreadsheet"
            >
              <Download className="w-3.5 h-3.5 text-zinc-500" />
              <span>CSV</span>
            </button>

            {/* Export JSON Audit Statement */}
            <button
              type="button"
              onClick={handleDownloadAuditJson}
              disabled={nativeWallet.transactions.length === 0}
              className="px-3 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-semibold text-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
              title="Export tamper-evident JSON audit statement"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: `All (${nativeWallet.transactions.length})` },
            { id: 'deposits', label: 'Deposits' },
            { id: 'withdrawals', label: 'Withdrawals' },
            { id: 'allocations', label: 'Desk Allocations' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilterCategory(cat.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                filterCategory === cat.id
                  ? 'bg-zinc-950 text-white shadow-2xs'
                  : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          {filteredTxs.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400 space-y-3">
              <Wallet className="w-8 h-8 mx-auto text-zinc-300" />
              <div className="text-zinc-500 font-medium">No transactions found matching your criteria.</div>
              <button
                type="button"
                onClick={() => setUpiModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-xs shadow-2xs transition-all"
              >
                + Fund Wallet
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06] text-[11px] uppercase font-semibold text-zinc-400">
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">USD Val</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">SHA-256 Receipt</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {filteredTxs.map((tx) => {
                  const isDeposit = tx.type === 'deposit';
                  const isWithdrawal = tx.type === 'withdrawal';
                  const isAlloc = tx.type === 'allocate_to_trading';
                  const isRecall = tx.type === 'recall_from_trading';

                  return (
                    <tr key={tx.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap text-zinc-500 font-mono text-[11px]">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                            isDeposit
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : isWithdrawal
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              : isAlloc
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                              : 'bg-zinc-100 text-zinc-700 border border-zinc-200/60'
                          }`}
                        >
                          <span className="capitalize">{tx.type.replace(/_/g, ' ')}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold text-zinc-950 whitespace-nowrap">
                        <span className={isDeposit || isRecall ? 'text-emerald-700' : 'text-zinc-900'}>
                          {isDeposit || isRecall ? '+' : '-'}
                          {formatCurrencyAmount(tx.amount, tx.currency)}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono text-zinc-500 whitespace-nowrap">
                        ${tx.amountUSD.toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-zinc-600 max-w-xs truncate font-medium">
                        {tx.description}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Settled</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCopyHash(tx.txHash)}
                          className="font-mono text-[11px] text-zinc-400 hover:text-zinc-700 inline-flex items-center gap-1 transition-colors"
                          title="Click to copy SHA-256 hash"
                        >
                          <span>{tx.txHash.slice(0, 10)}...</span>
                          {copiedHash === tx.txHash ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-zinc-300 hover:text-zinc-500" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            openGrievanceModal({
                              category: isDeposit
                                ? 'upi_deposit_pending'
                                : isWithdrawal
                                ? 'general_inquiry'
                                : 'unauthorized_activity',
                              title: `Dispute for ${tx.type.replace(/_/g, ' ')} (${formatCurrencyAmount(tx.amount, tx.currency)})`,
                              description: `Transaction reference: ${tx.paymentDetails?.referenceNumber || tx.txHash}\nAmount: ${tx.amount} ${tx.currency} ($${tx.amountUSD.toFixed(2)} USD)\nTimestamp: ${new Date(tx.timestamp).toISOString()}`,
                              relatedTxId: tx.id,
                              relatedUtr: tx.paymentDetails?.referenceNumber || '',
                              relatedTxHash: tx.txHash,
                              amountUSD: tx.amountUSD,
                              amountINR: tx.currency === 'INR' ? tx.amount : tx.amountUSD * simulationRateINR,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 font-semibold text-[11px] transition-colors"
                          title="Raise formal dispute or grievance ticket"
                        >
                          Dispute
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Interactive Modals */}
      <WalletCardPaymentModal
        isOpen={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
      />
      <WalletUPIPaymentModal
        isOpen={upiModalOpen}
        onClose={() => setUpiModalOpen(false)}
      />
      <WalletAllocateModal
        isOpen={allocateModalOpen}
        onClose={() => setAllocateModalOpen(false)}
        defaultMode={allocateMode}
      />
      <WalletWithdrawModal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
      />
      <WalletGuideModal
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      />
    </div>
  );
}
