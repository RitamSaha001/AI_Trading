import React, { useState, useMemo } from 'react';
import {
  PieChart as PieIcon,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Building2,
  Wallet,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  Maximize2,
  BarChart3,
  Percent,
} from 'lucide-react';
import { useLumen } from '../store';
import {
  Asset,
  INDIAN_ASSETS,
} from '../types';
import {
  META,
  moneyINR,
  formatQty,
  portfolioValue,
  positionPnl,
  getActiveLiquidCash,
  getActiveAssetUnits,
} from '../domain/portfolio';

// ---------------------------------------------------------------------------
// AUTHORITATIVE NSE SECTOR CLASSIFICATION & COLOR SCHEMES
// ---------------------------------------------------------------------------
export interface SectorInfo {
  name: string;
  color: string;
  iconBg: string;
}

export const NSE_SECTORS: Record<string, SectorInfo> = {
  'Banking & Financials': {
    name: 'Banking & Financials',
    color: '#3b82f6', // Blue
    iconBg: 'bg-blue-500/10 text-blue-600',
  },
  'Information Technology': {
    name: 'Information Technology',
    color: '#06b6d4', // Cyan
    iconBg: 'bg-cyan-500/10 text-cyan-600',
  },
  'Energy & Petrochemicals': {
    name: 'Energy & Petrochemicals',
    color: '#f59e0b', // Amber
    iconBg: 'bg-amber-500/10 text-amber-600',
  },
  'Automobiles': {
    name: 'Automobiles',
    color: '#8b5cf6', // Violet
    iconBg: 'bg-violet-500/10 text-violet-600',
  },
  'FMCG & Consumer Goods': {
    name: 'FMCG & Consumer Goods',
    color: '#10b981', // Emerald
    iconBg: 'bg-emerald-500/10 text-emerald-600',
  },
  'Infrastructure & Engineering': {
    name: 'Infrastructure & Engineering',
    color: '#f97316', // Orange
    iconBg: 'bg-orange-500/10 text-orange-600',
  },
  'Pharmaceuticals & Healthcare': {
    name: 'Pharmaceuticals & Healthcare',
    color: '#ec4899', // Pink
    iconBg: 'bg-pink-500/10 text-pink-600',
  },
  'Telecommunications': {
    name: 'Telecommunications',
    color: '#ef4444', // Red
    iconBg: 'bg-rose-500/10 text-rose-600',
  },
  'Power & Utilities': {
    name: 'Power & Utilities',
    color: '#14b8a6', // Teal
    iconBg: 'bg-teal-500/10 text-teal-600',
  },
  'Consumer Discretionary': {
    name: 'Consumer Discretionary',
    color: '#6366f1', // Indigo
    iconBg: 'bg-indigo-500/10 text-indigo-600',
  },
  'NBFC & Financial Services': {
    name: 'NBFC & Financial Services',
    color: '#0284c7', // Sky
    iconBg: 'bg-sky-500/10 text-sky-600',
  },
  'Liquid Cash Reserve': {
    name: 'Liquid Cash Reserve',
    color: '#71717a', // Zinc
    iconBg: 'bg-zinc-500/10 text-zinc-600',
  },
  'Other Equities': {
    name: 'Other Equities',
    color: '#64748b', // Slate
    iconBg: 'bg-slate-500/10 text-slate-600',
  },
  'Defence & Aerospace': {
    name: 'Defence & Aerospace',
    color: '#991b1b', // Red-800
    iconBg: 'bg-red-800/10 text-red-800',
  },
};

export const ASSET_SECTOR_MAP: Record<string, string> = {
  RELIANCE: 'Energy & Petrochemicals',
  ONGC: 'Energy & Petrochemicals',
  TCS: 'Information Technology',
  INFY: 'Information Technology',
  WIPRO: 'Information Technology',
  HDFCBANK: 'Banking & Financials',
  ICICIBANK: 'Banking & Financials',
  SBIN: 'Banking & Financials',
  KOTAKBANK: 'Banking & Financials',
  AXISBANK: 'Banking & Financials',
  TATAMOTORS: 'Automobiles',
  MARUTI: 'Automobiles',
  BHARTIARTL: 'Telecommunications',
  ITC: 'FMCG & Consumer Goods',
  HINDUNILVR: 'FMCG & Consumer Goods',
  LT: 'Infrastructure & Engineering',
  SUNPHARMA: 'Pharmaceuticals & Healthcare',
  TITAN: 'Consumer Discretionary',
  BAJFINANCE: 'NBFC & Financial Services',
  NTPC: 'Power & Utilities',
  HAL: 'Defence & Aerospace',
  BEL: 'Defence & Aerospace',
};

// ---------------------------------------------------------------------------
// PURE MATHEMATICAL SVG ARC GENERATOR (ZERO EXTERNAL DEPENDENCY)
// ---------------------------------------------------------------------------
function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const sweep = endAngle - startAngle;
  const isFullCircle = sweep >= 359.99;
  const safeEndAngle = isFullCircle ? startAngle + 359.99 : endAngle;

  const startOuter = polarToCartesian(cx, cy, outerRadius, safeEndAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, safeEndAngle);

  const largeArcFlag = sweep <= 180 ? '0' : '1';

  return [
    'M',
    startOuter.x,
    startOuter.y,
    'A',
    outerRadius,
    outerRadius,
    0,
    largeArcFlag,
    0,
    endOuter.x,
    endOuter.y,
    'L',
    startInner.x,
    startInner.y,
    'A',
    innerRadius,
    innerRadius,
    0,
    largeArcFlag,
    1,
    endInner.x,
    endInner.y,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// MAIN UPSTOX PORTFOLIO ANALYTICS COMPONENT
// ---------------------------------------------------------------------------
export function UpstoxPortfolioAnalytics() {
  const { state, markets, upstoxAccount, accountMode } = useLumen();

  const [activeTab, setActiveTab] = useState<'donut' | 'sectors' | 'waterfall' | 'margin'>('donut');
  const [hoveredSliceKey, setHoveredSliceKey] = useState<string | null>(null);
  const [includeCashInDonut, setIncludeCashInDonut] = useState(true);

  // Compute Total Portfolio Value & Balances
  const pv = useMemo(() => portfolioValue(state, markets), [state, markets]);
  const liquidCash = useMemo(() => getActiveLiquidCash(state), [state]);
  const investedCapital = Math.max(0, pv - liquidCash);

  // Extract Active Holdings
  const activeHoldingsData = useMemo(() => {
    const isUpstox = accountMode === 'upstox';
    const assetsToInspect = isUpstox ? INDIAN_ASSETS : (Object.keys(state.positions) as Asset[]);

    const items: Array<{
      asset: Asset;
      units: number;
      price: number;
      value: number;
      pct: number;
      color: string;
      sector: string;
      avgBuyPrice: number;
      pnl: { amount: number; pct: number };
    }> = [];

    assetsToInspect.forEach((a) => {
      const units = isUpstox ? getActiveAssetUnits(state, a) : (state.positions[a] || 0);
      if (units > 0.000001) {
        const price = markets[a]?.price || 0;
        const value = units * price;
        const pnl = positionPnl(state, markets, a);
        const sector = ASSET_SECTOR_MAP[a] || 'Other Equities';
        const color = META[a]?.iconColor || NSE_SECTORS[sector]?.color || '#4f46e5';

        items.push({
          asset: a,
          units,
          price,
          value,
          pct: pv > 0 ? (value / pv) * 100 : 0,
          color,
          sector,
          avgBuyPrice: state.avgBuyPrice?.[a] || price,
          pnl: { amount: pnl.amount, pct: pnl.pct },
        });
      }
    });

    // Sort descending by value
    return items.sort((a, b) => b.value - a.value);
  }, [state, markets, accountMode, pv]);

  // Slices for Donut Chart (Holdings + Optional Cash)
  const donutSlices = useMemo(() => {
    const totalBasis = includeCashInDonut ? pv : investedCapital;
    if (totalBasis <= 0) return [];

    let currentAngle = 0;
    const slices: Array<{
      key: string;
      label: string;
      subLabel: string;
      value: number;
      pct: number;
      color: string;
      startAngle: number;
      endAngle: number;
      midAngle: number;
      isCash: boolean;
      pnl?: { amount: number; pct: number };
      units?: number;
      price?: number;
    }> = [];

    // Add holdings slices
    activeHoldingsData.forEach((h) => {
      const sweep = (h.value / totalBasis) * 360;
      if (sweep > 0.01) {
        const start = currentAngle;
        const end = currentAngle + sweep;
        const mid = (start + end) / 2;
        slices.push({
          key: h.asset,
          label: h.asset,
          subLabel: META[h.asset]?.name || h.asset,
          value: h.value,
          pct: (h.value / totalBasis) * 100,
          color: h.color,
          startAngle: start,
          endAngle: end,
          midAngle: mid,
          isCash: false,
          pnl: h.pnl,
          units: h.units,
          price: h.price,
        });
        currentAngle = end;
      }
    });

    // Add Cash slice if enabled and > 0
    if (includeCashInDonut && liquidCash > 0) {
      const sweep = (liquidCash / totalBasis) * 360;
      if (sweep > 0.01) {
        const start = currentAngle;
        const end = Math.min(360, currentAngle + sweep);
        const mid = (start + end) / 2;
        slices.push({
          key: 'LIQUID_CASH',
          label: 'Liquid Cash',
          subLabel: 'Available Demat Balance',
          value: liquidCash,
          pct: (liquidCash / totalBasis) * 100,
          color: '#71717a',
          startAngle: start,
          endAngle: end,
          midAngle: mid,
          isCash: true,
        });
      }
    }

    return slices;
  }, [activeHoldingsData, includeCashInDonut, pv, investedCapital, liquidCash]);

  // Sector Aggregations
  const sectorData = useMemo(() => {
    const map = new Map<string, { sector: string; value: number; count: number; assets: Asset[] }>();

    activeHoldingsData.forEach((h) => {
      const s = h.sector;
      const cur = map.get(s) || { sector: s, value: 0, count: 0, assets: [] };
      cur.value += h.value;
      cur.count += 1;
      cur.assets.push(h.asset);
      map.set(s, cur);
    });

    // Include cash as liquidity sector
    if (liquidCash > 0) {
      map.set('Liquid Cash Reserve', {
        sector: 'Liquid Cash Reserve',
        value: liquidCash,
        count: 1,
        assets: [],
      });
    }

    const total = pv > 0 ? pv : 1;
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        pct: (item.value / total) * 100,
        color: NSE_SECTORS[item.sector]?.color || '#64748b',
        iconBg: NSE_SECTORS[item.sector]?.iconBg || 'bg-slate-500/10 text-slate-600',
      }))
      .sort((a, b) => b.value - a.value);
  }, [activeHoldingsData, liquidCash, pv]);

  // Sector Donut Slices
  const sectorSlices = useMemo(() => {
    if (pv <= 0) return [];
    let currentAngle = 0;
    return sectorData.map((s) => {
      const sweep = (s.value / pv) * 360;
      const start = currentAngle;
      const end = currentAngle + sweep;
      const mid = (start + end) / 2;
      currentAngle = end;
      return {
        ...s,
        startAngle: start,
        endAngle: end,
        midAngle: mid,
      };
    });
  }, [sectorData, pv]);

  // Upstox Funds & Demat Margins
  const upstoxFunds = upstoxAccount?.funds;
  const availableMargin = upstoxFunds?.availableCash 
    ?? (upstoxAccount?.balances?.INR?.free !== undefined ? Number(upstoxAccount.balances.INR.free) : liquidCash);
  const usedMargin = upstoxFunds?.usedMargin 
    ?? (upstoxAccount?.balances?.INR?.locked !== undefined ? Number(upstoxAccount.balances.INR.locked) : 0);
  const totalEquity = upstoxFunds?.totalEquity 
    ?? (upstoxAccount?.balances?.INR?.total !== undefined ? Number(upstoxAccount.balances.INR.total) : (availableMargin || pv));
  const marginUtilizationPct = totalEquity > 0 ? Math.min(100, (usedMargin / totalEquity) * 100) : 0;
  const cashReservePct = totalEquity > 0 ? Math.min(100, (availableMargin / totalEquity) * 100) : 0;

  // Waterfall / P&L Analysis
  const maxAbsPnl = useMemo(() => {
    let m = 1;
    activeHoldingsData.forEach((h) => {
      if (Math.abs(h.pnl.amount) > m) m = Math.abs(h.pnl.amount);
    });
    return m;
  }, [activeHoldingsData]);

  const totalUnrealizedPnl = useMemo(() => {
    return activeHoldingsData.reduce((acc, h) => acc + h.pnl.amount, 0);
  }, [activeHoldingsData]);

  // Currently active hover slice details for center of donut
  const activeHoveredSlice = useMemo(() => {
    if (!hoveredSliceKey) return null;
    return donutSlices.find((s) => s.key === hoveredSliceKey) || null;
  }, [hoveredSliceKey, donutSlices]);

  return (
    <div className="rounded-[32px] bg-white/90 dark:bg-zinc-950/90 backdrop-blur-2xl border border-black/[0.08] dark:border-white/10 shadow-xl p-5 sm:p-7 space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Interactive Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-black/[0.06] dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-xs">
              <PieIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
                  Interactive Portfolio Analytics
                </h2>
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                  GPU Vector Math
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Real-time SVG asset allocation, NSE sector dispersion, Demat margin health, and mark-to-market performance.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center p-1 rounded-2xl bg-black/[0.04] dark:bg-white/5 border border-black/[0.04] dark:border-white/5 self-start md:self-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('donut')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all transform-gpu cursor-pointer ${
              activeTab === 'donut'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <PieIcon className="w-3.5 h-3.5" />
            <span>Allocation</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sectors')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all transform-gpu cursor-pointer ${
              activeTab === 'sectors'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>NSE Sectors</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('waterfall')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all transform-gpu cursor-pointer ${
              activeTab === 'waterfall'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>P&amp;L Waterfall</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('margin')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all transform-gpu cursor-pointer ${
              activeTab === 'margin'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Demat Margin</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/60 border border-black/[0.04] dark:border-white/5">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Total Portfolio Value</span>
          <div className="text-base sm:text-lg font-bold font-mono text-zinc-950 dark:text-white mt-1">
            {moneyINR(pv)}
          </div>
          <span className="text-[10px] text-zinc-400 mt-0.5 block">
            {activeHoldingsData.length} active holdings
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/60 border border-black/[0.04] dark:border-white/5">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Unrealized MTM P&amp;L</span>
          <div
            className={`text-base sm:text-lg font-bold font-mono mt-1 flex items-center gap-1 ${
              totalUnrealizedPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {totalUnrealizedPnl >= 0 ? '+' : ''}
            {moneyINR(totalUnrealizedPnl)}
          </div>
          <span className="text-[10px] text-zinc-400 mt-0.5 block">
            {pv > 0 ? ((totalUnrealizedPnl / Math.max(1, pv - totalUnrealizedPnl)) * 100).toFixed(2) : '0.00'}% return
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/60 border border-black/[0.04] dark:border-white/5">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Available Demat Margin</span>
          <div className="text-base sm:text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {moneyINR(availableMargin)}
          </div>
          <span className="text-[10px] text-zinc-400 mt-0.5 block">
            {cashReservePct.toFixed(1)}% liquid buffer
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/60 border border-black/[0.04] dark:border-white/5">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">Top Asset Weight</span>
          <div className="text-base sm:text-lg font-bold font-mono text-zinc-950 dark:text-white mt-1">
            {activeHoldingsData[0] ? `${activeHoldingsData[0].asset} (${activeHoldingsData[0].pct.toFixed(1)}%)` : 'None'}
          </div>
          <span className="text-[10px] text-zinc-400 mt-0.5 block">
            {activeHoldingsData[0]?.pct > 35 ? '⚠️ High Concentration' : '✅ Well-balanced (<35%)'}
          </span>
        </div>
      </div>

      {/* TAB 1: INTERACTIVE ALLOCATION DONUT */}
      {activeTab === 'donut' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left / Center: Interactive SVG Donut Chart */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center p-4">
            <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center select-none">
              <svg
                viewBox="0 0 320 320"
                className="w-full h-full transform-gpu overflow-visible"
              >
                <defs>
                  <filter id="donutShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.25" />
                  </filter>
                </defs>

                {/* Empty Portfolio Fallback Ring */}
                {donutSlices.length === 0 && (
                  <circle
                    cx={160}
                    cy={160}
                    r={110}
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth={40}
                    className="opacity-50"
                  />
                )}

                {/* Donut Slices */}
                {donutSlices.map((slice) => {
                  const isHovered = hoveredSliceKey === slice.key;
                  // Compute slight radial translation when hovered
                  const rad = ((slice.midAngle - 90) * Math.PI) / 180;
                  const dx = isHovered ? Math.cos(rad) * 8 : 0;
                  const dy = isHovered ? Math.sin(rad) * 8 : 0;

                  return (
                    <path
                      key={slice.key}
                      d={describeDonutSlice(160, 160, 132, 86, slice.startAngle, slice.endAngle)}
                      fill={slice.color}
                      transform={`translate(${dx}, ${dy})`}
                      filter={isHovered ? 'url(#donutShadow)' : undefined}
                      className="cursor-pointer transition-all duration-300 ease-out transform-gpu hover:opacity-95"
                      onMouseEnter={() => setHoveredSliceKey(slice.key)}
                      onMouseLeave={() => setHoveredSliceKey(null)}
                    />
                  );
                })}

                {/* Inner Ring Glow Border */}
                <circle
                  cx={160}
                  cy={160}
                  r={85}
                  fill="none"
                  stroke="currentColor"
                  className="text-black/[0.04] dark:text-white/5"
                  strokeWidth={1}
                />
              </svg>

              {/* Dynamic Center Readout Card */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                {activeHoveredSlice ? (
                  <div className="animate-in fade-in zoom-in-95 duration-150 space-y-1">
                    <span className="text-[11px] font-bold tracking-tight text-zinc-500 dark:text-zinc-400 uppercase">
                      {activeHoveredSlice.label}
                    </span>
                    <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-zinc-950 dark:text-white">
                      {moneyINR(activeHoveredSlice.value)}
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-md text-white shadow-2xs"
                        style={{ backgroundColor: activeHoveredSlice.color }}
                      >
                        {activeHoveredSlice.pct.toFixed(1)}%
                      </span>
                      {activeHoveredSlice.pnl && (
                        <span
                          className={`text-[11px] font-mono font-bold ${
                            activeHoveredSlice.pnl.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {activeHoveredSlice.pnl.amount >= 0 ? '+' : ''}
                          {activeHoveredSlice.pnl.pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-200 space-y-0.5">
                    <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                      Total Capital
                    </span>
                    <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-zinc-950 dark:text-white">
                      {moneyINR(includeCashInDonut ? pv : investedCapital)}
                    </div>
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 block">
                      {activeHoldingsData.length} Equities Held
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Toggle Cash Option */}
            <div className="flex items-center gap-2 mt-3 pt-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCashInDonut}
                  onChange={(e) => setIncludeCashInDonut(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Include Liquid Cash ({((liquidCash / Math.max(1, pv)) * 100).toFixed(1)}%)</span>
              </label>
            </div>
          </div>

          {/* Right: Slices Breakdown Ledger */}
          <div className="lg:col-span-6 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 pb-1 border-b border-black/[0.04] dark:border-white/5">
              <span>Asset &amp; Sector</span>
              <span>Weight &amp; Value</span>
            </div>

            {donutSlices.map((slice) => {
              const isHovered = hoveredSliceKey === slice.key;
              return (
                <div
                  key={slice.key}
                  onMouseEnter={() => setHoveredSliceKey(slice.key)}
                  onMouseLeave={() => setHoveredSliceKey(null)}
                  className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 ${
                    isHovered
                      ? 'bg-zinc-100 dark:bg-zinc-800/80 border-indigo-500/40 shadow-xs scale-[1.01]'
                      : 'bg-zinc-50/60 dark:bg-zinc-900/40 border-black/[0.04] dark:border-white/5 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs transition-transform duration-200"
                      style={{
                        backgroundColor: slice.color,
                        transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-950 dark:text-white">
                          {slice.label}
                        </span>
                        {slice.isCash && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                            Cash
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400 block truncate max-w-[160px]">
                        {slice.subLabel}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100">
                      {moneyINR(slice.value)}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      <div className="w-12 h-1.5 rounded-full bg-black/[0.05] dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, slice.pct)}%`,
                            backgroundColor: slice.color,
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-zinc-600 dark:text-zinc-300">
                        {slice.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {donutSlices.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-400">
                No active asset positions in portfolio.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NSE SECTOR EXPOSURE & CONCENTRATION */}
      {activeTab === 'sectors' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Sector Ring SVG */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-4">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
              <svg viewBox="0 0 320 320" className="w-full h-full transform-gpu overflow-visible">
                {sectorSlices.map((slice) => {
                  const isHovered = hoveredSliceKey === slice.sector;
                  const rad = ((slice.midAngle - 90) * Math.PI) / 180;
                  const dx = isHovered ? Math.cos(rad) * 8 : 0;
                  const dy = isHovered ? Math.sin(rad) * 8 : 0;

                  return (
                    <path
                      key={slice.sector}
                      d={describeDonutSlice(160, 160, 130, 92, slice.startAngle, slice.endAngle)}
                      fill={slice.color}
                      transform={`translate(${dx}, ${dy})`}
                      className="cursor-pointer transition-all duration-300 ease-out hover:opacity-90"
                      onMouseEnter={() => setHoveredSliceKey(slice.sector)}
                      onMouseLeave={() => setHoveredSliceKey(null)}
                    />
                  );
                })}
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  NSE Sectors
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-zinc-950 dark:text-white">
                  {sectorData.length}
                </span>
                <span className="text-[11px] text-zinc-500 font-medium">
                  Industries Represented
                </span>
              </div>
            </div>
          </div>

          {/* Sector Cards Grid */}
          <div className="lg:col-span-7 space-y-3 max-h-[380px] overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 pb-1 border-b border-black/[0.04] dark:border-white/5">
              <span>Industry Sector</span>
              <span>Exposure (% of Capital)</span>
            </div>

            {sectorData.map((s) => {
              const isOverweight = s.pct > 35 && s.sector !== 'Liquid Cash Reserve';
              const isHovered = hoveredSliceKey === s.sector;

              return (
                <div
                  key={s.sector}
                  onMouseEnter={() => setHoveredSliceKey(s.sector)}
                  onMouseLeave={() => setHoveredSliceKey(null)}
                  className={`p-3.5 rounded-2xl border transition-all duration-200 ${
                    isHovered
                      ? 'bg-zinc-100 dark:bg-zinc-800 border-indigo-500/40 shadow-xs'
                      : 'bg-zinc-50/60 dark:bg-zinc-900/40 border-black/[0.04] dark:border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: s.color }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                            {s.sector}
                          </span>
                          {isOverweight && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              Overweight &gt;35%
                            </span>
                          )}
                        </div>
                        {s.assets.length > 0 && (
                          <span className="text-[10px] text-zinc-400 block mt-0.5">
                            Holdings: {s.assets.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white block">
                        {moneyINR(s.value)}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-zinc-500 dark:text-zinc-400">
                        {s.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Bar */}
                  <div className="w-full h-1.5 bg-black/[0.05] dark:bg-white/10 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, s.pct)}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: P&L WATERFALL & RELATIVE DISTRIBUTION */}
      {activeTab === 'waterfall' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pb-2 border-b border-black/[0.04] dark:border-white/5">
            <span>Asset &amp; Cost Basis</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Profitable</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Loss</span>
              </span>
            </div>
            <span>Unrealized P&amp;L</span>
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {activeHoldingsData.map((h) => {
              const isProfit = h.pnl.amount >= 0;
              const barWidthPct = (Math.abs(h.pnl.amount) / maxAbsPnl) * 100;

              return (
                <div
                  key={h.asset}
                  className="p-3.5 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/50 border border-black/[0.04] dark:border-white/5 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/80 transition-all flex items-center justify-between gap-4"
                >
                  {/* Left info */}
                  <div className="w-36 sm:w-44 shrink-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-lg text-white font-bold text-[10px] flex items-center justify-center shrink-0"
                        style={{ backgroundColor: h.color }}
                      >
                        {h.asset.slice(0, 3)}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                          {h.asset}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {formatQty(h.units, h.asset)} @ {moneyINR(h.avgBuyPrice)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Center Diverging Bar Chart */}
                  <div className="flex-1 flex items-center justify-center relative h-6 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl px-2">
                    {/* Zero Midline */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-zinc-300 dark:bg-zinc-700 z-10" />

                    <div className="w-full flex items-center h-full">
                      {/* Left Half (Loss) */}
                      <div className="w-1/2 flex justify-end pr-0.5">
                        {!isProfit && (
                          <div
                            className="h-3.5 rounded-l-md bg-gradient-to-l from-rose-500 to-rose-600 transition-all duration-300"
                            style={{ width: `${Math.max(4, barWidthPct)}%` }}
                            title={`Loss: ${moneyINR(h.pnl.amount)}`}
                          />
                        )}
                      </div>

                      {/* Right Half (Profit) */}
                      <div className="w-1/2 flex justify-start pl-0.5">
                        {isProfit && (
                          <div
                            className="h-3.5 rounded-r-md bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                            style={{ width: `${Math.max(4, barWidthPct)}%` }}
                            title={`Gain: +${moneyINR(h.pnl.amount)}`}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right P&L Metric */}
                  <div className="w-28 sm:w-36 text-right shrink-0">
                    <div
                      className={`text-xs font-bold font-mono ${
                        isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isProfit ? '+' : ''}
                      {moneyINR(h.pnl.amount)}
                    </div>
                    <span
                      className={`text-[10px] font-mono font-semibold ${
                        isProfit ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {isProfit ? '+' : ''}
                      {h.pnl.pct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}

            {activeHoldingsData.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-400">
                No active positions available for P&amp;L comparison.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: DEMAT MARGIN & CAPITAL HEALTH */}
      {activeTab === 'margin' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Radial Margin Gauge */}
          <div className="md:col-span-5 flex flex-col items-center justify-center p-4">
            <div className="relative w-64 h-64 flex items-center justify-center">
              <svg viewBox="0 0 240 240" className="w-full h-full transform -rotate-90">
                {/* Track Circle */}
                <circle
                  cx={120}
                  cy={120}
                  r={88}
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth={20}
                  className="opacity-40 dark:opacity-20"
                />

                {/* Used Margin Arc */}
                <circle
                  cx={120}
                  cy={120}
                  r={88}
                  fill="none"
                  stroke={marginUtilizationPct > 75 ? '#ef4444' : marginUtilizationPct > 50 ? '#f59e0b' : '#10b981'}
                  strokeWidth={20}
                  strokeDasharray={`${(marginUtilizationPct / 100) * 552.92} 552.92`}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />

                {/* Inner Available Cash Track */}
                <circle
                  cx={120}
                  cy={120}
                  r={60}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={12}
                  strokeDasharray={`${(cashReservePct / 100) * 376.99} 376.99`}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out opacity-80"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Margin In Use
                </span>
                <span className="text-2xl font-black font-mono text-zinc-950 dark:text-white">
                  {marginUtilizationPct.toFixed(1)}%
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 border ${
                    marginUtilizationPct > 75
                      ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                      : marginUtilizationPct > 50
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  }`}
                >
                  {marginUtilizationPct > 75 ? 'Critical Margin' : marginUtilizationPct > 50 ? 'Moderate Margin' : 'Conservative'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs mt-2">
              <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Used Margin</span>
              </span>
              <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>Liquid Buffer</span>
              </span>
            </div>
          </div>

          {/* Upstox Demat Funds Ledger Card */}
          <div className="md:col-span-7 space-y-3">
            <div className="p-4 rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/60 border border-black/[0.05] dark:border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Total Upstox Demat Equity
                </span>
                <span className="text-base font-bold font-mono text-zinc-950 dark:text-white">
                  {moneyINR(totalEquity)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-black/[0.04] dark:border-white/5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Available Liquid Trading Margin</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {moneyINR(availableMargin)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-black/[0.04] dark:border-white/5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Collateral / Margin Used</span>
                <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                  {moneyINR(usedMargin)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-black/[0.04] dark:border-white/5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">CNC Delivery Value (Invested)</span>
                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {moneyINR(investedCapital)}
                </span>
              </div>
            </div>

            {/* SEBI Compliance & Sentinel Notice */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/30 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                <strong>SEBI Peak Margin Compliance:</strong> Margin utilization is continuously monitored against exchange risk parameters. If utilization exceeds 80%, the Sentinel automatically suppresses new orders to prevent margin penalty calls.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
