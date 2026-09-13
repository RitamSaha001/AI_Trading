import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { IndianBrokerTerminalDrawer } from './components/IndianBrokerTerminalDrawer';
import { LiveOrderConfirmationModal } from './components/LiveOrderConfirmationModal';
import { ErrorBoundary } from './components/ErrorBoundary';
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
    clearNotifications,
    triggerToast,
    liveOrderProposal,
    liveOrderConfirmationOpen,
    closeLiveOrderConfirmation,
    confirmLiveOrderExecution,
  } = useLumen();
  const route = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [indianBrokerDrawerOpen, setIndianBrokerDrawerOpen] = useState(false);

  // Apple Gliding Liquid Dock Navigation State & Refs
  const navContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });
  const [dropTab, setDropTab] = useState<Route | null>(null);
  const [dropKey, setDropKey] = useState(0);

  // Apple Gliding Desk Switcher State & Refs
  const deskContainerRef = useRef<HTMLDivElement>(null);
  const paperBtnRef = useRef<HTMLButtonElement>(null);
  const upstoxBtnRef = useRef<HTMLButtonElement>(null);
  const [deskPill, setDeskPill] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });
  const [deskDropMode, setDeskDropMode] = useState<string | null>(null);
  const [deskDropKey, setDeskDropKey] = useState(0);

  const updateDockPill = useCallback(() => {
    const container = navContainerRef.current;
    const activeEl = tabRefs.current[route];
    if (!container || !activeEl) return;

    setIndicatorStyle({
      left: activeEl.offsetLeft,
      top: activeEl.offsetTop,
      width: activeEl.offsetWidth,
      height: activeEl.offsetHeight,
      ready: true,
    });
  }, [route]);

  const updateDeskPill = useCallback(() => {
    const container = deskContainerRef.current;
    const activeEl = accountMode === 'paper' ? paperBtnRef.current : upstoxBtnRef.current;
    if (!container || !activeEl) return;

    setDeskPill({
      left: activeEl.offsetLeft,
      top: activeEl.offsetTop,
      width: activeEl.offsetWidth,
      height: activeEl.offsetHeight,
      ready: true,
    });
  }, [accountMode]);

  useEffect(() => {
    updateDockPill();
    setDropTab(route);
    setDropKey((prev) => prev + 1);
    const timer = setTimeout(updateDockPill, 60);
    return () => clearTimeout(timer);
  }, [route, updateDockPill]);

  useEffect(() => {
    updateDeskPill();
    setDeskDropMode(accountMode);
    setDeskDropKey((prev) => prev + 1);
    const timer = setTimeout(updateDeskPill, 60);
    return () => clearTimeout(timer);
  }, [accountMode, updateDeskPill]);

  useEffect(() => {
    const handleResize = () => {
      updateDockPill();
      updateDeskPill();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateDockPill, updateDeskPill]);

  const handleTabClick = (path: Route) => {
    setDropTab(path);
    setDropKey((prev) => prev + 1);
    go(path);
  };

  const handleDeskClick = (mode: 'paper' | 'upstox') => {
    setDeskDropMode(mode);
    setDeskDropKey((prev) => prev + 1);
    if (mode === 'upstox') {
      if (!upstoxAccount?.connected) {
        openUpstoxDrawer();
      } else {
        setAccountMode('upstox');
      }
    } else {
      setAccountMode('paper');
    }
  };

  // Global Keyboard Shortcut: ⌘K or Ctrl+K to jump to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

        // Proactively open the Upstox Terminal Drawer so the user has immediate visual feedback
        openUpstoxDrawer();
        triggerToast('Authenticating Upstox', 'Connecting Demat session for 87BSJ2 (RAJASREE SAHA)...', 'info');

        const redirectUri = window.location.origin + window.location.pathname;
        import('./services/apiClient').then(({ ApiClient }) => {
          ApiClient.submitUpstoxCallback(code, stateParam || '', redirectUri)
            .then(async (res) => {
              if (res.ok) {
                setAccountMode('upstox');
                await syncUpstoxAccount();
                triggerToast('Upstox Live Connected', 'Demat 87BSJ2 (RAJASREE SAHA) authenticated for live trading.', 'success');
              } else {
                openUpstoxDrawer();
                const isSegment = res.data?.code === 'UPSTOX_SEGMENT_INACTIVE' || /No segments for these users are active/i.test(res.error || '');
                if (isSegment) {
                  triggerToast(
                    'Upstox Segment Pending',
                    'Demat 87BSJ2 is awaiting segment activation from Upstox app. Simulation mode active.',
                    'warn'
                  );
                } else {
                  triggerToast('Upstox Connection Failed', res.error || 'Failed to exchange authorization code.', 'warn');
                }
              }
            })
            .catch((err) => {
              console.error('Failed to exchange Upstox OAuth code:', err);
              openUpstoxDrawer();
              triggerToast('Upstox Connection Error', err.message || 'Network error during Upstox token exchange.', 'warn');
            });
        });
      }
    } catch {
      // ignore
    }
  }, [openUpstoxDrawer, setAccountMode, syncUpstoxAccount, triggerToast]);

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

  useEffect(() => {
    if (accountMode === 'upstox' && route === '/strategies') {
      go('/');
    }
  }, [accountMode, route]);

  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);

  const effectiveCash = accountMode === 'upstox'
    ? (upstoxAccount?.funds?.availableCash ??
        (upstoxAccount?.balances?.INR?.free !== undefined
          ? Number(upstoxAccount.balances.INR.free)
          : state.cash))
    : state.cash;

  const visibleNotifications = accountMode === 'upstox'
    ? state.notifications.filter(
        (n) => !n.body.match(/SOL|BTC|ETH|BNB|XRP|DOGE|USDT|USDC/i) && !n.title.match(/SOL|BTC|ETH|BNB|XRP|DOGE/i)
      )
    : state.notifications;

  const baseNav = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/markets', label: 'Markets', icon: BarChart3 },
    { path: '/portfolio', label: 'Portfolio', icon: Briefcase },
    { path: '/orders', label: 'Orders', icon: ArrowLeftRight },
    { path: '/strategies', label: 'Strategies', icon: Cpu },
    { path: '/alerts', label: 'Alerts', icon: Bell },
    { path: '/wallet', label: 'Wallet', icon: Wallet },
  ] as const;

  const nav = accountMode === 'upstox'
    ? baseNav.filter((item) => item.path !== '/strategies')
    : baseNav;

  const unreadAlerts = state.alerts.filter((a) => a.enabled && !a.triggered).length;

  return (
    <div className="min-h-screen bg-[#fbfbfc] text-zinc-900 font-sans antialiased selection:bg-indigo-500/20 selection:text-indigo-900 flex flex-col relative">
      {/* Apple Liquid Glass Sticky Header */}
      <header className="sticky top-0 z-30 h-16 liquid-glass border-b border-white/80 px-3 sm:px-6 md:px-8 flex items-center justify-between gap-3 sm:gap-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        {/* Left: Brand Identity + Search */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-xl">
          <button
            type="button"
            onClick={() => go('/')}
            className="flex items-center gap-2.5 shrink-0 hover:opacity-90 transition-opacity cursor-pointer text-left"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800 text-white flex items-center justify-center shadow-md shadow-black/10 border border-white/20 shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-zinc-950">Lumen</span>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/[0.05] text-zinc-600">
                  NSE / BSE
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium">Autonomous Quant Desk</p>
            </div>
          </button>

          {/* Quick Search with ⌘K */}
          <div className="relative w-full max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search NSE/BSE & Global (e.g. RELIANCE, TCS)..."
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
              className="w-full pl-8 pr-12 py-1.5 text-xs bg-black/[0.03] hover:bg-black/[0.05] focus:bg-white border border-transparent focus:border-black/[0.12] rounded-full outline-none transition-all placeholder:text-zinc-400 text-zinc-900 shadow-2xs"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-mono font-medium text-zinc-400 bg-black/[0.04] border border-black/[0.06] rounded-md pointer-events-none">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Professional Segmented Desk Switcher with Apple Gliding Spring Pill */}
          <div
            ref={deskContainerRef}
            className="relative inline-flex items-center p-0.5 rounded-full bg-zinc-100/90 border border-black/[0.06] shrink-0"
          >
            {/* Apple Gliding Desk Active Pill */}
            <div
              className="liquid-desk-active-pill"
              style={{
                transform: `translate3d(${deskPill.left}px, ${deskPill.top}px, 0)`,
                width: `${deskPill.width}px`,
                height: `${deskPill.height}px`,
                opacity: deskPill.ready ? 1 : 0,
              }}
            />

            <button
              ref={paperBtnRef}
              type="button"
              onClick={() => handleDeskClick('paper')}
              className={`relative z-10 px-2.5 py-1 text-[11px] rounded-full transition-colors flex items-center gap-1.5 font-medium cursor-pointer ${
                accountMode === 'paper'
                  ? (!deskPill.ready ? 'bg-white shadow-2xs ' : '') + 'text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Switch to Simulated Paper Sandbox"
            >
              {deskDropMode === 'paper' && (
                <>
                  <span key={`desk-ripple-${deskDropKey}`} className="liquid-drop-ripple" />
                  <span key={`desk-sheen-${deskDropKey}`} className="liquid-drop-sheen" />
                </>
              )}
              <div className={`flex items-center gap-1.5 ${deskDropMode === 'paper' ? 'animate-drop-bounce' : ''}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>Paper</span>
              </div>
            </button>

            <button
              ref={upstoxBtnRef}
              type="button"
              onClick={() => handleDeskClick('upstox')}
              className={`relative z-10 px-2.5 py-1 text-[11px] rounded-full transition-colors flex items-center gap-1.5 font-medium cursor-pointer ${
                accountMode === 'upstox'
                  ? (!deskPill.ready ? 'bg-white shadow-2xs ' : '') + 'text-zinc-950 font-semibold'
                  : upstoxAccount?.connected
                  ? 'text-indigo-600 hover:text-indigo-900'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title={upstoxAccount?.connected ? 'Upstox (NSE / BSE Live Desk)' : 'Connect Upstox Demat'}
            >
              {deskDropMode === 'upstox' && (
                <>
                  <span key={`desk-ripple-${deskDropKey}`} className="liquid-drop-ripple" />
                  <span key={`desk-sheen-${deskDropKey}`} className="liquid-drop-sheen" />
                </>
              )}
              <div className={`flex items-center gap-1.5 ${deskDropMode === 'upstox' ? 'animate-drop-bounce' : ''}`}>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    upstoxAccount?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                  }`}
                />
                <span>Upstox</span>
                <span className="hidden md:inline text-[10px] text-zinc-400 font-normal">NSE</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setIndianBrokerDrawerOpen(true)}
              className="relative z-10 px-2 py-1 text-[11px] rounded-full transition-all flex items-center gap-1 text-zinc-500 hover:text-zinc-900 cursor-pointer"
              title="Connect Kotak Neo or Flattrade"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>More</span>
            </button>
          </div>

          {/* Funds Pill */}
          <button
            type="button"
            onClick={() => go('/wallet')}
            className={`px-2 sm:px-2.5 py-1 text-[11px] rounded-full border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              route === '/wallet'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs font-semibold'
                : 'bg-white hover:bg-zinc-50 border-black/[0.08] text-zinc-700 shadow-2xs'
            }`}
            title="Funds, Margin & Capital Treasury"
          >
            <Wallet className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="font-mono font-tabular font-semibold text-zinc-900 text-[11px] sm:text-xs">
              {moneyINR(effectiveCash)}
            </span>
          </button>

          {/* Operational Health Indicator */}
          <div className="hidden lg:block shrink-0">
            <OperationalHealthBanner accountMode={state.accountMode} />
          </div>

          {/* Notifications */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative p-2 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all cursor-pointer"
              title="Notifications & Execution Signals"
            >
              <Bell className="w-4 h-4" />
              {visibleNotifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-2xl shadow-xl p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-3 py-2 border-b border-black/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900">Activity &amp; Signals</span>
                    <span className="text-[10px] text-zinc-400">{visibleNotifications.length} logged</span>
                  </div>
                  {visibleNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearNotifications()}
                      className="text-[10px] font-semibold text-zinc-400 hover:text-rose-600 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-black/[0.04]">
                  {visibleNotifications.length > 0 ? (
                    visibleNotifications.slice(0, 10).map((n) => (
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
          <button
            type="button"
            onClick={openUserProfileDrawer}
            className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded-full border border-black/[0.08] hover:border-black/[0.15] bg-white hover:bg-zinc-50 shadow-2xs transition-all active:scale-95 shrink-0 cursor-pointer"
            title={`${user?.displayName || 'Ritam Saha'} (${user?.email || 'ritamvarieties@gmail.com'})`}
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-zinc-900 text-white text-[10px] sm:text-[11px] font-bold flex items-center justify-center shrink-0">
              RS
            </div>
            <span className="text-xs font-semibold text-zinc-800 max-w-[70px] sm:max-w-[85px] truncate hidden sm:inline">
              {user?.displayName ? user.displayName.split(' ')[0] : 'Ritam'}
            </span>
            {user?.isEmergencyLocked ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 hidden md:inline" />
            )}
          </button>

          {/* Setup Guide / Tour Button */}
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/70 rounded-full transition-all shadow-2xs shrink-0 cursor-pointer"
            title="Setup Guide & Tour"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden md:inline">Guide</span>
          </button>

          {/* Preferences Button */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all cursor-pointer shrink-0"
            title="Preferences & AI Setup"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area (Spacious canvas with generous bottom padding for the floating liquid glass dock) */}
      <div className="flex-1 flex flex-col min-h-screen pb-28 sm:pb-36">
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
          {accountMode === 'upstox' && route === '/strategies' ? null : children}
        </main>

        {/* Institutional Statutory & Compliance Footer */}
        <LegalFooter />
      </div>

      {/* Apple Music / macOS Refractive Liquid Glass Floating Bottom Dock */}
      <div className="fixed bottom-3 sm:bottom-5 inset-x-0 z-40 flex justify-center pointer-events-none px-2.5 sm:px-4">
        <nav
          className="pointer-events-auto liquid-glass-dock rounded-[26px] sm:rounded-full px-2 sm:px-3 py-1.5 sm:py-2 max-w-4xl lg:max-w-5xl w-full flex items-center justify-between gap-1 sm:gap-3 transition-all duration-300 shadow-2xl"
          role="navigation"
          aria-label="Main Navigation"
        >
          {/* Left Wing: Brand Logo */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => go('/')}
              className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-full hover:bg-black/[0.04] transition-all group cursor-pointer"
              title="Lumen - Autonomous Quant Desk"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-950 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
              </div>
              <span className="font-bold text-xs sm:text-sm tracking-tight text-zinc-950 hidden md:inline">
                Lumen
              </span>
            </button>
          </div>

          {/* Center Wing: Primary Liquid Dock Segmented Navigation with Apple Gliding Spring Pill */}
          <div
            ref={navContainerRef}
            className="relative flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5"
          >
            {/* Apple Gliding Liquid Glass Active Pill */}
            <div
              className="liquid-dock-active-pill"
              style={{
                transform: `translate3d(${indicatorStyle.left}px, ${indicatorStyle.top}px, 0)`,
                width: `${indicatorStyle.width}px`,
                height: `${indicatorStyle.height}px`,
                opacity: indicatorStyle.ready ? 1 : 0,
              }}
            />

            {nav.map(({ path, label, icon: Icon }) => {
              const isActive = route === path;
              return (
                <button
                  key={path}
                  ref={(el) => {
                    tabRefs.current[path] = el;
                  }}
                  type="button"
                  onClick={() => handleTabClick(path)}
                  className={`liquid-dock-item relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    isActive
                      ? (!indicatorStyle.ready ? 'bg-[#18181b] ' : '') + 'text-white'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04]'
                  }`}
                  title={label}
                >
                  {/* Drop-like liquid ripple & sheen on active change */}
                  {dropTab === path && (
                    <>
                      <span key={`dock-ripple-${dropKey}`} className="liquid-drop-ripple" />
                      <span key={`dock-sheen-${dropKey}`} className="liquid-drop-sheen" />
                    </>
                  )}
                  <div
                    className={`relative z-10 flex items-center gap-1.5 ${
                      isActive && dropTab === path ? 'animate-drop-bounce' : ''
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
                        isActive ? 'text-white' : 'text-zinc-500'
                      }`}
                    />
                    <span
                      className={`${isActive ? 'font-bold' : ''} ${
                        ['Alerts', 'Strategies'].includes(label)
                          ? 'hidden lg:inline'
                          : 'hidden sm:inline'
                      }`}
                    >
                      {label}
                    </span>
                    {label === 'Alerts' && unreadAlerts > 0 && (
                      <span
                        className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full transition-colors ${
                          isActive ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-600'
                        }`}
                      >
                        {unreadAlerts}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Wing: Apple Music-style Now Playing Portfolio Widget & Nexus Copilot */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live Portfolio Mini-Player Widget with Spring Press & Hover Lift */}
            <button
              type="button"
              onClick={() => {
                setDropTab('/portfolio');
                setDropKey((k) => k + 1);
                go('/portfolio');
              }}
              className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/[0.03] hover:bg-black/[0.06] border border-black/[0.04] transition-all cursor-pointer group hover:-translate-y-0.5 active:scale-95 spring-smooth"
              title="Open Portfolio Ledger"
            >
              <div className="flex flex-col text-left font-tabular leading-tight">
                <span className="text-[11px] font-bold text-zinc-900">{moneyINR(pv)}</span>
                <span className={`text-[9px] font-semibold ${pnl.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {pnl.amount >= 0 ? '+' : ''}{pnl.pct.toFixed(2)}%
                </span>
              </div>
            </button>

            {/* Nexus Copilot Glass Pill with Spring Bouncy Click */}
            {(() => {
              const danger = senseMarketDanger(state, markets);
              return (
                <button
                  type="button"
                  onClick={() => (chatOpen ? closeChat() : openChat())}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-zinc-950 text-white hover:bg-zinc-900 shadow-sm transition-all hover:-translate-y-0.5 active:scale-90 spring-smooth cursor-pointer shrink-0 group"
                  title="Open Nexus Quant Copilot"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-300 group-hover:rotate-12 transition-transform duration-300" />
                  <span className="text-[11px] font-semibold hidden md:inline">Nexus</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      danger.dangerLevel === 'CRITICAL'
                        ? 'bg-rose-400 animate-ping'
                        : danger.dangerLevel === 'HIGH'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                </button>
              );
            })()}
          </div>
        </nav>
      </div>

      {/* Settings Modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Onboarding Visual Wizard Modal */}
      <OnboardingWizardModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />

      {/* Nexus AI Drawer */}
      {chatOpen && (
        <ErrorBoundary fallbackTitle="Nexus Intelligence Drawer" isDrawer={true} onClose={closeChat}>
          <ChatDrawer open={chatOpen} onClose={closeChat} />
        </ErrorBoundary>
      )}

      {/* Upstox Terminal Drawer */}
      <UpstoxTerminalDrawer open={upstoxDrawerOpen} onClose={closeUpstoxDrawer} />
      <IndianBrokerTerminalDrawer open={indianBrokerDrawerOpen} onClose={() => setIndianBrokerDrawerOpen(false)} />


      {/* AI Safety Authorization Gate Modal */}
      {pendingAIProposal && pendingAIValidation && (
        <AISafetyModal
          proposal={pendingAIProposal}
          validation={pendingAIValidation}
          onConfirm={confirmPendingAIProposal}
          onReject={rejectPendingAIProposal}
        />
      )}

      {/* Apple Liquid Glass Floating Toast Banner (Top Right on Desktop, Top Capsule on Mobile - NEVER occludes bottom dock) */}
      {activeToast && (
        <div className="fixed top-20 right-3 sm:right-6 z-50 max-w-sm sm:max-w-md w-[calc(100%-1.5rem)] sm:w-auto pointer-events-none animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="pointer-events-auto apple-toast-banner rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 relative overflow-hidden">
            <div className="mt-0.5 shrink-0">
              {activeToast.type === 'success' ? (
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shadow-2xs">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
              ) : activeToast.type === 'warn' ? (
                <div className="w-7 h-7 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-600 flex items-center justify-center border border-indigo-500/20 shadow-2xs">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <h4 className="text-xs font-semibold text-zinc-950 tracking-tight">{activeToast.title}</h4>
              <p className="text-xs text-zinc-600 mt-0.5 leading-snug">{activeToast.message}</p>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="shrink-0 p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-black/[0.04] transition-colors cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {/* Apple Countdown Progress Line */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/[0.04]">
              <div
                className={`h-full ${
                  activeToast.type === 'success'
                    ? 'bg-emerald-500'
                    : activeToast.type === 'warn'
                    ? 'bg-amber-500'
                    : 'bg-indigo-500'
                } opacity-70`}
                style={{
                  animation: 'toastCountdown 3.8s linear forwards',
                }}
              />
            </div>
          </div>
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
