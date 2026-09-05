import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, RefreshCw, XOctagon, Clock, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { ApiClient } from '../services/apiClient';

interface OperationalHealthData {
  overallState: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'RECONCILING' | 'BLOCKED';
  clockSync?: {
    offsetMs: number;
    isHealthy: boolean;
  };
  rateLimit?: {
    usedWeight1m: number;
    isThrottled: boolean;
    isBlocked: boolean;
  };
  killSwitch?: {
    isGlobalFrozen: boolean;
    activeFreezes: Array<{ scope: string; target: string; reason: string }>;
  };
  circuitBreakers?: {
    openCount: number;
    breakers: Array<{ name: string; scope: string; reason?: string }>;
  };
  unresolvedMismatches?: number;
  timestamp?: number;
}

export const OperationalHealthBanner: React.FC<{ accountMode?: string }> = ({ accountMode }) => {
  const [data, setData] = useState<OperationalHealthData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.getOperationalHealth();
      if (res.ok && res.data?.report) {
        setData(res.data.report);
      }
    } catch {
      // Non-blocking in frontend
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 15_000);
    return () => clearInterval(timer);
  }, [accountMode]);

  // Close panel on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleTriggerReconciliation = async () => {
    try {
      setActionLoading(true);
      setActionMessage('Running reconciliation sweep...');
      const res = await ApiClient.triggerReconciliation();
      if (res.ok) {
        setActionMessage('Reconciliation completed successfully.');
      } else {
        setActionMessage(`Reconciliation: ${res.error || 'Failed'}`);
      }
      await fetchHealth();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleEmergencyFreeze = async () => {
    try {
      setActionLoading(true);
      const isCurrentlyFrozen = (data?.killSwitch?.activeFreezes?.length || 0) > 0;
      if (isCurrentlyFrozen) {
        setActionMessage('Deactivating kill switch...');
        await ApiClient.unfreezeKillSwitch({
          scope: 'GLOBAL',
          reason: 'Manual unfreeze via Operational Cockpit',
        });
        setActionMessage('System unfrozen.');
      } else {
        setActionMessage('Activating emergency freeze...');
        await ApiClient.freezeKillSwitch({
          scope: 'GLOBAL',
          reason: 'Manual emergency freeze from trading console',
        });
        setActionMessage('EMERGENCY FREEZE ACTIVATED.');
      }
      await fetchHealth();
    } catch (err: any) {
      setActionMessage(`Freeze action failed: ${err.message}`);
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const state = data?.overallState || 'HEALTHY';
  const isHealthy = state === 'HEALTHY';
  const isDegraded = state === 'DEGRADED';
  const isBlocked = state === 'BLOCKED' || state === 'UNAVAILABLE';

  const badgeColor = isBlocked
    ? 'bg-rose-500/10 text-rose-700 border-rose-500/25'
    : isDegraded
    ? 'bg-amber-500/10 text-amber-700 border-amber-500/25'
    : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25';

  const dotColor = isBlocked ? 'bg-rose-500' : isDegraded ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="relative inline-block" ref={panelRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border shadow-2xs transition-all cursor-pointer hover:opacity-90 ${badgeColor}`}
        title="Authoritative Exchange Operational Health & Safety Controls"
      >
        <span className={`w-2 h-2 rounded-full ${dotColor} ${isDegraded ? 'animate-pulse' : ''}`} />
        <span className="font-semibold">OPS: {state}</span>
        {isOpen ? <ChevronUp className="w-3 h-3 opacity-60" /> : <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 z-50 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-zinc-900 dark:text-zinc-100">Exchange Operational Safety</span>
            </div>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={loading}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Refresh Health"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="py-3 space-y-2.5">
            {/* Clock Sync Status */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Clock Synchronization
              </span>
              <span className={`font-mono font-semibold ${data?.clockSync?.isHealthy ? 'text-emerald-600' : 'text-rose-600'}`}>
                {data?.clockSync ? `${data.clockSync.offsetMs >= 0 ? '+' : ''}${data.clockSync.offsetMs}ms` : 'Syncing...'}
              </span>
            </div>

            {/* Rate Limit Weight */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Binance Request Weight (1m)
              </span>
              <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                {data?.rateLimit?.usedWeight1m ?? 0} / 1,200
              </span>
            </div>

            {/* Circuit Breakers */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Circuit Breakers
              </span>
              <span className={`font-semibold ${(data?.circuitBreakers?.openCount || 0) > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>
                {(data?.circuitBreakers?.openCount || 0) === 0 ? 'All Closed (Safe)' : `${data?.circuitBreakers?.openCount} Tripped`}
              </span>
            </div>

            {/* Kill Switches */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <XOctagon className="w-3.5 h-3.5" /> Kill Switch State
              </span>
              <span className={`font-semibold ${data?.killSwitch?.isGlobalFrozen ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>
                {data?.killSwitch?.isGlobalFrozen ? 'GLOBAL FREEZE ACTIVE' : 'Operational'}
              </span>
            </div>

            {/* Unresolved Mismatches */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Reconciliation Health
              </span>
              <span className={`font-semibold ${(data?.unresolvedMismatches || 0) > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>
                {(data?.unresolvedMismatches || 0) === 0 ? 'Zero Mismatches' : `${data?.unresolvedMismatches} Critical`}
              </span>
            </div>
          </div>

          {actionMessage && (
            <div className="mb-3 p-2 text-center text-[11px] rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
              {actionMessage}
            </div>
          )}

          {/* Quick Actions */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
            <button
              type="button"
              onClick={handleTriggerReconciliation}
              disabled={actionLoading}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium text-[11px] flex items-center justify-center gap-1 transition-all"
            >
              <RefreshCw className="w-3 h-3" /> Reconcile Now
            </button>

            <button
              type="button"
              onClick={handleEmergencyFreeze}
              disabled={actionLoading}
              className={`py-1.5 px-2.5 rounded-lg font-medium text-[11px] flex items-center justify-center gap-1 transition-all text-white ${
                data?.killSwitch?.activeFreezes?.length ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              <XOctagon className="w-3 h-3" />
              {data?.killSwitch?.activeFreezes?.length ? 'Unfreeze System' : 'Emergency Freeze'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
