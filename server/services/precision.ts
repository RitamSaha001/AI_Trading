/**
 * Exact Decimal Math and Deterministic Financial Precision Utilities
 * 
 * Provides an immutable, arbitrary-precision decimal engine backed by BigInt
 * to eliminate JavaScript floating-point rounding errors across the entire
 * authoritative execution, fill, and financial ledger pipeline.
 */

export type RoundingMode = 'half-up' | 'truncate';

export class ExactDecimal {
  readonly unscaled: bigint;
  readonly scale: number;

  constructor(unscaled: bigint, scale: number) {
    if (scale < 0 || !Number.isInteger(scale)) {
      throw new Error(`Invalid decimal scale: ${scale}`);
    }
    this.unscaled = unscaled;
    this.scale = scale;
  }

  /**
   * Parses an input value into an ExactDecimal without lossy floating-point conversion.
   */
  static from(val: string | number | bigint | ExactDecimal): ExactDecimal {
    if (val instanceof ExactDecimal) {
      return val;
    }
    if (typeof val === 'bigint') {
      return new ExactDecimal(val, 0);
    }
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        throw new Error(`Cannot create ExactDecimal from non-finite number: ${val}`);
      }
      return ExactDecimal.fromString(val.toString());
    }
    if (typeof val === 'string') {
      return ExactDecimal.fromString(val);
    }
    throw new Error(`Unsupported value type for ExactDecimal: ${typeof val}`);
  }

  private static fromString(raw: string): ExactDecimal {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error('Cannot parse empty string to ExactDecimal');
    }

    let sign = 1n;
    let s = trimmed;
    if (s.startsWith('-')) {
      sign = -1n;
      s = s.slice(1);
    } else if (s.startsWith('+')) {
      s = s.slice(1);
    }

    if (/e/i.test(s)) {
      const [coeff, expStr] = s.split(/e/i);
      const exp = parseInt(expStr, 10);
      const coeffDec = ExactDecimal.fromString(coeff);
      if (exp >= 0) {
        return coeffDec.mul(new ExactDecimal(10n ** BigInt(exp), 0));
      } else {
        return coeffDec.div(new ExactDecimal(10n ** BigInt(-exp), 0), coeffDec.scale + (-exp));
      }
    }

    const parts = s.split('.');
    if (parts.length > 2) {
      throw new Error(`Invalid decimal string with multiple decimal points: ${trimmed}`);
    }

    const wholeStr = parts[0] || '0';
    const fracStr = parts[1] || '';

    if (!/^\d*$/.test(wholeStr) || !/^\d*$/.test(fracStr)) {
      throw new Error(`Invalid decimal string: ${trimmed}`);
    }

    const combinedStr = (wholeStr || '0') + fracStr;
    const unscaled = BigInt(combinedStr) * sign;
    const scale = fracStr.length;

    return new ExactDecimal(unscaled, scale);
  }

  static fromMinor(minor: bigint | number, decimals: number): ExactDecimal {
    return new ExactDecimal(BigInt(minor), decimals);
  }

  static zero(scale = 0): ExactDecimal {
    return new ExactDecimal(0n, scale);
  }

  static one(scale = 0): ExactDecimal {
    return new ExactDecimal(10n ** BigInt(scale), scale);
  }

  private align(other: ExactDecimal): [bigint, bigint, number] {
    if (this.scale === other.scale) {
      return [this.unscaled, other.unscaled, this.scale];
    }
    if (this.scale < other.scale) {
      const diff = BigInt(other.scale - this.scale);
      return [this.unscaled * (10n ** diff), other.unscaled, other.scale];
    } else {
      const diff = BigInt(this.scale - other.scale);
      return [this.unscaled, other.unscaled * (10n ** diff), this.scale];
    }
  }

  add(other: ExactDecimal | string | number | bigint): ExactDecimal {
    const o = ExactDecimal.from(other);
    const [u1, u2, s] = this.align(o);
    return new ExactDecimal(u1 + u2, s);
  }

  plus(other: ExactDecimal | string | number | bigint): ExactDecimal {
    return this.add(other);
  }

  sub(other: ExactDecimal | string | number | bigint): ExactDecimal {
    const o = ExactDecimal.from(other);
    const [u1, u2, s] = this.align(o);
    return new ExactDecimal(u1 - u2, s);
  }

  mul(other: ExactDecimal | string | number | bigint): ExactDecimal {
    const o = ExactDecimal.from(other);
    return new ExactDecimal(this.unscaled * o.unscaled, this.scale + o.scale);
  }

  times(other: ExactDecimal | string | number | bigint): ExactDecimal {
    return this.mul(other);
  }

  div(
    other: ExactDecimal | string | number | bigint,
    targetScale = 8,
    rounding: RoundingMode = 'half-up'
  ): ExactDecimal {
    const o = ExactDecimal.from(other);
    if (o.unscaled === 0n) {
      throw new Error('ExactDecimal division by zero');
    }

    const shift = o.scale - this.scale + targetScale;
    let numerator: bigint;
    if (shift >= 0) {
      numerator = this.unscaled * (10n ** BigInt(shift));
    } else {
      numerator = this.unscaled / (10n ** BigInt(-shift));
    }

    if (rounding === 'half-up') {
      const quotient = (numerator * 10n) / o.unscaled;
      const rem = quotient % 10n;
      const absRem = rem < 0n ? -rem : rem;
      let base = quotient / 10n;
      if (absRem >= 5n) {
        if (quotient >= 0n) {
          base += 1n;
        } else {
          base -= 1n;
        }
      }
      return new ExactDecimal(base, targetScale);
    } else {
      const quotient = numerator / o.unscaled;
      return new ExactDecimal(quotient, targetScale);
    }
  }

  mod(other: ExactDecimal | string | number | bigint): ExactDecimal {
    const o = ExactDecimal.from(other);
    if (o.unscaled === 0n) {
      throw new Error('ExactDecimal modulo by zero');
    }
    const [u1, u2, s] = this.align(o);
    return new ExactDecimal(u1 % u2, s);
  }

  abs(): ExactDecimal {
    return new ExactDecimal(this.unscaled < 0n ? -this.unscaled : this.unscaled, this.scale);
  }

  neg(): ExactDecimal {
    return new ExactDecimal(-this.unscaled, this.scale);
  }

  cmp(other: ExactDecimal | string | number | bigint): -1 | 0 | 1 {
    const o = ExactDecimal.from(other);
    const [u1, u2] = this.align(o);
    if (u1 < u2) return -1;
    if (u1 > u2) return 1;
    return 0;
  }

  eq(other: ExactDecimal | string | number | bigint): boolean {
    return this.cmp(other) === 0;
  }

  lt(other: ExactDecimal | string | number | bigint): boolean {
    return this.cmp(other) < 0;
  }

  lte(other: ExactDecimal | string | number | bigint): boolean {
    return this.cmp(other) <= 0;
  }

  gt(other: ExactDecimal | string | number | bigint): boolean {
    return this.cmp(other) > 0;
  }

  gte(other: ExactDecimal | string | number | bigint): boolean {
    return this.cmp(other) >= 0;
  }

  isZero(): boolean {
    return this.unscaled === 0n;
  }

  isPositive(): boolean {
    return this.unscaled > 0n;
  }

  isNegative(): boolean {
    return this.unscaled < 0n;
  }

  toMinor(targetDecimals: number, rounding: RoundingMode = 'half-up'): bigint {
    if (this.scale === targetDecimals) {
      return this.unscaled;
    }
    if (this.scale < targetDecimals) {
      const diff = BigInt(targetDecimals - this.scale);
      return this.unscaled * (10n ** diff);
    }

    const shift = this.scale - targetDecimals;
    const div = 10n ** BigInt(shift);
    if (rounding === 'half-up') {
      const half = div / 2n;
      const sign = this.unscaled < 0n ? -1n : 1n;
      const absVal = this.unscaled < 0n ? -this.unscaled : this.unscaled;
      return sign * ((absVal + half) / div);
    } else {
      return this.unscaled / div;
    }
  }

  trim(): ExactDecimal {
    if (this.unscaled === 0n) {
      return new ExactDecimal(0n, 0);
    }
    let u = this.unscaled;
    let s = this.scale;
    while (s > 0 && u % 10n === 0n) {
      u /= 10n;
      s -= 1;
    }
    return new ExactDecimal(u, s);
  }

  toFixed(decimals: number, rounding: RoundingMode = 'half-up'): string {
    const minor = this.toMinor(decimals, rounding);
    const signStr = minor < 0n ? '-' : '';
    const absMinor = minor < 0n ? -minor : minor;
    const str = absMinor.toString();

    if (decimals === 0) {
      return signStr + str;
    }

    if (str.length <= decimals) {
      const padded = '0'.repeat(decimals - str.length) + str;
      return `${signStr}0.${padded}`;
    }

    const whole = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals);
    return `${signStr}${whole}.${frac}`;
  }

  toString(): string {
    const trimmed = this.trim();
    if (trimmed.scale === 0) {
      return trimmed.unscaled.toString();
    }

    const signStr = trimmed.unscaled < 0n ? '-' : '';
    const absVal = trimmed.unscaled < 0n ? -trimmed.unscaled : trimmed.unscaled;
    const s = absVal.toString();

    if (s.length <= trimmed.scale) {
      const padded = '0'.repeat(trimmed.scale - s.length) + s;
      return `${signStr}0.${padded}`;
    }

    const whole = s.slice(0, s.length - trimmed.scale);
    const frac = s.slice(s.length - trimmed.scale);
    return `${signStr}${whole}.${frac}`;
  }

  /**
   * Non-authoritative conversion for UI/display, logging, or metric aggregation.
   * MUST NEVER be used in authoritative trading, risk, balance, or accounting calculations.
   */
  toDisplayNumber(): number {
    return Number(this.toString());
  }

  /**
   * Explicit alias for toDisplayNumber indicating lossy floating-point representation.
   */
  toApproximateNumber(): number {
    return Number(this.toString());
  }

  /**
   * @deprecated Use toDisplayNumber() or toApproximateNumber() to make non-authoritative boundary explicit.
   */
  toNumber(): number {
    return Number(this.toString());
  }
}

// ============================================================================
// BACKWARD-COMPATIBLE CONVERSION HELPERS (HARDENED WITH EXACTDECIMAL)
// ============================================================================

export const CASH_DECIMALS = 2;
export const CASH_FACTOR = 100n; // $1.00 = 100 cents

export const ASSET_DECIMALS = 8;
export const ASSET_FACTOR = 100_000_000n; // 1.00000000 = 100,000,000 satoshis

/**
 * Returns the authoritative decimal precision for an asset or currency.
 */
export function getAssetDecimals(assetOrCurrency: string): number {
  const norm = assetOrCurrency.toUpperCase().trim();
  if (['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD'].includes(norm)) {
    return 2;
  }
  return 8;
}

/**
 * Converts a number or decimal string to integer minor cash units (e.g. cents).
 */
export function toCashMinor(val: number | string | bigint | ExactDecimal): bigint {
  return ExactDecimal.from(val).toMinor(CASH_DECIMALS);
}

/**
 * Converts a number or decimal string to integer minor asset units (e.g. satoshis).
 */
export function toAssetMinor(val: number | string | bigint | ExactDecimal): bigint {
  return ExactDecimal.from(val).toMinor(ASSET_DECIMALS);
}

/**
 * Converts cash minor units (cents) to authoritative ExactDecimal representation.
 */
export function fromCashMinor(minor: bigint | number): ExactDecimal {
  return ExactDecimal.fromMinor(minor, CASH_DECIMALS);
}

/**
 * Converts asset minor units (satoshis) to authoritative ExactDecimal representation.
 */
export function fromAssetMinor(minor: bigint | number): ExactDecimal {
  return ExactDecimal.fromMinor(minor, ASSET_DECIMALS);
}

/**
 * Non-authoritative helper: converts cash minor units to standard JavaScript number for display/logging only.
 */
export function fromCashMinorToDisplayNumber(minor: bigint | number): number {
  return ExactDecimal.fromMinor(minor, CASH_DECIMALS).toDisplayNumber();
}

/**
 * Non-authoritative helper: converts asset minor units to standard JavaScript number for display/logging only.
 */
export function fromAssetMinorToDisplayNumber(minor: bigint | number): number {
  return ExactDecimal.fromMinor(minor, ASSET_DECIMALS).toDisplayNumber();
}

/**
 * Computes notional cash amount in minor units from asset quantity minor and price cash minor.
 */
export function computeNotionalMinor(qtyAssetMinor: bigint, priceCashMinor: bigint): bigint {
  const qty = ExactDecimal.fromMinor(qtyAssetMinor, ASSET_DECIMALS);
  const price = ExactDecimal.fromMinor(priceCashMinor, CASH_DECIMALS);
  return qty.mul(price).toMinor(CASH_DECIMALS);
}

/**
 * Computes the proportional cost basis of a sold quantity:
 * costBasisSoldMinor = (totalCostBasisMinor * soldQtyMinor) / totalQtyMinor
 * 
 * Rounding & allocation policy:
 * - Truncates minor fractions towards zero for partial sales.
 * - When liquidating entire remaining lot (soldQtyMinor >= totalQtyMinor), the entire
 *   remaining cost basis is assigned to prevent fractional residual drift.
 */
export function computeSoldCostBasis(
  totalCostBasisMinor: bigint,
  soldQtyMinor: bigint,
  totalQtyMinor: bigint
): bigint {
  if (totalQtyMinor <= 0n || soldQtyMinor <= 0n) return 0n;
  if (soldQtyMinor >= totalQtyMinor) return totalCostBasisMinor;
  return (totalCostBasisMinor * soldQtyMinor) / totalQtyMinor;
}
