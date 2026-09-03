import React, { useState, useMemo } from 'react';
import { useLumen } from '../store';
import { ASSETS, Asset, Market } from '../types';
import { META, money } from '../trading';
import { go } from '../Shell';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  LayoutGrid,
  Maximize2,
  Filter,
  BarChart2,
  Eye,
  ArrowRight,
} from 'lucide-react';

export interface MarketHeatmapProps {
  markets?: Record<Asset, Market | undefined>;
  onSelectAsset?: (asset: Asset) => void;
  selectedAsset?: Asset;
  className?: string;
}

type FilterMode = 'all' | 'gainers' | 'losers';
type LayoutMode = 'weighted' | 'uniform';

interface HeatmapTileColor {
  containerBg: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  textColor: string;
  intensityLabel: string;
}

function getTileColor(change24h: number): HeatmapTileColor {
  if (change24h >= 5) {
    return {
      containerBg: 'bg-emerald-500/[0.14] hover:bg-emerald-500/[0.22]',
      borderColor: 'border-emerald-500/35 hover:border-emerald-500/60',
      badgeBg: 'bg-emerald-600',
      badgeText: 'text-white',
      textColor: 'text-emerald-950',
      intensityLabel: 'Strong Gain (≥ +5%)',
    };
  }
  if (change24h >= 2) {
    return {
      containerBg: 'bg-emerald-500/[0.09] hover:bg-emerald-500/[0.16]',
      borderColor: 'border-emerald-500/25 hover:border-emerald-500/50',
      badgeBg: 'bg-emerald-500',
      badgeText: 'text-white',
      textColor: 'text-emerald-900',
      intensityLabel: 'Moderate Gain (+2% to +5%)',
    };
  }
  if (change24h > 0) {
    return {
      containerBg: 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.10]',
      borderColor: 'border-emerald-500/15 hover:border-emerald-500/35',
      badgeBg: 'bg-emerald-500/20',
      badgeText: 'text-emerald-700',
      textColor: 'text-emerald-800',
      intensityLabel: 'Mild Gain (0% to +2%)',
    };
  }
  if (change24h === 0) {
    return {
      containerBg: 'bg-zinc-500/[0.04] hover:bg-zinc-500/[0.08]',
      borderColor: 'border-zinc-300 hover:border-zinc-400',
      badgeBg: 'bg-zinc-200',
      badgeText: 'text-zinc-700',
      textColor: 'text-zinc-700',
      intensityLabel: 'Neutral (0%)',
    };
  }
  if (change24h > -2) {
    return {
      containerBg: 'bg-rose-500/[0.04] hover:bg-rose-500/[0.10]',
      borderColor: 'border-rose-500/15 hover:border-rose-500/35',
      badgeBg: 'bg-rose-500/20',
      badgeText: 'text-rose-700',
      textColor: 'text-rose-800',
      intensityLabel: 'Mild Dip (0% to -2%)',
    };
  }
  if (change24h > -5) {
    return {
      containerBg: 'bg-rose-500/[0.09] hover:bg-rose-500/[0.16]',
      borderColor: 'border-rose-500/25 hover:border-rose-500/50',
      badgeBg: 'bg-rose-500',
      badgeText: 'text-white',
      textColor: 'text-rose-900',
      intensityLabel: 'Moderate Dip (-2% to -5%)',
    };
  }
  return {
    containerBg: 'bg-rose-500/[0.14] hover:bg-rose-500/[0.22]',
    borderColor: 'border-rose-500/35 hover:border-rose-500/60',
    badgeBg: 'bg-rose-600',
    badgeText: 'text-white',
    textColor: 'text-rose-950',
    intensityLabel: 'Strong Dip (≤ -5%)',
  };
}

export function MarketHeatmap({
  markets: propMarkets,
  onSelectAsset: propOnSelectAsset,
  selectedAsset: propSelectedAsset,
  className = '',
}: MarketHeatmapProps) {
  const store = useLumen();
  const markets = propMarkets ?? store.markets;
  const onSelectAsset = propOnSelectAsset ?? store.setSelectedAsset;
  const currentSelected = propSelectedAsset ?? store.state.selectedAsset;

  const [filter, setFilter] = useState<FilterMode>('all');
  const [layout, setLayout] = useState<LayoutMode>('weighted');
  const [hoveredAsset, setHoveredAsset] = useState<Asset | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Compute market performance summary
  const summary = useMemo(() => {
    let totalChange = 0;
    let gainers = 0;
    let losers = 0;
    let topGainer: { asset: Asset; change: number } | null = null;
    let topLoser: { asset: Asset; change: number } | null = null;
    let totalVolume = 0;

    for (const a of ASSETS) {
      const m = markets[a];
      const chg = m?.change24h || 0;
      totalChange += chg;
      totalVolume += m?.volume24h || 0;

      if (chg >= 0) gainers++;
      else losers++;

      if (!topGainer || chg > topGainer.change) {
        topGainer = { asset: a, change: chg };
      }
      if (!topLoser || chg < topLoser.change) {
        topLoser = { asset: a, change: chg };
      }
    }

    const avgChange = ASSETS.length > 0 ? totalChange / ASSETS.length : 0;
    return { avgChange, gainers, losers, topGainer, topLoser, totalVolume };
  }, [markets]);

  // Filter and sort assets
  const visibleAssets = useMemo(() => {
    const list = ASSETS.filter((a) => {
      const m = markets[a];
      const chg = m?.change24h || 0;
      if (filter === 'gainers') return chg >= 0;
      if (filter === 'losers') return chg < 0;
      return true;
    }).sort((a, b) => {
      const ma = markets[a];
      const mb = markets[b];
      // Sort by absolute volume / importance for treemap weighting
      if (layout === 'weighted') {
        const volA = (ma?.price || 0) * (ma?.volume24h || 1);
        const volB = (mb?.price || 0) * (mb?.volume24h || 1);
        return volB - volA;
      }
      // Or by 24h change
      return (mb?.change24h || 0) - (ma?.change24h || 0);
    });
    return showAll ? list : list.slice(0, 24);
  }, [markets, filter, layout, showAll]);

  const handleTileClick = (asset: Asset) => {
    onSelectAsset(asset);
  };

  const handleInspect = (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    onSelectAsset(asset);
    go('/');
  };

  const handleTrade = (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    onSelectAsset(asset);
    go('/orders');
  };

  return (
    <div
      id="market-heatmap-container"
      className={`p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)] ${className}`}
    >
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-black/[0.05]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                Market Performance Heatmap
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/70">
                  24h Delta
                </span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Real-time visual map of price velocity across monitored cryptocurrency assets.
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Filter tabs */}
          <div className="flex items-center bg-black/[0.04] p-1 rounded-xl border border-black/[0.04]">
            <button
              id="heatmap-filter-all"
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filter === 'all'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              All ({ASSETS.length})
            </button>
            <button
              id="heatmap-filter-gainers"
              type="button"
              onClick={() => setFilter('gainers')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                filter === 'gainers'
                  ? 'bg-white text-emerald-700 shadow-xs font-semibold'
                  : 'text-zinc-600 hover:text-emerald-600'
              }`}
            >
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              Gainers ({summary.gainers})
            </button>
            <button
              id="heatmap-filter-losers"
              type="button"
              onClick={() => setFilter('losers')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                filter === 'losers'
                  ? 'bg-white text-rose-700 shadow-xs font-semibold'
                  : 'text-zinc-600 hover:text-rose-600'
              }`}
            >
              <TrendingDown className="w-3 h-3 text-rose-600" />
              Losers ({summary.losers})
            </button>
          </div>

          {/* Layout mode toggle */}
          <div className="flex items-center bg-black/[0.04] p-1 rounded-xl border border-black/[0.04]">
            <button
              id="heatmap-layout-weighted"
              type="button"
              onClick={() => setLayout('weighted')}
              title="Weighted Hierarchy View"
              className={`p-1.5 rounded-lg transition-all ${
                layout === 'weighted'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              id="heatmap-layout-uniform"
              type="button"
              onClick={() => setLayout('uniform')}
              title="Uniform Grid View"
              className={`p-1.5 rounded-lg transition-all ${
                layout === 'uniform'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Snapshot bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 p-3 rounded-2xl bg-black/[0.02] border border-black/[0.04] text-xs">
        <div>
          <span className="text-[11px] text-zinc-400 block font-medium">Market Average</span>
          <span
            className={`font-semibold font-mono inline-flex items-center gap-1 ${
              summary.avgChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {summary.avgChange >= 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
            {summary.avgChange >= 0 ? '+' : ''}
            {summary.avgChange.toFixed(2)}%
          </span>
        </div>

        <div>
          <span className="text-[11px] text-zinc-400 block font-medium">Top Performer</span>
          <span className="font-semibold text-zinc-900 inline-flex items-center gap-1.5">
            {summary.topGainer ? (
              <>
                <span className="font-mono text-emerald-600 font-bold">
                  {summary.topGainer.asset}
                </span>
                <span className="text-emerald-600 font-mono text-[11px]">
                  +{summary.topGainer.change.toFixed(2)}%
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-zinc-400 block font-medium">Top Laggard</span>
          <span className="font-semibold text-zinc-900 inline-flex items-center gap-1.5">
            {summary.topLoser ? (
              <>
                <span className="font-mono text-rose-600 font-bold">
                  {summary.topLoser.asset}
                </span>
                <span className="text-rose-600 font-mono text-[11px]">
                  {summary.topLoser.change.toFixed(2)}%
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>

        <div>
          <span className="text-[11px] text-zinc-400 block font-medium">Sentiment Ratio</span>
          <span className="font-medium text-zinc-800">
            {summary.gainers} Advancing / {summary.losers} Declining
          </span>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div
        className={
          layout === 'weighted'
            ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-3.5'
            : 'grid grid-cols-2 sm:grid-cols-4 gap-3.5'
        }
      >
        {visibleAssets.map((asset, idx) => {
          const m = markets[asset];
          const meta = META[asset];
          const chg = m?.change24h || 0;
          const isUp = chg >= 0;
          const style = getTileColor(chg);
          const isSelected = currentSelected === asset;

          // Proportional layout weighting
          let colSpan = 'col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-3';
          let minHeight = 'min-h-[148px]';

          if (layout === 'weighted') {
            if (asset === 'BTC' || asset === 'ETH') {
              colSpan = 'col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-6';
              minHeight = 'min-h-[170px]';
            } else if (asset === 'SOL' || asset === 'XRP') {
              colSpan = 'col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-3';
              minHeight = 'min-h-[155px]';
            } else {
              colSpan = 'col-span-1 sm:col-span-1 md:col-span-3 lg:col-span-3';
              minHeight = 'min-h-[148px]';
            }
          }

          return (
            <div
              key={asset}
              id={`market-heatmap-tile-${asset.toLowerCase()}`}
              role="button"
              tabIndex={0}
              onClick={() => handleTileClick(asset)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTileClick(asset);
                }
              }}
              onMouseEnter={() => setHoveredAsset(asset)}
              onMouseLeave={() => setHoveredAsset(null)}
              className={`group relative flex flex-col justify-between p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${colSpan} ${minHeight} ${style.containerBg} ${style.borderColor} ${
                isSelected
                  ? 'ring-2 ring-indigo-500/80 shadow-md scale-[1.01]'
                  : 'hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              {/* Tile Top: Symbol, Name & Badges */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-[11px] shadow-xs shrink-0"
                      style={{ backgroundColor: meta?.iconColor || '#222' }}
                    >
                      {asset}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-zinc-950 tracking-tight">
                          {asset}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-600 text-white tracking-wide">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-500 line-clamp-1">
                        {meta?.name}
                      </span>
                    </div>
                  </div>

                  {/* 24h Change Pill */}
                  <div
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold font-mono tracking-tight shadow-2xs ${style.badgeBg} ${style.badgeText}`}
                  >
                    {isUp ? (
                      <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 stroke-[2.5]" />
                    )}
                    {isUp ? '+' : ''}
                    {chg.toFixed(2)}%
                  </div>
                </div>

                {/* Price Display */}
                <div className="mt-3.5">
                  <div className="text-xl md:text-2xl font-bold font-mono tracking-tight text-zinc-950">
                    {m ? money(m.price) : '—'}
                  </div>
                </div>
              </div>

              {/* Tile Bottom: Volume & Quick Actions */}
              <div className="mt-3 pt-2.5 border-t border-black/[0.05] flex items-center justify-between text-[11px]">
                <div className="text-zinc-500 font-medium">
                  {m?.volume24h ? (
                    <span>
                      Vol: <strong className="text-zinc-700 font-mono">{m.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                    </span>
                  ) : (
                    <span>Range: L {m ? money(m.low24h) : '—'}</span>
                  )}
                </div>

                {/* Quick actions that appear on hover or focus */}
                <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    id={`heatmap-analyze-${asset.toLowerCase()}`}
                    onClick={(e) => handleInspect(e, asset)}
                    title="Analyze Asset on Dashboard"
                    className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-zinc-700 hover:text-zinc-950 border border-black/[0.06] shadow-2xs transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    id={`heatmap-trade-${asset.toLowerCase()}`}
                    onClick={(e) => handleTrade(e, asset)}
                    title="Open Trade Ticket"
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs transition-all"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand/Collapse 108 Markets Toggle */}
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-black/[0.08] bg-white hover:bg-black/[0.03] text-zinc-700 shadow-xs transition-all flex items-center gap-1.5"
        >
          <span>{showAll ? 'Show Top 24 Leading Markets' : `Expand Full Heatmap (All ${ASSETS.length} Markets)`}</span>
        </button>
      </div>

      {/* Heatmap Legend */}
      <div className="mt-5 pt-4 border-t border-black/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-600">Color Intensity:</span>
          <div className="flex items-center gap-1">
            <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">
              ≤ -5%
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-500 text-white text-[10px] font-semibold">
              -2%
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px] font-medium">
              0%
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-semibold">
              +2%
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
              ≥ +5%
            </span>
          </div>
        </div>

        <div className="text-[11px] text-zinc-400">
          Click any tile to set active target • Hover for quick inspection
        </div>
      </div>
    </div>
  );
}
