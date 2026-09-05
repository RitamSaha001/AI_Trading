import { describe, it, expect, beforeEach, vi } from "vitest";
import { SymbolRulesService, AuthoritativeExchangeRulesUnavailableError } from "../services/symbolRules";
import { ExactDecimal } from "../services/precision";

describe("Authoritative Dynamic Binance Symbol & Risk Rules Suite", () => {
  beforeEach(() => {
    SymbolRulesService.clearCache();
  });

  describe("1. Raw exchangeInfo Parsing", () => {
    it("correctly parses PRICE_FILTER, LOT_SIZE, MARKET_LOT_SIZE, NOTIONAL and precision", () => {
      const mockRawSymbolInfo = {
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        quotePrecision: 2,
        baseAssetPrecision: 8,
        filters: [
          {
            filterType: "PRICE_FILTER",
            minPrice: "0.01",
            maxPrice: "1000000.00",
            tickSize: "0.01",
          },
          {
            filterType: "LOT_SIZE",
            minQty: "0.00001",
            maxQty: "9000.00",
            stepSize: "0.00001",
          },
          {
            filterType: "MARKET_LOT_SIZE",
            minQty: "0.00002",
            maxQty: "500.00",
            stepSize: "0.00002",
          },
          {
            filterType: "NOTIONAL",
            minNotional: "5.00",
            maxNotional: "2000000.00",
            applyMinToMarket: true,
            applyMaxToMarket: true,
          },
          {
            filterType: "MAX_NUM_ORDERS",
            maxNumOrders: 200,
          },
        ],
      };

      const rule = SymbolRulesService.parseSymbolInfo(mockRawSymbolInfo);
      expect(rule.symbol).toBe("BTCUSDT");
      expect(rule.baseAsset).toBe("BTC");
      expect(rule.quoteAsset).toBe("USDT");
      expect(rule.tickSize.toFixed(2)).toBe("0.01");
      expect(rule.stepSize.toString()).toBe("0.00001");
      expect(rule.minQty.toString()).toBe("0.00001");
      expect(rule.maxQty.toFixed(2)).toBe("9000.00");
      expect(rule.marketMinQty?.toString()).toBe("0.00002");
      expect(rule.marketMaxQty?.toFixed(2)).toBe("500.00");
      expect(rule.marketStepSize?.toString()).toBe("0.00002");
      expect(rule.minNotional.toFixed(2)).toBe("5.00");
      expect(rule.maxNotional?.toFixed(2)).toBe("2000000.00");
      expect(rule.maxNumOrders).toBe(200);
      expect(rule.pricePrecision).toBe(2);
      expect(rule.quantityPrecision).toBe(5);
    });

    it("correctly handles legacy MIN_NOTIONAL filter", () => {
      const mockRawSymbolInfo = {
        symbol: "ETHUSDT",
        baseAsset: "ETH",
        quoteAsset: "USDT",
        filters: [
          { filterType: "PRICE_FILTER", tickSize: "0.01" },
          { filterType: "LOT_SIZE", stepSize: "0.0001", minQty: "0.0001", maxQty: "10000.00" },
          { filterType: "MIN_NOTIONAL", minNotional: "10.00", applyToMarket: true },
        ],
      };

      const rule = SymbolRulesService.parseSymbolInfo(mockRawSymbolInfo);
      expect(rule.minNotional.toFixed(2)).toBe("10.00");
      expect(rule.applyMinToMarket).toBe(true);
    });
  });

  describe("2. Dynamic Refresh & Cache TTL Policy", () => {
    it("refreshes rules from exchangeInfo API and caches them", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          symbols: [
            {
              symbol: "SOLUSDT",
              status: "TRADING",
              baseAsset: "SOL",
              quoteAsset: "USDT",
              filters: [
                { filterType: "PRICE_FILTER", tickSize: "0.01", minPrice: "0.01", maxPrice: "10000.00" },
                { filterType: "LOT_SIZE", stepSize: "0.01", minQty: "0.01", maxQty: "50000.00" },
                { filterType: "NOTIONAL", minNotional: "5.00" },
              ],
            },
          ],
        }),
      });

      const count = await SymbolRulesService.refreshRules({
        environment: "mainnet",
        symbols: ["SOLUSDT"],
        fetchFn: mockFetch as any,
      });

      expect(count).toBe(1);
      expect(SymbolRulesService.isFresh()).toBe(true);
      expect(SymbolRulesService.isStale()).toBe(false);

      const rule = await SymbolRulesService.getAuthoritativeRule("SOLUSDT", "live", { fetchFn: mockFetch as any });
      expect(rule.symbol).toBe("SOLUSDT");
      expect(rule.stepSize.toString()).toBe("0.01");
      // Cache hit: mockFetch should NOT be called again
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("fails closed with AuthoritativeExchangeRulesUnavailableError when live fetch fails and cache is empty", async () => {
      const failingFetch = vi.fn().mockRejectedValue(new Error("Network connection reset"));

      await expect(
        SymbolRulesService.getAuthoritativeRule("UNKNOWNUSDT", "live", { fetchFn: failingFetch as any })
      ).rejects.toThrow(AuthoritativeExchangeRulesUnavailableError);
    });

    it("fails closed when cached rules exceed maximum staleness threshold of 2 hours", async () => {
      const staleTimestamp = Date.now() - (2 * 60 * 60 * 1000 + 1000); // 2 hours and 1 second ago
      SymbolRulesService.registerRule({
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        tickSize: ExactDecimal.from("0.01"),
        stepSize: ExactDecimal.from("0.00001"),
        minQty: ExactDecimal.from("0.00001"),
        maxQty: ExactDecimal.from("9000.00"),
        minNotional: ExactDecimal.from("5.00"),
        pricePrecision: 2,
        quantityPrecision: 5,
        lastUpdated: staleTimestamp,
      });

      const failingFetch = vi.fn().mockRejectedValue(new Error("Binance API down"));

      await expect(
        SymbolRulesService.getAuthoritativeRule("BTCUSDT", "live", {
          allowStaleIfUnreachable: true,
          fetchFn: failingFetch as any,
        })
      ).rejects.toThrow(AuthoritativeExchangeRulesUnavailableError);
    });

    it("allows stale rules within maximum staleness window if unreachable and policy allows", async () => {
      const slightlyStaleTimestamp = Date.now() - (70 * 60 * 1000); // 70 minutes ago (> 1h TTL, < 2h staleness)
      SymbolRulesService.registerRule({
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        tickSize: ExactDecimal.from("0.01"),
        stepSize: ExactDecimal.from("0.00001"),
        minQty: ExactDecimal.from("0.00001"),
        maxQty: ExactDecimal.from("9000.00"),
        minNotional: ExactDecimal.from("5.00"),
        pricePrecision: 2,
        quantityPrecision: 5,
        lastUpdated: slightlyStaleTimestamp,
      });

      const failingFetch = vi.fn().mockRejectedValue(new Error("Temporary network timeout"));

      const rule = await SymbolRulesService.getAuthoritativeRule("BTCUSDT", "live", {
        allowStaleIfUnreachable: true,
        fetchFn: failingFetch as any,
      });

      expect(rule.symbol).toBe("BTCUSDT");
    });
  });

  describe("3. Exact Decimal Normalization & Anti-Fabrication Guarantees", () => {
    beforeEach(() => {
      SymbolRulesService.registerRule({
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        tickSize: ExactDecimal.from("0.01"),
        stepSize: ExactDecimal.from("0.00001"),
        minQty: ExactDecimal.from("0.00001"),
        maxQty: ExactDecimal.from("9000.00"),
        minPrice: ExactDecimal.from("0.01"),
        maxPrice: ExactDecimal.from("1000000.00"),
        marketMinQty: ExactDecimal.from("0.00002"),
        marketMaxQty: ExactDecimal.from("500.00"),
        marketStepSize: ExactDecimal.from("0.00002"),
        minNotional: ExactDecimal.from("5.00"),
        maxNotional: ExactDecimal.from("2000000.00"),
        pricePrecision: 2,
        quantityPrecision: 5,
        lastUpdated: Date.now(),
      });
    });

    it("validates and normalizes valid limit order with exact strings", () => {
      const res = SymbolRulesService.validateAndNormalize({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: "0.12345",
        price: "65432.10",
      });

      expect(res.quantityStr).toBe("0.12345");
      expect(res.priceStr).toBe("65432.10");
      expect(res.notional.toString()).toBe("8077.592745");
    });

    it("rejects limit orders violating tickSize increments", () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: "0.1",
          price: "65432.105", // 3 decimals, tick size is 0.01
        });
      }).toThrow(/does not conform to exchange tick size/);
    });

    it("rejects limit orders violating stepSize increments", () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: "0.123456", // 6 decimals, step size is 0.00001 (5 decimals)
          price: "65000.00",
        });
      }).toThrow(/does not conform to exchange step size/);
    });

    it("rejects orders below minimum notional value", () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: "0.00005",
          price: "50000.00", // 0.00005 * 50000 = 2.50 USDT < 5.00 minNotional
        });
      }).toThrow(/is below minimum notional of 5.00 USDT/);
    });

    it("validates quote-quantity market order (quoteOrderQty) without quantity", () => {
      const res = SymbolRulesService.validateAndNormalize({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quoteOrderQty: "100.00",
      });

      expect(res.isMarketOrder).toBe(true);
      expect(res.notionalStr).toBe("100.00");
      expect(res.quantity.isZero()).toBe(true);
    });

    it("rejects quote-quantity market order below minimum notional", () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "MARKET",
          quoteOrderQty: "4.50", // < 5.00 USDT
        });
      }).toThrow(/is below minimum notional of 5.00 USDT/);
    });

    it("strictly rejects market buy order without estimated price or quoteOrderQty (NEVER invents 50000.00)", () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "MARKET",
          quantity: "0.00005",
        });
      }).toThrow(/Estimated market quote price is required for quantity-based MARKET BUY order reservation. Never using arbitrary fallback price./);
    });

    it("applies MARKET_LOT_SIZE filters specifically to market orders", () => {
      // marketMinQty is 0.00002, lotSize minQty is 0.00001
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "BTCUSDT",
          side: "SELL",
          type: "MARKET",
          quantity: "0.00001",
          price: "60000.00",
        });
      }).toThrow(/is below minimum quantity of 0.00002/);

      // marketStepSize is 0.00002
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "BTCUSDT",
          side: "SELL",
          type: "MARKET",
          quantity: "0.00003",
          price: "60000.00",
        });
      }).toThrow(/does not conform to exchange step size 0.00002/);
    });
  });

  describe("4. Exact Decimal Serialization & Precision Preservation", () => {
    it("serializes exact values without scientific notation even for sub-satoshi and high decimal scales", () => {
      const oneSatoshi = ExactDecimal.from("0.00000001");
      expect(oneSatoshi.toString()).toBe("0.00000001");
      expect(oneSatoshi.toString()).not.toContain("e");

      const tenSatoshis = ExactDecimal.from("0.00000010");
      expect(tenSatoshis.toFixed(8)).toBe("0.00000010");

      const largeDecimal = ExactDecimal.from("99999999.12345678");
      expect(largeDecimal.toString()).toBe("99999999.12345678");
    });

    it("handles values exceeding Number.MAX_SAFE_INTEGER without digit loss", () => {
      // 9007199254740991 is Number.MAX_SAFE_INTEGER
      const hugeValueStr = "9007199254740995.12345678";
      const hugeDec = ExactDecimal.from(hugeValueStr);
      expect(hugeDec.toString()).toBe(hugeValueStr);

      const addOne = hugeDec.add(ExactDecimal.from("1.00000000"));
      expect(addOne.toString()).toBe("9007199254740996.12345678");
    });
  });

  describe("5. Dynamic Rule Evolution & Live Update", () => {
    it("dynamically reflects rule updates when Binance updates filters", async () => {
      // Initial state: tickSize 0.01
      SymbolRulesService.registerRule({
        symbol: "ADAUSDT",
        baseAsset: "ADA",
        quoteAsset: "USDT",
        tickSize: ExactDecimal.from("0.01"),
        stepSize: ExactDecimal.from("1.0"),
        minQty: ExactDecimal.from("1.0"),
        maxQty: ExactDecimal.from("100000.0"),
        minNotional: ExactDecimal.from("5.00"),
        pricePrecision: 2,
        quantityPrecision: 1,
        lastUpdated: Date.now(),
      });

      // Price with 3 decimals rejected
      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: "ADAUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: "10.0",
          price: "0.555",
        });
      }).toThrow(/does not conform to exchange tick size/);

      // Binance updates tickSize to 0.001
      const updateMockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          symbols: [
            {
              symbol: "ADAUSDT",
              status: "TRADING",
              baseAsset: "ADA",
              quoteAsset: "USDT",
              filters: [
                { filterType: "PRICE_FILTER", tickSize: "0.001", minPrice: "0.001", maxPrice: "100.000" },
                { filterType: "LOT_SIZE", stepSize: "1.0", minQty: "1.0", maxQty: "100000.0" },
                { filterType: "NOTIONAL", minNotional: "5.00" },
              ],
            },
          ],
        }),
      });

      await SymbolRulesService.refreshRules({
        environment: "mainnet",
        symbols: ["ADAUSDT"],
        fetchFn: updateMockFetch as any,
      });

      // Now price with 3 decimals is accepted
      const normalized = SymbolRulesService.validateAndNormalize({
        symbol: "ADAUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: "10.0",
        price: "0.555",
      });

      expect(normalized.priceStr).toBe("0.555");
      expect(normalized.notionalStr).toBe("5.550");
    });
  });
});
