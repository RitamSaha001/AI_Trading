/**
 * Real-Time News & Financial Sentiment Engine Types
 * Specifically tuned for Indian Equity Markets (NSE/BSE NIFTY 100 Universe)
 */

export type FinancialEventCategory =
  | 'REGULATORY_SANCTION'   // SEBI order, CBI inquiry, audit resignation, forensic audit, fraud
  | 'EARNINGS_SURPRISE'     // QoQ / YoY profit surge, earnings beat, margin expansion
  | 'ORDER_WIN'             // Major contract award, defense tender, multi-crore order addition
  | 'FDA_ACTION'            // USFDA Form 483, Warning Letter, Import Alert, EIR approval
  | 'MANAGEMENT_CHANGE'     // CEO/MD resignation, promoter dispute, key executive exit
  | 'CREDIT_RATING'         // Rating downgrade / upgrade by CRISIL, ICRA, CARE
  | 'MERGER_ACQUISITION'    // Acquisition, stake sale, open offer, divestment
  | 'GENERAL_MARKET';       // Routine recap, broker target update, market commentary

export type SentimentPolarity = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface NewsArticle {
  id: string;                      // SHA-256 / MD5 digest of canonical headline + source
  headline: string;
  summary?: string;
  url?: string;
  source: 'BSE_ANNOUNCEMENTS' | 'NSE_ANNOUNCEMENTS' | 'GOOGLE_NEWS' | 'MONEYCONTROL' | 'ECONOMIC_TIMES' | 'MANUAL_TEST';
  publishedAt: number;             // Epoch ms
  rawText?: string;
}

export interface NewsSentimentAnalysis {
  articleId: string;
  headline: string;
  source: string;
  publishedAt: number;
  sentiment: SentimentPolarity;
  score: number;                   // -1.00 (Extreme Bearish) to +1.00 (Extreme Bullish)
  confidence: number;              // 0.00 to 1.00
  urgency: number;                 // 0 to 100 (>= 75 indicates high-priority breaking material event)
  category: FinancialEventCategory;
  matchedTickers: string[];        // Standardized NSE symbols e.g. ['ZYDUSLIFE', 'RELIANCE']
  isEmergencyVeto: boolean;        // Triggers immediate liquidation scratch if currently held
  isAlphaCatalyst: boolean;        // Eligible for ACI momentum boost if breakout confirms
  keyEntities: string[];           // Extracted entities e.g. ['SEBI', 'USFDA', 'Zydus Lifesciences']
  salienceReasoning: string;       // Concise explanation of classification
  processingLatencyMs: number;
}

export interface TickerSentimentStatus {
  symbol: string;
  activeVeto: boolean;
  vetoReason?: string;
  activeCatalyst: boolean;
  catalystReason?: string;
  compositeSentiment: number;      // Rolling weighted sentiment (-1.0 to +1.0)
  recentArticlesCount: number;
  lastArticleTimestamp: number;
  latestAnalysis?: NewsSentimentAnalysis;
}

export interface NewsFeedFilter {
  ticker?: string;
  category?: FinancialEventCategory;
  minUrgency?: number;
  sentiment?: SentimentPolarity;
  onlyActionable?: boolean;
}
