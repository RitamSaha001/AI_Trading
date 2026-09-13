import { describe, it, expect, beforeEach } from "vitest";
import {
  LocalFinBERTEngine,
  NewsCatalystRegistry,
  NewsArticle,
} from "../index";
import { tickAutonomousPilot, initializeFleetStatus, createDefaultRateLimitStatus } from "../../autonomousPilotEngine";
import { AppState, Market, Asset } from "../../../types";

describe("News Engine Trading Integration Suite", () => {
  beforeEach(() => {
    NewsCatalystRegistry.clear();
  });

  it("registers breaking adverse news and triggers active veto in NewsCatalystRegistry", () => {
    const article: NewsArticle = {
      id: "adverse_1",
      headline: "SEBI initiates forensic audit and search on promoters of Zydus Lifesciences",
      source: "BSE_ANNOUNCEMENTS",
      publishedAt: Date.now(),
    };

    const analysis = LocalFinBERTEngine.analyze(article);
    NewsCatalystRegistry.ingest(analysis);

    const vetoCheck = NewsCatalystRegistry.checkEmergencyVeto("ZYDUSLIFE");
    expect(vetoCheck.hasVeto).toBe(true);
    expect(vetoCheck.reason).toContain("Breaking Adverse News Veto");

    const status = NewsCatalystRegistry.getTickerStatus("ZYDUSLIFE");
    expect(status.activeVeto).toBe(true);
    expect(status.compositeSentiment).toBeLessThan(-0.8);
  });

  it("registers major commercial order win as alpha catalyst in NewsCatalystRegistry", () => {
    const article: NewsArticle = {
      id: "order_1",
      headline: "BHEL bags mega commercial order worth Rs 4,500 cr from NTPC for thermal plant",
      source: "BSE_ANNOUNCEMENTS",
      publishedAt: Date.now(),
    };

    const analysis = LocalFinBERTEngine.analyze(article);
    NewsCatalystRegistry.ingest(analysis);

    const catalystCheck = NewsCatalystRegistry.checkAlphaCatalyst("BHEL");
    expect(catalystCheck.hasCatalyst).toBe(true);
    expect(catalystCheck.boostPoints).toBeGreaterThanOrEqual(11);

    const status = NewsCatalystRegistry.getTickerStatus("BHEL");
    expect(status.activeCatalyst).toBe(true);
    expect(status.compositeSentiment).toBeGreaterThan(0.8);
  });

  it("triggers immediate emergency liquidation scratch when held asset suffers adverse news", () => {
    const now = Date.now();
    const asset = "ZYDUSLIFE" as Asset;

    // 1. Ingest adverse SEBI news on ZYDUSLIFE
    const article: NewsArticle = {
      id: "veto_test_1",
      headline: "SEBI initiates forensic audit and search on promoters of Zydus Lifesciences",
      source: "BSE_ANNOUNCEMENTS",
      publishedAt: now,
    };
    NewsCatalystRegistry.ingest(LocalFinBERTEngine.analyze(article));

    // 2. Setup mock state with an open position in ZYDUSLIFE
    const currentPrice = 1150.0;
    const mockMarket: Market = {
      asset,
      symbol: "ZYDUSLIFE",
      name: "Zydus Lifesciences",
      price: currentPrice,
      change24h: 0.5,
      high24h: 1160,
      low24h: 1140,
      volume24h: 500000,
      history: [1145, 1148, 1150],
      candles: [
        { time: now - 300000, open: 1145, high: 1148, low: 1144, close: 1146, volume: 10000 },
        { time: now - 240000, open: 1146, high: 1150, low: 1145, close: 1148, volume: 12000 },
        { time: now - 180000, open: 1148, high: 1152, low: 1147, close: 1150, volume: 15000 },
        { time: now - 120000, open: 1150, high: 1153, low: 1149, close: 1151, volume: 11000 },
        { time: now - 60000, open: 1151, high: 1152, low: 1148, close: 1150, volume: 9000 },
      ],
      source: "Upstox Live",
      isSynthetic: false,
      lastUpdated: now,
    };

    const markets = { [asset]: mockMarket } as Record<Asset, Market | undefined>;

    const initialFleet = initializeFleetStatus([asset]);
    initialFleet[asset] = {
      ...initialFleet[asset],
      state: "IN_POSITION",
      unitsHeld: 25,
      entryPrice: 1145.0,
      stopLossPrice: 1130.0,
      takeProfitPrice: 1165.0,
      takeProfit2Price: 1180.0,
      currentPrice: currentPrice,
      trancheStage: 0,
      entryTimestamp: now - 15 * 60 * 1000,
      highWaterMark: 1155.0,
    };

    const state: AppState = {
      cash: 50000,
      positions: { [asset]: 25 },
      accountMode: "paper",
      orders: [],
      autonomousPilot: {
        enabled: true,
        executionMode: "full_autonomous",
        profile: "balanced",
        activeFleet: initialFleet,
        rateLimits: createDefaultRateLimitStatus(),
        actionLogs: [],
        dailyStartingValue: 50000,
        peakPortfolioValue: 50000,
        dailyDrawdownPct: 0,
        circuitBreakerTier: "NORMAL",
        riskSessionDate: "2026-09-13",
        riskPerTradePct: 0.01,
        circuitBreakerTripped: false,
        circuitBreakerReason: null,
      },
    } as any;

    // 3. Execute engine tick
    const result = tickAutonomousPilot(state, markets, now);

    // 4. Verify emergency veto exit order was dispatched
    const vetoOrder = result.ordersToDispatch.find(
      (o) => o.asset === asset && o.side === "sell" && o.strategyName === "Auto-Pilot: Emergency News Veto Defense"
    );

    expect(vetoOrder).toBeDefined();
    expect(vetoOrder?.amount).toBe(25);
    expect(vetoOrder?.type).toBe("market");
    expect(vetoOrder?.reason).toContain("Breaking Adverse News Veto");

    // Verify action log
    const vetoLog = result.newActionLogs.find((l) => l.asset === asset && l.detail?.includes("Breaking Adverse News Veto"));
    expect(vetoLog).toBeDefined();
  });
});
