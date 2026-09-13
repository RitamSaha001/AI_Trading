import { NewsSentimentAnalysis, TickerSentimentStatus } from "./types";

export interface EmergencyVetoResult {
  hasVeto: boolean;
  reason?: string;
  analysis?: NewsSentimentAnalysis;
}

export interface AlphaCatalystResult {
  hasCatalyst: boolean;
  boostPoints: number; // ACI points to add (typically +8 to +14)
  reason?: string;
  analysis?: NewsSentimentAnalysis;
}

export class NewsCatalystRegistry {
  private static recentAnalyses: NewsSentimentAnalysis[] = [];
  private static tickerAnalyses: Map<string, NewsSentimentAnalysis[]> = new Map();
  private static readonly MAX_GLOBAL_HISTORY = 200;
  private static readonly VETO_HORIZON_MS = 60 * 60 * 1000;      // 60 minutes active veto window
  private static readonly CATALYST_HORIZON_MS = 90 * 60 * 1000;  // 90 minutes catalyst boost window

  /**
   * Ingests a new sentiment analysis result and maps it to affected tickers.
   */
  public static ingest(analysis: NewsSentimentAnalysis): void {
    // Add to global feed
    this.recentAnalyses.unshift(analysis);
    if (this.recentAnalyses.length > this.MAX_GLOBAL_HISTORY) {
      this.recentAnalyses.pop();
    }

    // Map to each matched ticker
    for (const ticker of analysis.matchedTickers) {
      const existing = this.tickerAnalyses.get(ticker) || [];
      existing.unshift(analysis);
      // Keep last 20 for ticker
      if (existing.length > 20) {
        existing.pop();
      }
      this.tickerAnalyses.set(ticker, existing);
    }
  }

  /**
   * Checks if an open position or candidate trade for a ticker has an active emergency news veto.
   * If true, the position should be immediately liquidated or the trade entry blocked.
   */
  public static checkEmergencyVeto(symbol: string, now: number = Date.now()): EmergencyVetoResult {
    const list = this.tickerAnalyses.get(symbol.toUpperCase());
    if (!list || list.length === 0) {
      return { hasVeto: false };
    }

    // Find the most recent active veto within the veto horizon
    for (const item of list) {
      if (item.isEmergencyVeto && now - item.publishedAt <= this.VETO_HORIZON_MS) {
        return {
          hasVeto: true,
          reason: `[Breaking Adverse News Veto] ${item.category}: "${item.headline}" (Score: ${item.score}, Urgency: ${item.urgency}/100)`,
          analysis: item,
        };
      }
    }

    return { hasVeto: false };
  }

  /**
   * Checks if a candidate trade has a verified positive news catalyst.
   * If true, returns the ACI confidence boost points (+8 to +14) to enhance breakout sizing.
   */
  public static checkAlphaCatalyst(symbol: string, now: number = Date.now()): AlphaCatalystResult {
    const list = this.tickerAnalyses.get(symbol.toUpperCase());
    if (!list || list.length === 0) {
      return { hasCatalyst: false, boostPoints: 0 };
    }

    // Find the strongest recent catalyst within horizon
    for (const item of list) {
      if (item.isAlphaCatalyst && now - item.publishedAt <= this.CATALYST_HORIZON_MS) {
        // Dynamic ACI boost based on urgency and confidence
        let boost = 8;
        if (item.urgency >= 90) boost = 14;
        else if (item.urgency >= 82) boost = 11;

        return {
          hasCatalyst: true,
          boostPoints: boost,
          reason: `[News Alpha Catalyst] ${item.category}: "${item.headline}" (Urgency: ${item.urgency}/100, +${boost} ACI)`,
          analysis: item,
        };
      }
    }

    return { hasCatalyst: false, boostPoints: 0 };
  }

  /**
   * Returns comprehensive ticker sentiment telemetry.
   */
  public static getTickerStatus(symbol: string, now: number = Date.now()): TickerSentimentStatus {
    const sym = symbol.toUpperCase();
    const veto = this.checkEmergencyVeto(sym, now);
    const catalyst = this.checkAlphaCatalyst(sym, now);
    const list = this.tickerAnalyses.get(sym) || [];

    // Calculate rolling weighted sentiment
    let compositeSentiment = 0;
    if (list.length > 0) {
      let totalWeight = 0;
      let weightedSum = 0;
      for (let i = 0; i < Math.min(list.length, 5); i++) {
        const item = list[i];
        const ageHours = (now - item.publishedAt) / (60 * 60 * 1000);
        const recencyWeight = Math.max(0.1, 1.0 - ageHours * 0.2); // Decay over 5 hours
        weightedSum += item.score * recencyWeight;
        totalWeight += recencyWeight;
      }
      compositeSentiment = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0;
    }

    return {
      symbol: sym,
      activeVeto: veto.hasVeto,
      vetoReason: veto.reason,
      activeCatalyst: catalyst.hasCatalyst,
      catalystReason: catalyst.reason,
      compositeSentiment,
      recentArticlesCount: list.length,
      lastArticleTimestamp: list.length > 0 ? list[0].publishedAt : 0,
      latestAnalysis: list.length > 0 ? list[0] : undefined,
    };
  }

  /**
   * Returns the global stream of recent analyses.
   */
  public static getRecentFeed(limit = 50): NewsSentimentAnalysis[] {
    return this.recentAnalyses.slice(0, limit);
  }

  /**
   * Clears in-memory registry (useful for testing).
   */
  public static clear(): void {
    this.recentAnalyses = [];
    this.tickerAnalyses.clear();
  }
}
