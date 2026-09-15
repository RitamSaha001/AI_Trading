import { NewsArticle } from "./types";
import { NewsDeduplicator } from "./newsDeduplicator";
import { LocalFinBERTEngine } from "./finbertLocalEngine";
import { NewsCatalystRegistry } from "./newsCatalystGate";

export interface FreeFeedConfig {
  name: string;
  url: string;
  sourceType: NewsArticle["source"];
}

export const FREE_NEWS_FEEDS: FreeFeedConfig[] = [
  {
    name: "Google News - Indian Stock Market & Corporate News",
    url: "https://news.google.com/rss/search?q=NSE+OR+BSE+OR+SEBI+stock+announcements&hl=en-IN&gl=IN&ceid=IN:en",
    sourceType: "GOOGLE_NEWS",
  },
  {
    name: "Google News - NIFTY 50 Bluechip Results & Orders",
    url: "https://news.google.com/rss/search?q=(Reliance+OR+TCS+OR+Infosys+OR+Zydus+OR+BHEL+OR+L%26T)+NSE&hl=en-IN&gl=IN&ceid=IN:en",
    sourceType: "GOOGLE_NEWS",
  },
  {
    name: "Economic Times - Corporate Results & Filings",
    url: "https://economictimes.indiatimes.com/markets/stocks/recs/rssfeeds/2143844.cms",
    sourceType: "ECONOMIC_TIMES",
  },
];

export class NewsIngestionService {
  private static pollerTimer: ReturnType<typeof setTimeout> | null = null;
  private static isPolling = false;
  private static pollIntervalMs = 60 * 1000; // 60s default
  private static lastPollTimestamp = 0;

  /**
   * Parses an RSS XML string using high-speed native regex parsing (zero external dependencies).
   */
  public static parseRssItems(xmlText: string, source: NewsArticle["source"]): NewsArticle[] {
    const articles: NewsArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];

      // Extract title
      const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(itemContent);
      if (!titleMatch) continue;
      const headline = titleMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

      // Extract link
      const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(itemContent);
      const url = linkMatch ? linkMatch[1].trim() : undefined;

      // Extract description / summary
      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(itemContent);
      const summary = descMatch ? descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : undefined;

      // Extract pubDate
      const pubMatch = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(itemContent);
      let publishedAt = Date.now();
      if (pubMatch) {
        const parsed = Date.parse(pubMatch[1]);
        if (!isNaN(parsed)) publishedAt = parsed;
      }

      const tempArticle: NewsArticle = {
        id: "",
        headline,
        summary,
        url,
        source,
        publishedAt,
      };

      tempArticle.id = NewsDeduplicator.hashArticle(tempArticle);
      articles.push(tempArticle);
    }

    return articles;
  }

  /**
   * Fetches and processes a single feed URL.
   */
  public static async pollFeed(feed: FreeFeedConfig): Promise<number> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch(feed.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "LumenAI-TradingNewsEngine/1.0",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return 0;
      }

      const xml = await res.text();
      const items = this.parseRssItems(xml, feed.sourceType);
      let ingestedCount = 0;

      for (const item of items) {
        if (NewsDeduplicator.register(item)) {
          // Dual-Speed Cognitive Routing: Evaluate through AstraFin Cognitive Engine (System 1 reflex + System 2 MoE)
          const directives = NewsCatalystRegistry.processWithAstraFin(item.headline, item.source, Date.now());
          if (directives.length === 0) {
            // Fallback to LocalFinBERT for general market sentiment if no specific equity was targeted
            const analysis = LocalFinBERTEngine.analyze(item);
            NewsCatalystRegistry.ingest(analysis);
          }
          ingestedCount++;
        }
      }

      return ingestedCount;
    } catch {
      // Offline, rate-limited, or network error handled gracefully
      return 0;
    }
  }

  /**
   * Polls all configured free feeds once.
   */
  public static async pollAllFeeds(): Promise<number> {
    this.lastPollTimestamp = Date.now();
    let totalIngested = 0;

    for (const feed of FREE_NEWS_FEEDS) {
      const count = await this.pollFeed(feed);
      totalIngested += count;
    }

    return totalIngested;
  }

  /**
   * Starts background news ingestion poller.
   */
  public static start(intervalMs: number = 60 * 1000): void {
    if (this.isPolling) return;
    this.isPolling = true;
    this.pollIntervalMs = intervalMs;

    // Initial poll
    this.pollAllFeeds().catch(() => {});

    this.pollerTimer = setInterval(() => {
      this.pollAllFeeds().catch(() => {});
    }, this.pollIntervalMs);
  }

  /**
   * Stops background news ingestion poller.
   */
  public static stop(): void {
    if (this.pollerTimer) {
      clearInterval(this.pollerTimer);
      this.pollerTimer = null;
    }
    this.isPolling = false;
  }

  public static getStatus(): { isPolling: boolean; pollIntervalMs: number; lastPollTimestamp: number } {
    return {
      isPolling: this.isPolling,
      pollIntervalMs: this.pollIntervalMs,
      lastPollTimestamp: this.lastPollTimestamp,
    };
  }
}
