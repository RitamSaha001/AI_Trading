import { describe, it, expect } from 'vitest';
import { UpstoxInstrumentProvider } from '../services/brokers/upstox/upstoxInstrumentProvider';
import { UpstoxInstrumentRegistry } from '../services/brokers/upstox/upstoxInstrumentRegistry';

describe('Authoritative Upstox Instrument Registry & Circuit Limits', () => {
  const provider = new UpstoxInstrumentProvider();

  it('resolves verified Nifty 50 instruments with authoritative ISIN and freeze limits', () => {
    const reliance = provider.getInstrument('RELIANCE');
    expect(reliance).not.toBeNull();
    expect(reliance!.tradingSymbol).toBe('RELIANCE');
    expect(reliance!.instrumentKey).toBe('NSE_EQ|INE002A01018');
    expect(reliance!.exchange).toBe('NSE');
    expect(reliance!.segment).toBe('NSE_EQ');
    expect(reliance!.tickSize).toBe('0.05');
    expect(reliance!.lotSize).toBe(1);

    const tcs = provider.getInstrument('NSE:TCS');
    expect(tcs).not.toBeNull();
    expect(tcs!.tradingSymbol).toBe('TCS');
    expect(tcs!.instrumentKey).toBe('NSE_EQ|INE467B01029');

    const infy = provider.getInstrument('NSE_EQ|INE009A01021');
    expect(infy).not.toBeNull();
    expect(infy!.tradingSymbol).toBe('INFY');
  });

  it('rejects unverified synthetic symbols (Finding 1)', () => {
    // Unverified symbols must return null and be rejected
    const unknown = provider.getInstrument('XYZUNKNOWN');
    expect(unknown).toBeNull();

    const orderRes = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'XYZUNKNOWN',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 100.0,
      idempotencyKey: 'idemp_unknown',
    });

    expect(orderRes.isValid).toBe(false);
    expect(orderRes.error).toContain('Unsupported Upstox instrument: XYZUNKNOWN');
  });

  it('validates ₹0.05 tick size steps for limit orders', () => {
    // Valid tick: 2900.05
    const valid = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2900.05,
      idempotencyKey: 'idemp_tick_valid',
    });
    expect(valid.isValid).toBe(true);

    // Invalid tick: 2900.03
    const invalid = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2900.03,
      idempotencyKey: 'idemp_tick_invalid',
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.error).toContain('not a valid tick step');
  });

  it('enforces exchange lower and upper circuit limits (Finding 8)', () => {
    // RELIANCE has lowerCircuit: 2000.0, upperCircuit: 3500.0
    // Price within band: 2800.0
    const normal = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 2800.0,
      idempotencyKey: 'idemp_circuit_normal',
    });
    expect(normal.isValid).toBe(true);

    // Below lower circuit: 1800.0 (< 2000.0)
    const belowLower = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 1800.0,
      idempotencyKey: 'idemp_circuit_low',
    });
    expect(belowLower.isValid).toBe(false);
    expect(belowLower.error).toContain('breaches exchange lower circuit limit');

    // Above upper circuit: 3800.0 (> 3500.0)
    const aboveUpper = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'RELIANCE',
      side: 'SELL',
      type: 'LIMIT',
      quantity: 5,
      price: 3800.0,
      idempotencyKey: 'idemp_circuit_high',
    });
    expect(aboveUpper.isValid).toBe(false);
    expect(aboveUpper.error).toContain('breaches exchange upper circuit limit');
  });

  it('enforces exchange freeze limits unless auto-slicing is enabled', () => {
    // RELIANCE freeze limit is 10,000 shares
    // 15,000 shares without slice=true must be rejected
    const unsliced = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 15000,
      price: 2900.0,
      slice: false,
      idempotencyKey: 'idemp_freeze_unsliced',
    });
    expect(unsliced.isValid).toBe(false);
    expect(unsliced.error).toContain('exceeds exchange freeze limit of 10000');

    // 15,000 shares with slice=true is permitted
    const sliced = provider.validateOrder({
      userId: 'usr_test',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 15000,
      price: 2900.0,
      slice: true,
      idempotencyKey: 'idemp_freeze_sliced',
    });
    expect(sliced.isValid).toBe(true);
  });
});
