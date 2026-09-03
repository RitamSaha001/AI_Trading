import React, { useMemo, useState, useRef, useCallback } from 'react';
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

/**
 * Computes a smooth Catmull-Rom cubic Bezier curve string from points.
 */
function getSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }
  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export function LineChart({
  data,
  candles = [],
  height = 290,
  positive = true,
  fill = true,
  showControls = true,
}: ChartProps) {
  const [mode, setMode] = useState<'line' | 'candle'>('line');
  const [showOverlays, setShowOverlays] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const w = 920;
  const paddingX = 20;
  const bottomAxisHeight = 26;
  const volumeHeight = 28;
  const chartHeight = height - bottomAxisHeight - volumeHeight;

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
    const rawRange = max - min || 1;
    // Add 6% headroom and footroom for ultra-clean breathing room
    return {
      min: min - rawRange * 0.06,
      max: max + rawRange * 0.06,
      range: rawRange * 1.12,
    };
  }, [points, mode, candles]);

  // Volume metrics
  const maxVolume = useMemo(() => {
    if (!candles.length) return 1;
    return Math.max(...candles.map((c) => c.volume), 1);
  }, [candles]);

  // Compute 2D points
  const coords = useMemo(() => {
    if (points.length < 2) return [];
    return points.map((v, i) => ({
      x: paddingX + (i / (points.length - 1)) * (w - paddingX * 2),
      y: chartHeight - ((v - stats.min) / stats.range) * chartHeight,
    }));
  }, [points, stats, chartHeight, w]);

  // Smooth SVG Path
  const smoothLinePath = useMemo(() => getSmoothPath(coords), [coords]);

  // 10-period SMA overlay path
  const sma10Path = useMemo(() => {
    if (!showOverlays || points.length < 10) return '';
    const smaCoords: { x: number; y: number }[] = [];
    for (let i = 9; i < points.length; i++) {
      const slice = points.slice(i - 9, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / 10;
      const x = paddingX + (i / (points.length - 1)) * (w - paddingX * 2);
      const y = chartHeight - ((avg - stats.min) / stats.range) * chartHeight;
      smaCoords.push({ x, y });
    }
    return getSmoothPath(smaCoords);
  }, [showOverlays, points, stats, chartHeight, w]);

  // 30-period SMA overlay path
  const sma30Path = useMemo(() => {
    if (!showOverlays || points.length < 30) return '';
    const smaCoords: { x: number; y: number }[] = [];
    for (let i = 29; i < points.length; i++) {
      const slice = points.slice(i - 29, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / 30;
      const x = paddingX + (i / (points.length - 1)) * (w - paddingX * 2);
      const y = chartHeight - ((avg - stats.min) / stats.range) * chartHeight;
      smaCoords.push({ x, y });
    }
    return getSmoothPath(smaCoords);
  }, [showOverlays, points, stats, chartHeight, w]);

  // Time-wise label markers (5 evenly spaced)
  const timeLabels = useMemo(() => {
    if (candles.length > 4) {
      const step = Math.floor((candles.length - 1) / 4);
      const indices = [0, step, step * 2, step * 3, candles.length - 1];
      return indices.map((idx) => {
        const c = candles[idx];
        const date = new Date(c?.time || Date.now());
        const x = paddingX + (idx / (candles.length - 1)) * (w - paddingX * 2);
        return {
          x,
          label: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      });
    }
    return [
      { x: paddingX, label: 'Start' },
      { x: paddingX + (w - paddingX * 2) * 0.25, label: '-18h' },
      { x: paddingX + (w - paddingX * 2) * 0.5, label: '-12h' },
      { x: paddingX + (w - paddingX * 2) * 0.75, label: '-6h' },
      { x: w - paddingX, label: 'Now' },
    ];
  }, [candles, w, paddingX]);

  // Price ticks on vertical axis (3 levels)
  const priceTicks = useMemo(() => {
    const p1 = stats.min + stats.range * 0.85;
    const p2 = stats.min + stats.range * 0.5;
    const p3 = stats.min + stats.range * 0.15;
    return [
      { y: chartHeight * 0.15, price: p1 },
      { y: chartHeight * 0.5, price: p2 },
      { y: chartHeight * 0.85, price: p3 },
    ];
  }, [stats, chartHeight]);

  // Interactive scrubber handling (touch & mouse)
  const updateHoverFromClientX = useCallback(
    (clientX: number) => {
      if (!svgRef.current || points.length < 2) return;
      const rect = svgRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left - paddingX) / (rect.width - paddingX * 2)));
      const idx = Math.round(pct * (points.length - 1));
      setHoverIndex(idx);
    },
    [points.length, paddingX]
  );

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    updateHoverFromClientX(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches[0]) {
      updateHoverFromClientX(e.touches[0].clientX);
    }
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : null;
  const activePrice = hoverIndex !== null && points[hoverIndex] !== undefined ? points[hoverIndex] : null;
  const startPrice = points[0] || 1;
  const activeDeltaPct = activePrice !== null ? ((activePrice - startPrice) / startPrice) * 100 : null;

  const color = positive ? '#10b981' : '#f43f5e';
  const gradId = useMemo(() => 'grad_' + Math.random().toString(36).substring(2, 7), []);

  return (
    <div className="relative w-full select-none">
      {/* Top Chart Toolbar & Live Inspector */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3 mb-2 border-b border-black/[0.04]">
          <div className="flex items-center gap-1.5">
            <div className="inline-flex p-0.5 rounded-xl bg-black/[0.03] border border-black/[0.04]">
              <button
                type="button"
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'line'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                onClick={() => setMode('line')}
              >
                Smooth Line
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'candle'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                onClick={() => setMode('candle')}
              >
                Candlesticks
              </button>
            </div>

            <button
              type="button"
              className={`px-2.5 py-1 text-xs font-medium rounded-xl border transition-all ${
                showOverlays
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700'
                  : 'border-black/[0.06] text-zinc-500 hover:bg-black/[0.03]'
              }`}
              onClick={() => setShowOverlays((v) => !v)}
            >
              {showOverlays ? '● SMA 10/30' : '○ SMA Overlays'}
            </button>
          </div>

          {/* Minimalist Live Scrubber Display */}
          <div className="flex items-center gap-3 text-xs">
            {activePrice !== null ? (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-black/[0.02] px-3 py-1 rounded-xl border border-black/[0.03]">
                {activeCandle && (
                  <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                    <span>O: <strong className="text-zinc-800">{money(activeCandle.open)}</strong></span>
                    <span>H: <strong className="text-zinc-800">{money(activeCandle.high)}</strong></span>
                    <span>L: <strong className="text-zinc-800">{money(activeCandle.low)}</strong></span>
                  </div>
                )}
                <span className="font-bold text-zinc-950 font-mono text-sm">
                  {money(activePrice)}
                </span>
                {activeDeltaPct !== null && (
                  <span
                    className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                      activeDeltaPct >= 0
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : 'bg-rose-500/10 text-rose-700'
                    }`}
                  >
                    {activeDeltaPct >= 0 ? '+' : ''}
                    {activeDeltaPct.toFixed(2)}%
                  </span>
                )}
                {activeCandle?.time && (
                  <span className="text-zinc-400 text-[11px] font-medium hidden md:inline">
                    {new Date(activeCandle.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-zinc-400 text-[11px] tracking-tight">
                Hover or slide finger to inspect timeline
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Vector Surface */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${height}`}
        className="w-full overflow-visible cursor-crosshair touch-none select-none"
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="60%" stopColor={color} stopOpacity="0.04" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor={color} floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Minimalist Horizontal Reference Lines & Right Price Ticks */}
        {priceTicks.map((pt, idx) => (
          <g key={idx}>
            <line
              x1={paddingX}
              y1={pt.y}
              x2={w - paddingX}
              y2={pt.y}
              stroke="currentColor"
              strokeDasharray="3 6"
              className="text-black/[0.04]"
            />
            <text
              x={w - paddingX}
              y={pt.y - 4}
              textAnchor="end"
              className="text-[10px] font-mono fill-zinc-400 font-medium select-none"
            >
              {money(pt.price)}
            </text>
          </g>
        ))}

        {/* Minimalist Volume Histograms at Baseline */}
        {candles.map((c, i) => {
          const x = paddingX + (i / Math.max(candles.length - 1, 1)) * (w - paddingX * 2);
          const barW = Math.max(1.8, ((w - paddingX * 2) / candles.length) * 0.55);
          const barH = (c.volume / maxVolume) * volumeHeight;
          const y = height - bottomAxisHeight - barH;
          const isUp = c.close >= c.open;
          const isHovered = hoverIndex === i;

          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={y}
              width={barW}
              height={Math.max(1, barH)}
              fill={isUp ? '#10b981' : '#f43f5e'}
              opacity={isHovered ? 0.75 : 0.16}
              rx={0.6}
            />
          );
        })}

        {/* Mode: Minimalist Smooth Area Curve */}
        {mode === 'line' && (
          <g>
            {fill && smoothLinePath && (
              <path
                d={`${smoothLinePath} L ${w - paddingX} ${chartHeight} L ${paddingX} ${chartHeight} Z`}
                fill={`url(#${gradId})`}
              />
            )}
            {smoothLinePath && (
              <path
                d={smoothLinePath}
                fill="none"
                stroke={color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
              />
            )}
          </g>
        )}

        {/* Mode: Minimalist Japanese Candlesticks */}
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
            const candleWidth = Math.max(2.4, ((w - paddingX * 2) / candles.length) * 0.68);

            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={candleColor}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <rect
                  x={x - candleWidth / 2}
                  y={bodyY}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={candleColor}
                  rx={1}
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
            strokeWidth="1.6"
            strokeDasharray="3 3"
            opacity="0.85"
          />
        )}
        {showOverlays && sma30Path && (
          <path
            d={sma30Path}
            fill="none"
            stroke="#6366f1"
            strokeWidth="1.6"
            strokeDasharray="4 4"
            opacity="0.85"
          />
        )}

        {/* Time-wise Axis Labels */}
        <g className="select-none">
          {timeLabels.map((tl, i) => (
            <text
              key={i}
              x={tl.x}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === timeLabels.length - 1 ? 'end' : 'middle'}
              className="text-[10px] font-mono fill-zinc-400 font-medium"
            >
              {tl.label}
            </text>
          ))}
        </g>

        {/* Interactive Hover Crosshair with Pulsing Beacon */}
        {hoverIndex !== null && coords[hoverIndex] && (
          <g>
            {/* Vertical Guide Line */}
            <line
              x1={coords[hoverIndex].x}
              y1={0}
              x2={coords[hoverIndex].x}
              y2={height - bottomAxisHeight}
              stroke="rgba(0, 0, 0, 0.22)"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            {/* Horizontal Guide Line */}
            <line
              x1={paddingX}
              y1={coords[hoverIndex].y}
              x2={w - paddingX}
              y2={coords[hoverIndex].y}
              stroke="rgba(0, 0, 0, 0.16)"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            {/* Outer halo */}
            <circle
              cx={coords[hoverIndex].x}
              cy={coords[hoverIndex].y}
              r="8"
              fill={color}
              opacity="0.2"
            />
            {/* Inner Core */}
            <circle
              cx={coords[hoverIndex].x}
              cy={coords[hoverIndex].y}
              r="4.5"
              fill="#ffffff"
              stroke={color}
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * Minimalist Smooth Sparkline Component for tables & market cards.
 */
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
  const paddingY = 4;

  const path = useMemo(() => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * w,
      y: height - paddingY - ((v - min) / range) * (height - paddingY * 2),
    }));
    return getSmoothPath(pts);
  }, [data, height]);

  const color = positive ? '#10b981' : '#f43f5e';
  const gradId = useMemo(() => 'spark_grad_' + Math.random().toString(36).substring(2, 7), []);

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {path && (
        <path
          d={`${path} L ${w} ${height} L 0 ${height} Z`}
          fill={`url(#${gradId})`}
        />
      )}
      {path && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
