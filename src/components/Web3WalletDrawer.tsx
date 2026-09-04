import React, { useState, useEffect } from 'react';
import {
  X,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Zap,
  Download,
  QrCode,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { useLumen } from '../store';
import {
  WEB3_NETWORKS,
  Web3NetworkKey,
  loadEncryptedKeystore,
  removeEncryptedKeystore,
  GeneratedWallet,
} from '../services/web3Wallet';
import { money } from '../domain/portfolio';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenUPI?: () => void;
}

export function Web3WalletDrawer({ open, onClose, onOpenUPI }: Props) {
  const {
    web3Account,
    createWeb3Wallet,
    importWeb3Wallet,
    unlockWeb3Wallet,
    lockWeb3Wallet,
    switchWeb3Network,
    syncWeb3Balances,
    setAccountMode,
    triggerToast,
  } = useLumen();

  const [mode, setMode] = useState<'create' | 'import' | 'view'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [importInput, setImportInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedWallet | null>(null);
  const [seedSavedConfirmed, setSeedSavedConfirmed] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const hasStoredKeystore = Boolean(loadEncryptedKeystore() || web3Account?.address);
  const isUnlocked = Boolean(web3Account?.isUnlocked);
  const activeNetwork = (web3Account?.network || 'polygon') as Web3NetworkKey;
  const networkConfig = WEB3_NETWORKS[activeNetwork] || WEB3_NETWORKS.polygon;

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      if (hasStoredKeystore) {
        setMode('view');
      } else {
        setMode('create');
      }
    }
  }, [open, hasStoredKeystore]);

  if (!open) return null;

  const handleCopyAddress = () => {
    if (web3Account?.address) {
      navigator.clipboard.writeText(web3Account.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleCopySeed = (seedText: string) => {
    navigator.clipboard.writeText(seedText);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (pin.length < 6) {
      setErrorMessage('Security PIN / Passphrase must be at least 6 characters.');
      return;
    }
    if (pin !== confirmPin) {
      setErrorMessage('PIN confirmation does not match.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await createWeb3Wallet(pin);
      setGeneratedResult(res);
      setSeedSavedConfirmed(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create wallet');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!importInput.trim()) {
      setErrorMessage('Please enter your 12-word seed phrase or private key.');
      return;
    }
    if (pin.length < 6) {
      setErrorMessage('Security PIN must be at least 6 characters.');
      return;
    }

    setIsProcessing(true);
    try {
      await importWeb3Wallet(pin, importInput.trim());
      setMode('view');
      setPin('');
      setImportInput('');
      setAccountMode('web3');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to import wallet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlockWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!pin) {
      setErrorMessage('Please enter your PIN / master passphrase.');
      return;
    }

    setIsProcessing(true);
    try {
      const ok = await unlockWeb3Wallet(pin);
      if (ok) {
        setPin('');
        setAccountMode('web3');
      } else {
        setErrorMessage('Incorrect PIN. Decryption failed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to unlock wallet');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetWallet = () => {
    if (
      window.confirm(
        'Are you sure you want to remove this local wallet from your browser? Make sure you have your 12-word seed phrase backed up, or your funds will be permanently lost.'
      )
    ) {
      removeEncryptedKeystore();
      lockWeb3Wallet();
      setGeneratedResult(null);
      setMode('create');
      triggerToast('Keystore Cleared', 'Local Web3 vault removed.', 'info');
    }
  };

  const handleExportKeystoreJson = () => {
    const ks = loadEncryptedKeystore();
    if (!ks) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(ks, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `lumen_keystore_${ks.address.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerToast('Keystore Exported', 'Standard encrypted keystore JSON downloaded.', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-zinc-200 shadow-2xl flex flex-col text-zinc-900">
          
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-zinc-900">Web3 Self-Custody Desk</h2>
                  {isUnlocked ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  ) : hasStoredKeystore ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <Lock className="w-2.5 h-2.5" />
                      Locked
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                      New
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 font-medium">
                  Independent of Binance • 100% Client-Side Privacy
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Generated seed phrase review screen */}
            {generatedResult && !seedSavedConfirmed ? (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                    <ShieldAlert className="w-4 h-4" />
                    Write Down Your 12-Word Recovery Phrase
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    This phrase is the <strong>only way</strong> to recover your funds if you switch browsers. It is never transmitted to any server. Store it safely offline.
                  </p>
                </div>

                {/* 12-word grid */}
                <div className="grid grid-cols-3 gap-2 bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  {generatedResult.mnemonic.split(' ').map((word, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono font-bold shadow-xs"
                    >
                      <span className="text-[10px] text-zinc-400 w-4">{idx + 1}.</span>
                      <span className="text-zinc-800">{word}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopySeed(generatedResult.mnemonic)}
                    className="flex-1 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-bold text-zinc-700 flex items-center justify-center gap-2 transition-all shadow-xs"
                  >
                    {copiedSeed ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedSeed ? 'Copied to Clipboard' : 'Copy All 12 Words'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSeedSavedConfirmed(true);
                    setGeneratedResult(null);
                    setMode('view');
                    setAccountMode('web3');
                  }}
                  className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>I Have Backed Up My Recovery Phrase</span>
                </button>
              </div>
            ) : !hasStoredKeystore || mode === 'create' || mode === 'import' ? (
              /* Create or Import screen */
              <div className="space-y-5">
                <div className="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('create');
                      setErrorMessage(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      mode === 'create' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    Create New Wallet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('import');
                      setErrorMessage(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      mode === 'import' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    Import Seed / Key
                  </button>
                </div>

                {mode === 'create' ? (
                  <form onSubmit={handleCreateWallet} className="space-y-4">
                    <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2">
                      <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        True Self-Custodial Web3 Desk
                      </div>
                      <p className="text-[11px] text-indigo-700 leading-relaxed">
                        Generates a client-side EVM address (Polygon & Arbitrum). Secured with AES-256-GCM authenticated encryption and PBKDF2 (100,000 rounds).
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Set Security PIN / Passphrase</label>
                      <div className="relative">
                        <input
                          type={showPin ? 'text' : 'password'}
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600"
                        >
                          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Confirm PIN / Passphrase</label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        placeholder="Re-enter to confirm"
                        className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Key className="w-4 h-4" />
                      )}
                      <span>{isProcessing ? 'Generating Keypair...' : 'Generate 12-Word Wallet & Encrypt'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleImportWallet} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">12-Word Seed Phrase or Private Key</label>
                      <textarea
                        rows={3}
                        value={importInput}
                        onChange={(e) => setImportInput(e.target.value)}
                        placeholder="e.g. apple banana cherry ... or 0x..."
                        className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs font-mono outline-none resize-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700">Set New Security PIN</label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="At least 6 characters"
                        className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>{isProcessing ? 'Decrypting & Importing...' : 'Import & Encrypt Keystore'}</span>
                    </button>
                  </form>
                )}

                {hasStoredKeystore && (
                  <button
                    type="button"
                    onClick={() => setMode('view')}
                    className="w-full text-center text-xs text-zinc-500 hover:text-zinc-800 font-semibold"
                  >
                    ← Back to Existing Encrypted Keystore
                  </button>
                )}
              </div>
            ) : !isUnlocked ? (
              /* Unlock Screen */
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900">Self-Custody Vault Locked</h3>
                  <p className="text-xs text-zinc-500 font-mono">
                    {web3Account?.address
                      ? `${web3Account.address.slice(0, 10)}...${web3Account.address.slice(-8)}`
                      : 'EVM Keystore Stored Locally'}
                  </p>
                </div>

                <form onSubmit={handleUnlockWallet} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700">Enter Security PIN / Passphrase</label>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="Enter PIN to unlock"
                        className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600"
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Unlock className="w-4 h-4" />
                    )}
                    <span>{isProcessing ? 'Decrypting Vault...' : 'Unlock Self-Custody Desk'}</span>
                  </button>
                </form>

                <div className="pt-2 flex items-center justify-between border-t border-zinc-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode('import')}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    Import Different Wallet
                  </button>
                  <button
                    type="button"
                    onClick={handleResetWallet}
                    className="text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Clear Local Keystore
                  </button>
                </div>
              </div>
            ) : (
              /* Fully Unlocked Dashboard Screen */
              <div className="space-y-5 animate-in fade-in duration-200">
                
                {/* Active Network Selector */}
                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Active Blockchain Network
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                      Chain ID: {networkConfig.chainId}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['polygon', 'arbitrum', 'amoy'] as Web3NetworkKey[]).map((net) => (
                      <button
                        key={net}
                        type="button"
                        onClick={() => switchWeb3Network(net)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                          activeNetwork === net
                            ? 'bg-zinc-900 text-white shadow-xs'
                            : 'bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200'
                        }`}
                      >
                        {WEB3_NETWORKS[net].name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Address Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                      Self-Custody Address
                    </span>
                    <a
                      href={`${networkConfig.blockExplorer}/address/${web3Account?.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex items-center justify-between gap-2 bg-white/10 p-2.5 rounded-xl backdrop-blur-xs font-mono text-xs">
                    <span className="truncate">{web3Account?.address}</span>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors shrink-0"
                      title="Copy Address"
                    >
                      {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/10">
                    <div>
                      <div className="text-[10px] text-zinc-400 uppercase font-semibold">Total Net Worth</div>
                      <div className="text-lg font-extrabold text-white">
                        {money(web3Account?.totalValueUsd || 0)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => syncWeb3Balances()}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Sync</span>
                    </button>
                  </div>
                </div>

                {/* Balances Breakdown */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-zinc-600 flex items-center justify-between">
                    <span>On-Chain Balances</span>
                    <span className="text-[11px] text-zinc-400 font-normal">
                      Last synced: {web3Account?.lastSyncAt ? new Date(web3Account.lastSyncAt).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>

                  <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-xs">
                    {/* Native Gas Token */}
                    <div className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs">
                          {web3Account?.nativeSymbol || 'POL'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-zinc-900">
                            {web3Account?.nativeSymbol || 'POL'} (Gas Token)
                          </div>
                          <div className="text-[10px] text-zinc-500 font-medium">Native Layer 2</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-zinc-900">
                          {(web3Account?.nativeBalance || 0).toFixed(4)}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-medium">
                          ≈ {money((web3Account?.nativeBalance || 0) * (activeNetwork === 'polygon' ? 0.45 : 3200))}
                        </div>
                      </div>
                    </div>

                    {/* Stablecoins */}
                    {['USDC', 'USDT'].map((sym) => (
                      <div key={sym} className="p-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
                            {sym}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-zinc-900">{sym}</div>
                            <div className="text-[10px] text-zinc-500 font-medium">USD Stablecoin</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-zinc-900">
                            {(web3Account?.balances?.[sym] || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-medium">
                            {money(web3Account?.balances?.[sym] || 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMode('web3');
                      onClose();
                      if (onOpenUPI) onOpenUPI();
                    }}
                    className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Deposit via UPI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountMode('web3');
                      onClose();
                    }}
                    className="py-3 px-4 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Trade on DEX</span>
                  </button>
                </div>

                {/* Security and Vault Management */}
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Cryptographic Sentinel Audit
                  </div>
                  <ul className="text-[11px] text-zinc-600 space-y-1 font-medium">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      Client-side secp256k1 & Keccak-256 derivation
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      AES-256-GCM vault encrypted locally in browser
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      Private keys never sent across network
                    </li>
                  </ul>

                  <div className="pt-2 flex items-center justify-between border-t border-zinc-200">
                    <button
                      type="button"
                      onClick={handleExportKeystoreJson}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Keystore
                    </button>

                    <button
                      type="button"
                      onClick={lockWeb3Wallet}
                      className="text-xs text-zinc-600 hover:text-zinc-900 font-bold flex items-center gap-1"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Lock Session
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
