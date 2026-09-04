import { describe, it, expect } from 'vitest';
import {
  calculateDexQuote,
  validateSwapPrerequisites,
  executeDexSwap,
  encodeExactInputSingle,
  encodeERC20Approve,
} from './dexRouter';

describe('DEX Execution Router', () => {
  const mockPrices = {
    USDT: 1.0,
    USDC: 1.0,
    POL: 0.40,
    ETH: 3200,
    BTC: 65000,
    SOL: 150,
  };

  describe('calculateDexQuote', () => {
    it('calculates accurate swap quote from USDT to POL on Polygon', () => {
      const quote = calculateDexQuote({
        fromAsset: 'USDT',
        toAsset: 'POL',
        amountIn: 100, // $100
        network: 'polygon',
        marketPrices: mockPrices,
        slippageTolerancePct: 0.005, // 0.5%
      });

      expect(quote.fromAsset).toBe('USDT');
      expect(quote.toAsset).toBe('POL');
      expect(quote.amountIn).toBe(100);
      expect(quote.expectedAmountOut).toBeGreaterThan(240); // 100 / 0.40 = ~250 minus fee
      expect(quote.expectedAmountOut).toBeLessThan(250);
      expect(quote.minimumAmountOut).toBeLessThan(quote.expectedAmountOut);
      expect(quote.poolFeePct).toBe(0.001); // 0.10%
      expect(quote.poolFeeUsd).toBeCloseTo(0.10, 2);
      expect(quote.network).toBe('polygon');
      expect(quote.routerAddress).toBeDefined();
    });

    it('calculates multi-hop route when neither asset is a stablecoin', () => {
      const quote = calculateDexQuote({
        fromAsset: 'SOL',
        toAsset: 'ETH',
        amountIn: 2, // 2 SOL = $300
        network: 'arbitrum',
        marketPrices: mockPrices,
      });

      expect(quote.route).toEqual(['SOL', 'USDC', 'ETH']);
      expect(quote.expectedAmountOut).toBeGreaterThan(0.09); // $300 / 3200 = ~0.09375 ETH
    });

    it('throws when price is missing', () => {
      expect(() =>
        calculateDexQuote({
          fromAsset: 'UNKNOWN_COIN',
          toAsset: 'POL',
          amountIn: 100,
          network: 'polygon',
          marketPrices: mockPrices,
        })
      ).toThrow(/Market price unavailable/i);
    });
  });

  describe('validateSwapPrerequisites', () => {
    it('passes validation when user has sufficient balance and gas', () => {
      const quote = calculateDexQuote({
        fromAsset: 'USDT',
        toAsset: 'POL',
        amountIn: 50,
        network: 'polygon',
        marketPrices: mockPrices,
      });

      const res = validateSwapPrerequisites({
        quote,
        availableFromBalance: 100, // have $100 USDT
        availableNativeGasBalance: 2.5, // have 2.5 POL
      });

      expect(res.valid).toBe(true);
      expect(res.errors.length).toBe(0);
    });

    it('rejects when input token balance is insufficient', () => {
      const quote = calculateDexQuote({
        fromAsset: 'USDT',
        toAsset: 'POL',
        amountIn: 500,
        network: 'polygon',
        marketPrices: mockPrices,
      });

      const res = validateSwapPrerequisites({
        quote,
        availableFromBalance: 50, // only have 50 USDT
        availableNativeGasBalance: 5.0,
      });

      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Insufficient USDT balance');
    });

    it('rejects when native gas reserve is inadequate', () => {
      const quote = calculateDexQuote({
        fromAsset: 'USDT',
        toAsset: 'POL',
        amountIn: 50,
        network: 'polygon',
        marketPrices: mockPrices,
      });

      const res = validateSwapPrerequisites({
        quote,
        availableFromBalance: 100,
        availableNativeGasBalance: 0.000001, // near zero POL for gas
      });

      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Insufficient POL for gas fees');
    });
  });

  describe('executeDexSwap', () => {
    it('executes simulated swap and generates verified PolygonScan link', async () => {
      const quote = calculateDexQuote({
        fromAsset: 'USDT',
        toAsset: 'POL',
        amountIn: 100,
        network: 'polygon',
        marketPrices: mockPrices,
      });

      const receipt = await executeDexSwap({
        quote,
        walletAddress: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      });

      expect(receipt.receiptId.startsWith('DEX-')).toBe(true);
      expect(receipt.txHash.startsWith('0x')).toBe(true);
      expect(receipt.txHash.length).toBe(66);
      expect(receipt.blockNumber).toBeGreaterThan(60_000_000);
      expect(receipt.explorerUrl).toContain('polygonscan.com/tx/0x');
      expect(receipt.amountIn).toBe(100);
      expect(receipt.amountOut).toBeGreaterThan(240);
    });
  });

  describe('Uniswap V3 Calldata Encoders', () => {
    it('encodes exactInputSingle with correct selector and 7 32-byte words', () => {
      const calldata = encodeExactInputSingle({
        tokenIn: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        tokenOut: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        fee: 3000,
        recipient: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
        amountIn: 100000000n,
        amountOutMinimum: 240000000000000000000n,
        sqrtPriceLimitX96: 0n,
      });

      expect(calldata.startsWith('0x04e45aaf')).toBe(true);
      // '0x' + 8 hex selector chars + 7 * 64 hex chars = 2 + 8 + 448 = 458
      expect(calldata.length).toBe(458);
      // Verify tokenIn is encoded in first 32 bytes
      expect(calldata.slice(10, 74).toLowerCase()).toBe('0000000000000000000000003c499c542cef5e3811e1192ce70d8cc03d5c3359');
    });

    it('encodes ERC-20 approve with correct selector and 2 32-byte words', () => {
      const calldata = encodeERC20Approve('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', 1000000n);
      expect(calldata.startsWith('0x095ea7b3')).toBe(true);
      // '0x' + 8 hex selector + 2 * 64 hex chars = 2 + 8 + 128 = 138
      expect(calldata.length).toBe(138);
    });
  });
});
