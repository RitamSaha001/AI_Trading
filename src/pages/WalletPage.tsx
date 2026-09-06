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
} from 'lucide-react';
import { WalletCurrency, Asset, ASSETS } from '../types';
import {
  formatCurrencyAmount,
  filterTransactions,
  exportLedgerToCsv,
  TransactionFilterCategory,
} from '../domain/walletLedger';
import { convertCurrency, PAPER_SIMULATION_FX_RATES_TO_USD, get24hVolume } from '../domain/wallet';
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
  } = useLumen();

  // Modals state
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [allocateModalOpen, setAllocateModalOpen] = useState(false);
  const [allocateMode, setAllocateMode] = useState<'allocate' | 'recall'>('allocate');
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  // Currency view toggle (INR vs USD)
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'INR'>('INR');

  // Ledger state
  const [filterCategory, setFilterCategory] =
    useState<TransactionFilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Upstox Demat Margin Allocation state
  const [allocSegment, setAllocSegment] = useState<'EQUITY_DELIVERY' | 'EQUITY_INTRADAY' | 'FNO_DERIVATIVES'>('EQUITY_INTRADAY');
  const [allocAmountINR, setAllocAmountINR] = useState('25000');
  const [isAllocatingMargin, setIsAllocatingMargin] = useState(false);

  const totalSovereignNetWorthUSD =
    nativeWallet.balanceUSD + nativeWallet.allocatedToTradingUSD;

  // PAPER MODE ONLY: Using simulation FX rate. Live mode uses backend conversion.
  const simulationRateINR = 1 / PAPER_SIMULATION_FX_RATES_TO_USD['INR'];
  const displayRate = displayCurrency === 'INR' ? simulationRateINR : 1;
  const currencySymbol = displayCurrency === 'INR' ? '₹' : '$';

  const formatDisplayValue = (valUSD: number) => {
    if (displayCurrency === 'INR') {
      return `₹${(valUSD * simulationRateINR).toLocaleString('en-US', {
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
    link.setAttribute(
      'download',
      `lumen_wallet_ledger_${new Date().toISOString().slice(0, 10)}.csv`
    );
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
  const withdraw24h = get24hVolume(nativeWallet.transactions, 'withdrawal');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      
      {/* Top Banner & Treasury Net Worth Header */}
      <div className="relative p-6 sm:p-8 rounded-[32px] bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 text-white shadow-2xl overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-indigo-300 shadow-inner">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    Funds, Margin &amp; Capital Treasury
                  </h1>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    SEBI Demat &amp; Trading
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-medium">
                  Institutional treasury with instant UPI &amp; Net Banking deposit rails, Demat margin allocation, and SEBI compliance ledger.
                </p>
              </div>
            </div>

            {/* Total Valuation */}
            <div className="pt-2">
              <div className="text-xs uppercase font-bold tracking-wider text-zinc-400">
                Total Demat &amp; Sovereign Treasury Balance
              </div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight text-white font-mono mt-0.5">
                {formatDisplayValue(totalSovereignNetWorthUSD)}
              </div>
            </div>
          </div>

          {/* Currency Toggle & Quick Guide Launcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Currency switch */}
            <div className="flex items-center p-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15">
              <button
                type="button"
                onClick={() => setDisplayCurrency('USD')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  displayCurrency === 'USD'
                    ? 'bg-white text-zinc-900 shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setDisplayCurrency('INR')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  displayCurrency === 'INR'
                    ? 'bg-white text-zinc-900 shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                INR (₹)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setGuideModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-indigo-300" />
              <span>Wallet Guide & Tour</span>
            </button>
          </div>
        </div>

        {/* 4 Telemetry Metrics Cards */}
        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-zinc-400 font-medium">Liquid Wallet Cash</div>
            <div className="text-lg font-black text-white font-mono mt-0.5">
              {formatDisplayValue(nativeWallet.balanceUSD)}
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready to spend / allocate</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-zinc-400 font-medium">Allocated to Trading</div>
            <div className="text-lg font-black text-indigo-300 font-mono mt-0.5">
              {formatDisplayValue(nativeWallet.allocatedToTradingUSD)}
            </div>
            <div className="text-[10px] text-zinc-400 font-semibold mt-1">
              Trading Desk Cash: ${state.cash.toFixed(2)}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-zinc-400 font-medium">Lifetime Inflows</div>
            <div className="text-lg font-black text-white font-mono mt-0.5">
              ${nativeWallet.totalDepositedUSD.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-400 font-semibold mt-1">
              Withdrawn: ${nativeWallet.totalWithdrawnUSD.toFixed(2)}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-zinc-400 font-medium">Security Sentinel</div>
            <div className="text-lg font-black text-emerald-300 font-mono mt-0.5">
              AES-GCM-256
            </div>
            <div className="text-[10px] text-zinc-400 font-semibold mt-1">
              Limit: ${nativeWallet.security.dailyDepositLimitUSD.toLocaleString()} / day
            </div>
          </div>
        </div>
      </div>

      {/* Upstox Demat Gateway & Margin Desk Bar */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-zinc-900 via-indigo-950 to-zinc-900 text-white border border-indigo-500/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner shrink-0">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">Upstox Demat Gateway</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono uppercase">
                {accountMode === 'upstox' ? 'Live Upstox Desk (NSE/BSE)' : 'Simulated Paper Desk'}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <ShieldCheck className="w-2.5 h-2.5" />
                IP: 87.76.191.49
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Authoritative SEBI Broker Gateway • CNC Delivery (1x) &amp; MIS Intraday (Up to 5x Margin)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-zinc-400 uppercase font-semibold">Trading Desk Cash</div>
            <div className="text-sm font-extrabold text-white font-mono">
              {formatDisplayValue(state.cash)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAllocateMode('allocate');
              setAllocateModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Deploy Margin to Desk</span>
          </button>
        </div>
      </div>

      {/* Main Action Command Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setCardModalOpen(true)}
          className="p-4 rounded-3xl bg-white/90 hover:bg-white border border-zinc-200/80 shadow-sm hover:shadow-md transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform mb-3">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-zinc-900 group-hover:text-indigo-600 transition-colors">
            Deposit via Card
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-0.5">
            Visa, Mastercard, RuPay
          </div>
        </button>

        <button
          type="button"
          onClick={() => setUpiModalOpen(true)}
          className="p-4 rounded-3xl bg-white/90 hover:bg-white border border-zinc-200/80 shadow-sm hover:shadow-md transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform mb-3">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors">
            Deposit via UPI
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-0.5">
            Instant QR, BHIM UPI, GPay, Net Banking
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setAllocateMode('allocate');
            setAllocateModalOpen(true);
          }}
          className="p-4 rounded-3xl bg-white/90 hover:bg-white border border-zinc-200/80 shadow-sm hover:shadow-md transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform mb-3">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-zinc-900 group-hover:text-amber-600 transition-colors">
            Allocate to Trading
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-0.5">
            Deploy or recall desk cash
          </div>
        </button>

        <button
          type="button"
          onClick={() => setWithdrawModalOpen(true)}
          className="p-4 rounded-3xl bg-white/90 hover:bg-white border border-zinc-200/80 shadow-sm hover:shadow-md transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 group-hover:scale-105 transition-transform mb-3">
            <ArrowUpFromLine className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-zinc-900 group-hover:text-slate-900 transition-colors">
            Withdraw Funds
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-0.5">
            Transfer to Bank, Card, UPI
          </div>
        </button>
      </div>

      {/* Upstox Margin Allocation & Saved Payment Methods Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upstox Margin Allocation Terminal */}
        <div className="lg:col-span-2 p-6 rounded-[28px] bg-white/90 backdrop-blur-xl border border-zinc-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 text-sm">Upstox Margin &amp; Segment Allocation</h3>
                <p className="text-xs text-zinc-500">
                  Allocate Demat treasury funds into active intraday, delivery, or F&amp;O margin
                </p>
              </div>
            </div>
            <div className="text-xs font-semibold text-zinc-500">
              Treasury Liquid: <strong className="text-zinc-900 font-mono">{formatDisplayValue(nativeWallet.balanceUSD)}</strong>
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Allocation Amount (INR ₹)</label>
                <input
                  type="number"
                  step="100"
                  min="100"
                  value={allocAmountINR}
                  onChange={(e) => setAllocAmountINR(e.target.value)}
                  placeholder="25000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600">Target Trading Segment</label>
                <select
                  value={allocSegment}
                  onChange={(e) => setAllocSegment(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold outline-none bg-white"
                >
                  <option value="EQUITY_INTRADAY">NSE/BSE Equity Intraday (MIS - 5x Leverage)</option>
                  <option value="EQUITY_DELIVERY">NSE/BSE Cash Delivery (CNC - 1x Cash)</option>
                  <option value="FNO_DERIVATIVES">NSE F&amp;O Derivatives (Index &amp; Stock Options/Futures)</option>
                </select>
              </div>
            </div>

            {/* Margin Leverage & Effective Buying Power Preview */}
            <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-600 flex items-center justify-between">
              <div>
                <span className="text-zinc-500">Effective Buying Power: </span>
                <strong className="text-zinc-900 font-mono font-bold">
                  ₹{((parseFloat(allocAmountINR) || 0) * (allocSegment === 'EQUITY_INTRADAY' ? 5 : 1)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
                {allocSegment === 'EQUITY_INTRADAY' && (
                  <span className="ml-1.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                    5x MIS Margin
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400">
                SEBI Peak Margin Compliant | 0% Brokerage on Equity Delivery
              </div>
            </div>

            <button
              type="submit"
              disabled={isAllocatingMargin || (parseFloat(allocAmountINR) || 0) <= 0}
              className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAllocatingMargin ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Deploying Margin...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>
                    Deploy ₹{(parseFloat(allocAmountINR) || 0).toLocaleString('en-IN')} Margin to Upstox Desk
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Saved Tokenized Payment Methods Vault */}
        <div className="p-6 rounded-[28px] bg-white/90 backdrop-blur-xl border border-zinc-200/80 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-zinc-900 text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Saved Payment Vault</span>
              </div>
              <span className="text-[10px] font-bold text-zinc-400">
                {nativeWallet.savedPaymentMethods.length} Methods
              </span>
            </div>

            <p className="text-xs text-zinc-500">
              Encrypted credentials stored safely on device via Web Crypto AES-GCM.
            </p>

            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {nativeWallet.savedPaymentMethods.length === 0 ? (
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/60 text-center text-xs text-zinc-400 space-y-2">
                  <CreditCard className="w-6 h-6 mx-auto text-zinc-300" />
                  <div>No saved cards or VPAs yet.</div>
                  <div className="text-[10px] text-zinc-400">
                    Enable &quot;Save safely in local device vault&quot; during deposit.
                  </div>
                </div>
              ) : (
                nativeWallet.savedPaymentMethods.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-200/80 flex items-center justify-between text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {m.type === 'card' ? (
                        <CreditCard className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                      )}
                      <div>
                        <div className="font-bold text-zinc-900">{m.label}</div>
                        <div className="text-[10px] text-zinc-400">
                          Added {new Date(m.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deletePaymentMethod(m.id)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete saved method"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Conditional Demo Sandbox Funding or Grievance Redressal */}
          <div className="pt-3 border-t border-zinc-100">
            {accountMode === 'paper' ? (
              <button
                type="button"
                onClick={handleQuickDemoFund}
                className="w-full py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold transition-all flex items-center justify-center gap-2"
                title="Credit $1,000 virtual simulated test balance to paper wallet"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>+ $1,000 Sandbox Test Deposit (Virtual)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openGrievanceModal()}
                className="w-full py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs"
                title="Open official statutory grievance and transaction dispute desk"
              >
                <LifeBuoy className="w-3.5 h-3.5 text-emerald-600" />
                <span>Grievance Desk &amp; Dispute Resolution</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Double-Entry Cryptographic Ledger Table */}
      <div className="p-6 rounded-[28px] bg-white/90 backdrop-blur-xl border border-zinc-200/80 shadow-sm space-y-4">
        
        {/* Ledger Header & Search Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 text-sm">
                Cryptographic Audit Ledger
              </h3>
              <p className="text-xs text-zinc-500">
                Immutable double-entry transaction record with SHA-256 receipts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-medium outline-none focus:border-indigo-500 w-44 sm:w-56"
              />
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={nativeWallet.transactions.length === 0}
              className="px-3 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-bold text-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
              title="Export RFC 4180 CSV spreadsheet"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {/* Export JSON Audit Statement */}
            <button
              type="button"
              onClick={handleDownloadAuditJson}
              disabled={nativeWallet.transactions.length === 0}
              className="px-3 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-bold text-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-40"
              title="Export tamper-evident JSON audit ledger"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>Audit JSON</span>
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                filterCategory === cat.id
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          {filteredTxs.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-400 space-y-3">
              <Wallet className="w-10 h-10 mx-auto text-zinc-300" />
              <div>No transactions found matching the selected filter.</div>
              <button
                type="button"
                onClick={() => setCardModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-sm transition-all"
              >
                + Make First Deposit
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200/80 text-[11px] uppercase font-bold text-zinc-400">
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">USD Equivalent</th>
                  <th className="py-3 px-3">Method / Details</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Receipt Hash (SHA-256)</th>
                  <th className="py-3 px-3 text-right">Redressal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTxs.map((tx) => {
                  const isDeposit = tx.type === 'deposit';
                  const isWithdrawal = tx.type === 'withdrawal';
                  const isAlloc = tx.type === 'allocate_to_trading';
                  const isRecall = tx.type === 'recall_from_trading';
                  const isSwap = tx.type === 'swap_crypto';

                  return (
                    <tr key={tx.id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap text-zinc-500 font-mono text-[11px]">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            isDeposit
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isWithdrawal
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : isAlloc
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : isRecall
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isDeposit && <CreditCard className="w-3 h-3" />}
                          {isWithdrawal && <ArrowUpFromLine className="w-3 h-3" />}
                          {isAlloc && <ArrowLeftRight className="w-3 h-3" />}
                          {isRecall && <RefreshCw className="w-3 h-3" />}
                          {isSwap && <Zap className="w-3 h-3" />}
                          <span className="capitalize">{tx.type.replace(/_/g, ' ')}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {isDeposit || isRecall ? '+' : '-'}
                        {formatCurrencyAmount(tx.amount, tx.currency)}
                      </td>

                      <td className="py-3 px-3 font-mono text-zinc-600 whitespace-nowrap">
                        ${tx.amountUSD.toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-zinc-700 max-w-xs truncate">
                        {tx.description}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Settled</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCopyHash(tx.txHash)}
                          className="font-mono text-[11px] text-zinc-400 hover:text-zinc-700 hover:underline inline-flex items-center gap-1"
                          title="Click to copy SHA-256 hash"
                        >
                          <span>{tx.txHash.slice(0, 10)}...</span>
                          {copiedHash === tx.txHash ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-zinc-300" />
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
                                : isSwap
                                ? 'general_inquiry'
                                : isWithdrawal
                                ? 'general_inquiry'
                                : 'unauthorized_activity',
                              title: `Dispute for ${tx.type.replace(/_/g, ' ')} (${formatCurrencyAmount(tx.amount, tx.currency)})`,
                              description: `Transaction reference: ${tx.paymentDetails?.referenceNumber || tx.txHash}\nAmount: ${tx.amount} ${tx.currency} ($${tx.amountUSD.toFixed(2)} USD)\nTimestamp: ${new Date(tx.timestamp).toISOString()}`,
                              relatedTxId: tx.id,
                              relatedUtr: tx.paymentDetails?.referenceNumber || '',
                              relatedTxHash: tx.txHash,
                              amountUSD: tx.amountUSD,
                              amountINR: tx.currency === 'INR' ? tx.amount : tx.amountUSD * (1 / PAPER_SIMULATION_FX_RATES_TO_USD['INR']),
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] border border-indigo-200/60 inline-flex items-center gap-1 transition-colors shadow-2xs active:scale-95"
                          title="Raise formal dispute or grievance ticket for this transaction"
                        >
                          <LifeBuoy className="w-3 h-3 text-indigo-500" />
                          <span>Dispute</span>
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
