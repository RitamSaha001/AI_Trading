/**
 * Authoritative Broker / Product Compatibility Matrix for Upstox
 *
 * Enforces explicit product compatibility across cash equities and derivatives:
 * - Equities (NSE_EQ, BSE_EQ): Strictly CNC (Delivery) or MIS (Intraday). NRML is rejected.
 * - Derivatives (NSE_FO, BSE_FO): Strictly NRML (Carry forward) or MIS (Intraday). CNC is rejected.
 * Deterministically blocks invalid or ambiguous combinations before touching broker transport.
 */

import { StandardBrokerError } from '../brokerGateway';

export type UpstoxProductCode = 'CNC' | 'MIS' | 'NRML';
export type UpstoxWireProduct = 'D' | 'I' | 'M';

export interface ProductCompatibilityRule {
  segment: string;
  allowedProducts: UpstoxProductCode[];
  defaultProduct: UpstoxProductCode;
}

export class UpstoxProductMatrix {
  private static readonly RULES: Record<string, ProductCompatibilityRule> = {
    NSE_EQ: {
      segment: 'NSE_EQ',
      allowedProducts: ['CNC', 'MIS'],
      defaultProduct: 'CNC',
    },
    BSE_EQ: {
      segment: 'BSE_EQ',
      allowedProducts: ['CNC', 'MIS'],
      defaultProduct: 'CNC',
    },
    NSE_FO: {
      segment: 'NSE_FO',
      allowedProducts: ['NRML', 'MIS'],
      defaultProduct: 'NRML',
    },
    BSE_FO: {
      segment: 'BSE_FO',
      allowedProducts: ['NRML', 'MIS'],
      defaultProduct: 'NRML',
    },
  };

  /**
   * Normalizes client or wire product into canonical UpstoxProductCode.
   */
  public static normalizeProduct(rawProduct?: string): UpstoxProductCode | null {
    if (!rawProduct) return null;
    const upper = rawProduct.trim().toUpperCase();
    if (upper === 'CNC' || upper === 'D' || upper === 'DELIVERY') return 'CNC';
    if (upper === 'MIS' || upper === 'I' || upper === 'INTRADAY') return 'MIS';
    if (upper === 'NRML' || upper === 'M' || upper === 'NORMAL') return 'NRML';
    return null;
  }

  /**
   * Converts canonical product code to Upstox API wire format ('D' | 'I' | 'M').
   */
  public static toWireProduct(product: UpstoxProductCode): UpstoxWireProduct {
    switch (product) {
      case 'CNC':
        return 'D';
      case 'MIS':
        return 'I';
      case 'NRML':
        return 'M';
    }
  }

  /**
   * Validates product against instrument segment with deterministic rejection on mismatch.
   */
  public static validateProduct(
    segment: string,
    rawProduct: string | undefined,
    symbol: string
  ): { valid: boolean; product: UpstoxProductCode; wireProduct: UpstoxWireProduct; error?: string } {
    const cleanSegment = (segment || 'NSE_EQ').toUpperCase();
    const rule = this.RULES[cleanSegment] || this.RULES['NSE_EQ'];

    const normalized = this.normalizeProduct(rawProduct);

    if (!normalized) {
      throw new StandardBrokerError(
        'INVALID_PRODUCT',
        `Unrecognized product '${rawProduct}' for ${symbol}. Supported products: CNC (Delivery), MIS (Intraday), NRML (Derivatives carry-forward).`,
        'upstox'
      );
    }

    if (!rule.allowedProducts.includes(normalized)) {
      if (cleanSegment.endsWith('_EQ') && normalized === 'NRML') {
        throw new StandardBrokerError(
          'INVALID_PRODUCT_FOR_SEGMENT',
          `Equities (${cleanSegment}) do not support NRML product. Use CNC for delivery or MIS for intraday trading on ${symbol}.`,
          'upstox'
        );
      }

      if (cleanSegment.endsWith('_FO') && normalized === 'CNC') {
        throw new StandardBrokerError(
          'INVALID_PRODUCT_FOR_SEGMENT',
          `Derivatives (${cleanSegment}) do not support CNC delivery product. Use NRML for carry-forward or MIS for intraday trading on ${symbol}.`,
          'upstox'
        );
      }

      throw new StandardBrokerError(
        'INVALID_PRODUCT_FOR_SEGMENT',
        `Product ${normalized} is not permitted for segment ${cleanSegment}. Allowed products: ${rule.allowedProducts.join(', ')}.`,
        'upstox'
      );
    }

    return {
      valid: true,
      product: normalized,
      wireProduct: this.toWireProduct(normalized),
    };
  }
}
