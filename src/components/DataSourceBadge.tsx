import React from 'react';
import { DataSource } from '../types';

interface Props {
  source?: DataSource;
  isSynthetic?: boolean;
  lastUpdated?: number;
  isReconnecting?: boolean;
}

export const DataSourceBadge: React.FC<Props> = ({
  source = 'Binance WebSocket (Live)',
  isSynthetic = false,
  lastUpdated,
  isReconnecting = false,
}) => {
  const now = Date.now();
  const ageMs = lastUpdated ? Math.max(0, now - lastUpdated) : Infinity;
  const ageSec = Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : 999;

  // Connection Health States:
  // 🟢 Connected: (WebSocket alive, data < 10s old)
  // 🟡 Degraded: (data 10-45s old, or WS reconnecting, or synthetic)
  // 🔴 Disconnected: (WS dead, data > 45s old)
  if (!lastUpdated || ageMs > 45000) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-700 border border-rose-500/25 shadow-2xs"
        title={`🔴 Disconnected: Market feed is offline or quote exceeds 45s threshold (${ageSec}s stale). Executable trading is safeguarded.`}
      >
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        <span className="font-semibold">DISCONNECTED</span>
        <span className="text-[10px] opacity-80 font-mono">(&gt;45s)</span>
      </div>
    );
  }

  if (ageMs >= 10000 || isSynthetic || isReconnecting) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-700 border border-amber-500/25 shadow-2xs animate-pulse"
        title={`🟡 Degraded: Market data latency elevated (10-45s, currently ${ageSec}s)${isReconnecting ? ' [reconnecting]' : ''}${isSynthetic ? ' [synthetic fallback]' : ''}. Source: ${source}`}
      >
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="font-semibold">DEGRADED</span>
        <span className="text-[10px] opacity-80 font-mono">({ageSec}s)</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/25 shadow-2xs"
      title={`🟢 Connected: Live market stream active with <10s latency (currently ${ageSec}s). Feed: ${source}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="font-semibold">CONNECTED</span>
      <span className="text-[10px] opacity-75 font-mono">(&lt;{Math.max(1, ageSec)}s)</span>
    </div>
  );
};
