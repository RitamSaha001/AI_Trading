import React, { useMemo, useState, useRef } from 'react';
import { Candle } from './types';
import { money } from './trading';

interface ChartProps {
  data: number[];
  candles?: Candle[];
  height?: number;
  positive?: boolean;
  fill?: boolean;
  showControls?: boolean;
}

export function LineChart({
  data,
  candles = [],
  height = 260,
  positive = true,
  fill = true,
  showControls = true,
}: ChartProps) {
  const [mode, setMode] = useState<'line' | 'candle'>('line');
  const [showOverlays, setShowOverlays] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const w = 920;
  const paddingX = 16;
  const chartHeight = height - 55; // reserve space for volume bar at bottom
  const volumeHeight = 35;

  // Compute metrics
  const points = useMemo(() => {
    if (mode === 'candle' && candles.length > 0) {
      return candles.map((c) => c.close);
    }
    return data;
  }, [mode, candles, data]);

  const stats = useMemo(() => {
    if (!points.length) return { min: 0, max: 1, range: 1 };
    let min = Math.min(...points);
    let max = Math.max(...points);
    if (mode === 'candle' && candles.length > 0) {
      min = Math.min(...candles.map((c) => c.low));
      max = Math.max(...candles.map((c) => c.high));
    }
    const range = max - min || 1;
    // Add 4% buffer top and bottom for visual breathing room
    return {
      min: min - range * 0.04,
      max: max + range * 0.04,
      range: range * 1.08,
    };
  }, [points, mode, candles]);

  // Volume metrics
  const maxVolume = useMemo(() => {
    if (!candles.length) return 1;
    return Math.max(...candles.map((c) => c.volume), 1);
  }, [candles]);

  // SVG Paths
  const linePath = useMemo(() => {
    if (points.length < 2) return '';
    return points
      .map((v, i) => {
        const x = paddingX + (i / (points.length - 1)) * (w - paddingX * 2);
        const y = chartHeight - ((v - stats.min) / stats.range) * chartHeight;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points, stats, chartHeight, w]);

  // 10-period SMA overlay path
  const sma10Path = useMemo(() => {
    if (!showOverlays || points.length < 10) return '';
    const smaVals: { x: number; y: number }[] = [];
    for (let i = 9; i < points.length; i++) {
      const slice = points.slice(i - 9, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / 10;
      const x = paddingX + (i / (points.length - 1)) * (w - paddingX * 2);
      const y = chartHeight - ((avg - stats.min) / stats.range) * chartHeight;
      smaVals.push({ x, y });
    }
    return smaVals.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [showOverlays, points, stats, chartHeight, w]);

  // 30-period SMA overlay path
  const sma30Path = useMemo(() => {
    if (!showOverlays || points.length < 30) return '';
    const smaVals: { x: number; y: number }[] = [];
    for (let i = 29; i < points.length; i++) {
      const slice = points.slice(i - 29, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / 30;
      const x = paddingX + (i / (points.length - 1)) * (w - paddingX * 2);
      const y = chartHeight - ((avg - stats.min) / stats.range) * chartHeight;
      smaVals.push({ x, y });
    }
    return smaVals.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [showOverlays, points, stats, chartHeight, w]);

  // Interaction handlers
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, (clientX - paddingX) / (rect.width - paddingX * 2)));
    const idx = Math.round(pct * (points.length - 1));
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : null;
  const activePrice = hoverIndex !== null && points[hoverIndex] !== undefined ? points[hoverIndex] : null;

  const color = positive ? '#10b981' : '#f43f5e';
  const gradId = useMemo(() => 'grad_' + Math.random().toString(36).substring(2, 7), []);

  return (
    <div className="relative w-full select-none">
      {showControls && (
        <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-black/[0.04]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                mode === 'line'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-black/[0.04]'
              }`}
              onClick={() => setMode('line')}
            >
              Line
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                mode === 'candle'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-black/[0.04]'
              }`}
              onClick={() => setMode('candle')}
            >
              Candles
            </button>
            <button
              type="button"
              className={`ml-2 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                showOverlays
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700'
                  : 'border-black/[0.08] text-zinc-500 hover:bg-black/[0.03]'
              }`}
              onClick={() => setShowOverlays((v) => !v)}
            >
              {showOverlays ? '● SMA 10/30 On' : '○ Overlays'}
            </button>
          </div>

          {/* Scrubber Inspector */}
          <div className="text-right text-xs">
            {activePrice !== null ? (
              <div className="flex items-center gap-3">
                {activeCandle && (
                  <span className="text-zinc-400 font-mono hidden sm:inline">
                    O: <strong className="text-zinc-700">{money(activeCandle.open)}</strong> H:{' '}
                    <strong className="text-zinc-700">{money(activeCandle.high)}</strong> L:{' '}
                    <strong className="text-zinc-700">{money(activeCandle.low)}</strong>
                  </span>
                )}
                <span className="font-semibold text-zinc-900 font-mono">
                  {money(activePrice)}
                </span>
                {activeCandle?.time && (
                  <span className="text-zinc-400 text-[11px]">
                    {new Date(activeCandle.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-zinc-400 text-[11px]">Hover over chart to inspect</span>
            )}
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${height}`}
        className="w-full overflow-visible cursor-crosshair touch-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="65%" stopColor={color} stopOpacity="0.05" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle Horizontal Grid lines */}
        {[0.2, 0.5, 0.8].map((ratio, idx) => (
          <line
            key={idx}
            x1={paddingX}
            y1={chartHeight * ratio}
            x2={w - paddingX}
            y2={chartHeight * ratio}
            stroke="currentColor"
            strokeDasharray="4 6"
            className="text-black/[0.04]"
          />
        ))}

        {/* Volume Bars */}
        {candles.map((c, i) => {
          const x = paddingX + (i / Math.max(candles.length - 1, 1)) * (w - paddingX * 2);
          const barW = Math.max(1.8, ((w - paddingX * 2) / candles.length) * 0.65);
          const barH = (c.volume / maxVolume) * volumeHeight;
          const y = height - barH;
          const isUp = c.close >= c.open;
          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={y}
              width={barW}
              height={barH}
              fill={isUp ? '#10b981' : '#f43f5e'}
              opacity={hoverIndex === i ? 0.6 : 0.2}
              rx={0.8}
            />
          );
        })}

        {/* Mode: Area Line Chart */}
        {mode === 'line' && (
          <>
            {fill && linePath && (
              <path
                d={`${linePath} L ${w - paddingX} ${chartHeight} L ${paddingX} ${chartHeight} Z`}
                fill={`url(#${gradId})`}
              />
            )}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </>
        )}

        {/* Mode: Japanese Candlesticks */}
        {mode === 'candle' &&
          candles.map((c, i) => {
            const x = paddingX + (i / Math.max(candles.length - 1, 1)) * (w - paddingX * 2);
            const highY = chartHeight - ((c.high - stats.min) / stats.range) * chartHeight;
            const lowY = chartHeight - ((c.low - stats.min) / stats.range) * chartHeight;
            const openY = chartHeight - ((c.open - stats.min) / stats.range) * chartHeight;
            const closeY = chartHeight - ((c.close - stats.min) / stats.range) * chartHeight;

            const isUp = c.close >= c.open;
            const candleColor = isUp ? '#10b981' : '#f43f5e';
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(1.8, Math.abs(closeY - openY));
            const candleWidth = Math.max(2.5, ((w - paddingX * 2) / candles.length) * 0.7);

            return (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={candleColor}
                  strokeWidth="1.2"
                />
                {/* Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={bodyY}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={candleColor}
                  rx={0.8}
                />
              </g>
            );
          })}

        {/* Moving Average Overlays */}
        {showOverlays && sma10Path && (
          <path
            d={sma10Path}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="2 2"
            opacity="0.85"
          />
        )}
        {showOverlays && sma30Path && (
          <path
            d={sma30Path}
            fill="none"
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.85"
          />
        )}

        {/* Hover Crosshair */}
        {hoverIndex !== null && points[hoverIndex] !== undefined && (
          <g>
            {(() => {
              const hx = paddingX + (hoverIndex / Math.max(points.length - 1, 1)) * (w - paddingX * 2);
              const hy = chartHeight - ((points[hoverIndex] - stats.min) / stats.range) * chartHeight;
              return (
                <>
                  <line
                    x1={hx}
                    y1={0}
                    x2={hx}
                    y2={height}
                    stroke="rgba(0,0,0,0.25)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <line
                    x1={paddingX}
                    y1={hy}
                    x2={w - paddingX}
                    y2={hy}
                    stroke="rgba(0,0,0,0.25)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <circle cx={hx} cy={hy} r="5" fill="#fff" stroke={color} strokeWidth="2.5" />
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}

export function Sparkline({
  data,
  positive = true,
  height = 36,
}: {
  data: number[];
  positive?: boolean;
  height?: number;
}) {
  const w = 120;
  const path = useMemo(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = height - 4 - ((v - min) / range) * (height - 8);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, height]);

  const color = positive ? '#10b981' : '#f43f5e';

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
