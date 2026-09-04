import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Key,
  Eye,
  EyeOff,
  Activity,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Coins,
} from 'lucide-react';
import { useLumen } from '../store';
import {
  ExchangeCredentials,
  ExchangeEnvironment,
  isVaultConfigured,
  isVaultUnlocked,
  DEFAULT_AUTO_LOCK_MS,
} from '../services/keyVault';
import { money } from '../domain/portfolio';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ExchangeOnboardingDrawer({ open, onClose }: Props) {
  const {
    state,
    exchangeAccount,
    connectExchange,
    disconnectExchange,
    syncExchangeBalances,
    setAccountMode,
  } = useLumen();

  const [environment, setEnvironment] = useState<ExchangeEnvironment>(
    exchangeAccount?.environment || 'testnet'
  );
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const configured = isVaultConfigured();
  const unlocked = isVaultUnlocked();

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      setSuccessMessage(null);
      if (exchangeAccount?.environment) {
        setEnvironment(exchangeAccount.environment);
      }
    }
  }, [open, exchangeAccount]);

  if (!open) return null;

  const handleTestAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!configured && passphrase !== confirmPassphrase) {
      setErrorMessage('Master passphrases do not match.');
      return;
    }

    if (!configured && passphrase.length < 6) {
      setErrorMessage('Master passphrase must be at least 6 characters.');
      return;
    }

    if (!configured && (!apiKey.trim() || !apiSecret.trim())) {
      setErrorMessage('Please enter both API Key and API Secret.');
      return;
    }

    setTesting(true);
    try {
      const creds: ExchangeCredentials = {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        environment,
      };

      const res = await connectExchange(creds, passphrase);
      if (res.ok) {
        setSuccessMessage('Exchange connected and security audit verified!');
        setApiKey('');
        setApiSecret('');
        setPassphrase('');
        setConfirmPassphrase('');
      } else {
        setErrorMessage(res.error || 'Connection failed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected connection error');
    } finally {
      setTesting(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setTesting(true);
    try {
      const res = await connectExchange(
        { apiKey: '', apiSecret: '', environment },
        passphrase
      );
      if (res.ok) {
        setSuccessMessage('Vault unlocked successfully!');
        setPassphrase('');
      } else {
        setErrorMessage(res.error || 'Unlock failed');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to unlock vault');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = () => {
    if (confirm('Disconnect Binance exchange and purge keys from encrypted vault?')) {
      disconnectExchange();
      setSuccessMessage('Exchange disconnected and credentials cleared.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-black/[0.08] shadow-2xl flex flex-col z-50">
          {/* Header */}
          <div className="px-6 py-5 border-b border-black/[0.06] flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
                  Binance Spot Execution Bridge
                </h2>
                <p className="text-[11px] text-zinc-500">Live trading & private balance sync</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-black/[0.04] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Status Card */}
            {exchangeAccount?.connected ? (
              <div className="p-4 rounded-2xl bg-zinc-900 text-white shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Connected to Binance {exchangeAccount.environment.toUpperCase()}
                    </span>
                  </div>
                  {exchangeAccount.latencyMs !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-400 bg-white/10 px-2 py-0.5 rounded-full">
                      {exchangeAccount.latencyMs}ms ping
                    </span>
                  )}
                </div>

                <div className="text-xs text-zinc-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{exchangeAccount.securityBadge}</span>
                </div>

                {exchangeAccount.securityWarning && (
                  <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs">
                    {exchangeAccount.securityWarning}
                  </div>
                )}

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setAccountMode(state.accountMode === 'exchange' ? 'paper' : 'exchange');
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                      state.accountMode === 'exchange'
                        ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    Active Desk: {state.accountMode === 'exchange' ? '🟢 Live Exchange' : '📊 Paper Simulation'}
                  </button>
                  <button
                    onClick={() => syncExchangeBalances()}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Refresh balances"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Client-Side Encrypted Security
                </div>
                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                  Keys are encrypted locally in your browser using <strong>AES-GCM-256</strong> with PBKDF2.
                  Your API secret is <strong>never</strong> transmitted to third-party servers.
                </p>
              </div>
            )}

            {/* Error / Success Banners */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Balances Breakdown (if connected) */}
            {exchangeAccount?.connected && exchangeAccount.balances && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                  <span>Verified Exchange Balances</span>
                  <span className="text-[10px] text-zinc-400">
                    Synced {new Date(exchangeAccount.lastSyncAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="bg-zinc-50 border border-black/[0.06] rounded-xl divide-y divide-black/[0.04] max-h-48 overflow-y-auto">
                  {Object.values(exchangeAccount.balances).map((b) => (
                    <div key={b.asset} className="px-3.5 py-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-800">{b.asset}</span>
                      <div className="text-right">
                        <div className="font-mono text-zinc-900 font-medium">
                          {b.free.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                        </div>
                        {b.locked > 0 && (
                          <div className="text-[10px] text-amber-600 font-mono">
                            {b.locked} locked
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Connection / Unlock Form */}
            {configured && !unlocked && !exchangeAccount?.connected ? (
              /* Unlock Existing Vault */
              <form onSubmit={handleUnlock} className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-50 border border-black/[0.06] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
                    <Lock className="w-4 h-4 text-indigo-600" />
                    Encrypted Key Vault is Locked
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Enter your master passphrase to unlock stored Binance credentials.
                  </p>
                  <div>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Master Passphrase..."
                      required
                      className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={testing}
                    className="w-full py-2 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                    Unlock Vault &amp; Connect
                  </button>
                </div>
              </form>
            ) : !exchangeAccount?.connected ? (
              /* Full Setup Form */
              <form onSubmit={handleTestAndConnect} className="space-y-4">
                {/* Step 1: Environment */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-700">1. Target Environment</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEnvironment('testnet')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        environment === 'testnet'
                          ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/10'
                          : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-semibold text-zinc-900">Binance Testnet</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Recommended (Safe Sandbox)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnvironment('mainnet')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        environment === 'mainnet'
                          ? 'border-amber-600 bg-amber-50/50 ring-2 ring-amber-600/10'
                          : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-semibold text-zinc-900">Binance Mainnet</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Real Exchange Funds</div>
                    </button>
                  </div>
                </div>

                {/* Step 2: Keys */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-700">2. API Credentials</label>
                  <div>
                    <label className="text-[10px] font-medium text-zinc-500 block mb-1">API Key</label>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="e.g. vmPUZE6mv9SD5VNHk4HlWFsOr6a..."
                      required
                      className="w-full px-3 py-2 font-mono text-xs border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-zinc-500 block mb-1">API Secret</label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        placeholder="e.g. NhqPtmdSJYdKjVHjA7PZj4..."
                        required
                        className="w-full px-3 py-2 pr-9 font-mono text-xs border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3: Master Passphrase */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-700">3. Master Passphrase</label>
                  <p className="text-[11px] text-zinc-500">
                    Used to encrypt your keys client-side with AES-GCM-256.
                  </p>
                  <div>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Choose Master Passphrase (min 6 chars)..."
                      required
                      className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      value={confirmPassphrase}
                      onChange={(e) => setConfirmPassphrase(e.target.value)}
                      placeholder="Confirm Master Passphrase..."
                      required
                      className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={testing}
                  className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Auditing Permissions &amp; Connecting...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Save Encrypted &amp; Test Connection
                    </>
                  )}
                </button>
              </form>
            ) : null}
          </div>

          {/* Footer Actions */}
          <div className="p-5 border-t border-black/[0.06] bg-zinc-50/50 flex items-center justify-between">
            {configured ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
              >
                Disconnect &amp; Purge Vault
              </button>
            ) : (
              <span className="text-[11px] text-zinc-400">No exchange credentials stored.</span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all shadow-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
