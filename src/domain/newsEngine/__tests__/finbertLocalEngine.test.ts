import { describe, it, expect, beforeEach } from "vitest";
import {
  LocalFinBERTEngine,
  extractEntitiesFromText,
  NewsDeduplicator,
  NewsArticle,
} from "../index";

describe("LocalFinBERTEngine Unit Suite", () => {
  beforeEach(() => {
    NewsDeduplicator.clear();
  });

  describe("NIFTY 100 Entity Disambiguation", () => {
    it("extracts exact symbols and aliases accurately", () => {
      const res1 = extractEntitiesFromText("Reliance Industries shares hit record high as Jio expands 5G");
      expect(res1.tickers).toContain("RELIANCE");

      const res2 = extractEntitiesFromText("SEBI summons promoters of Zydus Lifesciences over governance dispute");
      expect(res2.tickers).toContain("ZYDUSLIFE");

      const res3 = extractEntitiesFromText("BHEL wins commercial contract from NTPC for super thermal plant");
      expect(res3.tickers).toContain("BHEL");
      expect(res3.tickers).toContain("NTPC");

      const res4 = extractEntitiesFromText("L&T Construction awarded domestic transmission package");
      expect(res4.tickers).toContain("LT");

      const res5 = extractEntitiesFromText("State Bank of India reports strong festive loan growth");
      expect(res5.tickers).toContain("SBIN");

      const res6 = extractEntitiesFromText("Mahindra & Mahindra unveils new EV platform");
      expect(res6.tickers).toContain("M&M");
    });
  });

  describe("Regulatory Sanction & Fraud Event Detection (Emergency Veto)", () => {
    it("flags SEBI forensic audit / search as emergency veto", () => {
      const headline = "SEBI initiates forensic audit and search on promoters of Zydus Lifesciences";
      const res = LocalFinBERTEngine.evaluateHeadline(headline);

      expect(res.category).toBe("REGULATORY_SANCTION");
      expect(res.sentiment).toBe("NEGATIVE");
      expect(res.score).toBeLessThanOrEqual(-0.85);
      expect(res.urgency).toBeGreaterThanOrEqual(90);
      expect(res.isEmergencyVeto).toBe(true);
      expect(res.isAlphaCatalyst).toBe(false);
      expect(res.matchedTickers).toContain("ZYDUSLIFE");
    });

    it("flags USFDA Warning Letter as critical pharma veto", () => {
      const headline = "USFDA issues Warning Letter with data integrity observations for Sun Pharma plant";
      const res = LocalFinBERTEngine.evaluateHeadline(headline);

      expect(res.category).toBe("FDA_ACTION");
      expect(res.sentiment).toBe("NEGATIVE");
      expect(res.score).toBeLessThanOrEqual(-0.80);
      expect(res.urgency).toBeGreaterThanOrEqual(85);
      expect(res.isEmergencyVeto).toBe(true);
      expect(res.matchedTickers).toContain("SUNPHARMA");
    });

    it("flags statutory auditor resignation red flag", () => {
      const headline = "Statutory auditor of company resigns immediately citing refusal of management to share records";
      const res = LocalFinBERTEngine.evaluateHeadline(headline);

      expect(res.category).toBe("MANAGEMENT_CHANGE");
      expect(res.sentiment).toBe("NEGATIVE");
      expect(res.isEmergencyVeto).toBe(true);
      expect(res.urgency).toBeGreaterThanOrEqual(85);
    });

    it("flags debt default and NCLT insolvency proceedings", () => {
      const headline = "Company faces NCLT insolvency petition after debt default on foreign currency bonds";
      const res = LocalFinBERTEngine.evaluateHeadline(headline);

      expect(res.category).toBe("CREDIT_RATING");
      expect(res.sentiment).toBe("NEGATIVE");
      expect(res.score).toBeLessThanOrEqual(-0.90);
      expect(res.isEmergencyVeto).toBe(true);
    });
  });

  describe("Commercial Order Wins & Earnings Beats (Alpha Catalyst)", () => {
    it("identifies mega commercial order wins as alpha catalyst", () => {
      const headline = "BHEL bags mega commercial order worth Rs 4,500 cr from power utility";
      const res = LocalFinBERTEngine.evaluateHeadline(headline);

      expect(res.category).toBe("ORDER_WIN");
      expect(res.sentiment).toBe("POSITIVE");
      expect(res.score).toBeGreaterThanOrEqual(0.80);
      expect(res.urgency).toBeGreaterThanOrEqual(80);
      expect(res.isAlphaCatalyst).toBe(true);
      expect(res.isEmergencyVeto).toBe(false);
      expect(res.matchedTickers).toContain("BHEL");
    });

    it("identifies USFDA EIR inspection clearances as catalyst", () => {
      const headline = "Dr. Reddy clears USFDA inspection with Establishment Inspection Report (EIR)";
      const res = LocalFinBERTEngine.evaluateHeadline(headline);

      expect(res.category).toBe("FDA_ACTION");
      expect(res.sentiment).toBe("POSITIVE");
      expect(res.isAlphaCatalyst).toBe(true);
      expect(res.matchedTickers).toContain("DRREDDY");
    });

    it("identifies blowout quarterly profit surges", () => {
      const headline = "Infosys reports net profit surge of 28% YoY beating analyst consensus";
      const res = LocalFinBERTEngine.evaluateHeadline(headline);

      expect(res.category).toBe("EARNINGS_SURPRISE");
      expect(res.sentiment).toBe("POSITIVE");
      expect(res.isAlphaCatalyst).toBe(true);
      expect(res.matchedTickers).toContain("INFY");
    });
  });

  describe("Deduplication Engine", () => {
    it("hashes and detects duplicated syndicated news stories", () => {
      const article1: NewsArticle = {
        id: "1",
        headline: "Reliance Retail expands regional supply chain logistics with new distribution centers",
        source: "GOOGLE_NEWS",
        publishedAt: Date.now(),
      };

      const article2: NewsArticle = {
        id: "2",
        headline: "Reliance Retail expands regional supply chain logistics with new distribution centers",
        source: "ECONOMIC_TIMES",
        publishedAt: Date.now() + 1000,
      };

      expect(NewsDeduplicator.register(article1)).toBe(true);
      expect(NewsDeduplicator.isDuplicate(article2)).toBe(true);
      expect(NewsDeduplicator.register(article2)).toBe(false);
    });
  });

  describe("Sub-Millisecond Processing Performance", () => {
    it("processes a headline in under 1 millisecond", () => {
      const start = performance.now();
      const count = 100;
      for (let i = 0; i < count; i++) {
        LocalFinBERTEngine.evaluateHeadline("SEBI orders probe into market manipulation at leading brokerage");
      }
      const durationMs = performance.now() - start;
      const perOpMs = durationMs / count;
      expect(perOpMs).toBeLessThan(1.5);
    });
  });
});
