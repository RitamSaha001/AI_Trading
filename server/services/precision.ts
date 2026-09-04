/**
 * Precision Math and Fixed-Precision Conversion Utilities
 * 
 * Provides deterministic integer arithmetic using BigInt to eliminate
 * JavaScript floating-point rounding errors in authoritative financial accounting.
 */

export const CASH_DECIMALS = 2;
export const CASH_FACTOR = 100n; // $1.00 = 100 cents

export const ASSET_DECIMALS = 8;
export const ASSET_FACTOR = 100_000_000n; // 1.00000000 = 100,000,000 satoshis

/**
 * Converts a number or decimal string to integer minor cash units (e.g. cents).
 * Example: 50.25 -> 5025n, "123.456" -> 12346n (rounded to nearest cent)
 */
export function toCashMinor(val: number | string | bigint): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number' && !Number.isFinite(val)) {
    throw new Error(`Cannot convert non-finite number ${val} to cash minor units`);
  }

  const str = typeof val === 'number' ? val.toFixed(4) : String(val).trim();
  const [wholeStr, fracStr = ''] = str.split('.');
  const whole = BigInt(wholeStr || '0');
  const fracPadded = (fracStr + '0000').slice(0, 4); // 4 decimal places for rounding
  const fracInt = BigInt(fracPadded);
  // Round to 2 decimals: if 3rd digit >= 5 (i.e. fracInt % 100 >= 50), round up
  const roundedCents = (fracInt + 50n) / 100n;
  return whole * CASH_FACTOR + roundedCents;
}

/**
 * Converts a number or decimal string to integer minor asset units (e.g. satoshis).
 * Example: 0.1 -> 10_000_000n, "1.00000001" -> 100_000_001n
 */
export function toAssetMinor(val: number | string | bigint): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number' && !Number.isFinite(val)) {
    throw new Error(`Cannot convert non-finite number ${val} to asset minor units`);
  }

  const str = typeof val === 'number' ? val.toFixed(10) : String(val).trim();
  const [wholeStr, fracStr = ''] = str.split('.');
  const whole = BigInt(wholeStr || '0');
  const fracPadded = (fracStr + '0000000000').slice(0, 10); // 10 decimal places for rounding
  const fracInt = BigInt(fracPadded);
  // Round to 8 decimals: if 9th digit >= 5 (i.e. fracInt % 100 >= 50), round up
  const roundedSatoshis = (fracInt + 50n) / 100n;
  return whole * ASSET_FACTOR + roundedSatoshis;
}

/**
 * Converts cash minor units (cents) to a standard JavaScript floating-point number.
 */
export function fromCashMinor(minor: bigint | number): number {
  return Number(minor) / Number(CASH_FACTOR);
}

/**
 * Converts asset minor units (satoshis) to a standard JavaScript floating-point number.
 */
export function fromAssetMinor(minor: bigint | number): number {
  return Number(minor) / Number(ASSET_FACTOR);
}

/**
 * Computes notional cash amount in minor units from asset quantity minor and price cash minor.
 * notionalCashMinor = (qtyAssetMinor * priceCashMinor) / ASSET_FACTOR
 */
export function computeNotionalMinor(qtyAssetMinor: bigint, priceCashMinor: bigint): bigint {
  return (qtyAssetMinor * priceCashMinor + (ASSET_FACTOR / 2n)) / ASSET_FACTOR;
}

/**
 * Computes the proportional cost basis of a sold quantity:
 * costBasisSoldMinor = (totalCostBasisMinor * soldQtyMinor) / totalQtyMinor
 */
export function computeSoldCostBasis(
  totalCostBasisMinor: bigint,
  soldQtyMinor: bigint,
  totalQtyMinor: bigint
): bigint {
  if (totalQtyMinor <= 0n) return 0n;
  return (totalCostBasisMinor * soldQtyMinor) / totalQtyMinor;
}
