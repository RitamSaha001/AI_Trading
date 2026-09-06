import React, { useMemo, useState, useRef, useCallback, useEffect, memo } from 'react';
import { Candle } from './types';
import { money, moneyINR } from './trading';

export interface ChartProps {
  data: number[];
  candles?: Candle[];
  height?: number;
  positive?: boolean;
  fill?: boolean;
  showControls?: boolean;
  isINR?: boolean;
  currency?: 'USD' | 'INR';
}

/**
 * High-performance Monotone Cubic Spline (Fritsch-Carlson algorithm).
 * Ensures smooth, natural curvature with strictly zero overshoot or looping,
 * matching Apple Stocks and Bloomberg professional visualization standards.
 */
function getMonotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }

  const dxs: number[] = [];
  const dys: number[] = [];
  const slopes: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    dxs.push(dx);
    dys.push(dy);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  const tangents: number[] = [slopes[0]];
  for (let i = 0; i < n - 2; i++) {
    const m0 = slopes[i];
    const m1 = slopes[i + 1];
    if (m0 * m1 <= 0) {
      tangents.push(0);
    } else {
      const dx0 = dxs[i];
      const dx1 = dxs[i + 1];
      const common = dx0 + dx1;
      tangents.push((3 * common) / ((common + dx1) / m0 + (common + dx0) / m1));
    }
  }
  tangents.push(slopes[n - 2]);

  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = dxs[i];
    const cp1x = p1.x + dx / 3;
    const cp1y = p1.y + (tangents[i] * dx) / 3;
    const cp2x = p2.x - dx / 3;
    const cp2y = p2.y - (tangents[i + 1] * dx) / 3;
    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

let chartCounter = 0;

export function LineChart({
  data,
  candles = [],
  height = 290,
  positive = true,
  fill = true,
  showControls = true,
  isINR = false,
  currency,
}: ChartProps) {
  const [mode, setMode] = useState<'line' | 'candle'>('line');
  const [showOverlays, setShowOverlays] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rectRef = useRef<{ left: number; width: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const instanceId = useMemo(() => ++chartCounter, []);

  const useINR = currency === 'INR' || isINR;
  const formatPrice = useCallback((val: number) => {
    return useINR ? moneyINR(val) : money(val);
  }, [useINR]);

  const w = 920;
  const paddingX = 24;
  const bottomAxisHeight = 24;
  const volumeHeight = 26;
  const chartHeight = Math.max(100, height - bottomAxisHeight - volumeHeight);

  // Apple Stocks Colors (authentic Cupertino design system)
  const appleGreen = '#34C759';
  const appleRed = '#FF3B30';
  const color = positive ? appleGreen : appleRed;

  // Active Points Series
  const points = useMemo(() => {
    if (mode === 'candle' && candles.length > 0) {
      return candles.map((c) => c.close);
    }
    return data;
  }, [mode, candles, data]);

  // Price range with Apple's 5% proportional breathing room
  const stats = useMemo(() => {
    if (!points.length) return { min: 0, max: 1, range: 1 };
    let min = Math.min(...points);
    let max = Math.max(...points);
    if (mode === 'candle' && candles.length > 0) {
      min = Math.min(...candles.map((c) => c.low));
      max = Math.max(...candles.map((c) => c.high));
    }
    const rawRange = max - min || 1;
    const padding = rawRange * 0.05;
    return {
      min: min - padding,
      max: max + padding,
      range: rawRange + padding * 2,
    };
  }, [points, mode, candles]);

  // Volume metrics
  const maxVolume = useMemo(() => {
    if (!candles.length) return 1;
    return Math.max(...candles.map((c) => c.volume), 1);
  }, [candles]);

  // Compute 2D points on grid
  const coords = useMemo(() => {
    if (points.length < 2) return [];
    const len = points.length - 1;
    const spanX = w - paddingX * 2;
    return points.map((v, i) => ({
      x: paddingX + (i / len) * spanX,
      y: chartHeight - ((v - stats.min) / stats.range) * chartHeight,
    }));
  }, [points, stats, chartHeight, w, paddingX]);

  // Monotone smooth line path
  const smoothLinePath = useMemo(() => getMonotonePath(coords), [coords]);

  // 10-period SMA overlay path
  const sma10Path = useMemo(() => {
    if (!showOverlays || points.length < 10) return '';
    const smaCoords: { x: number; y: number }[] = [];
    const len = points.length - 1;
    const spanX = w - paddingX * 2;
    for (let i = 9; i < points.length; i++) {
      const slice = points.slice(i - 9, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / 10;
      const x = paddingX + (i / len) * spanX;
      const y = chartHeight - ((avg - stats.min) / stats.range) * chartHeight;
      smaCoords.push({ x, y });
    }
    return getMonotonePath(smaCoords);
  }, [showOverlays, points, stats, chartHeight, w, paddingX]);

  // 30-period SMA overlay path
  const sma30Path = useMemo(() => {
    if (!showOverlays || points.length < 30) return '';
    const smaCoords: { x: number; y: number }[] = [];
    const len = points.length - 1;
    const spanX = w - paddingX * 2;
    for (let i = 29; i < points.length; i++) {
      const slice = points.slice(i - 29, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / 30;
      const x = paddingX + (i / len) * spanX;
      const y = chartHeight - ((avg - stats.min) / stats.range) * chartHeight;
      smaCoords.push({ x, y });
    }
    return getMonotonePath(smaCoords);
  }, [showOverlays, points, stats, chartHeight, w, paddingX]);

  // Time labels (5 evenly spaced)
  const timeLabels = useMemo(() => {
    if (candles.length > 4) {
      const step = Math.floor((candles.length - 1) / 4);
      const indices = [0, step, step * 2, step * 3, candles.length - 1];
      const spanX = w - paddingX * 2;
      return indices.map((idx) => {
        const c = candles[idx];
        const date = new Date(c?.time || Date.now());
        const x = paddingX + (idx / (candles.length - 1)) * spanX;
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

  // Reference lines on vertical axis (3 levels)
  const priceTicks = useMemo(() => {
    const pTop = stats.min + stats.range * 0.85;
    const pMid = stats.min + stats.range * 0.5;
    const pLow = stats.min + stats.range * 0.15;
    return [
      { y: chartHeight * 0.15, price: pTop },
      { y: chartHeight * 0.5, price: pMid },
      { y: chartHeight * 0.85, price: pLow },
    ];
  }, [stats, chartHeight]);

  // Precomputed candlestick geometry (batched into high-performance primitives)
  const candleGeometry = useMemo(() => {
    if (mode !== 'candle' || candles.length === 0) return null;

    const spanX = w - paddingX * 2;
    const total = Math.max(candles.length - 1, 1);
    const candleWidth = Math.max(2.4, Math.min(12, (spanX / candles.length) * 0.7));

    let bullWickPath = '';
    let bearWickPath = '';
    const bullRects: { x: number; y: number; width: number; height: number }[] = [];
    const bearRects: { x: number; y: number; width: number; height: number }[] = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = paddingX + (i / total) * spanX;
      const highY = chartHeight - ((c.high - stats.min) / stats.range) * chartHeight;
      const lowY = chartHeight - ((c.low - stats.min) / stats.range) * chartHeight;
      const openY = chartHeight - ((c.open - stats.min) / stats.range) * chartHeight;
      const closeY = chartHeight - ((c.close - stats.min) / stats.range) * chartHeight;

      const isUp = c.close >= c.open;
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      const rect = {
        x: x - candleWidth / 2,
        y: bodyY,
        width: candleWidth,
        height: bodyHeight,
      };

      const wickSegment = `M ${x.toFixed(1)} ${highY.toFixed(1)} L ${x.toFixed(1)} ${lowY.toFixed(1)} `;
      if (isUp) {
        bullWickPath += wickSegment;
        bullRects.push(rect);
      } else {
        bearWickPath += wickSegment;
        bearRects.push(rect);
      }
    }

    return {
      bullWickPath,
      bearWickPath,
      bullRects,
      bearRects,
      candleWidth,
    };
  }, [mode, candles, stats, chartHeight, w, paddingX]);

  // Precomputed volume bars
  const volumeBars = useMemo(() => {
    if (!candles.length) return [];
    const spanX = w - paddingX * 2;
    const total = Math.max(candles.length - 1, 1);
    const barWidth = Math.max(1.8, Math.min(10, (spanX / candles.length) * 0.6));

    return candles.map((c, i) => {
      const x = paddingX + (i / total) * spanX;
      const barH = Math.max(1, (c.volume / maxVolume) * volumeHeight);
      const y = height - bottomAxisHeight - barH;
      const isUp = c.close >= c.open;
      return {
        x: x - barWidth / 2,
        y,
        width: barWidth,
        height: barH,
        fill: isUp ? appleGreen : appleRed,
      };
    });
  }, [candles, maxVolume, volumeHeight, height, bottomAxisHeight, w, paddingX]);

  // ---------------------------------------------------------------------------
  // ZERO-JANK POINTER SCRUBBING ENGINE (60 - 120 FPS)
  // Caches container bounding box to eliminate synchronous layout reflows.
  // ---------------------------------------------------------------------------
  const updateRect = useCallback(() => {
    if (svgRef.current) {
      const b = svgRef.current.getBoundingClientRect();
      rectRef.current = { left: b.left, width: b.width };
    }
  }, []);

  const handlePointerEnter = (e: React.PointerEvent<SVGSVGElement>) => {
    updateRect();
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (points.length < 2) return;
    let rect = rectRef.current;
    if (!rect || rect.width === 0) {
      updateRect();
      rect = rectRef.current;
      if (!rect) return;
    }

    const clientX = e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left - paddingX) / (rect.width - paddingX * 2)));
    const targetIdx = Math.round(pct * (points.length - 1));

    pendingIndexRef.current = targetIdx;

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingIndexRef.current !== null && pendingIndexRef.current !== hoverIndex) {
          setHoverIndex(pendingIndexRef.current);
        }
      });
    }
  };

  const handlePointerLeave = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingIndexRef.current = null;
    setHoverIndex(null);
  };

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Inspect stats
  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : null;
  const activePrice = hoverIndex !== null && points[hoverIndex] !== undefined ? points[hoverIndex] : null;
  const startPrice = points[0] || 1;
  const activeDeltaPct = activePrice !== null ? ((activePrice - startPrice) / startPrice) * 100 : null;

  const gradId = `apple_chart_grad_${instanceId}`;

  return (
    <div ref={containerRef} className="relative w-full select-none font-sans">
      {/* Top Chart Toolbar & Cupertino Live Inspector */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3 mb-2 border-b border-black/[0.05]">
          <div className="flex items-center gap-2">
            {/* Apple Segmented Control */}
            <div className="inline-flex p-0.5 rounded-xl bg-black/[0.04] border border-black/[0.04]">
              <button
                type="button"
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'line'
                    ? 'bg-white text-zinc-950 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                onClick={() => setMode('line')}
              >
                Line
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'candle'
                    ? 'bg-white text-zinc-950 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                onClick={() => setMode('candle')}
              >
                Candlesticks
              </button>
            </div>

            {/* SMA Indicator Toggle */}
            <button
              type="button"
              className={`px-2.5 py-1 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 ${
                showOverlays
                  ? 'border-indigo-500/30 bg-indigo-50 text-indigo-700 shadow-2xs font-semibold'
                  : 'border-black/[0.06] text-zinc-500 hover:bg-black/[0.03]'
              }`}
              onClick={() => setShowOverlays((v) => !v)}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${showOverlays ? 'bg-indigo-600' : 'bg-zinc-400'}`} />
              <span>SMA (10/30)</span>
            </button>
          </div>

          {/* Minimalist Live Scrubber Display */}
          <div className="flex items-center gap-3 text-xs">
            {activePrice !== null ? (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-zinc-50 px-3 py-1 rounded-xl border border-black/[0.04]">
                {activeCandle && (
                  <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                    <span>O: <strong className="text-zinc-800">{formatPrice(activeCandle.open)}</strong></span>
                    <span>H: <strong className="text-zinc-800">{formatPrice(activeCandle.high)}</strong></span>
                    <span>L: <strong className="text-zinc-800">{formatPrice(activeCandle.low)}</strong></span>
                    <span>C: <strong className="text-zinc-800">{formatPrice(activeCandle.close)}</strong></span>
                  </div>
                )}
                <span className="font-bold text-zinc-950 font-mono text-sm tracking-tight">
                  {formatPrice(activePrice)}
                </span>
                {activeDeltaPct !== null && (
                  <span
                    className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                      activeDeltaPct >= 0
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : 'bg-rose-500/15 text-rose-700'
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
                Slide across timeline to inspect
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Vector Surface (Hardware Accelerated) */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${height}`}
        className="w-full overflow-visible cursor-crosshair touch-none select-none"
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ willChange: 'contents' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.14" />
            <stop offset="65%" stopColor={color} stopOpacity="0.02" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Apple Horizontal Reference Hairlines & Price Ticks */}
        {priceTicks.map((pt, idx) => (
          <g key={idx}>
            <line
              x1={paddingX}
              y1={pt.y}
              x2={w - paddingX}
              y2={pt.y}
              stroke="currentColor"
              strokeDasharray="2 4"
              strokeWidth="0.8"
              className="text-black/[0.06]"
            />
            <text
              x={w - paddingX}
              y={pt.y - 4}
              textAnchor="end"
              className="text-[10px] font-mono fill-zinc-400 font-medium select-none"
            >
              {formatPrice(pt.price)}
            </text>
          </g>
        ))}

        {/* Minimalist Volume Histograms at Baseline */}
        {volumeBars.map((vb, i) => (
          <rect
            key={i}
            x={vb.x}
            y={vb.y}
            width={vb.width}
            height={vb.height}
            fill={vb.fill}
            opacity={hoverIndex === i ? 0.6 : 0.14}
            rx={0.8}
            className="transition-opacity duration-75"
          />
        ))}

        {/* Mode: Monotone Smooth Area Curve (Apple Aesthetic) */}
        {mode === 'line' && (
          <g>
            {fill && smoothLinePath && (
              <path
                d={`${smoothLinePath} L ${w - paddingX} ${chartHeight} L ${paddingX} ${chartHeight} Z`}
                fill={`url(#${gradId})`}
              />
            )}
            {/* Subtle underglow path for depth without GPU filter overhead */}
            {smoothLinePath && (
              <path
                d={smoothLinePath}
                fill="none"
                stroke={color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.12"
              />
            )}
            {/* Primary razor-sharp Apple curve stroke */}
            {smoothLinePath && (
              <path
                d={smoothLinePath}
                fill="none"
                stroke={color}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        )}

        {/* Mode: Minimalist Japanese Candlesticks */}
        {mode === 'candle' && candleGeometry && (
          <g>
            {/* Bullish Wicks Path */}
            {candleGeometry.bullWickPath && (
              <path
                d={candleGeometry.bullWickPath}
                fill="none"
                stroke={appleGreen}
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            )}
            {/* Bearish Wicks Path */}
            {candleGeometry.bearWickPath && (
              <path
                d={candleGeometry.bearWickPath}
                fill="none"
                stroke={appleRed}
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            )}
            {/* Bullish Candle Bodies */}
            {candleGeometry.bullRects.map((r, i) => (
              <rect
                key={`bull_${i}`}
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                fill={appleGreen}
                rx={1.5}
              />
            ))}
            {/* Bearish Candle Bodies */}
            {candleGeometry.bearRects.map((r, i) => (
              <rect
                key={`bear_${i}`}
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                fill={appleRed}
                rx={1.5}
              />
            ))}
          </g>
        )}

        {/* Moving Average Overlays */}
        {showOverlays && sma10Path && (
          <path
            d={sma10Path}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.85"
          />
        )}
        {showOverlays && sma30Path && (
          <path
            d={sma30Path}
            fill="none"
            stroke="#6366f1"
            strokeWidth="1.5"
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

        {/* Interactive Hover Crosshair with Cupertino Beacon Dot */}
        {hoverIndex !== null && coords[hoverIndex] && (
          <g>
            {/* Vertical Guide Hairline */}
            <line
              x1={coords[hoverIndex].x}
              y1={0}
              x2={coords[hoverIndex].x}
              y2={height - bottomAxisHeight}
              stroke="rgba(0, 0, 0, 0.20)"
              strokeDasharray="2 3"
              strokeWidth="1"
            />
            {/* Horizontal Guide Hairline */}
            <line
              x1={paddingX}
              y1={coords[hoverIndex].y}
              x2={w - paddingX}
              y2={coords[hoverIndex].y}
              stroke="rgba(0, 0, 0, 0.14)"
              strokeDasharray="2 3"
              strokeWidth="1"
            />

            {/* Active Price Pill Badge on Right Axis */}
            {activePrice !== null && (
              <g transform={`translate(${w - paddingX}, ${coords[hoverIndex].y})`}>
                <rect
                  x="-64"
                  y="-10"
                  width="64"
                  height="20"
                  rx="4"
                  fill="#18181b"
                />
                <text
                  x="-32"
                  y="3.5"
                  textAnchor="middle"
                  className="text-[10px] font-mono font-semibold fill-white"
                >
                  {formatPrice(activePrice)}
                </text>
              </g>
            )}

            {/* Apple Beacon Outer Halo */}
            <circle
              cx={coords[hoverIndex].x}
              cy={coords[hoverIndex].y}
              r="8"
              fill={color}
              opacity="0.18"
            />
            {/* Apple Beacon Inner Core */}
            <circle
              cx={coords[hoverIndex].x}
              cy={coords[hoverIndex].y}
              r="4"
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
 * Powered by Monotone Cubic Spline with zero GPU overhead.
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
    const len = data.length - 1;
    const pts = data.map((v, i) => ({
      x: (i / len) * w,
      y: height - paddingY - ((v - min) / range) * (height - paddingY * 2),
    }));
    return getMonotonePath(pts);
  }, [data, height]);

  const color = positive ? '#34C759' : '#FF3B30';
  const gradId = positive ? 'spark_grad_pos' : 'spark_grad_neg';

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="w-full h-full overflow-visible"
      preserveAspectRatio="none"
    >
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
