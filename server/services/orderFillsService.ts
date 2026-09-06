import { DBClient, getDb } from '../db';
import { ExactDecimal } from './precision';
import crypto from 'node:crypto';

export interface RecordFillParams {
  fillDbId?: string;
  orderIdentifier: string; // May be exchange_orders.id or client_order_id
  exchangeTradeId: string;
  canonicalFillKey: string;
  symbol: string;
  price: ExactDecimal | string | number;
  qty: ExactDecimal | string | number;
  commission: ExactDecimal | string | number;
  commissionAsset: string;
  commissionStatus?: string;
  quoteQty?: ExactDecimal | string | number;
  executedAt?: number;
  broker?: string;
}

export interface RecordFillResult {
  inserted: boolean;
  fillId: string;
  orderId: string; // The canonical exchange_orders.id foreign key
  clientOrderId: string;
  orderRecord: any;
}

export class OrderFillsService {
  /**
   * Resolves the authoritative exchange_orders record by either internal id or client_order_id.
   */
  public static async resolveOrder(
    tx: DBClient,
    identifier: string
  ): Promise<any | null> {
    return tx.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE id = ? OR client_order_id = ? ORDER BY created_at DESC LIMIT 1`,
      [identifier, identifier]
    );
  }

  /**
   * Authoritatively records an exchange fill row, guaranteeing that order_id
   * always strictly references the exchange_orders.id primary key, while
   * retaining client_order_id for indexed lookups.
   */
  public static async recordFill(
    tx: DBClient,
    params: RecordFillParams
  ): Promise<RecordFillResult> {
    const order = await this.resolveOrder(tx, params.orderIdentifier);
    if (!order) {
      throw new Error(
        `[OrderFillsService] Foreign Key Invariant Error: Cannot record fill for order identifier '${params.orderIdentifier}'. No matching record found in exchange_orders.`
      );
    }

    const priceDec = ExactDecimal.from(params.price);
    const qtyDec = ExactDecimal.from(params.qty);
    const commissionDec = ExactDecimal.from(params.commission);
    const notionalDec = params.quoteQty
      ? ExactDecimal.from(params.quoteQty)
      : priceDec.mul(qtyDec);

    const fillDbId =
      params.fillDbId ||
      `fill_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const executedAt = params.executedAt || Date.now();
    const commissionStatus = params.commissionStatus || 'AUTHORITATIVE';
    const broker = params.broker || order.broker || 'upstox';

    const insertRes = await tx.execute(
      `INSERT INTO exchange_fills (
        id, order_id, client_order_id, exchange_trade_id, canonical_fill_key, symbol,
        price, price_exact, qty, qty_exact,
        commission, commission_exact, commission_asset, commission_status,
        quote_qty, quote_qty_exact, broker, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (canonical_fill_key) DO NOTHING`,
      [
        fillDbId,
        order.id, // STRICT INVARIANT: Always the foreign key referencing exchange_orders(id)
        order.client_order_id, // Retained for direct lookups
        params.exchangeTradeId,
        params.canonicalFillKey,
        params.symbol,
        priceDec.toNumber(),
        priceDec.toString(),
        qtyDec.toNumber(),
        qtyDec.toString(),
        commissionDec.toNumber(),
        commissionDec.toString(),
        params.commissionAsset,
        commissionStatus,
        notionalDec.toNumber(),
        notionalDec.toString(),
        broker,
        executedAt,
      ]
    );

    return {
      inserted: insertRes.changes > 0,
      fillId: fillDbId,
      orderId: order.id,
      clientOrderId: order.client_order_id,
      orderRecord: order,
    };
  }

  /**
   * Fetches all fills for an order, supporting query by either internal id or client_order_id.
   */
  public static async getFillsForOrder(
    orderIdentifier: string,
    db: DBClient = getDb()
  ): Promise<any[]> {
    return db.query<any>(
      `SELECT * FROM exchange_fills WHERE order_id = ? OR client_order_id = ? ORDER BY executed_at ASC`,
      [orderIdentifier, orderIdentifier]
    );
  }
}
