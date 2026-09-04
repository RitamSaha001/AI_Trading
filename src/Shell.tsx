import React, { useEffect, useState } from 'react';
import { useLumen } from './store';
import { ASSETS, Asset } from './types';
import { SettingsModal } from './Settings';
import { ChatDrawer } from './ChatDrawer';
import { DataSourceBadge } from './components/DataSourceBadge';
import { AISafetyModal } from './components/AISafetyModal';
import { ExchangeOnboardingDrawer } from './components/ExchangeOnboardingDrawer';
import { Web3WalletDrawer } from './components/Web3WalletDrawer';
import { OnboardingWizardModal } from './components/OnboardingWizardModal';
import {
  LayoutDashboard,
  BarChart3,
  Briefcase,
  ArrowLeftRight,
  Cpu,
  Bell,
  Settings as SettingsIcon,
  Sparkles,
  Search,
  CheckCircle,
  AlertCircle,
  X,
  Volume2,
  VolumeX,
  Menu,
  Coins,
  Wallet,
  Zap,
} from 'lucide-react';
import { money, portfolioValue, totalPortfolioPnl } from './trading';
import { senseMarketDanger } from './domain/agentic';

export type Route = '/' | '/markets' | '/portfolio' | '/orders' | '/strategies' | '/alerts' | '/wallet' | '/settings';

const VALID_ROUTES: Route[] = ['/', '/markets', '/portfolio', '/orders', '/strategies', '/alerts', '/wallet', '/settings'];

function parseRoute(): Route {
  if (typeof window === 'undefined') return '/';
  if (window.location.hash) {
    const raw = window.location.hash.replace(/^#\/?/, '/');
    const cleanHash = raw.split('?')[0].replace(/\/+$/, '') || '/';
    if (VALID_ROUTES.includes(cleanHash as Route)) return cleanHash as Route;
  }
  let p = (window.location.pathname || '/').replace(/\/AI_Trading/i, '');
  p = p.split('?')[0].replace(/\/+$/, '') || '/';
  return (VALID_ROUTES.includes(p as Route) ? p : '/') as Route;
}

export function useRoute() {
  const [r, setR] = useState<Route>(parseRoute());
  useEffect(() => {
    const on = () => setR(parseRoute());
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
    };
  }, []);
  return r;
}

export function go(path: Route) {
  try {
    const isGhPages = typeof window !== 'undefined' && /github\.io/i.test(window.location.hostname);
    if (isGhPages) {
      window.location.hash = '#' + path;
      return;
    }
    const prefix = window.location.pathname.toLowerCase().includes('/ai_trading') ? '/AI_Trading' : '';
    history.pushState({}, '', prefix + path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    window.location.hash = '#' + path;
  }
}

export function Shell({ children }: { children: React.ReactNode }) {
  const {
    state,
    markets,
    currentDataSource,
    setSelectedAsset,
    activeToast,
    dismissToast,
    setSettings,
    pendingAIProposal,
    pendingAIValidation,
    confirmPendingAIProposal,
    rejectPendingAIProposal,
    chatOpen,
    openChat,
    closeChat,
    accountMode,
    setAccountMode,
    exchangeAccount,
    exchangeDrawerOpen,
    openExchangeDrawer,
    closeExchangeDrawer,
    web3Account,
    web3DrawerOpen,
    openWeb3Drawer,
    closeWeb3Drawer,
    nativeWallet,
  } = useLumen();
  const route = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem('lumen_onboarded_v1');
      if (!done) {
        setOnboardingOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);

  const nav = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/markets', label: 'Markets', icon: BarChart3 },
    { path: '/portfolio', label: 'Portfolio', icon: Briefcase },
    { path: '/orders', label: 'Orders', icon: ArrowLeftRight },
    { path: '/strategies', label: 'Strategies', icon: Cpu },
    { path: '/alerts', label: 'Alerts', icon: Bell },
    { path: '/wallet', label: 'Wallet', icon: Wallet },
  ] as const;

  const mobileBottomNav = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/markets', label: 'Markets', icon: BarChart3 },
    { path: '/orders', label: 'Trade', icon: ArrowLeftRight },
    { path: '/portfolio', label: 'Portfolio', icon: Briefcase },
    { path: '/wallet', label: 'Wallet', icon: Wallet },
  ] as const;

  const unreadAlerts = state.alerts.filter((a) => a.enabled && !a.triggered).length;

  const handleNavClick = (path: Route) => {
    go(path);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#fbfbfc] text-zinc-900 font-sans antialiased selection:bg-indigo-500/20 selection:text-indigo-900 flex flex-col lg:flex-row">
      {/* Mobile Drawer Overlay Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Responsive Sidebar (Fixed on lg, Slide-over on mobile/tablet) */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 sm:w-80 lg:w-64 bg-white/95 lg:bg-white/70 backdrop-blur-2xl border-r border-black/[0.06] p-5 flex flex-col z-50 transition-transform duration-300 ease-out shadow-2xl lg:shadow-[4px_0_24px_rgba(0,0,0,0.02)] ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand & Close button for mobile */}
        <div className="flex items-center justify-between px-2 py-2 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800 text-white flex items-center justify-center shadow-md shadow-black/10 border border-white/20">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-zinc-950">Lumen</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/[0.05] text-zinc-600">
                  100+ MKTS
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">Autonomous Paper Desk</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="space-y-1 flex-1 overflow-y-auto">
          <div className="px-3 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Workspace
          </div>
          {nav.map(({ path, label, icon: Icon }) => {
            const isActive = route === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => handleNavClick(path)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                  isActive
                    ? 'bg-black text-white shadow-sm font-semibold'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-700'
                    }`}
                  />
                  <span>{label}</span>
                </div>
                {label === 'Alerts' && unreadAlerts > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {unreadAlerts}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Portfolio Snapshot Footer Card */}
        <div className="mt-auto space-y-3 pt-4 border-t border-black/[0.05]">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-white/90 to-white/50 border border-black/[0.06] backdrop-blur-md shadow-xs">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
              <span>Paper Valuation</span>
              <span className={`font-semibold ${pnl.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {pnl.amount >= 0 ? '+' : ''}
                {pnl.pct.toFixed(2)}%
              </span>
            </div>
            <div className="text-lg font-bold text-zinc-950 font-mono tracking-tight">
              {money(pv)}
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1">
              <span>Cash: {money(state.cash)}</span>
              <span className="text-[10px] font-semibold text-indigo-600">Active</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOnboardingOpen(true);
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200/70 rounded-xl transition-all shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            <span>Setup Guide &amp; Tour</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04] rounded-xl transition-all"
          >
            <SettingsIcon className="w-4 h-4 text-zinc-400" />
            <span>Preferences &amp; AI Setup</span>
          </button>
        </div>
      </aside>

      {/* Main Container: adjusts left margin on desktop, zero margin on mobile */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Responsive Sticky Header */}
        <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-xl border-b border-black/[0.05] px-3 sm:px-6 md:px-8 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Mobile hamburger + Search */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04] transition-all"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Quick Search */}
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search 108 markets (e.g. SUI, PEPE, TAO)..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const q = search.trim().toUpperCase();
                    const found = ASSETS.find((a) => a === q || a.includes(q));
                    if (found) {
                      setSelectedAsset(found);
                      go('/markets');
                      setSearch('');
                    }
                  }
                }}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-black/[0.03] hover:bg-black/[0.05] focus:bg-white border border-transparent focus:border-black/[0.1] rounded-xl outline-none transition-all placeholder:text-zinc-400 text-zinc-900"
              />
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Triple-Account Desk Switcher (Simulated | Binance | Web3) */}
            <div className="flex items-center bg-black/[0.04] p-0.5 rounded-full border border-black/[0.06]">
              <button
                type="button"
                onClick={() => setAccountMode('paper')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all flex items-center gap-1.5 ${
                  accountMode === 'paper'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                title="Switch to Simulated Paper Desk ($50,000 Sandbox)"
              >
                <span>📊</span>
                <span className="hidden sm:inline">Simulated</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!exchangeAccount?.connected) {
                    openExchangeDrawer();
                  } else {
                    setAccountMode('exchange');
                  }
                }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all flex items-center gap-1.5 ${
                  accountMode === 'exchange'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : exchangeAccount?.connected
                    ? 'text-emerald-700 hover:text-emerald-900'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                title={exchangeAccount?.connected ? 'Switch to Live Binance Account' : 'Connect Binance Exchange'}
              >
                {exchangeAccount?.connected ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="hidden sm:inline">Binance</span>
                    <span className="text-[10px] opacity-80 uppercase font-mono">
                      {exchangeAccount.environment === 'testnet' ? 'Test' : 'Live'}
                    </span>
                  </>
                ) : (
                  <>
                    <Coins className="w-3 h-3 text-amber-500" />
                    <span className="hidden sm:inline">Binance</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!web3Account?.address) {
                    openWeb3Drawer();
                  } else {
                    setAccountMode('web3');
                  }
                }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all flex items-center gap-1.5 ${
                  accountMode === 'web3'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : web3Account?.address
                    ? 'text-indigo-700 hover:text-indigo-900'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                title={
                  web3Account?.address
                    ? `Switch to Self-Custodial Web3 / UPI Desk (${web3Account.address.slice(0, 6)}...${web3Account.address.slice(-4)})`
                    : 'Setup Self-Custodial Web3 / UPI Desk'
                }
              >
                {web3Account?.address ? (
                  <>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        web3Account.isUnlocked ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="hidden sm:inline">Web3</span>
                    <span className="text-[10px] opacity-80 uppercase font-mono">
                      {web3Account.network === 'polygon' ? 'POL' : web3Account.network === 'arbitrum' ? 'ARB' : 'DEV'}
                    </span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3 text-indigo-500" />
                    <span>Web3 / UPI</span>
                  </>
                )}
              </button>

              {web3Account?.address && (
                <button
                  type="button"
                  onClick={openWeb3Drawer}
                  className="px-1.5 py-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-700 transition-colors"
                  title="Web3 Self-Custody Vault & Network Settings"
                >
                  ⚡
                </button>
              )}
              {exchangeAccount?.connected && (
                <button
                  type="button"
                  onClick={openExchangeDrawer}
                  className="px-1.5 py-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-700 transition-colors"
                  title="Exchange Settings & Security Audit"
                >
                  ⚙️
                </button>
              )}
            </div>

            {/* Sovereign Wallet Quick Pill */}
            <button
              type="button"
              onClick={() => go('/wallet')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all flex items-center gap-1.5 ${
                route === '/wallet'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-indigo-50/80 hover:bg-indigo-100 border-indigo-200/80 text-indigo-900'
              }`}
              title="Open Sovereign Fiat & Web3 Wallet"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Wallet:</span>
              <span className="font-mono font-bold">${nativeWallet.balanceUSD.toFixed(2)}</span>
            </button>

            {/* Quick Start Visual Guide Trigger */}
            <button
              type="button"
              onClick={() => setOnboardingOpen(true)}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-full border border-indigo-200/80 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
              title="Launch Interactive Cockpit Walkthrough"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
              <span className="hidden md:inline">Quick Start Guide</span>
            </button>

            {/* Live Data Source Indicator (hidden on smallest screens to preserve space) */}
            <div className="hidden sm:block">
              <DataSourceBadge
                source={currentDataSource}
                isSynthetic={markets[state.selectedAsset]?.isSynthetic}
                lastUpdated={markets[state.selectedAsset]?.lastUpdated}
              />
            </div>

            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setSettings({ soundEnabled: !state.settings.soundEnabled })}
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all"
              title={state.settings.soundEnabled ? 'Mute acoustic feedback' : 'Enable acoustic feedback'}
            >
              {state.settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Notifications Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {state.notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-2xl shadow-xl p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-black/[0.05]">
                    <span className="text-xs font-semibold text-zinc-900">Activity &amp; Signals</span>
                    <span className="text-[10px] text-zinc-400">{state.notifications.length} logged</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-black/[0.04]">
                    {state.notifications.length > 0 ? (
                      state.notifications.slice(0, 10).map((n) => (
                        <div key={n.id} className="p-2.5 text-xs hover:bg-black/[0.02] rounded-xl transition-all">
                          <div className="font-semibold text-zinc-800">{n.title}</div>
                          <p className="text-zinc-500 text-[11px] mt-0.5 leading-tight">{n.body}</p>
                          <span className="text-[10px] text-zinc-400 mt-1 block">
                            {new Date(n.ts).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-zinc-400">No activity yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* AI Nexus Header Trigger - Apple Minimalist Pill */}
            <button
              type="button"
              onClick={() => (chatOpen ? closeChat() : openChat())}
              className="group relative flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 bg-white/70 hover:bg-white/95 border border-black/[0.08] hover:border-black/[0.15] rounded-full shadow-xs backdrop-blur-xl transition-all active:scale-95"
            >
              <div className="relative flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-zinc-900 transition-transform group-hover:rotate-12" />
              </div>
              <span className="tracking-tight hidden sm:inline">Nexus</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-3 sm:p-5 md:p-8 max-w-7xl w-full mx-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Visible only on mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border-t border-black/[0.08] px-2 py-1.5 flex items-center justify-around lg:hidden">
        {mobileBottomNav.map(({ path, label, icon: Icon }) => {
          const isActive = route === path;
          return (
            <button
              key={path}
              type="button"
              onClick={() => go(path)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${
                isActive ? 'text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-zinc-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : ''}`} />
              <span className="text-[10px] tracking-tight">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Floating Lumen Nexus Capsule Button - Apple Siri Intelligence Capsule */}
      {(() => {
        const danger = senseMarketDanger(state, markets);
        return (
          <button
            type="button"
            onClick={() => (chatOpen ? closeChat() : openChat())}
            className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-30 flex items-center gap-3 px-4 py-2.5 bg-zinc-950/90 text-white backdrop-blur-2xl border border-white/20 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.3)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 group"
          >
            <div className="relative flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center relative z-10">
                <Sparkles className="w-3.5 h-3.5 text-white group-hover:scale-110 transition-transform" />
              </div>
              <div className="absolute inset-0 rounded-full siri-aurora-glow scale-150 pointer-events-none" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold tracking-tight text-white flex items-center gap-1.5">
                Nexus Intelligence
              </span>
              <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                {danger.dangerLevel === 'CRITICAL' ? (
                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    Critical Hazard
                  </span>
                ) : danger.dangerLevel === 'HIGH' ? (
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Elevated Risk
                  </span>
                ) : (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Autonomous Quant
                  </span>
                )}
              </span>
            </div>
          </button>
        );
      })()}

      {/* Settings Modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Onboarding Visual Wizard Modal */}
      <OnboardingWizardModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />

      {/* Nexus AI Drawer */}
      <ChatDrawer open={chatOpen} onClose={closeChat} />

      {/* Binance Exchange Onboarding Drawer */}
      <ExchangeOnboardingDrawer open={exchangeDrawerOpen} onClose={closeExchangeDrawer} />

      {/* Web3 Self-Custodial Desk Drawer */}
      <Web3WalletDrawer open={web3DrawerOpen} onClose={closeWeb3Drawer} onOpenUPI={() => go('/wallet')} />

      {/* AI Safety Authorization Gate Modal */}
      {pendingAIProposal && pendingAIValidation && (
        <AISafetyModal
          proposal={pendingAIProposal}
          validation={pendingAIValidation}
          onConfirm={confirmPendingAIProposal}
          onReject={rejectPendingAIProposal}
        />
      )}

      {/* Toast Notification Container */}
      {activeToast && (
        <div className="fixed bottom-20 lg:bottom-6 left-3 right-3 sm:left-6 sm:right-auto z-50 max-w-md bg-white/95 backdrop-blur-2xl border border-black/[0.08] shadow-2xl rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <div className="mt-0.5">
            {activeToast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-indigo-500" />
            )}
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-zinc-900">{activeToast.title}</h4>
            <p className="text-xs text-zinc-600 mt-0.5">{activeToast.message}</p>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
