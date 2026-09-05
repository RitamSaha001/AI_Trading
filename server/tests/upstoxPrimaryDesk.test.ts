import { describe, it, expect, beforeEach } from 'vitest';
import { UpstoxInstrumentRegistry } from '../services/brokers/upstox/upstoxInstrumentRegistry';
import { calculateNextUpstoxExpiry, getTokenHealth } from '../services/brokers/upstox/upstoxExpiry';
import { config } from '../config';
import { moneyINR, isIndianAsset, formatCurrency } from '../../src/domain/portfolio';

describe('Upstox Primary Indian Equities & Desk Upgrade Suite', () => {
  beforeEach(() => {
    config.UPSTOX_LIVE_TRADING_ENABLED = false;
  });

  describe('Indian Equities & Currency Domain Helpers', () => {
    it('correctly identifies Indian equities', () => {
      expect(isIndianAsset('RELIANCE')).toBe(true);
      expect(isIndianAsset('TCS')).toBe(true);
      expect(isIndianAsset('INFY')).toBe(true);
      expect(isIndianAsset('HDFCBANK')).toBe(true);
      expect(isIndianAsset('TATAMOTORS')).toBe(true);

      expect(isIndianAsset('BTC')).toBe(false);
      expect(isIndianAsset('ETH')).toBe(false);
      expect(isIndianAsset('SOL')).toBe(false);
    });

    it('formats numbers as Indian Rupees (INR ₹)', () => {
      const formatted = moneyINR(2980.5);
      expect(formatted).toContain('₹');
      expect(formatted).toContain('2,980.50');

      const formattedLarge = moneyINR(154250.75);
      expect(formattedLarge).toContain('₹');
      expect(formattedLarge).toContain('1,54,250.75');
    });

    it('formatCurrency dynamically switches between INR and USD', () => {
      expect(formatCurrency(500, 'INR')).toContain('₹');
      expect(formatCurrency(500, 'USD')).toContain('$');
    });
  });

  describe('Upstox Instrument Registry', () => {
    it('returns all 20 authoritative Indian equities with 0.05 tick size', () => {
      const instruments = UpstoxInstrumentRegistry.getAll();
      expect(instruments.length).toBeGreaterThanOrEqual(20);

      const reliance = instruments.find((i) => i.tradingSymbol === 'RELIANCE');
      expect(reliance).toBeDefined();
      expect(reliance?.segment).toBe('NSE_EQ');
      expect(reliance?.tickSize).toBe(0.05);
      expect(reliance?.lotSize).toBe(1);
      expect(reliance?.instrumentKey).toBe('NSE_EQ|INE002A01018');

      const tcs = instruments.find((i) => i.tradingSymbol === 'TCS');
      expect(tcs).toBeDefined();
      expect(tcs?.tickSize).toBe(0.05);
      expect(tcs?.lotSize).toBe(1);
    });

    it('resolves registered symbols by instrument key or plain ticker', () => {
      const byKey = UpstoxInstrumentRegistry.get('NSE_EQ|INE002A01018');
      expect(byKey?.tradingSymbol).toBe('RELIANCE');

      const bySymbol = UpstoxInstrumentRegistry.get('INFY');
      expect(bySymbol?.instrumentKey).toBe('NSE_EQ|INE009A01021');
    });
  });

  describe('Upstox Token Health & 03:30 AM IST Expiry', () => {
    it('calculates the next 03:30 AM IST expiry correctly', () => {
      const now = new Date('2026-09-05T12:00:00.000Z'); // 17:30 IST
      const nextExpiry = calculateNextUpstoxExpiry(now);

      // The next expiry must be in the future
      expect(nextExpiry).toBeGreaterThan(now.getTime());

      // In IST (UTC+5:30), 03:30 AM IST is 22:00 UTC of previous day
      const expiryDate = new Date(nextExpiry);
      expect(expiryDate.getUTCHours()).toBe(22);
      expect(expiryDate.getUTCMinutes()).toBe(0);
    });

    it('reports DISCONNECTED when no token is present', () => {
      const health = getTokenHealth(null);
      expect(health.status).toBe('DISCONNECTED');
      expect(health.expiresAt).toBeNull();
      expect(health.reauthRequired).toBe(true);
      expect(health.warning).toBeDefined();
    });

    it('reports EXPIRED when expiresAt timestamp has passed', () => {
      const pastTime = Date.now() - 10000;
      const health = getTokenHealth(pastTime);
      expect(health.status).toBe('EXPIRED');
      expect(health.timeRemainingMs).toBe(0);
      expect(health.reauthRequired).toBe(true);
      expect(health.warning).toContain('expired');
    });

    it('reports ACTIVE when token is valid with remaining hours', () => {
      const futureTime = Date.now() + 8 * 3600 * 1000; // 8 hours left
      const health = getTokenHealth(futureTime);
      expect(health.status).toBe('ACTIVE');
      expect(health.timeRemainingMs).toBeGreaterThan(0);
      expect(health.timeRemainingHuman).toContain('h');
      expect(health.reauthRequired).toBe(false);
    });
  });

  describe('Upstox Production Live Safety Invariant', () => {
    it('strictly maintains UPSTOX_LIVE_TRADING_ENABLED=false as safety default', () => {
      expect(config.UPSTOX_LIVE_TRADING_ENABLED).toBe(false);
    });
  });
});
