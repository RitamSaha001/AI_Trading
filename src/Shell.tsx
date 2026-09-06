import React, { useEffect, useState } from 'react';
import { useLumen } from './store';
import { ASSETS, Asset } from './types';
import { SettingsModal } from './Settings';
import { ChatDrawer } from './ChatDrawer';
import { DataSourceBadge } from './components/DataSourceBadge';
import { OperationalHealthBanner } from './components/OperationalHealthBanner';
import { AISafetyModal } from './components/AISafetyModal';
import { OnboardingWizardModal } from './components/OnboardingWizardModal';
import { AuthModal } from './components/AuthModal';
import { UserProfileDrawer } from './components/UserProfileDrawer';
import { GrievanceModal } from './components/GrievanceModal';
import { LegalFooter } from './components/LegalFooter';
import { UpstoxTerminalDrawer } from './components/UpstoxTerminalDrawer';
import { LiveOrderConfirmationModal } from './components/LiveOrderConfirmationModal';
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
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  X,
  Volume2,
  VolumeX,
  Menu,
  Coins,
  Wallet,
  Zap,
  User,
  ShieldAlert,
  LifeBuoy,
  Lock,
} from 'lucide-react';
import { money, moneyINR, portfolioValue, totalPortfolioPnl } from './trading';
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
    nativeWallet,
    authSession,
    user,
    isAuthenticated,
    openAuthModal,
    openUserProfileDrawer,
    openGrievanceModal,
    upstoxAccount,
    upstoxDrawerOpen,
    openUpstoxDrawer,
    closeUpstoxDrawer,
    syncUpstoxAccount,
    liveOrderProposal,
    liveOrderConfirmationOpen,
    closeLiveOrderConfirmation,
    confirmLiveOrderExecution,
  } = useLumen();
  const route = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Intercept Upstox OAuth redirect: /?code=...&state=... or #/?code=...
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code') || new URLSearchParams(window.location.hash.split('?')[1] || '').get('code');
      const stateParam = url.searchParams.get('state') || new URLSearchParams(window.location.hash.split('?')[1] || '').get('state');

      if (code) {
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        window.history.replaceState({}, document.title, url.pathname + (url.hash ? url.hash.split('?')[0] : ''));

        import('./services/apiClient').then(({ ApiClient }) => {
          ApiClient.submitUpstoxCallback(code, stateParam || '')
            .then(async (res) => {
              if (res.ok) {
                setAccountMode('upstox');
                await syncUpstoxAccount();
              }
            })
            .catch((err) => {
              console.error('Failed to exchange Upstox OAuth code:', err);
            });
        });
      }
    } catch {
      // ignore
    }
  }, [setAccountMode, syncUpstoxAccount]);

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
                  NSE / BSE
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">Indian Equities &amp; F&amp;O Desk</p>
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
              <span>{accountMode === 'upstox' ? 'Upstox Valuation' : 'Simulated Valuation'}</span>
              <span className={`font-semibold ${pnl.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {pnl.amount >= 0 ? '+' : ''}
                {pnl.pct.toFixed(2)}%
              </span>
            </div>
            <div className="text-lg font-bold text-zinc-950 font-mono tracking-tight">
              {moneyINR(pv)}
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1">
              <span>Cash: {moneyINR(state.cash)}</span>
              <span className="text-[10px] font-semibold text-indigo-600">{accountMode === 'upstox' ? 'NSE Live' : 'Sandbox'}</span>
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
                placeholder="Search NSE/BSE & Global (e.g. RELIANCE, TCS, INFY)..."
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
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Professional Segmented Desk Switcher */}
            <div className="inline-flex items-center p-0.5 rounded-xl bg-zinc-100/90 border border-black/[0.06] shrink-0">
              <button
                type="button"
                onClick={() => setAccountMode('paper')}
                className={`px-2.5 py-1 text-[11px] rounded-lg transition-all flex items-center gap-1.5 font-medium ${
                  accountMode === 'paper'
                    ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                title="Switch to Simulated Paper Sandbox"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>Paper</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!upstoxAccount?.connected) {
                    openUpstoxDrawer();
                  } else {
                    setAccountMode('upstox');
                  }
                }}
                className={`px-2.5 py-1 text-[11px] rounded-lg transition-all flex items-center gap-1.5 font-medium ${
                  accountMode === 'upstox'
                    ? 'bg-white text-zinc-950 font-semibold shadow-2xs'
                    : upstoxAccount?.connected
                    ? 'text-indigo-600 hover:text-indigo-900'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                title={upstoxAccount?.connected ? 'Upstox (NSE / BSE Live Desk)' : 'Connect Upstox Demat'}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    upstoxAccount?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                  }`}
                />
                <span>Upstox</span>
                <span className="hidden md:inline text-[10px] text-zinc-400 font-normal">NSE</span>
              </button>
            </div>

            {/* Funds Pill */}
            <button
              type="button"
              onClick={() => go('/wallet')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] rounded-xl border transition-all flex items-center gap-1.5 shrink-0 ${
                route === '/wallet'
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs font-semibold'
                  : 'bg-white hover:bg-zinc-50 border-black/[0.08] text-zinc-700 shadow-2xs'
              }`}
              title="Funds, Margin & Capital Treasury"
            >
              <Wallet className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="font-mono font-semibold text-zinc-900 text-[11px] sm:text-xs">
                {accountMode === 'upstox' && upstoxAccount?.funds
                  ? moneyINR(upstoxAccount.funds.availableCash)
                  : moneyINR(state.cash)}
              </span>
            </button>

            {/* Authoritative Operational Health & Safety Indicator (Single clean status pill) */}
            <div className="hidden sm:block shrink-0">
              <OperationalHealthBanner accountMode={state.accountMode} />
            </div>

            {/* Notifications Popover */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all"
                title="Notifications & Execution Signals"
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

            {/* User Account / Profile Pill */}
            {isAuthenticated && user ? (
              <button
                type="button"
                onClick={openUserProfileDrawer}
                className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded-xl border border-black/[0.08] hover:border-black/[0.15] bg-white hover:bg-zinc-50 shadow-2xs transition-all active:scale-95 shrink-0"
                title={`${user.displayName} (${user.email})`}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover border border-black/10 shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-zinc-900 text-white text-[10px] sm:text-[11px] font-bold flex items-center justify-center shrink-0">
                    {user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <span className="text-xs font-semibold text-zinc-800 max-w-[70px] sm:max-w-[85px] truncate hidden sm:inline">
                  {user.displayName ? user.displayName.split(' ')[0] : user.email?.split('@')[0]}
                </span>
                {user.isEmergencyLocked ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 hidden md:inline" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={openAuthModal}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-2xs transition-all active:scale-95 shrink-0"
                title="Sign In for Isolated Account"
              >
                <User className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            )}

            {/* AI Nexus Header Trigger */}
            <button
              type="button"
              onClick={() => (chatOpen ? closeChat() : openChat())}
              className="group flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold text-zinc-900 bg-white hover:bg-zinc-50 border border-black/[0.08] hover:border-black/[0.15] rounded-xl shadow-2xs transition-all active:scale-95 shrink-0"
              title="Open Nexus AI Cockpit"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 group-hover:rotate-12 transition-transform" />
              <span className="font-medium hidden sm:inline">Nexus</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>
          </div>
        </header>

        {/* Persistent Emergency Freeze Banner (Only shown if emergency freeze is explicitly active) */}
        {user?.isEmergencyLocked && (
          <div className="bg-rose-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-white animate-pulse" />
              <span>
                <strong>EMERGENCY FREEZE ENGAGED:</strong> All trade executions and automated strategies are locked. Capital is safeguarded.
              </span>
            </div>
            <button
              type="button"
              onClick={openUserProfileDrawer}
              className="px-2.5 py-1 bg-white text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-lg shadow-2xs transition-colors"
            >
              Open Security Drawer
            </button>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 p-3 sm:p-5 md:p-8 max-w-7xl w-full mx-auto overflow-x-hidden">
          {children}
        </main>

        {/* Institutional Statutory & Compliance Footer */}
        <LegalFooter />
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

      {/* Upstox Terminal Drawer */}
      <UpstoxTerminalDrawer open={upstoxDrawerOpen} onClose={closeUpstoxDrawer} />


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

      {/* Google / Email Enterprise Authentication Modal */}
      <AuthModal />

      {/* Authenticated User Profile & Security Drawer */}
      <UserProfileDrawer />

      {/* Formal Grievance Redressal & Dispute Ticket Desk Modal */}
      <GrievanceModal />

      {/* SEBI Two-Step Live Order Confirmation Modal */}
      <LiveOrderConfirmationModal
        isOpen={liveOrderConfirmationOpen}
        proposal={liveOrderProposal}
        onConfirm={confirmLiveOrderExecution}
        onClose={closeLiveOrderConfirmation}
      />
    </div>
  );
}
