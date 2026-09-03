import React from 'react';
import { DataSource } from '../types';
import { Radio, Wifi, WifiOff, AlertTriangle, Cpu } from 'lucide-react';

interface Props {
  source?: DataSource;
  isSynthetic?: boolean;
  lastUpdated?: number;
}

export const DataSourceBadge: React.FC<Props> = ({
  source = 'Binance WebSocket (Live)',
  isSynthetic = false,
  lastUpdated,
}) => {
  const now = Date.now();
  const isStale = lastUpdated ? now - lastUpdated > 25000 : false;

  if (isSynthetic) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"
        title="Public exchange networks are unreachable or rate-limited. Operating on deterministic heuristic simulation."
      >
        <Cpu className="w-3 h-3 text-amber-400" />
        <span>SIMULATED / HEURISTIC FEED</span>
      </div>
    );
  }

  if (isStale) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 animate-pulse"
        title="Quote data has not refreshed recently (>25s)."
      >
        <AlertTriangle className="w-3 h-3 text-rose-400" />
        <span>STALE FEED ({source})</span>
      </div>
    );
  }

  if (source === 'Binance WebSocket (Live)') {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
        title="Real-time WebSocket connection to Binance miniTicker stream active."
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>LIVE WEBSOCKET (BINANCE)</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
      title={`Operating on ${source} REST polling`}
    >
      <Radio className="w-3 h-3 text-cyan-400" />
      <span>{source.toUpperCase()}</span>
    </div>
  );
};
