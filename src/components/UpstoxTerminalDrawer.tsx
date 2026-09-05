import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Lock,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Globe,
  LogOut,
} from 'lucide-react';
import { useLumen } from '../store';
import { ApiClient } from '../services/apiClient';
import { moneyINR } from '../domain/portfolio';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UpstoxTerminalDrawer({ open, onClose }: Props) {
  const {
    upstoxAccount,
    syncUpstoxAccount,
    disconnectUpstox,
    setAccountMode,
  } = useLumen();

  const [dailyToken, setDailyToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'holdings' | 'positions'>('overview');

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      setSuccessMessage(null);
      syncUpstoxAccount();
    }
  }, [open, syncUpstoxAccount]);

  const handleStartOAuth = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const res = await ApiClient.getUpstoxAuthUrl(redirectUri);
      if (res.ok && res.data?.authUrl) {
        window.location.href = res.data.authUrl;
      } else {
        setErrorMessage(res.error || 'Failed to generate Upstox OAuth authorization URL.');
        setLoading(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to connect to Upstox authentication service.');
      setLoading(false);
    }
  };

  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyToken.trim()) {
      setErrorMessage('Please paste an Upstox access token.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await ApiClient.connectExchange({
        broker: 'upstox',
        accessToken: dailyToken.trim(),
      });
      if (res.ok && res.data?.audit?.connected) {
        setSuccessMessage('Upstox connected and session credentials securely encrypted!');
        setDailyToken('');
        await syncUpstoxAccount();
        setAccountMode('upstox');
      } else {
        setErrorMessage(res.error || 'Upstox rejected access token. Please verify token validity.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with server gateway.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await syncUpstoxAccount();
      setSuccessMessage('Upstox account state, funds, and positions refreshed.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to refresh Upstox state.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Upstox and purge stored session credentials?')) return;
    setLoading(true);
    try {
      await disconnectUpstox();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to disconnect Upstox.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const isConnected = Boolean(upstoxAccount?.connected);
  const tokenHealth = upstoxAccount?.tokenHealth;
  const ipDiag = upstoxAccount?.ipDiagnostics;
  const funds = upstoxAccount?.funds;
  const holdings = upstoxAccount?.holdings || [];
  const positions = upstoxAccount?.positions || [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-zinc-200 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-950 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center font-bold text-white shadow-md text-base tracking-wider">
              UP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Upstox Trading Terminal</h2>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-semibold ${
                  isConnected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {isConnected ? (upstoxAccount?.environment === 'production' ? 'NSE PROD' : 'SANDBOX') : 'OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Authoritative Indian Equities &amp; F&amp;O Brokerage Gateway
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status Banners */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {isConnected ? (
            /* Connected State */
            <div className="space-y-4">
              {/* Account Overview Card */}
              <div className="p-4 rounded-2xl bg-zinc-900 text-white space-y-3 shadow-lg border border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Live Broker Connected
                    </span>
                  </div>
                  {upstoxAccount?.latencyMs !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-400 bg-white/10 px-2 py-0.5 rounded-full">
                      {upstoxAccount.latencyMs}ms ping
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Client Code (UCC)</span>
                    <span className="text-sm font-mono font-bold text-white">
                      {upstoxAccount?.accountId || 'Active'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Account Name</span>
                    <span className="text-sm font-semibold text-white truncate block">
                      {upstoxAccount?.accountName || 'Authorized User'}
                    </span>
                  </div>
                </div>

                {/* Funds Quick Snapshot */}
                <div className="pt-2 border-t border-zinc-800 grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Available Margin</span>
                    <span className="text-sm font-bold font-mono text-emerald-400">
                      {moneyINR(funds?.availableCash || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Used Margin</span>
                    <span className="text-sm font-bold font-mono text-amber-400">
                      {moneyINR(funds?.usedMargin || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Total Equity</span>
                    <span className="text-sm font-bold font-mono text-white">
                      {moneyINR(funds?.totalEquity || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Token Session Health & 03:30 AM IST Expiry */}
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-orange-600" />
                    <span>Daily Session Validity (IST Expiry)</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    tokenHealth?.status === 'HEALTHY'
                      ? 'bg-emerald-100 text-emerald-800'
                      : tokenHealth?.status === 'EXPIRING_SOON'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {tokenHealth?.status || 'HEALTHY'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-600 flex items-center justify-between">
                  <span>Daily Expiry: <strong>03:30 AM IST</strong></span>
                  <span>{tokenHealth?.timeRemainingHuman || 'Session Active'}</span>
                </div>
                {tokenHealth?.status === 'EXPIRING_SOON' && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                    <span>Upstox session expiring soon.</span>
                    <button
                      type="button"
                      onClick={handleStartOAuth}
                      className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-semibold"
                    >
                      Re-auth Now
                    </button>
                  </div>
                )}
              </div>

              {/* Static Egress IP Health Widget */}
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs">
                <div className="flex items-center justify-between font-medium text-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-indigo-600" />
                    <span>Static Egress IP Verification</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={loading}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    Test IP
                  </button>
                </div>
                <div className="text-[11px] font-mono text-zinc-600 flex items-center justify-between">
                  <span>Outbound IP: <strong>{ipDiag?.outboundIp || 'Probing...'}</strong></span>
                  <span className={ipDiag?.status === 'PASS' ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                    {ipDiag?.status === 'PASS' ? '✓ Static IP Verified' : (ipDiag?.status === 'BYPASS_SANDBOX' ? 'Sandbox Bypass' : 'Diagnostic Mode')}
                  </span>
                </div>
              </div>

              {/* Tabs for Holdings & Positions */}
              <div className="flex border-b border-zinc-200 gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`pb-2 transition-colors ${activeTab === 'overview' ? 'border-b-2 border-zinc-900 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Margins &amp; Controls
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('holdings')}
                  className={`pb-2 transition-colors ${activeTab === 'holdings' ? 'border-b-2 border-zinc-900 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Holdings (CNC) ({holdings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('positions')}
                  className={`pb-2 transition-colors ${activeTab === 'positions' ? 'border-b-2 border-zinc-900 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Positions (MIS) ({positions.length})
                </button>
              </div>

              {activeTab === 'holdings' && (
                <div className="space-y-2">
                  {holdings.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-4 text-center">No long-term equity delivery holdings found.</p>
                  ) : (
                    <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                      {holdings.map((h, i) => (
                        <div key={i} className="p-3 bg-white flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-zinc-900">{h.symbol}</span>
                            <span className="text-[11px] text-zinc-400 block">{h.quantity} shares @ {moneyINR(Number(h.averagePrice) || 0)}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-semibold">{moneyINR((Number(h.quantity) || 0) * (Number(h.currentPrice || h.averagePrice) || 0))}</span>
                            <span className={`text-[11px] block ${Number(h.pnl) >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}`}>
                              {Number(h.pnl) >= 0 ? '+' : ''}{moneyINR(Number(h.pnl) || 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'positions' && (
                <div className="space-y-2">
                  {positions.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-4 text-center">No open intraday or derivatives positions.</p>
                  ) : (
                    <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                      {positions.map((p, i) => (
                        <div key={i} className="p-3 bg-white flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-900">{p.symbol}</span>
                              <span className="text-[10px] px-1.5 py-0.2 bg-zinc-100 text-zinc-600 rounded uppercase">{p.product}</span>
                            </div>
                            <span className="text-[11px] text-zinc-400 block">{p.quantity} qty @ {moneyINR(Number(p.averagePrice) || 0)}</span>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-semibold ${Number(p.unrealizedPnl) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {Number(p.unrealizedPnl) >= 0 ? '+' : ''}{moneyINR(Number(p.unrealizedPnl) || 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'overview' && (
                <div className="space-y-3">
                  {/* Safety Gate Warning Banner */}
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Production Safety Invariant Enforced
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900/90">
                      Live real-money order placement is guarded by default (<code className="font-mono font-semibold">UPSTOX_LIVE_TRADING_ENABLED = false</code>). Paper trading on Indian equities executes deterministically with 0.05 tick size.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={loading}
                      className="flex-1 py-2 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      Refresh Session
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={loading}
                      className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Disconnected State */
            <div className="space-y-4">
              {/* AES-256 OAuth Protection Card */}
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Enterprise AES-256-GCM Vault Protection
                </div>
                <p className="text-[11px] text-indigo-950/80 leading-relaxed">
                  Connect your Upstox account securely. OAuth authorization and session credentials are encrypted exclusively on your backend server. Zero API secrets are ever stored in the browser.
                </p>
              </div>

              {/* Option 1: Official OAuth */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="text-xs font-bold text-zinc-900 flex items-center justify-between">
                  <span>Option 1: Official Upstox OAuth 2.0 Login</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">Recommended</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Authorize directly via Upstox with two-factor authentication. Automatically creates an encrypted server session expiring at 03:30 AM IST.
                </p>
                <button
                  type="button"
                  onClick={handleStartOAuth}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Connect with Upstox Account
                </button>
              </div>

              {/* Option 2: Daily Token */}
              <form onSubmit={handleConnectToken} className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="text-xs font-bold text-zinc-900">
                  Option 2: Enter Daily Developer Access Token
                </div>
                <p className="text-[11px] text-zinc-500">
                  If generated via Upstox developer console or CLI, paste your daily token below for instant backend encryption:
                </p>
                <div>
                  <input
                    type="password"
                    value={dailyToken}
                    onChange={(e) => setDailyToken(e.target.value)}
                    placeholder="Paste Upstox access token..."
                    className="w-full px-3 py-2 font-mono text-xs border border-zinc-200 rounded-xl focus:border-zinc-900 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !dailyToken.trim()}
                  className="w-full py-2 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  Encrypt &amp; Connect Token
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-xs">
          <span className="text-[11px] text-zinc-400">
            {isConnected ? `UCC: ${upstoxAccount?.accountId || 'Active'}` : 'Not connected'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
