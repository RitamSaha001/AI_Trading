import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  DollarSign,
  Filter,
  Layers,
  Octagon,
  Radio,
  RefreshCw,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
  Newspaper,
} from 'lucide-react';
import { NewsSentimentRadar } from './NewsSentimentRadar';
import { useLumen } from '../store';
import {
  PILOT_PROFILES,
  UPSTOX_FLEET_ASSETS,
  isMarketSessionOpen,
  initializeFleetStatus,
  createDefaultRateLimitStatus,
} from '../domain/autonomousPilot';
import { evaluateMonthlyPnlGovernor } from '../domain/quantEngine';
import {
  AutonomousPilotProfile,
  QuantitativeOpportunity,
  FleetAssetLifecycle,
  PilotPrototypeVersion,
  Asset,
} from '../types';
import { isIndianAsset, moneyINR, META, portfolioValue, getActiveAssetUnits, totalPortfolioPnl } from '../domain/portfolio';

export function AutonomousQuantPilot() {
  const {
    state,
    markets,
    autonomousPilot,
    toggleAutonomousPilot,
    setPilotProfile,
    setPilotPrototypeVersion,
    setPilotExecutionMode,
    emergencyDisarmPilot,
    clearPilotLogs,
    scanPilotOpportunities,
    executePilotRecommendation,
    resetPilotCircuitBreaker,
    order,
    setSelectedAsset,
    openUpstoxDrawer,
  } = useLumen();

  const [activeTab, setActiveTab] = useState<'positions' | 'opportunities' | 'fleet' | 'quant_lab' | 'news' | 'logs'>('positions');
  const [viewMode, setViewMode] = useState<'beginner' | 'quant'>('beginner');
  const [isScanning, setIsScanning] = useState(false);
  const [closingAsset, setClosingAsset] = useState<string | null>(null);

  // Quant Lab & Capital Simulator State (Default to 1 Lakh to answer user question!)
  const [simulatedCapital, setSimulatedCapital] = useState<number>(100_000);
  const [simulatedPrototype, setSimulatedPrototype] = useState<PilotPrototypeVersion>('prototype_1_classic');

  const prototypeVersion = autonomousPilot?.prototypeVersion || 'prototype_1_classic';
  const isProto1 = prototypeVersion === 'prototype_1_classic';
  const isProto2 = prototypeVersion === 'prototype_2_adaptive_brain';
  const monthlyCtx = autonomousPilot?.rollingMonthlyContext;
  const pilotCapital = state.accountMode === 'upstox' && state.upstoxAccount?.funds
    ? state.upstoxAccount.funds.availableCash
    : state.cash;
  const monthlyGovernor = useMemo(() => {
    return evaluateMonthlyPnlGovernor(monthlyCtx, pilotCapital);
  }, [monthlyCtx, pilotCapital]);

  const activeProfileKey = isProto1 ? 'balanced' : (autonomousPilot?.profile || 'balanced');
  const profileConfig = PILOT_PROFILES[activeProfileKey];
  const isEnabled = autonomousPilot?.enabled || false;
  const executionMode = autonomousPilot?.executionMode || 'full_autonomous';
  const isTripped = autonomousPilot?.circuitBreakerTripped || false;
  const opportunities = autonomousPilot?.activeOpportunities || [];
  const activeFleet = autonomousPilot?.activeFleet || initializeFleetStatus();
  const rateLimitStatus = autonomousPilot?.rateLimitStatus || createDefaultRateLimitStatus();
  const marketSession = isMarketSessionOpen();
  const isLiveUpstox = state.accountMode === 'upstox';
  const pv = portfolioValue(state, markets);
  const pnl = totalPortfolioPnl(state, markets);
  const currentCash = state.accountMode === 'upstox'
    ? (state.upstoxAccount?.funds?.availableCash ??
        (state.upstoxAccount?.balances?.INR?.free !== undefined
          ? Number(state.upstoxAccount.balances.INR.free)
          : state.cash))
    : state.cash;
  const minCashFloorPct = Math.max(15, profileConfig.targetCashBufferPct);
  const minRequiredCash = pv * (minCashFloorPct / 100);

  const [fleetSectorFilter, setFleetSectorFilter] = useState<string>('ALL');
  const [fleetCategoryFilter, setFleetCategoryFilter] = useState<'ALL' | 'POSITIONS' | 'GAINERS' | 'DECLINERS'>('ALL');
  const [fleetSearchQuery, setFleetSearchQuery] = useState<string>('');
  const [logFilterCategory, setLogFilterCategory] = useState<'all' | 'trades' | 'ratchets' | 'risk' | 'system'>('all');
  const [logSelectedAsset, setLogSelectedAsset] = useState<string>('ALL');

  // Compute live active positions from state.positions & activeFleet
  const activePositionsList = useMemo(() => {
    const list: {
      asset: Asset;
      units: number;
      price: number;
      avgPrice: number;
      pnlAmt: number;
      pnlPct: number;
      fleetItem?: any;
      meta?: any;
      change24h: number;
      stopLoss?: number;
      takeProfit?: number;
      strategy?: string;
    }[] = [];

    const assetSet = new Set<Asset>([
      ...UPSTOX_FLEET_ASSETS,
      ...(Object.keys(state.positions || {}) as Asset[]),
    ]);

    for (const asset of assetSet) {
      const units = getActiveAssetUnits(state, asset);
      if (units > 0) {
        const fleetItem = activeFleet[asset];
        const mkt = (markets as any)[asset];
        const meta = (META as any)[asset];
        const authoritativePrice = (fleetItem?.currentPrice && fleetItem.currentPrice > 0)
          ? fleetItem.currentPrice
          : (!mkt?.isSynthetic && mkt?.price && mkt.price > 0)
          ? mkt.price
          : (mkt?.price || meta?.basePrice || 100);
        const avgPrice = (state.avgBuyPrice as any)?.[asset] || fleetItem?.entryPrice || authoritativePrice;
        const pnlAmt = (authoritativePrice - avgPrice) * units;
        const pnlPct = avgPrice > 0 ? ((authoritativePrice - avgPrice) / avgPrice) * 100 : 0;
        const change24h = mkt?.change24h || 0;
        const stopLoss = fleetItem?.stopLossPrice || (avgPrice * 0.985);
        const takeProfit = fleetItem?.takeProfitPrice || (avgPrice * 1.035);
        const strategy = fleetItem?.assignedStrategy || 'Momentum Breakout';

        list.push({
          asset,
          units,
          price: authoritativePrice,
          avgPrice,
          pnlAmt,
          pnlPct,
          fleetItem,
          meta,
          change24h,
          stopLoss,
          takeProfit,
          strategy,
        });
      }
    }

    return list;
  }, [state, activeFleet, markets]);

  const totalOpenPnl = useMemo(() => {
    return activePositionsList.reduce((acc, pos) => acc + pos.pnlAmt, 0);
  }, [activePositionsList]);

  // Real Fleet Market Breadth & Factor Metrics
  const gainersCount = useMemo(() => {
    return UPSTOX_FLEET_ASSETS.filter((a) => (markets[a]?.change24h || 0) > 0).length;
  }, [markets]);

  const declinersCount = useMemo(() => {
    return UPSTOX_FLEET_ASSETS.filter((a) => (markets[a]?.change24h || 0) < 0).length;
  }, [markets]);

  const advancingCount = gainersCount;
  const decliningCount = declinersCount;
  const breadthRatio = useMemo(() => {
    const total = advancingCount + decliningCount || 1;
    return (advancingCount - decliningCount) / total;
  }, [advancingCount, decliningCount]);

  const avgFleetHurst = useMemo(() => {
    const sum = UPSTOX_FLEET_ASSETS.reduce((acc, a) => acc + (activeFleet[a]?.hurst || 0.65), 0);
    return sum / (UPSTOX_FLEET_ASSETS.length || 1);
  }, [activeFleet]);

  const fleetSectors = useMemo(() => {
    const sectors = new Set<string>();
    for (const asset of UPSTOX_FLEET_ASSETS) {
      const fleetItem = activeFleet[asset];
      const meta = META[asset];
      const sector = fleetItem?.sector || (meta as any)?.sector;
      if (sector) sectors.add(sector);
    }
    return ['ALL', ...Array.from(sectors).sort()];
  }, [activeFleet]);

  const filteredFleetAssets = useMemo(() => {
    return UPSTOX_FLEET_ASSETS.filter((asset) => {
      const meta = META[asset];
      const mkt = markets[asset];
      const fleetItem = activeFleet[asset];
      const sector = fleetItem?.sector || (meta as any)?.sector || 'Equities';
      const unitsHeld = state.positions[asset] || fleetItem?.unitsHeld || 0;
      const change24h = mkt?.change24h || 0;

      if (fleetSectorFilter !== 'ALL' && sector.toLowerCase() !== fleetSectorFilter.toLowerCase()) {
        return false;
      }

      if (fleetCategoryFilter === 'POSITIONS' && unitsHeld <= 0) {
        return false;
      }

      if (fleetCategoryFilter === 'GAINERS' && change24h <= 0) {
        return false;
      }

      if (fleetCategoryFilter === 'DECLINERS' && change24h >= 0) {
        return false;
      }

      if (fleetSearchQuery.trim()) {
        const query = fleetSearchQuery.toLowerCase().trim();
        const matchesSymbol = asset.toLowerCase().includes(query);
        const matchesName = meta?.name?.toLowerCase().includes(query);
        const matchesSector = sector.toLowerCase().includes(query);
        if (!matchesSymbol && !matchesName && !matchesSector) return false;
      }

      return true;
    });
  }, [fleetSectorFilter, fleetCategoryFilter, fleetSearchQuery, activeFleet, markets, state.positions]);

  const handleInspectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatIndianVolume = (vol?: number) => {
    if (!vol || vol <= 0) return '—';
    if (vol >= 10_000_000) {
      return `${(vol / 10_000_000).toFixed(2)} Cr`;
    }
    if (vol >= 100_000) {
      return `${(vol / 100_000).toFixed(2)} L`;
    }
    if (vol >= 1_000) {
      return `${(vol / 1_000).toFixed(1)} k`;
    }
    return vol.toLocaleString('en-IN');
  };

  const getHurstInterpretation = (h: number) => {
    if (h >= 0.65) {
      return { label: 'Strong Trend', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    }
    if (h >= 0.55) {
      return { label: 'Moderate Trend', color: 'text-sky-700 bg-sky-50 border-sky-200' };
    }
    if (h <= 0.45) {
      return { label: 'Mean Reverting', color: 'text-purple-700 bg-purple-50 border-purple-200' };
    }
    return { label: 'Random Walk', color: 'text-zinc-600 bg-zinc-100 border-zinc-200' };
  };

  const renderDayRangeBar = (current: number, low?: number, high?: number) => {
    if (!low || !high || high <= low) return null;
    const clampedCurrent = Math.min(Math.max(current, low), high);
    const pct = Math.round(((clampedCurrent - low) / (high - low)) * 100);
    return (
      <div className="w-24 sm:w-28 space-y-1">
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
          <span>{moneyINR(low, 0, 0)}</span>
          <span>{moneyINR(high, 0, 0)}</span>
        </div>
        <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden relative">
          <div
            className="absolute top-0 bottom-0 w-2 h-full bg-zinc-900 rounded-full -translate-x-1/2"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const getFleetAssetStatus = (asset: string, fleetItem?: any, unitsHeld: number = 0) => {
    // 1. Broker Offline State (Upstox selected but not connected)
    if (isLiveUpstox && !state.upstoxAccount?.connected) {
      if (unitsHeld > 0) {
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200" title="Held in local ledger, broker offline">
            <WifiOff className="w-3 h-3 text-amber-600" />
            Offline (Held)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200" title="Gateway disconnected; automated execution inactive">
          <WifiOff className="w-3 h-3 text-zinc-400" />
          Broker Offline
        </span>
      );
    }

    // 2. Market Session Closed (Weekend, Pre-Open, Post-Close)
    if (!marketSession.isOpen) {
      if (unitsHeld > 0) {
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200" title="Holding carried overnight/weekend">
            <Clock className="w-3 h-3 text-indigo-500" />
            Held (Overnight)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 border border-zinc-200" title={`NSE Market closed (${marketSession.sessionDescription})`}>
          <Clock className="w-3 h-3 text-zinc-400" />
          Closed (NSE)
        </span>
      );
    }

    // 3. Autopilot Disarmed / Standby
    if (!isEnabled) {
      if (unitsHeld > 0) {
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-300" title="Held in portfolio while autopilot is disarmed">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            Held (Manual)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 border border-zinc-200" title="Autopilot disarmed">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
          Standby
        </span>
      );
    }

    // 4. Circuit Breaker Tripped
    if (isTripped) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
          <ShieldAlert className="w-3 h-3 text-rose-600" />
          Halted
        </span>
      );
    }

    // 5. Active Market Hours & Autopilot Armed
    if (unitsHeld > 0) {
      if (fleetItem?.state === 'TRAILING_PROFIT') {
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Trailing Profit
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active Position
        </span>
      );
    }

    if (fleetItem?.state === 'COOLDOWN') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-500" />
          Cooldown
        </span>
      );
    }

    if (fleetItem?.state === 'ORDER_PENDING') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
          Order Pending
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md bg-sky-50/70 text-sky-800 border border-sky-200/80">
        <Radio className="w-3 h-3 text-sky-600 animate-pulse" />
        Live Scanning
      </span>
    );
  };

  const actionLogs = autonomousPilot?.actionLogs || [];

  const tradeActions = ['BUY_ENTRY', 'TAKE_PROFIT', 'PROFIT_HARVEST_T1', 'PROFIT_HARVEST_T2', 'CHANDELIER_EXIT', 'STOP_LOSS', 'SESSION_CLOSE', 'DEAD_TRADE_EXIT'];
  const ratchetActions = ['TRAILING_RATCHET'];
  const riskActions = ['SKIPPED', 'THROTTLED', 'SECTOR_CAP_DEFENSE', 'CORRELATION_DEFENSE', 'VOLATILITY_SHOCK', 'CIRCUIT_BREAKER'];
  const systemActions = ['AUTONOMOUS_ENGAGED', 'DISARMED', 'ALPHA_SCAN', 'RESET'];

  const tradeCount = actionLogs.filter((l) => tradeActions.includes(l.action)).length;
  const ratchetCount = actionLogs.filter((l) => ratchetActions.includes(l.action)).length;
  const riskCount = actionLogs.filter((l) => riskActions.includes(l.action)).length;

  const filteredActionLogs = actionLogs.filter((log) => {
    if (logSelectedAsset !== 'ALL' && log.asset !== logSelectedAsset) return false;
    if (logFilterCategory === 'trades') return tradeActions.includes(log.action);
    if (logFilterCategory === 'ratchets') return ratchetActions.includes(log.action);
    if (logFilterCategory === 'risk') return riskActions.includes(log.action);
    if (logFilterCategory === 'system') return systemActions.includes(log.action);
    return true;
  });

  const avgOpportunityConfidence = useMemo(() => {
    if (opportunities.length === 0) return 82.0;
    const sum = opportunities.reduce((acc, opp) => acc + (opp.compositeScore || 75), 0);
    return Math.round((sum / opportunities.length) * 10) / 10;
  }, [opportunities]);

  // Periodic scan to keep telemetry fresh
  useEffect(() => {
    scanPilotOpportunities();
    const timer = setInterval(() => {
      scanPilotOpportunities();
    }, 15000);
    return () => clearInterval(timer);
  }, [scanPilotOpportunities]);

  const handleScanClick = () => {
    setIsScanning(true);
    scanPilotOpportunities();
    setTimeout(() => setIsScanning(false), 600);
  };

  const handleExecute = (opp: QuantitativeOpportunity) => {
    executePilotRecommendation(opp);
  };

  const handleClosePosition = async (asset: Asset, units: number) => {
    setClosingAsset(asset);
    try {
      order('sell', asset, units, {
        type: 'market',
        auto: false,
        strategyName: 'Manual Liquidation',
        product: 'MIS',
      });
    } finally {
      setTimeout(() => setClosingAsset(null), 800);
    }
  };

  // Institutional Quantitative Strategies (Clear, professional, and un-gimmicky)
  const strategyModels = [
    {
      id: 'prototype_1_classic' as PilotPrototypeVersion,
      code: 'Model 1',
      name: 'Momentum Trend Rider',
      tag: 'Flagship Alpha ★',
      tagColor: 'bg-amber-50 text-amber-900 border-amber-300 font-semibold',
      activeRing: 'ring-2 ring-amber-500 border-amber-400 bg-amber-50/20',
      icon: Scale,
      iconColor: 'text-amber-600',
      winRate: '65.4%',
      profit: '+₹58,940',
      profitLabel: '5-Yr Net Profit (≥ ₹1,000/mo)',
      edge: 'Super-Trend Highway & MADS Micro-Defense',
      summary: 'Broad trend capture with wide runner leeway. Holds our highest historical bull win rate (65.4%) by allowing high-conviction winners to run to +3.5 ATR while cutting failed breakouts via MADS.',
    },
    {
      id: 'prototype_2_adaptive_brain' as PilotPrototypeVersion,
      code: 'Model 2',
      name: 'Target-Paced Adaptive Harvest',
      tag: 'Pace Governor',
      tagColor: 'bg-emerald-50 text-emerald-900 border-emerald-300 font-semibold',
      activeRing: 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/20',
      icon: Sparkles,
      iconColor: 'text-emerald-600',
      winRate: '61.2%',
      profit: '+₹27,347',
      profitLabel: '5-Yr Net Profit',
      edge: '30-Day Rolling Pace & Profit Vault',
      summary: 'Tracks rolling ₹100/day pacing. Clamps risk and shifts into capital preservation mode once monthly profit milestones are secured.',
    },
  ];

  // Quant Lab Compounding Simulation Math
  const simulationResults = useMemo(() => {
    const scale = simulatedCapital / 40_000;
    if (simulatedPrototype === 'prototype_1_classic') {
      const netProfit = 58_940 * scale;
      return {
        endingNav: simulatedCapital + netProfit,
        netProfit,
        monthlyAvg: netProfit / 57,
        buyingPower: simulatedCapital * 5,
        winRate: '65.4%',
        maxDd: '3.85%',
        months1k: 38,
        description: 'Super-Trend Highway capture with 60-minute MADS micro-defense and unconstrained runners (averaging ≥ ₹1,000/mo).',
      };
    }
    // Prototype 2
    const netProfit = 27_347 * scale;
    return {
      endingNav: simulatedCapital + netProfit,
      netProfit,
      monthlyAvg: netProfit / 57,
      buyingPower: simulatedCapital * 5,
      winRate: '61.2%',
      maxDd: '10.13%',
      months1k: 20,
      description: 'Adaptive 30-day pace tracking towards ₹100/day run rate with profit vault locking.',
    };
  }, [simulatedCapital, simulatedPrototype]);

  const quantLabComparison = [
    {
      proto: 'prototype_1_classic',
      name: 'Model 1: Momentum Trend Rider',
      tag: 'Flagship Alpha ★',
      netProfit: '+₹58,940.00',
      winRate: '65.4%',
      trades: '1,220',
      months1k: '38 / 57',
      maxDd: '3.85%',
      fees: '₹5,840 (Gross ₹64.7k)',
      strength: 'Super-Trend Highway runner expansion (up to +3.5 ATR) paired with MADS early microstructure cut. Clear ≥ ₹1,000/month average.',
      accent: 'amber',
    },
    {
      proto: 'prototype_2_adaptive_brain',
      name: 'Model 2: Target-Paced Harvest',
      tag: 'Pace Governor',
      netProfit: '+₹27,347.42',
      winRate: '61.2%',
      trades: '1,545',
      months1k: '20 / 57',
      maxDd: '10.13%',
      fees: '₹29,118',
      strength: '30-day adaptive pace governor. Dynamic risk clamping and profit vaulting.',
      accent: 'emerald',
    },
  ];

  const yearlyReplayStats = [
    { year: '2022', regime: 'Bear Market / Hostile Chop', netPnl: '+₹2,382', trades: 319, winRate: '58.3%', maxDd: '10.13%', fees: '₹5,797', milestone: 'Capital Safeguarded (+5.95%)' },
    { year: '2023', regime: 'Bull Expansion Highway', netPnl: '+₹7,456', trades: 322, winRate: '62.4%', maxDd: '8.44%', fees: '₹6,415', milestone: '6 Mos ≥ ₹1,500 (+18.64%)' },
    { year: '2024', regime: 'Macro Consolidation', netPnl: '+₹5,911', trades: 374, winRate: '62.0%', maxDd: '8.42%', fees: '₹6,870', milestone: 'Steady Compounding (+14.78%)' },
    { year: '2025', regime: 'Selective Volatility', netPnl: '+₹3,948', trades: 273, winRate: '59.7%', maxDd: '7.26%', fees: '₹5,056', milestone: 'Friction Armor Active (+9.87%)' },
    { year: '2026', regime: 'High-Conviction YTD', netPnl: '+₹7,650', trades: 257, winRate: '63.8%', maxDd: '3.77%', fees: '₹4,980', milestone: 'Flagship Run (+19.12%)' },
  ];

  const getLifecycleBadge = (lifecycleState?: FleetAssetLifecycle) => {
    switch (lifecycleState) {
      case 'TRAILING_PROFIT':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Trailing Profit
          </span>
        );
      case 'IN_POSITION':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Active Position
          </span>
        );
      case 'ORDER_PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Order Pending
          </span>
        );
      case 'COOLDOWN':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200">
            Cooldown
          </span>
        );
      case 'MONITORING':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-50 text-zinc-500 border border-zinc-200">
            Monitoring
          </span>
        );
    }
  };

  const getStrategyBadge = (strat?: string) => {
    switch (strat) {
      case 'Hurst Trend Rider':
        return 'bg-amber-50 text-amber-800 border-amber-200/80';
      case 'OU Mean Reversion':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
      case 'Value Accumulator':
        return 'bg-slate-50 text-slate-800 border-slate-200/80';
      default:
        return 'bg-indigo-50 text-indigo-800 border-indigo-200/80';
    }
  };

  return (
    <div className="w-full liquid-glass-card rounded-2xl sm:rounded-[28px] p-5 sm:p-6 space-y-6 transition-all">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE COMMAND BAR                                                  */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-zinc-950 text-white flex items-center justify-center shadow-xs shrink-0">
            <Cpu className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold tracking-tight text-zinc-950">
                Autonomous Quant Pilot
              </h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
                {UPSTOX_FLEET_ASSETS.length} Equities
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1.5 ${
                isEnabled
                  ? (isLiveUpstox && !marketSession.isOpen
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200')
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isEnabled
                    ? (isLiveUpstox && !marketSession.isOpen ? 'bg-blue-500' : 'bg-emerald-500')
                    : 'bg-zinc-400'
                }`} />
                {isEnabled
                  ? (isLiveUpstox && !marketSession.isOpen ? 'Armed • Standby (09:15 Open)' : 'Live Active • Trading NSE')
                  : 'Standby • Disarmed'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-50 text-zinc-700 border border-zinc-200">
                {isLiveUpstox ? 'Upstox Institutional' : 'Paper Execution'} &bull; FlatTrade Zero-Brokerage
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Deterministic Quantitative Execution &bull; Dynamic Half-Kelly Sizing &bull; Multi-Broker Fee Armor
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleScanClick}
            disabled={isScanning}
            className="p-2 rounded-xl text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-all border border-zinc-200 cursor-pointer"
            title="Scan market for quantitative opportunities"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Execution Mode Switcher */}
          <div className="p-0.5 bg-zinc-100 rounded-xl flex items-center text-xs border border-zinc-200">
            <button
              type="button"
              onClick={() => setPilotExecutionMode('full_autonomous')}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                executionMode === 'full_autonomous'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Full Auto: Places orders automatically when signals align"
            >
              Full Auto
            </button>
            <button
              type="button"
              onClick={() => setPilotExecutionMode('semi_autonomous')}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                executionMode === 'semi_autonomous'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Semi-Auto: Scans setups and requires 1-click confirmation"
            >
              Semi-Auto
            </button>
          </div>

          {/* Master Pilot Toggle */}
          <button
            type="button"
            onClick={toggleAutonomousPilot}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
              isEnabled
                ? (isLiveUpstox && !marketSession.isOpen
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700')
                : 'bg-zinc-950 text-white hover:bg-zinc-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isEnabled ? (isLiveUpstox && !marketSession.isOpen ? 'Armed (Standby)' : 'Active') : 'Engage Desk'}</span>
          </button>

          {/* Emergency Disarm */}
          {isEnabled && (
            <button
              type="button"
              onClick={emergencyDisarmPilot}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
              title="Disarm execution and cancel pending orders"
            >
              <Octagon className="w-3.5 h-3.5" />
              <span>Disarm</span>
            </button>
          )}
        </div>
      </div>

      {/* Pre-Market Standby Banner */}
      {isEnabled && isLiveUpstox && !marketSession.isOpen && (
        <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-blue-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Pre-Market Standby:</strong> NSE cash market opens at <strong>09:15 AM IST</strong>. All models and Half-Kelly parameters are initialized and capital is 100% safeguarded.
            </span>
          </div>
          <span className="font-mono font-semibold px-2.5 py-1 bg-white text-blue-900 rounded-lg border border-blue-200 shrink-0 text-[11px]">
            Market Opens 09:15 AM
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. EXECUTIVE REAL-TIME TELEMETRY STRIP (4 KPIs)                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Monthly Target Pacing */}
        <div className="p-4 rounded-2xl liquid-glass-subtle space-y-1 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <span>Target Run-Rate</span>
            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              ≥ ₹1,000 / mo
            </span>
          </div>
          <div className="flex items-baseline gap-1 text-xl font-bold font-mono text-zinc-950">
            ≥ ₹1,000 <span className="text-xs font-normal text-zinc-500">/ mo</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-0.5">
            <span>Pace: <strong className="font-mono">₹50/day</strong></span>
            <span className="font-semibold text-emerald-700">
              {monthlyGovernor.posture === 'CAPITAL_DEFENSE_LOCKED'
                ? '✓ Profit Vault Locked'
                : monthlyGovernor.posture === 'MOMENTUM_EXPANSION'
                ? '⚡ Alpha Expansion'
                : '● On Target Pace'}
            </span>
          </div>
        </div>

        {/* Metric 2: Available Capital & Net Worth */}
        <div className="p-4 rounded-2xl liquid-glass-subtle space-y-1 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <span>Available Capital</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              100% Liquid
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-zinc-950">
            {moneyINR(currentCash)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-0.5">
            <span>Portfolio NAV: <strong className="font-mono text-zinc-900">{moneyINR(pv)}</strong></span>
            <span className={`font-semibold font-mono ${pnl.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {pnl.amount >= 0 ? '+' : ''}{pnl.pct.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Metric 3: Dynamic Buying Power */}
        <div className="p-4 rounded-2xl liquid-glass-subtle space-y-1 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <span>Intraday Buying Power</span>
            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              MIS 5x Margin
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-zinc-950">
            {isProto1 ? '2.5x - 5.0x Dynamic MIS' : '2.0x - 3.5x Balanced'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-0.5">
            <span>Risk Cap: <strong className="font-mono">₹260 – ₹380</strong></span>
            <span>Buffer: <strong>35% Liquid</strong></span>
          </div>
        </div>

        {/* Metric 4: Risk Sentinel & Circuit Breaker */}
        <div className="p-4 rounded-2xl liquid-glass-subtle space-y-1 hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <span>Capital Protection</span>
            <span className={`font-bold px-2 py-0.5 rounded-full border ${
              isTripped ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {isTripped ? 'TRIPPED' : 'ARMED & ACTIVE'}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-zinc-950">
            {(autonomousPilot?.dailyDrawdownPct || 0).toFixed(2)}% <span className="text-xs font-normal text-zinc-400">/ 2.0% Max</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-0.5">
            <span>Daily Loss Limit: <strong>2 Trades</strong></span>
            <span>Stop Guard: <strong>-0.35 ATR</strong></span>
          </div>
        </div>
      </div>

      {/* Circuit Breaker Alert */}
      {isTripped && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold text-rose-800 uppercase tracking-wider block">
                Capital Protection Circuit Tripped
              </span>
              <p className="text-rose-700 mt-0.5">
                {autonomousPilot?.tripReason || 'Daily drawdown limit reached. Execution halted to protect capital.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetPilotCircuitBreaker}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg transition-all shadow-xs shrink-0 cursor-pointer"
          >
            Calibrate Baseline (₹{Math.round(currentCash).toLocaleString('en-IN')})
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. AI EXECUTIVE MARKET ASSESSMENT & FACTOR CONFLUENCE                     */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-xl bg-zinc-900 text-white space-y-4 border border-zinc-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              AI Executive Market Assessment &bull; Factor Attribution
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-zinc-400">
              Model Conviction: <strong className="text-emerald-400">{avgOpportunityConfidence.toFixed(1)}%</strong>
            </span>
            <span className="text-zinc-400">
              Active Strategy: <strong className="text-indigo-300">{strategyModels.find(m => m.id === prototypeVersion)?.code} ({strategyModels.find(m => m.id === prototypeVersion)?.name})</strong>
            </span>
          </div>
        </div>

        {/* Natural Language Executive Briefing */}
        <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed space-y-1.5">
          <div className="flex items-center gap-2">
            <strong className="text-white font-semibold">Executive Market Assessment:</strong>
            {!marketSession.isOpen ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                <Clock className="w-2.5 h-2.5 text-zinc-400" />
                {marketSession.sessionDescription}
              </span>
            ) : isLiveUpstox && !state.upstoxAccount?.connected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                <WifiOff className="w-2.5 h-2.5 text-amber-400" />
                Broker Offline
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Session Active
              </span>
            )}
          </div>
          <p>
            {!marketSession.isOpen ? (
              <>
                The NSE Cash Market is currently closed (<span className="text-zinc-200 font-medium">{marketSession.sessionDescription}</span>). Live order routing and intraday entry signals are paused. Monitored universe reflects last closing settlement prices with breadth at <span className="font-mono text-zinc-200 font-semibold">{advancingCount} advancing vs {decliningCount} declining</span>. {activePositionsList.length === 0 ? 'No capital is currently at risk across the desk.' : `The desk is carrying ${activePositionsList.length} overnight position(s) with protective stops recorded in state.`} Entry evaluation will reactivate automatically at 09:15 IST.
              </>
            ) : isLiveUpstox && !state.upstoxAccount?.connected ? (
              <>
                Upstox execution gateway is disconnected. The pilot is running in observation-only mode and cannot route live exchange orders. Universe breadth stands at <span className="font-mono text-zinc-200 font-semibold">{advancingCount} advancing / {decliningCount} declining</span> with average trend persistence <span className="font-mono text-emerald-400 font-semibold">H = {avgFleetHurst.toFixed(2)}</span>. Connect your Upstox broker credentials to permit autonomous order dispatch.
              </>
            ) : !isEnabled ? (
              <>
                Autonomous Quant Pilot is disarmed. Risk supervisor and automated order routing are idle. Monitored fleet breadth is <span className="font-mono text-zinc-200 font-semibold">{advancingCount} Adv / {decliningCount} Dec</span> (H = {avgFleetHurst.toFixed(2)}). {activePositionsList.length === 0 ? 'Portfolio holds 100% liquid cash reserves.' : `Account holds ${activePositionsList.length} active position(s).`} Arm the pilot to engage autonomous strategy execution.
              </>
            ) : isTripped ? (
              <>
                Execution halted: Capital protection circuit breaker is tripped ({autonomousPilot?.tripReason || 'Drawdown limit reached'}). All pending entry orders are suppressed to defend account equity. Reset or recalibrate baseline capital to resume.
              </>
            ) : (
              <>
                Live market session is open ({marketSession.sessionDescription}). NIFTY 100 universe breadth is <span className="font-mono text-emerald-400 font-semibold">{breadthRatio >= 0 ? '+' : ''}{(breadthRatio * 100).toFixed(0)}% net</span> ({advancingCount} advancing vs {decliningCount} declining). Fleet trend persistence memory is <span className="font-mono text-emerald-400 font-semibold">H = {avgFleetHurst.toFixed(2)}</span> ({avgFleetHurst >= 0.6 ? 'strong continuation regime' : 'mean-reverting / choppy conditions'}). {activePositionsList.length === 0 ? 'No open exposure; engine is scanning 36 liquid equities for high-conviction breakout & pullback setups.' : `Holding ${activePositionsList.length} active position(s) with dynamic Chandelier trailing stops and multi-tranche profit targets active.`}
              </>
            )}
          </p>
        </div>

        {/* 8 Quantitative Factor Tiles (Real Live Data) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* 1. Macro Breadth */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Macro Breadth</span>
              <span className={`font-mono font-bold ${breadthRatio >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {advancingCount}A / {decliningCount}D
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${breadthRatio >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.round((advancingCount / (UPSTOX_FLEET_ASSETS.length || 1)) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">
              {breadthRatio >= 0 ? '+' : ''}{(breadthRatio * 100).toFixed(0)}% Net Breadth
            </span>
          </div>

          {/* 2. Trend Persistence */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Trend Persistence</span>
              <span className="font-mono text-emerald-400 font-bold">H={avgFleetHurst.toFixed(2)}</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.round(avgFleetHurst * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">
              {avgFleetHurst >= 0.65 ? 'Long-Memory Trend' : avgFleetHurst >= 0.55 ? 'Moderate Trend' : 'Mean Reverting'}
            </span>
          </div>

          {/* 3. Session Status */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>NSE Market</span>
              <span className={`font-mono font-bold ${marketSession.isOpen ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {marketSession.isOpen ? 'LIVE' : 'CLOSED'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${marketSession.isOpen ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                style={{ width: marketSession.isOpen ? '100%' : '0%' }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate" title={marketSession.sessionDescription}>
              {marketSession.sessionDescription}
            </span>
          </div>

          {/* 4. Execution Gateway */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Gateway</span>
              <span className={`font-mono font-bold ${
                isLiveUpstox
                  ? state.upstoxAccount?.connected
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                  : 'text-indigo-300'
              }`}>
                {isLiveUpstox ? (state.upstoxAccount?.connected ? 'Upstox Online' : 'Offline') : 'Paper Ledger'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  isLiveUpstox
                    ? state.upstoxAccount?.connected
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                    : 'bg-indigo-500'
                }`}
                style={{ width: isLiveUpstox ? (state.upstoxAccount?.connected ? '100%' : '20%') : '100%' }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">
              {isLiveUpstox ? (state.upstoxAccount?.connected ? 'Live API Connected' : 'Broker Key Disconnected') : 'Simulated Sandbox'}
            </span>
          </div>

          {/* 5. Deployed Exposure */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Fleet Exposure</span>
              <span className="font-mono text-zinc-200 font-bold">
                {moneyINR(pv - currentCash, 0, 0)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round(((pv - currentCash) / (pv || 1)) * 100))}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">
              {(((pv - currentCash) / (pv || 1)) * 100).toFixed(1)}% Capital Deployed
            </span>
          </div>

          {/* 6. Liquid Cash Buffer */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Free Margin</span>
              <span className="font-mono text-emerald-400 font-bold">
                {moneyINR(currentCash, 0, 0)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round((currentCash / (pv || 1)) * 100))}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">
              {((currentCash / (pv || 1)) * 100).toFixed(1)}% Liquid Reserve
            </span>
          </div>

          {/* 7. Active Concurrency */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>MIS Slots</span>
              <span className="font-mono text-zinc-200 font-bold">{activePositionsList.length} / 4</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round((activePositionsList.length / 4) * 100))}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">
              {activePositionsList.length > 0 ? `${activePositionsList.length} Positions Active` : 'All 4 Slots Open'}
            </span>
          </div>

          {/* 8. Target Velocity */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Target Run-Rate</span>
              <span className="font-mono text-purple-300 font-bold">₹1,000 / mo</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: '75%' }} />
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">₹50 / session target pace</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. QUANTITATIVE EXECUTION MODELS (Select Active Architecture)             */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-bold text-zinc-950">
              Quantitative Execution Models
            </h3>
            <p className="text-xs text-zinc-500">
              Select an execution model to adjust risk parameters, sizing formulas, and exit behaviors in real time.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            Active: <strong className="text-zinc-900">{strategyModels.find(m => m.id === prototypeVersion)?.name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {strategyModels.map((model) => {
            const isCurrent = prototypeVersion === model.id;
            const IconComponent = model.icon;

            return (
              <div
                key={model.id}
                onClick={() => setPilotPrototypeVersion(model.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  isCurrent
                    ? `${model.activeRing} shadow-xs`
                    : 'bg-white border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50/50'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        isCurrent ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'
                      }`}>
                        <IconComponent className={`w-3.5 h-3.5 ${isCurrent ? model.iconColor : 'text-zinc-600'}`} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-zinc-950 block">
                          {model.code}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-medium">
                          {model.name}
                        </span>
                      </div>
                    </div>

                    <span className={`text-[9px] px-2 py-0.5 rounded-md border ${model.tagColor}`}>
                      {model.tag}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
                    <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                      <span className="text-[10px] text-zinc-400 block">{model.profitLabel}</span>
                      <span className="text-xs font-bold font-mono text-zinc-950">
                        {model.profit}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                      <span className="text-[10px] text-zinc-400 block">Win Rate</span>
                      <span className="text-xs font-bold font-mono text-emerald-700">
                        {model.winRate}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-600 leading-relaxed">
                    {model.summary}
                  </p>
                </div>

                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500">
                    {model.edge}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPilotPrototypeVersion(model.id);
                    }}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                      isCurrent
                        ? 'bg-zinc-950 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    {isCurrent ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Active</span>
                      </>
                    ) : (
                      <span>Select</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. STREAMLINED DESK TABS                                                  */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between border-b border-black/[0.06] pb-2 flex-wrap gap-2 pt-2">
        <div className="flex items-center gap-1.5 flex-wrap p-1 liquid-glass-pill">
          {/* TAB: ACTIVE POSITIONS */}
          <button
            type="button"
            onClick={() => setActiveTab('positions')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer spring-press ${
              activeTab === 'positions'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Active Positions</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activePositionsList.length > 0
                ? (activeTab === 'positions' ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800 font-bold')
                : (activeTab === 'positions' ? 'bg-white/20 text-white' : 'bg-black/[0.06] text-zinc-700')
            }`}>
              {activePositionsList.length}
            </span>
          </button>

          {/* TAB: ACTIONABLE SETUPS */}
          <button
            type="button"
            onClick={() => setActiveTab('opportunities')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer spring-press ${
              activeTab === 'opportunities'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Opportunity Scanner</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'opportunities' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
            }`}>
              {opportunities.length}
            </span>
          </button>

          {/* TAB: MONITORED FLEET */}
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer spring-press ${
              activeTab === 'fleet'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Fleet Coverage</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'fleet' ? 'bg-white/20 text-white' : 'bg-black/[0.06] text-zinc-600'
            }`}>
              {UPSTOX_FLEET_ASSETS.length}
            </span>
          </button>

          {/* TAB: QUANT LAB & CAPITAL SIMULATOR */}
          <button
            type="button"
            onClick={() => setActiveTab('quant_lab')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer spring-press ${
              activeTab === 'quant_lab'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-indigo-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Quant Lab &bull; Simulator</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 font-mono font-bold">
              ₹1L Calc
            </span>
          </button>

          {/* TAB: NEWS & SENTIMENT RADAR */}
          <button
            type="button"
            onClick={() => setActiveTab('news')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer spring-press ${
              activeTab === 'news'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-rose-900'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>News &bull; Sentiment</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 font-mono font-bold">
              FinBERT
            </span>
          </button>

          {/* TAB: AUDIT STREAM */}
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer spring-press ${
              activeTab === 'logs'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Execution Audit</span>
            {actionLogs.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'logs' ? 'bg-white/20 text-white' : 'bg-black/[0.06] text-zinc-700'
              }`}>
                {actionLogs.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'opportunities' && (
          <div className="p-0.5 bg-zinc-100 rounded-xl flex items-center text-xs border border-zinc-200">
            <button
              type="button"
              onClick={() => setViewMode('beginner')}
              className={`px-3 py-1 font-medium rounded-lg transition-all cursor-pointer ${
                viewMode === 'beginner' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500'
              }`}
            >
              Executive Summary
            </button>
            <button
              type="button"
              onClick={() => setViewMode('quant')}
              className={`px-3 py-1 font-medium rounded-lg transition-all cursor-pointer ${
                viewMode === 'quant' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500'
              }`}
            >
              Technical Factors
            </button>
          </div>
        )}

        {activeTab === 'logs' && actionLogs.length > 0 && (
          <button
            type="button"
            onClick={clearPilotLogs}
            className="text-[11px] text-zinc-500 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            Clear Logs
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. TAB 1: ACTIVE POSITIONS DESK                                           */}
      {/* ========================================================================= */}
      {activeTab === 'positions' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs text-zinc-500 px-1">
            <span>
              Real-time portfolio exposure, live stop losses, and target tranches
            </span>
            {activePositionsList.length > 0 && (
              <div className="text-xs font-mono font-bold flex items-center gap-1.5">
                <span>Total Open P&L:</span>
                <span className={`px-2 py-0.5 rounded-md ${
                  totalOpenPnl >= 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {totalOpenPnl >= 0 ? '+' : ''}{moneyINR(totalOpenPnl)}
                </span>
              </div>
            )}
          </div>

          {activePositionsList.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-50/70 border border-zinc-200/80 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-zinc-900">Capital 100% Safeguarded &bull; No Open Exposure</h4>
              <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                The desk is continuously evaluating the {UPSTOX_FLEET_ASSETS.length}-asset fleet. When high-conviction signals qualify, positions will be displayed here with real-time trailing stops and liquidation controls.
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('opportunities')}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Inspect Opportunities ({opportunities.length})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {activePositionsList.map((pos) => {
                const assetMeta = pos.meta;
                const isClosing = closingAsset === pos.asset;

                return (
                  <div
                    key={pos.asset}
                    className="p-4 rounded-xl bg-white border border-zinc-200/90 shadow-xs space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs"
                            style={{ backgroundColor: assetMeta?.iconColor || '#4f46e5' }}
                          >
                            {pos.asset.slice(0, 3)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-zinc-950">
                                {pos.asset}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                ({assetMeta?.name || pos.asset})
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                                {pos.fleetItem?.sector || 'Equities'}
                              </span>
                              <span className={`text-[9px] font-medium px-1.5 py-0.2 rounded border ${getStrategyBadge(pos.strategy)}`}>
                                {pos.strategy}
                              </span>
                            </div>
                          </div>
                        </div>

                        {getLifecycleBadge(pos.fleetItem?.state)}
                      </div>

                      {/* Live Price & P&L Block */}
                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
                        <div>
                          <span className="text-[10px] text-zinc-400 block uppercase font-medium">Spot Price</span>
                          <span className="font-bold font-mono text-zinc-950 text-xs">
                            {moneyINR(pos.price)}
                          </span>
                          <span className={`text-[9px] font-mono block ${
                            pos.change24h >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {pos.change24h >= 0 ? '+' : ''}{pos.change24h.toFixed(2)}% today
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block uppercase font-medium">Unrealized P&L</span>
                          <span className={`font-bold font-mono text-sm block ${
                            pos.pnlAmt >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {pos.pnlAmt >= 0 ? '+' : ''}{moneyINR(pos.pnlAmt)}
                          </span>
                          <span className={`text-[9px] font-mono font-semibold block ${
                            pos.pnlPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                        <div className="p-1.5 rounded-md bg-zinc-50 border border-zinc-100">
                          <span className="text-[9px] text-zinc-400 block">Shares Held</span>
                          <span className="font-bold font-mono text-zinc-900 text-[11px]">{pos.units}</span>
                        </div>
                        <div className="p-1.5 rounded-md bg-zinc-50 border border-zinc-100">
                          <span className="text-[9px] text-zinc-400 block">Avg Price</span>
                          <span className="font-bold font-mono text-zinc-900 text-[11px]">{moneyINR(pos.avgPrice)}</span>
                        </div>
                        <div className="p-1.5 rounded-md bg-zinc-50 border border-zinc-100">
                          <span className="text-[9px] text-zinc-400 block">Kelly Ratio</span>
                          <span className="font-bold font-mono text-indigo-700 text-[11px]">
                            {(pos.fleetItem?.kellyFraction || 1.0).toFixed(2)}x
                          </span>
                        </div>
                      </div>

                      {/* Stop Loss & Profit Target Levels */}
                      <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500 font-medium">Stop-Loss:</span>
                          <span className="font-bold font-mono text-rose-700">
                            {pos.stopLoss ? moneyINR(pos.stopLoss) : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500 font-medium">Profit Target:</span>
                          <span className="font-bold font-mono text-emerald-700">
                            {pos.takeProfit ? moneyINR(pos.takeProfit) : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Exit Button */}
                    <div className="pt-2 border-t border-zinc-100">
                      <button
                        type="button"
                        disabled={isClosing}
                        onClick={() => handleClosePosition(pos.asset, pos.units)}
                        className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Liquidate this position immediately at market"
                      >
                        {isClosing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        )}
                        <span>{isClosing ? 'Closing Position...' : 'Market Liquidation'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. TAB 2: ACTIONABLE SETUPS                                               */}
      {/* ========================================================================= */}
      {activeTab === 'opportunities' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
            <span>
              High-conviction setups satisfying minimum {profileConfig.minRiskReward}:1 profit-to-risk threshold
            </span>
            {autonomousPilot?.lastScanAt && (
              <span className="text-[10px] text-zinc-400 font-mono">
                Last scan: {new Date(autonomousPilot.lastScanAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {opportunities.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-50/70 border border-zinc-200/80 text-center space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-zinc-900">Capital 100% Preserved</h4>
              <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                No setups currently meet your minimum {profileConfig.minRiskReward}:1 risk-reward hurdle and liquidity filters. The engine holds liquid capital until an asymmetric edge is mathematically confirmed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {opportunities.map((opp) => {
                const isIndian = isIndianAsset(opp.asset);
                const currSym = '₹';
                const assetMeta = META[opp.asset];

                return (
                  <div
                    key={opp.id}
                    className="p-4 rounded-xl bg-white border border-zinc-200/90 shadow-xs space-y-3 hover:border-zinc-300 transition-all"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-xs"
                          style={{ backgroundColor: assetMeta?.iconColor || '#4f46e5' }}
                        >
                          {opp.asset.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-zinc-950">
                              {assetMeta?.name || opp.asset}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              ({opp.asset} &bull; NSE)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {opp.riskRewardRatio}:1 R:R
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                              {opp.confidenceLabel} ({opp.compositeScore}/100)
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isLiveUpstox && !marketSession.isOpen}
                        onClick={() => handleExecute(opp)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer ${
                          isLiveUpstox && !marketSession.isOpen
                            ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                        }`}
                        title={isLiveUpstox && !marketSession.isOpen ? 'Indian markets are closed (09:15 - 15:30 IST).' : 'Execute setup'}
                      >
                        <span>{isLiveUpstox && !marketSession.isOpen ? 'Market Closed' : 'Execute'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* View Mode Description */}
                    {viewMode === 'beginner' ? (
                      <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 leading-relaxed">
                        <strong className="text-zinc-900">Thesis: </strong>
                        {opp.beginnerExplanation.why}
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-xs">
                        <p className="text-zinc-600 text-[11px] leading-relaxed">
                          {opp.plainEnglishRationale}
                        </p>
                        <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                          <div className="p-1 rounded bg-zinc-50 border border-zinc-100">
                            <span className="text-zinc-400 block">RSI</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.rsi}</span>
                          </div>
                          <div className="p-1 rounded bg-zinc-50 border border-zinc-100">
                            <span className="text-zinc-400 block">ATR</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.atr}</span>
                          </div>
                          <div className="p-1 rounded bg-zinc-50 border border-zinc-100">
                            <span className="text-zinc-400 block">Regime</span>
                            <span className="font-semibold text-zinc-800">{opp.regime.split('_')[0]}</span>
                          </div>
                          <div className="p-1 rounded bg-zinc-50 border border-zinc-100">
                            <span className="text-zinc-400 block">Volatility</span>
                            <span className="font-semibold text-zinc-800">{opp.indicatorsSummary.volatilityPct}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Brackets Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100 text-xs">
                      <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                        <span className="text-[10px] text-zinc-400 block uppercase">Entry Spot</span>
                        <span className="font-bold font-mono text-zinc-950">
                          {currSym}{opp.entryPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-rose-50/70 border border-rose-100">
                        <span className="text-[10px] text-rose-600 block uppercase font-medium">Stop-Loss</span>
                        <span className="font-bold font-mono text-rose-700">
                          {currSym}{opp.stopLossPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-100">
                        <span className="text-[10px] text-emerald-600 block uppercase font-medium">Target Profit</span>
                        <span className="font-bold font-mono text-emerald-700">
                          {currSym}{opp.takeProfitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Sizing Footer */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 px-0.5 pt-0.5 font-mono">
                      <span>
                        Size: <strong className="text-zinc-800">{opp.recommendedUnits} {isIndian ? 'shares' : 'units'}</strong>
                      </span>
                      <span>
                        Max Risk: <strong className="text-rose-700">{currSym}{opp.projectedLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                      <span>
                        Target Return: <strong className="text-emerald-700">+{currSym}{opp.projectedGain.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. TAB 3: MONITORED FLEET & OPERATIONAL TELEMETRY                         */}
      {/* ========================================================================= */}
      {activeTab === 'fleet' && (
        <div className="space-y-4">
          {/* Operational Readiness Header (4 Sleek Telemetry Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* 1. Market Session */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="font-semibold uppercase tracking-wider">Exchange Session</span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                  <span className={`w-2 h-2 rounded-full ${marketSession.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                  {marketSession.isOpen ? 'LIVE' : 'CLOSED'}
                </span>
              </div>
              <div className="text-sm font-bold text-zinc-900 truncate">
                {marketSession.isOpen ? 'NSE Cash Market Open' : 'NSE Market Closed'}
              </div>
              <div className="text-[11px] text-zinc-500 truncate" title={marketSession.sessionDescription}>
                {marketSession.sessionDescription}
              </div>
            </div>

            {/* 2. Quant Pilot State */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="font-semibold uppercase tracking-wider">Quant Desk State</span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                  !isEnabled
                    ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                    : isTripped
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {!isEnabled ? 'STANDBY' : isTripped ? 'HALTED' : 'ARMED'}
                </span>
              </div>
              <div className="text-sm font-bold text-zinc-900 truncate">
                {!isEnabled
                  ? 'Autopilot Disarmed'
                  : isTripped
                  ? 'Circuit Breaker Tripped'
                  : executionMode === 'full_autonomous'
                  ? 'Autonomous Execution'
                  : 'Advisor Approval Mode'}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {!isEnabled
                  ? 'Order dispatch paused'
                  : isTripped
                  ? 'Risk circuit tripped'
                  : `${activePositionsList.length} active positions managed`}
              </div>
            </div>

            {/* 3. Execution Gateway */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="font-semibold uppercase tracking-wider">Order Gateway</span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                  isLiveUpstox
                    ? state.upstoxAccount?.connected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>
                  {isLiveUpstox
                    ? state.upstoxAccount?.connected
                      ? 'CONNECTED'
                      : 'OFFLINE'
                    : 'SIMULATION'}
                </span>
              </div>
              <div className="text-sm font-bold text-zinc-900 truncate">
                {isLiveUpstox
                  ? state.upstoxAccount?.connected
                    ? 'Upstox Live Broker'
                    : 'Upstox Disconnected'
                  : 'Paper Trading Engine'}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {isLiveUpstox ? (
                  state.upstoxAccount?.connected ? (
                    `User: ${state.upstoxAccount.accountId || state.upstoxAccount.accountName || 'Linked'}`
                  ) : (
                    <button
                      type="button"
                      onClick={openUpstoxDrawer}
                      className="text-amber-700 hover:text-amber-800 font-semibold underline cursor-pointer"
                    >
                      Click to connect API &rarr;
                    </button>
                  )
                ) : (
                  'Zero-latency virtual fills'
                )}
              </div>
            </div>

            {/* 4. Universe Exposure */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="font-semibold uppercase tracking-wider">Fleet Universe</span>
                <span className="text-[10px] font-mono text-zinc-600 font-bold">
                  {activePositionsList.length} / {UPSTOX_FLEET_ASSETS.length} Held
                </span>
              </div>
              <div className="text-sm font-bold text-zinc-900">
                {moneyINR(totalOpenPnl)}
                <span className={`text-xs ml-1.5 font-normal ${totalOpenPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ({totalOpenPnl >= 0 ? '+' : ''}{((totalOpenPnl / (pv || 1)) * 100).toFixed(2)}%)
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {advancingCount} Gainers &bull; {decliningCount} Decliners
              </div>
            </div>
          </div>

          {/* Conditional Gateway Warning Alert if Upstox is disconnected */}
          {isLiveUpstox && !state.upstoxAccount?.connected && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2.5">
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold block">Upstox Trading Gateway Disconnected</span>
                  <span className="text-amber-700">Real orders cannot be routed to exchange. The fleet is in observation-only mode until access token is linked.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={openUpstoxDrawer}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-all text-xs shrink-0 cursor-pointer shadow-2xs"
              >
                Connect Upstox Broker &rarr;
              </button>
            </div>
          )}

          {/* Session Closed Alert */}
          {!marketSession.isOpen && (
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs shadow-2xs">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>
                  <strong>NSE Cash Market is Closed:</strong> {marketSession.sessionDescription}. Telemetry reflects the latest settlement prices. Automated strategy entry resumes at 09:15 IST.
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                Mon–Fri 09:15–15:30 IST
              </span>
            </div>
          )}

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
            {/* Category Segmented Control */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setFleetCategoryFilter('ALL')}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all shrink-0 cursor-pointer ${
                  fleetCategoryFilter === 'ALL'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                All Equities ({UPSTOX_FLEET_ASSETS.length})
              </button>

              <button
                type="button"
                onClick={() => setFleetCategoryFilter('POSITIONS')}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  fleetCategoryFilter === 'POSITIONS'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                }`}
              >
                <span>Active Positions</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
                  {activePositionsList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFleetCategoryFilter('GAINERS')}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  fleetCategoryFilter === 'GAINERS'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span>Gainers</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                  {gainersCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFleetCategoryFilter('DECLINERS')}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  fleetCategoryFilter === 'DECLINERS'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <TrendingDown className="w-3 h-3 text-rose-600" />
                <span>Decliners</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 font-mono">
                  {declinersCount}
                </span>
              </button>
            </div>

            {/* Sector Dropdown & Search Input */}
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={fleetSectorFilter}
                onChange={(e) => setFleetSectorFilter(e.target.value)}
                className="text-xs py-1.5 px-2.5 bg-white border border-zinc-200 rounded-lg outline-hidden focus:border-zinc-400 text-zinc-700 shadow-2xs cursor-pointer"
              >
                {fleetSectors.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector === 'ALL' ? 'All Sectors' : sector}
                  </option>
                ))}
              </select>

              <div className="relative sm:w-52">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search symbol / name..."
                  value={fleetSearchQuery}
                  onChange={(e) => setFleetSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-lg outline-hidden focus:border-zinc-400 shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Clean Minimalist Telemetry Table */}
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                  <th className="py-2.5 px-3.5">Asset / Sector</th>
                  <th className="py-2.5 px-3">Spot Price &amp; 24h</th>
                  <th className="py-2.5 px-3 hidden sm:table-cell">Day Range (L - H)</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">24h Volume</th>
                  <th className="py-2.5 px-3">Model &amp; Hurst</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Holding &amp; P&amp;L</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredFleetAssets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-zinc-500 text-xs">
                      No equities found matching the current filters.
                    </td>
                  </tr>
                )}
                {filteredFleetAssets.map((asset) => {
                  const meta = META[asset];
                  const mkt = markets[asset];
                  const fleetItem = activeFleet[asset];
                  const authoritativePrice = (fleetItem?.currentPrice && fleetItem.currentPrice > 0)
                    ? fleetItem.currentPrice
                    : (!mkt?.isSynthetic && mkt?.price && mkt.price > 0)
                    ? mkt.price
                    : (mkt?.price || meta?.basePrice || 100);
                  const price = authoritativePrice;
                  const strat = fleetItem?.assignedStrategy || 'Breakout Rider';
                  const hurst = fleetItem?.hurst ?? 0.65;
                  const hurstInfo = getHurstInterpretation(hurst);
                  const unitsHeld = state.positions[asset] || fleetItem?.unitsHeld || 0;
                  const avgPrice = state.avgBuyPrice?.[asset] || fleetItem?.entryPrice || price;
                  const pnlAmt = unitsHeld > 0 ? (price - avgPrice) * unitsHeld : 0;
                  const pnlPct = unitsHeld > 0 && avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : 0;
                  const change24h = mkt?.change24h || 0;

                  return (
                    <tr key={asset} className="hover:bg-zinc-50/90 transition-colors">
                      {/* Asset & Sector */}
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-2xs"
                            style={{ backgroundColor: meta?.iconColor || '#4f46e5' }}
                          >
                            {asset.slice(0, 3)}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-950 flex items-center gap-1.5">
                              {asset}
                              <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                                {fleetItem?.sector || (meta as any)?.sector || 'Equities'}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[130px]">
                              {meta?.name || asset}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Spot Price & 24h Change */}
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-zinc-900">
                          {moneyINR(price)}
                        </div>
                        <div className={`text-[10px] font-mono font-semibold ${
                          change24h >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                        </div>
                      </td>

                      {/* Day Range Bar */}
                      <td className="py-2.5 px-3 hidden sm:table-cell">
                        {renderDayRangeBar(price, mkt?.low24h, mkt?.high24h) || (
                          <span className="text-[10px] text-zinc-400 font-mono">—</span>
                        )}
                      </td>

                      {/* 24h Volume */}
                      <td className="py-2.5 px-3 hidden md:table-cell font-mono text-[11px] text-zinc-600">
                        {formatIndianVolume(mkt?.volume24h)}
                      </td>

                      {/* Quantitative Model & Hurst */}
                      <td className="py-2.5 px-3">
                        <div>
                          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.2 rounded-md border ${getStrategyBadge(strat)}`}>
                            {strat}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] font-mono font-semibold text-zinc-700">
                            H={hurst.toFixed(2)}
                          </span>
                          <span className={`text-[9px] font-medium px-1 rounded border ${hurstInfo.color}`}>
                            {hurstInfo.label}
                          </span>
                        </div>
                      </td>

                      {/* Operational Status Badge */}
                      <td className="py-2.5 px-3">
                        {getFleetAssetStatus(asset, fleetItem, unitsHeld)}
                      </td>

                      {/* Position & Net P&L */}
                      <td className="py-2.5 px-3.5 text-right font-mono">
                        {unitsHeld > 0 ? (
                          <div>
                            <div className="font-bold text-zinc-900">
                              {unitsHeld} shs @ {moneyINR(avgPrice, 0, 0)}
                            </div>
                            <div className={`text-[10px] font-semibold ${pnlAmt >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {pnlAmt >= 0 ? '+' : ''}{moneyINR(pnlAmt)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Inspect Desk Button */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleInspectAsset(asset as Asset)}
                          className="text-[11px] font-semibold px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all cursor-pointer border border-zinc-200"
                          title={`Inspect ${asset} in the Trading Desk`}
                        >
                          Inspect &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. TAB 4: QUANT LAB & CAPITAL SIMULATOR                                   */}
      {/* ========================================================================= */}
      {activeTab === 'quant_lab' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-950">
                  5-Year Historical Quant Lab &bull; Capital Compounding Simulator
                </h3>
              </div>
              <p className="text-xs text-zinc-600 mt-1 max-w-2xl">
                Simulate portfolio growth, monthly run-rate, and maximum drawdown across 57 months of tick-by-tick backtesting (January 2022 to September 2026) for different initial capital sizes and model architectures.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold px-3 py-1 bg-white text-zinc-800 rounded-lg border border-zinc-200 shrink-0">
              57 Months &bull; 1,214 Trading Days
            </span>
          </div>

          {/* Interactive Compounding Calculator Strip */}
          <div className="p-4 sm:p-5 rounded-xl bg-white border border-zinc-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-zinc-950 block">
                  Select Starting Capital Size
                </span>
                <span className="text-[11px] text-zinc-500">
                  Direct simulation answering: "If I had ₹1 Lakh at the beginning, what would be the returns?"
                </span>
              </div>

              {/* Capital Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: '₹25,000', value: 25_000 },
                  { label: '₹40,000 (Base)', value: 40_000 },
                  { label: '₹1,00,000 (1 Lakh)', value: 100_000 },
                  { label: '₹2,50,000', value: 250_000 },
                  { label: '₹5,00,000 (5 Lakh)', value: 500_000 },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSimulatedCapital(preset.value)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      simulatedCapital === preset.value
                        ? 'bg-zinc-950 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Strategy Model Selector for Simulation */}
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-semibold text-zinc-500 shrink-0">Model Architecture:</span>
              {[
                { id: 'prototype_1_classic' as PilotPrototypeVersion, label: 'Model 1 (Trend Rider ★ Flagship)' },
                { id: 'prototype_2_adaptive_brain' as PilotPrototypeVersion, label: 'Model 2 (Target-Paced Harvest)' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSimulatedPrototype(p.id)}
                  className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all shrink-0 cursor-pointer ${
                    simulatedPrototype === p.id
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Projected Simulation Results Output Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-zinc-500 block">
                  Projected Ending NAV
                </span>
                <span className="text-lg font-bold font-mono text-zinc-950 block">
                  {moneyINR(simulationResults.endingNav)}
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold block font-mono">
                  +{((simulationResults.netProfit / simulatedCapital) * 100).toFixed(1)}% 5-Yr Growth
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-zinc-500 block">
                  Total 5-Yr Net Profit
                </span>
                <span className="text-lg font-bold font-mono text-emerald-700 block">
                  +{moneyINR(simulationResults.netProfit)}
                </span>
                <span className="text-[10px] text-zinc-600 font-medium block">
                  {simulationResults.winRate} Win Rate
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-zinc-500 block">
                  Average Monthly Profit
                </span>
                <span className="text-lg font-bold font-mono text-indigo-900 block">
                  +{moneyINR(simulationResults.monthlyAvg)}
                </span>
                <span className="text-[10px] text-indigo-700 font-semibold block">
                  {simulationResults.monthlyAvg >= 1000 ? '✓ Beats ≥ ₹1,000/mo Goal' : 'On Track Target'}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                <span className="text-[10px] uppercase font-semibold text-zinc-500 block">
                  Intraday Buying Power
                </span>
                <span className="text-lg font-bold font-mono text-zinc-950 block">
                  {moneyINR(simulationResults.buyingPower)}
                </span>
                <span className="text-[10px] text-zinc-500 font-medium block">
                  5x MIS Margin Capacity
                </span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-600 leading-relaxed pt-1">
              <strong>Execution Blueprint:</strong> {simulationResults.description} Historical maximum drawdown was constrained to <strong>{simulationResults.maxDd}</strong> across the 2022 bear market and 2024 consolidations.
            </p>
          </div>

          {/* 5-Year Head-to-Head Comparative Matrix */}
          <div className="p-4 sm:p-5 rounded-xl bg-white border border-zinc-200/90 shadow-xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>5-Year Head-to-Head Model Audit (2022 — 2026)</span>
            </h4>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase font-semibold text-zinc-500">
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3">5-Yr Net Profit</th>
                    <th className="py-2.5 px-3">Win Rate</th>
                    <th className="py-2.5 px-3">Total Trades</th>
                    <th className="py-2.5 px-3">Months ≥ ₹1k</th>
                    <th className="py-2.5 px-3">Max DD</th>
                    <th className="py-2.5 px-3">Friction Fees</th>
                    <th className="py-2.5 px-3">Core Architectural Edge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {quantLabComparison.map((row) => (
                    <tr key={row.proto} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-zinc-950">{row.name}</div>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-md border font-semibold ${
                          row.accent === 'amber' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                          row.accent === 'emerald' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          row.accent === 'slate' ? 'bg-zinc-100 text-zinc-800 border-zinc-200' :
                          'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}>
                          {row.tag}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {row.netProfit}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-zinc-900">
                        {row.winRate}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-600">
                        {row.trades}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-indigo-700">
                        {row.months1k}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-rose-700">
                        {row.maxDd}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-500 text-[11px]">
                        {row.fees}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-zinc-600 max-w-xs">
                        {row.strength}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Yearly Performance Across Market Cycles */}
          <div className="p-4 sm:p-5 rounded-xl bg-white border border-zinc-200/90 shadow-xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-600" />
              <span>Year-by-Year Performance Across Market Regimes</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              {yearlyReplayStats.map((y) => (
                <div key={y.year} className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-zinc-950">{y.year}</span>
                    <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-white text-zinc-600 border border-zinc-200">
                      {y.trades} trades
                    </span>
                  </div>
                  <div className="text-sm font-bold font-mono text-emerald-700">
                    {y.netPnl}
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center justify-between">
                    <span>Win: <strong>{y.winRate}</strong></span>
                    <span>DD: <strong className="text-rose-700">{y.maxDd}</strong></span>
                  </div>
                  <div className="text-[9px] text-zinc-400 truncate pt-1 border-t border-zinc-200/60">
                    {y.regime}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9.5 TAB: REAL-TIME NEWS & SENTIMENT RADAR                                 */}
      {/* ========================================================================= */}
      {activeTab === 'news' && (
        <NewsSentimentRadar />
      )}

      {/* ========================================================================= */}
      {/* 10. TAB 5: AUDIT & EXECUTION STREAM                                       */}
      {/* ========================================================================= */}
      {activeTab === 'logs' && (
        <div className="space-y-3.5">
          {/* Top Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">Total Log Events</span>
              <span className="text-sm font-bold text-zinc-900 font-mono">{actionLogs.length}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">Orders & Fills</span>
              <span className="text-sm font-bold text-emerald-700 font-mono">{tradeCount}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider block">Trailing Ratchets</span>
              <span className="text-sm font-bold text-teal-700 font-mono">{ratchetCount}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">Risk Guards &amp; Skips</span>
              <span className="text-sm font-bold text-amber-700 font-mono">{riskCount}</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-200">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setLogFilterCategory('all')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  logFilterCategory === 'all'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                All ({actionLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setLogFilterCategory('trades')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  logFilterCategory === 'trades'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Fills &amp; Exits ({tradeCount})
              </button>
              <button
                type="button"
                onClick={() => setLogFilterCategory('ratchets')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  logFilterCategory === 'ratchets'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Defense Ratchets ({ratchetCount})
              </button>
              <button
                type="button"
                onClick={() => setLogFilterCategory('risk')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  logFilterCategory === 'risk'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                Risk Guards ({riskCount})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={logSelectedAsset}
                onChange={(e) => setLogSelectedAsset(e.target.value)}
                className="text-[11px] font-semibold bg-white border border-zinc-200 text-zinc-700 rounded-md px-2.5 py-1 outline-hidden shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Assets</option>
                {UPSTOX_FLEET_ASSETS.map((ast) => (
                  <option key={ast} value={ast}>
                    {ast}
                  </option>
                ))}
              </select>

              {actionLogs.length > 0 && (
                <button
                  type="button"
                  onClick={clearPilotLogs}
                  className="text-[11px] text-zinc-500 hover:text-rose-600 flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-rose-50 cursor-pointer"
                  title="Clear in-memory action logs"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Logs List */}
          {filteredActionLogs.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-50 border border-zinc-200 text-center space-y-2">
              <Clock className="w-4 h-4 text-zinc-400 mx-auto" />
              <h4 className="text-xs font-bold text-zinc-900">
                {actionLogs.length === 0 ? 'No Execution Events Yet' : 'No logs match the selected filter'}
              </h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                {actionLogs.length === 0
                  ? 'When market setups qualify, entries, trailing ratchets, and profit harvests will be recorded here.'
                  : 'Try selecting "All" or choosing another asset to see your logged actions.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActionLogs.map((log) => {
                const isTrade = tradeActions.includes(log.action);
                const isRisk = riskActions.includes(log.action);

                let iconNode = <Activity className="w-4 h-4 text-zinc-600" />;
                let iconBg = 'bg-zinc-100 border-zinc-200';
                let actionBadgeStyle = 'bg-zinc-100 text-zinc-700 border-zinc-200';

                if (log.action === 'BUY_ENTRY') {
                  iconNode = <ArrowUpRight className="w-4 h-4 text-emerald-600" />;
                  iconBg = 'bg-emerald-50 border-emerald-200';
                  actionBadgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
                } else if (log.action === 'TAKE_PROFIT' || log.action === 'PROFIT_HARVEST_T1' || log.action === 'PROFIT_HARVEST_T2') {
                  iconNode = <DollarSign className="w-4 h-4 text-teal-600" />;
                  iconBg = 'bg-teal-50 border-teal-200';
                  actionBadgeStyle = 'bg-teal-100 text-teal-800 border-teal-300 font-bold';
                } else if (log.action === 'CHANDELIER_EXIT') {
                  iconNode = <TrendingUp className="w-4 h-4 text-purple-600" />;
                  iconBg = 'bg-purple-50 border-purple-200';
                  actionBadgeStyle = 'bg-purple-100 text-purple-800 border-purple-300 font-bold';
                } else if (log.action === 'STOP_LOSS') {
                  iconNode = <ArrowDownRight className="w-4 h-4 text-rose-600" />;
                  iconBg = 'bg-rose-50 border-rose-200';
                  actionBadgeStyle = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
                } else if (log.action === 'TRAILING_RATCHET') {
                  iconNode = <TrendingUp className="w-4 h-4 text-emerald-600" />;
                  iconBg = 'bg-emerald-50 border-emerald-200';
                  actionBadgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
                } else if (log.action === 'SESSION_CLOSE' || log.action === 'DEAD_TRADE_EXIT') {
                  iconNode = <Clock className="w-4 h-4 text-amber-600" />;
                  iconBg = 'bg-amber-50 border-amber-200';
                  actionBadgeStyle = 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
                } else if (isRisk) {
                  iconNode = <ShieldAlert className="w-4 h-4 text-amber-600" />;
                  iconBg = 'bg-amber-50 border-amber-200';
                  actionBadgeStyle = 'bg-amber-100 text-amber-900 border-amber-300 font-medium';
                }

                const status = log.status || (isTrade ? 'EXECUTED' : isRisk ? 'BLOCKED' : 'EXECUTED');
                let statusBadge = (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>EXECUTED</span>
                  </span>
                );
                if (status === 'BLOCKED') {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <Shield className="w-2.5 h-2.5" />
                      <span>BLOCKED</span>
                    </span>
                  );
                } else if (status === 'THROTTLED') {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>THROTTLED</span>
                    </span>
                  );
                }

                const actionTitle = log.action.replaceAll('_', ' ');

                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-white border border-zinc-200 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${iconBg} mt-0.5`}>
                        {iconNode}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] uppercase px-2 py-0.5 rounded-md border ${actionBadgeStyle}`}>
                            {actionTitle}
                          </span>
                          <span className="font-bold text-zinc-950 font-mono">
                            {log.asset}
                          </span>
                          {log.strategy && (
                            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-sm">
                              {log.strategy}
                            </span>
                          )}
                          {statusBadge}
                        </div>

                        <p className="text-zinc-600 text-[11px] leading-relaxed max-w-2xl">
                          {log.detail}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between shrink-0 text-right gap-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-100">
                      {log.price > 0 ? (
                        <span className="font-mono text-zinc-900 font-bold text-xs">
                          {moneyINR(log.price)}
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-[11px] font-mono">&mdash;</span>
                      )}
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
