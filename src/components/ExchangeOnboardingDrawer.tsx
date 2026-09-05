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
import { ApiClient } from '../services/apiClient';

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

  // Upstox multi-broker state
  const [selectedBroker, setSelectedBroker] = useState<'binance' | 'upstox'>('binance');
  const [upstoxToken, setUpstoxToken] = useState('');
  const [upstoxAccount, setUpstoxAccount] = useState<any>(null);
  const [ipDiagnostics, setIpDiagnostics] = useState<any>(null);

  const configured = isVaultConfigured();
  const unlocked = isVaultUnlocked();

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      setSuccessMessage(null);
      if (exchangeAccount?.environment) {
        setEnvironment(exchangeAccount.environment);
      }
      ApiClient.getExchangeAccount('upstox')
        .then((res) => setUpstoxAccount(res.data?.account?.connected ? res.data.account : null))
        .catch(() => setUpstoxAccount(null));
      ApiClient.getUpstoxIpDiagnostics()
        .then((res) => setIpDiagnostics(res.data?.diagnostics || null))
        .catch(() => {});
    }
  }, [open, exchangeAccount]);

  const handleConnectUpstoxToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upstoxToken.trim()) {
      setErrorMessage('Please enter an Upstox access token.');
      return;
    }
    setTesting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await ApiClient.connectExchange({
        broker: 'upstox',
        accessToken: upstoxToken.trim(),
      });
      if (res.data?.audit?.connected) {
        setSuccessMessage('Upstox connected and credentials verified!');
        setUpstoxToken('');
        const acc = await ApiClient.getExchangeAccount('upstox');
        setUpstoxAccount(acc.data?.account || null);
      } else {
        setErrorMessage(res.data?.message || res.error || 'Connection failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect Upstox');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnectUpstox = async () => {
    if (confirm('Disconnect Upstox exchange and wipe credentials?')) {
      try {
        await ApiClient.disconnectExchange('upstox');
        setUpstoxAccount(null);
        setSuccessMessage('Upstox disconnected and credentials cleared.');
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to disconnect Upstox');
      }
    }
  };

  const handleStartUpstoxOAuth = async () => {
    try {
      const res = await ApiClient.getUpstoxAuthUrl();
      if (res.data?.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate Upstox OAuth URL');
    }
  };

  const handleRefreshUpstox = async () => {
    setTesting(true);
    setErrorMessage(null);
    try {
      const acc = await ApiClient.getExchangeAccount('upstox');
      setUpstoxAccount(acc.data?.account?.connected ? acc.data.account : null);
      const diag = await ApiClient.getUpstoxIpDiagnostics();
      setIpDiagnostics(diag.data?.diagnostics || null);
      setSuccessMessage('Upstox connection refreshed.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to refresh Upstox state');
    } finally {
      setTesting(false);
    }
  };

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
        void ApiClient.runReconciliation();
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
                  Broker Execution Bridge
                </h2>
                <p className="text-[11px] text-zinc-500">Multi-venue execution, authentication &amp; balance sync</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-black/[0.04] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Broker Selection Tabs */}
          <div className="px-6 py-3 bg-zinc-50/50 border-b border-black/[0.06]">
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-200/60 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setSelectedBroker('binance');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  selectedBroker === 'binance'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${exchangeAccount?.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                Binance (Crypto)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedBroker('upstox');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  selectedBroker === 'upstox'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${upstoxAccount?.connected ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                Upstox (NSE/BSE)
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
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

            {selectedBroker === 'binance' ? (
              <div className="space-y-6">
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
        ) : (
          /* Upstox Multi-Broker View */
          <div className="space-y-6">
            {upstoxAccount?.connected ? (
              /* Connected Upstox View */
              <div className="p-4 rounded-2xl bg-zinc-900 text-white shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Connected to Upstox ({upstoxAccount.environment?.toUpperCase() || 'PROD'})
                    </span>
                  </div>
                  {upstoxAccount.latencyMs !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-400 bg-white/10 px-2 py-0.5 rounded-full">
                      {upstoxAccount.latencyMs}ms ping
                    </span>
                  )}
                </div>

                <div className="text-xs text-zinc-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    UCC: <strong className="font-mono text-white">{upstoxAccount.accountId || 'Verified'}</strong>
                    {upstoxAccount.accountName ? ` (${upstoxAccount.accountName})` : ''}
                  </span>
                </div>

                <div className="text-[11px] text-zinc-400 bg-white/5 p-2.5 rounded-xl border border-white/10 space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Static IP Verification:</span>
                    <span className={ipDiagnostics?.status === 'PASS' ? 'text-emerald-400 font-medium' : (ipDiagnostics?.status === 'BYPASS_SANDBOX' ? 'text-sky-400 font-medium' : 'text-amber-400 font-medium')}>
                      {ipDiagnostics?.status === 'PASS' ? `✓ Verified (${ipDiagnostics.outboundIp})` : (ipDiagnostics?.status === 'BYPASS_SANDBOX' ? 'ℹ Sandbox (Bypass)' : (ipDiagnostics?.outboundIp ? `Mismatch (${ipDiagnostics.outboundIp})` : 'Not Probed'))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Daily Session Validity:</span>
                    <span className={upstoxAccount.tokenHealth?.status === 'EXPIRED' ? 'text-rose-400 font-semibold' : (upstoxAccount.tokenHealth?.status === 'EXPIRING_SOON' ? 'text-amber-400 font-medium' : 'text-zinc-200')}>
                      {upstoxAccount.tokenHealth?.status === 'EXPIRED' ? 'Expired at 03:30 AM IST' : (upstoxAccount.tokenHealth?.timeRemainingHuman ? `${upstoxAccount.tokenHealth.timeRemainingHuman} remaining` : 'Active (Daily IST Expiry)')}
                    </span>
                  </div>
                </div>

                {/* Token Expiring Soon or Expired Warning Banner */}
                {(upstoxAccount.tokenHealth?.status === 'EXPIRING_SOON' || upstoxAccount.tokenHealth?.status === 'EXPIRED') && (
                  <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      {upstoxAccount.tokenHealth.warning || 'Upstox session expiring soon.'}
                    </div>
                    <button
                      type="button"
                      onClick={handleStartUpstoxOAuth}
                      className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Re-authenticate with Upstox Now
                    </button>
                  </div>
                )}

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRefreshUpstox}
                    disabled={testing}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
                    Refresh Session
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectUpstox}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-all"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              /* Disconnected Upstox View */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    Server-Side AES-256-GCM OAuth Protection
                  </div>
                  <p className="text-[11px] text-indigo-950/80 leading-relaxed">
                    Upstox tokens are exchanged and encrypted exclusively on your backend server.
                    Zero API secrets are ever exposed to the client or browser storage.
                  </p>
                </div>

                {/* Static IP Diagnostic Banner */}
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs space-y-2">
                  <div className="flex items-center justify-between font-medium text-zinc-800">
                    <span>Static IP Health</span>
                    <button
                      type="button"
                      onClick={handleRefreshUpstox}
                      disabled={testing}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
                      Check Outbound IP
                    </button>
                  </div>
                  {ipDiagnostics ? (
                    <div className="text-[11px] font-mono text-zinc-600 flex items-center justify-between">
                      <span>Outbound IP: {ipDiagnostics.outboundIp || 'Unknown'}</span>
                      <span className={ipDiagnostics.matches ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                        {ipDiagnostics.matches ? '✓ Static IP Registered' : 'Not Enforced / Diagnostic'}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-500">
                      Static IP check not run yet. Click to verify outbound server IP.
                    </div>
                  )}
                </div>

                {/* Safety Gate Warning */}
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Phase 2 Safety Gate Active
                  </div>
                  <p className="text-[11px] text-amber-900/90 leading-relaxed">
                    Upstox live order placement is disabled by default (<code className="font-mono text-amber-950">UPSTOX_LIVE_TRADING_ENABLED = false</code>).
                    Paper trading simulation, real-time balance sync, and market data queries are fully functional.
                  </p>
                </div>

                {/* Connect Option 1: Upstox OAuth Login */}
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <div className="text-xs font-semibold text-zinc-900">
                    Option 1: Connect via Upstox OAuth Login
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Authorize Lumen directly via the official Upstox OAuth 2.0 flow.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartUpstoxOAuth}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Authorize with Upstox
                  </button>
                </div>

                {/* Connect Option 2: Direct Access Token Entry */}
                <form onSubmit={handleConnectUpstoxToken} className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <div className="text-xs font-semibold text-zinc-900">
                    Option 2: Enter Daily Access Token
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    If generated via CLI or Upstox developer console, paste your session token below:
                  </p>
                  <div>
                    <input
                      type="password"
                      value={upstoxToken}
                      onChange={(e) => setUpstoxToken(e.target.value)}
                      placeholder="Paste Upstox access token..."
                      className="w-full px-3 py-2 font-mono text-xs border border-zinc-200 rounded-xl focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={testing || !upstoxToken.trim()}
                    className="w-full py-2 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    Connect &amp; Encrypt Token
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-5 border-t border-black/[0.06] bg-zinc-50/50 flex items-center justify-between">
        {selectedBroker === 'binance' ? (
          configured ? (
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
            >
              Disconnect &amp; Purge Vault
            </button>
          ) : (
            <span className="text-[11px] text-zinc-400">No Binance credentials stored.</span>
          )
        ) : (
          upstoxAccount?.connected ? (
            <button
              type="button"
              onClick={handleDisconnectUpstox}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
            >
              Disconnect Upstox
            </button>
          ) : (
            <span className="text-[11px] text-zinc-400">No Upstox session stored.</span>
          )
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
