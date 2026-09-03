import React, { useEffect, useState } from 'react';
import { useLumen } from './store';
import { ASSETS, Asset } from './types';
import { SettingsModal } from './Settings';
import { ChatDrawer } from './ChatDrawer';
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
} from 'lucide-react';
import { money, portfolioValue, totalPortfolioPnl } from './trading';

export type Route = '/' | '/markets' | '/portfolio' | '/orders' | '/strategies' | '/alerts' | '/settings';

const VALID_ROUTES: Route[] = ['/', '/markets', '/portfolio', '/orders', '/strategies', '/alerts', '/settings'];

function parseRoute(): Route {
  if (typeof window === 'undefined') return '/';
  if (window.location.hash && window.location.hash.startsWith('#/')) {
    const h = window.location.hash.slice(1);
    if (VALID_ROUTES.includes(h as Route)) return h as Route;
  }
  let p = window.location.pathname || '/';
  if (p.includes('/AI_Trading')) p = p.replace('/AI_Trading', '');
  p = p.replace(/\/+$/, '') || '/';
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
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    window.location.hash = path;
  }
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { state, markets, setSelectedAsset, activeToast, dismissToast, setSettings } = useLumen();
  const route = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);

  const nav = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/markets', label: 'Markets', icon: BarChart3 },
    { path: '/portfolio', label: 'Portfolio', icon: Briefcase },
    { path: '/orders', label: 'Orders', icon: ArrowLeftRight },
    { path: '/strategies', label: 'Strategies', icon: Cpu },
    { path: '/alerts', label: 'Alerts', icon: Bell },
  ] as const;

  const unreadAlerts = state.alerts.filter((a) => a.enabled && !a.triggered).length;

  return (
    <div className="min-h-screen bg-[#fbfbfc] text-zinc-900 font-sans antialiased selection:bg-indigo-500/20 selection:text-indigo-900 flex">
      {/* Apple Liquid Glass Sidebar */}
      <aside className="w-64 bg-white/70 backdrop-blur-2xl border-r border-black/[0.05] p-5 fixed inset-0 right-auto flex flex-col z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-800 text-white flex items-center justify-center shadow-md shadow-black/10 border border-white/20">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-base tracking-tight text-zinc-950">Lumen</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/[0.05] text-zinc-600">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">AI Trading Cockpit</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="space-y-1 flex-1">
          <div className="px-3 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Workspace
          </div>
          {nav.map(({ path, label, icon: Icon }) => {
            const isActive = route === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => go(path)}
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
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-white/90 to-white/50 border border-black/[0.06] backdrop-blur-md shadow-sm">
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
              <span className="text-[10px] text-zinc-500">Live Paper</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.04] rounded-xl transition-all"
          >
            <SettingsIcon className="w-4 h-4 text-zinc-400" />
            <span>Preferences &amp; AI Setup</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Apple Glass Sticky Topbar */}
        <header className="sticky top-0 z-20 h-16 bg-white/75 backdrop-blur-xl border-b border-black/[0.05] px-8 flex items-center justify-between">
          {/* Quick Search */}
          <div className="relative w-80 max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets (BTC, ETH, SOL, AVAX)..."
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
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-black/[0.03] hover:bg-black/[0.05] focus:bg-white border border-transparent focus:border-black/[0.1] rounded-xl outline-none transition-all placeholder:text-zinc-400 text-zinc-900"
            />
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-3">
            {/* Live Feed Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-medium border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Feeds Synchronized</span>
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

            {/* Notifications Popover Trigger */}
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
                <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-2xl shadow-xl p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
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

            {/* Settings Trigger */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] transition-all"
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>

            {/* AI Copilot Trigger */}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl shadow-sm shadow-indigo-500/25 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Copilot</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Floating Copilot Capsule Button (on mobile or bottom right) */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-zinc-950/90 text-white backdrop-blur-xl border border-white/20 rounded-full shadow-2xl hover:scale-105 transition-all duration-200"
      >
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-semibold">AI Copilot</span>
      </button>

      {/* Settings Modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Copilot Drawer */}
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Toast Notification Container */}
      {activeToast && (
        <div className="fixed bottom-6 left-6 z-50 max-w-md bg-white/95 backdrop-blur-2xl border border-black/[0.08] shadow-2xl rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-300">
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
