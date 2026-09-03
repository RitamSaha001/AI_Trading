import { ASSETS, AppState, Asset, Market, Order, Side, OrderType } from '../types';
import {
  FEE_RATE,
  money,
  formatQty,
  META,
  getReservedCash,
  getAvailableCash,
  getReservedPosition,
  getAvailablePosition,
} from './portfolio';

export interface ExecutionQuote {
  quotePrice: number;
  estimatedPrice: number;
  slippagePct: number;
  fee: number;
  notional: number;
  totalCashRequired: number; // for buy
  netProceeds: number; // for sell
}

/**
 * Calculates modeled realistic slippage and execution pricing based on notional size.
 */
export function calculateExecutionQuote(
  marketPrice: number,
  side: Side,
  qty: number
): ExecutionQuote {
  const rawNotional = marketPrice * qty;
  // Dynamic liquidity impact model (min 2 bps, scales with notional size, max 120 bps)
  const slippage = Math.min(0.0002 + (rawNotional / 1_000_000) * 0.001, 0.012);
  const estimatedPrice = side === 'buy' ? marketPrice * (1 + slippage) : marketPrice * (1 - slippage);
  const notional = estimatedPrice * qty;
  const fee = notional * FEE_RATE;

  return {
    quotePrice: marketPrice,
    estimatedPrice,
    slippagePct: slippage * 100,
    fee,
    notional,
    totalCashRequired: notional + fee,
    netProceeds: Math.max(0, notional - fee),
  };
}

export interface ExecuteOrderOptions {
  type?: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  auto?: boolean;
  strategyName?: string;
  takeProfit?: number;
  stopLoss?: number;
  positionLotId?: string;
  bracketId?: string;
}

export interface ExecuteOrderResult {
  ok: boolean;
  error?: string;
  order?: Order;
}

export interface CheckPendingOrdersResult {
  changed: boolean;
  filledOrders: Order[];
  rejectedOrders: Order[];
  triggeredBrackets: { order: Order; reason: string; closeOrder?: Order }[];
  triggeredAlerts: string[];
}

/**
 * Executes or queues orders with strict accounting, reservation tracking, and lifecycle state.
 */
export function executeOrder(
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  side: Side,
  asset: Asset,
  amount: number,
  options?: ExecuteOrderOptions
): ExecuteOrderResult {
  const qty = Math.abs(Number(amount));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'Trade quantity must be a positive number.' };
  }

  const marketPrice = markets[asset]?.price || 0;
  if (!marketPrice || marketPrice <= 0) {
    return { ok: false, error: `Live quote for ${asset} is not yet available.` };
  }

  const type = options?.type || 'market';
  const auto = options?.auto ?? false;
  const strategyName = options?.strategyName;
  const now = Date.now();

  const lotId =
    options?.positionLotId ||
    (options?.takeProfit || options?.stopLoss
      ? 'lot_' + Math.random().toString(36).substring(2, 7) + Date.now().toString(36).slice(-4)
      : undefined);
  const brkId =
    options?.bracketId ||
    (options?.takeProfit || options?.stopLoss
      ? 'brk_' + Math.random().toString(36).substring(2, 7) + Date.now().toString(36).slice(-4)
      : undefined);

  // 1. LIMIT ORDERS: Queue in pending status with explicit balance reservations
  if (type === 'limit') {
    const limitPrice = options?.limitPrice;
    if (!limitPrice || limitPrice <= 0 || !Number.isFinite(limitPrice)) {
      return { ok: false, error: 'Please specify a valid positive limit price.' };
    }

    const notional = limitPrice * qty;
    const estFee = notional * FEE_RATE;

    if (side === 'buy') {
      const requiredCash = notional + estFee;
      const availableCash = getAvailableCash(state);
      if (requiredCash > availableCash + 0.01) {
        const reserved = getReservedCash(state);
        return {
          ok: false,
          error: `Insufficient available cash. Need ${money(requiredCash)}, available cash is ${money(availableCash)} (${money(reserved)} reserved by pending limit buys).`,
        };
      }

      const order: Order = {
        id: 'ord_lim_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        ts: now,
        side,
        type: 'limit',
        asset,
        amount: qty,
        price: limitPrice,
        limitPrice,
        fee: estFee,
        notional,
        slippageImpact: 0,
        auto,
        strategyName,
        status: 'pending',
        takeProfit: options?.takeProfit,
        stopLoss: options?.stopLoss,
        positionLotId: lotId,
        bracketId: brkId,
        reservedCash: requiredCash,
      };

      state.orders = [order, ...state.orders].slice(0, 300);
      state.reservedCash = getReservedCash(state);
      return { ok: true, order };
    } else {
      // Limit Sell
      const currentHolding = state.positions[asset] || 0;
      const availableHolding = getAvailablePosition(state, asset);
      if (qty > availableHolding + 1e-6) {
        const reservedHolding = getReservedPosition(state, asset);
        return {
          ok: false,
          error: `Insufficient available ${asset} balance to place limit sell. Holding ${formatQty(currentHolding, asset)}, but ${formatQty(reservedHolding, asset)} is reserved for open pending orders (available: ${formatQty(availableHolding, asset)}).`,
        };
      }

      const order: Order = {
        id: 'ord_lim_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        ts: now,
        side,
        type: 'limit',
        asset,
        amount: qty,
        price: limitPrice,
        limitPrice,
        fee: estFee,
        notional,
        slippageImpact: 0,
        auto,
        strategyName,
        status: 'pending',
        takeProfit: options?.takeProfit,
        stopLoss: options?.stopLoss,
        positionLotId: lotId,
        bracketId: brkId,
        reservedAmount: qty,
      };

      state.orders = [order, ...state.orders].slice(0, 300);
      state.reservedCash = getReservedCash(state);
      return { ok: true, order };
    }
  }

  // 2. MARKET ORDERS: Immediate fill with realistic slippage, fee & cost-basis reconciliation
  const quote = calculateExecutionQuote(marketPrice, side, qty);

  if (side === 'buy') {
    const availableCash = getAvailableCash(state);
    if (quote.totalCashRequired > availableCash + 0.01) {
      const reserved = getReservedCash(state);
      return {
        ok: false,
        error: `Insufficient available cash. Need ${money(quote.totalCashRequired)} (incl. fee), available cash is ${money(availableCash)} (${money(reserved)} reserved by pending limit orders).`,
      };
    }

    const priorQty = state.positions[asset] || 0;
    const priorAvg = state.avgBuyPrice?.[asset] || quote.estimatedPrice;
    const newQty = priorQty + qty;
    // Strict accounting: Capitalized cost basis includes acquisition taker fee
    const totalCost = quote.notional + quote.fee;
    const newAvg = (priorQty * priorAvg + totalCost) / Math.max(newQty, 1e-8);

    state.cash -= quote.totalCashRequired;
    state.totalFees = (state.totalFees || 0) + quote.fee;
    state.positions[asset] = newQty;
    if (!state.avgBuyPrice) state.avgBuyPrice = {} as Record<Asset, number>;
    state.avgBuyPrice[asset] = newAvg;
  } else {
    // Sell
    const currentHolding = state.positions[asset] || 0;
    const availableHolding = getAvailablePosition(state, asset);
    if (qty > availableHolding + 1e-6) {
      const reserved = getReservedPosition(state, asset);
      return {
        ok: false,
        error: `Insufficient available ${asset} balance. Holding ${formatQty(currentHolding, asset)}, but ${formatQty(reserved, asset)} is reserved for open pending orders (available: ${formatQty(availableHolding, asset)}).`,
      };
    }

    const avgBuy = state.avgBuyPrice?.[asset] || quote.estimatedPrice;
    // Realized P&L = Net Proceeds - (Cost Basis per unit * units sold)
    const realizedTradePnl = quote.netProceeds - avgBuy * qty;
    state.realizedPnl = (state.realizedPnl || 0) + realizedTradePnl;
    state.totalFees = (state.totalFees || 0) + quote.fee;

    const remainingQty = Math.max(0, currentHolding - qty);
    if (remainingQty < 1e-7) {
      state.positions[asset] = 0;
      if (state.avgBuyPrice) delete state.avgBuyPrice[asset];
    } else {
      state.positions[asset] = remainingQty;
    }

    state.cash += quote.netProceeds;
  }

  const order: Order = {
    id: 'ord_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
    ts: now,
    filledAt: now,
    side,
    type: 'market',
    asset,
    amount: qty,
    price: quote.estimatedPrice,
    fee: quote.fee,
    notional: quote.notional,
    slippageImpact: quote.slippagePct,
    auto,
    strategyName,
    status: 'filled',
    takeProfit: options?.takeProfit,
    stopLoss: options?.stopLoss,
    positionLotId: lotId,
    bracketId: brkId,
  };

  state.orders = [order, ...state.orders].slice(0, 300);
  state.reservedCash = getReservedCash(state);
  return { ok: true, order };
}

/**
 * Monitored during live price ticks: evaluates pending limit orders, bracket lot lifecycles, and returns comprehensive state change indicators.
 */
export function checkPendingOrders(
  state: AppState,
  markets: Record<Asset, Market | undefined>
): CheckPendingOrdersResult {
  const filledOrders: Order[] = [];
  const rejectedOrders: Order[] = [];
  const triggeredBrackets: { order: Order; reason: string; closeOrder?: Order }[] = [];
  const triggeredAlerts: string[] = [];
  const now = Date.now();
  let changed = false;

  // 1. Evaluate Pending Limit Orders
  for (const order of state.orders) {
    if (order.status !== 'pending') continue;

    const m = markets[order.asset];
    if (!m || m.price <= 0) continue;

    let trigger = false;
    let executionPrice = m.price;

    if (order.type === 'limit') {
      const target = order.limitPrice ?? order.price;
      if (order.side === 'buy' && m.price <= target) {
        trigger = true;
        executionPrice = Math.min(target, m.price);
      } else if (order.side === 'sell' && m.price >= target) {
        trigger = true;
        executionPrice = Math.max(target, m.price);
      }
    }

    if (trigger) {
      const notional = executionPrice * order.amount;
      const fee = notional * FEE_RATE;

      if (order.side === 'buy') {
        const cost = notional + fee;
        if (state.cash >= cost) {
          state.cash -= cost;
          state.totalFees = (state.totalFees || 0) + fee;
          const priorQty = state.positions[order.asset] || 0;
          const priorAvg = state.avgBuyPrice?.[order.asset] || executionPrice;
          const newQty = priorQty + order.amount;
          // Capitalized fee in cost basis
          const totalCost = notional + fee;
          const newAvg = (priorQty * priorAvg + totalCost) / Math.max(newQty, 1e-8);

          state.positions[order.asset] = newQty;
          if (!state.avgBuyPrice) state.avgBuyPrice = {} as Record<Asset, number>;
          state.avgBuyPrice[order.asset] = newAvg;

          order.status = 'filled';
          order.price = executionPrice;
          order.fee = fee;
          order.notional = notional;
          order.filledAt = now;
          order.reservedCash = undefined;
          filledOrders.push(order);
          triggeredAlerts.push(`Limit Buy Filled: ${order.amount} ${order.asset} @ ${money(executionPrice)}`);
          changed = true;
        } else {
          order.status = 'rejected';
          order.rejectReason = 'Insufficient cash at execution trigger';
          order.reservedCash = undefined;
          rejectedOrders.push(order);
          changed = true;
        }
      } else {
        // Sell limit
        const currentHolding = state.positions[order.asset] || 0;
        if (currentHolding >= order.amount - 1e-6) {
          const avgBuy = state.avgBuyPrice?.[order.asset] || executionPrice;
          const netProceeds = notional - fee;
          const realizedTradePnl = netProceeds - avgBuy * order.amount;
          state.realizedPnl = (state.realizedPnl || 0) + realizedTradePnl;
          state.totalFees = (state.totalFees || 0) + fee;

          const remaining = Math.max(0, currentHolding - order.amount);
          if (remaining < 1e-7) {
            state.positions[order.asset] = 0;
            if (state.avgBuyPrice) delete state.avgBuyPrice[order.asset];
          } else {
            state.positions[order.asset] = remaining;
          }

          state.cash += netProceeds;
          order.status = 'filled';
          order.price = executionPrice;
          order.fee = fee;
          order.notional = notional;
          order.filledAt = now;
          order.reservedAmount = undefined;
          filledOrders.push(order);
          triggeredAlerts.push(`Limit Sell Filled: ${order.amount} ${order.asset} @ ${money(executionPrice)}`);
          changed = true;
        } else {
          order.status = 'rejected';
          order.rejectReason = 'Insufficient asset balance at execution trigger';
          order.reservedAmount = undefined;
          rejectedOrders.push(order);
          changed = true;
        }
      }
    }
  }

  // 2. Evaluate Specific Position Lot Brackets (TP / SL per lot)
  const activeBracketLots = state.orders.filter(
    (o) => o.side === 'buy' && o.status === 'filled' && (o.takeProfit || o.stopLoss) && o.amount > 1e-6
  );

  for (const lot of activeBracketLots) {
    const m = markets[lot.asset];
    if (!m || m.price <= 0) continue;

    const availableToSell = getAvailablePosition(state, lot.asset);
    const closeQty = Math.min(lot.amount, availableToSell);
    if (closeQty <= 1e-6) continue;

    let closeReason: string | null = null;
    if (lot.takeProfit && m.price >= lot.takeProfit) {
      closeReason = `Take-Profit reached at ${money(m.price)} (Target: ${money(lot.takeProfit)})`;
    } else if (lot.stopLoss && m.price <= lot.stopLoss) {
      closeReason = `Stop-Loss triggered at ${money(m.price)} (Stop: ${money(lot.stopLoss)})`;
    } else if (lot.stopLoss && m.price > lot.price * 1.02) {
      // Dynamic Trailing Stop Ratchet: Protect accumulated unrealized profits as price runs up
      const dynamicTrailStop = +(m.price * 0.98).toFixed(2);
      if (dynamicTrailStop > lot.stopLoss) {
        lot.stopLoss = dynamicTrailStop;
        changed = true;
      }
    }

    if (closeReason) {
      const sellResult = executeOrder(state, markets, 'sell', lot.asset, closeQty, {
        auto: true,
        strategyName: `${closeReason} [${lot.positionLotId || lot.id.slice(-6)}]`,
      });

      // Clear bracket on this specific lot
      lot.takeProfit = undefined;
      lot.stopLoss = undefined;
      changed = true;

      if (sellResult.ok && sellResult.order && state.strategies && lot.strategyName) {
        const strat = state.strategies.find((s) => s.name === lot.strategyName);
        if (strat) {
          const tradePnl = (sellResult.order.price - lot.price) * closeQty - sellResult.order.fee;
          strat.realizedPnl = (strat.realizedPnl || 0) + tradePnl;
          strat.totalPnl = (strat.totalPnl || 0) + tradePnl;
          if (tradePnl > 0) {
            strat.winCount = (strat.winCount || 0) + 1;
          } else {
            strat.lossCount = (strat.lossCount || 0) + 1;
          }
        }
      }

      triggeredBrackets.push({
        order: lot,
        reason: closeReason,
        closeOrder: sellResult.order,
      });
      triggeredAlerts.push(`${lot.asset} Bracket Triggered: ${closeReason}`);
    }
  }

  if (changed) {
    state.reservedCash = getReservedCash(state);
  }

  return { changed, filledOrders, rejectedOrders, triggeredBrackets, triggeredAlerts };
}

/**
 * Cancels an open/pending order cleanly and releases reserved funds/units.
 */
export function cancelOrder(state: AppState, orderId: string): boolean {
  const target = state.orders.find((o) => o.id === orderId);
  if (target && target.status === 'pending') {
    target.status = 'cancelled';
    target.reservedCash = undefined;
    target.reservedAmount = undefined;
    state.reservedCash = getReservedCash(state);
    return true;
  }
  return false;
}
