import { ASSETS, Asset, AppState, Market } from '../types';

export const META: Record<
  Asset,
  { name: string; symbol: string; cbSymbol: string; basePrice: number; decimals: number; iconColor: string }
> = {
  BTC: { name: 'Bitcoin', symbol: 'BTCUSDT', cbSymbol: 'BTC-USD', basePrice: 67850, decimals: 5, iconColor: '#f7931a' },
  ETH: { name: 'Ethereum', symbol: 'ETHUSDT', cbSymbol: 'ETH-USD', basePrice: 3520, decimals: 4, iconColor: '#627eea' },
  SOL: { name: 'Solana', symbol: 'SOLUSDT', cbSymbol: 'SOL-USD', basePrice: 152.4, decimals: 3, iconColor: '#14f195' },
  ADA: { name: 'Cardano', symbol: 'ADAUSDT', cbSymbol: 'ADA-USD', basePrice: 0.482, decimals: 2, iconColor: '#0033ad' },
  XRP: { name: 'XRP', symbol: 'XRPUSDT', cbSymbol: 'XRP-USD', basePrice: 0.584, decimals: 2, iconColor: '#23292f' },
  AVAX: { name: 'Avalanche', symbol: 'AVAXUSDT', cbSymbol: 'AVAX-USD', basePrice: 28.6, decimals: 3, iconColor: '#e84142' },
  LINK: { name: 'Chainlink', symbol: 'LINKUSDT', cbSymbol: 'LINK-USD', basePrice: 14.8, decimals: 3, iconColor: '#375bd2' },
  DOGE: { name: 'Dogecoin', symbol: 'DOGEUSDT', cbSymbol: 'DOGE-USD', basePrice: 0.124, decimals: 1, iconColor: '#c2a633' },
};

export const FEE_RATE = 0.0008; // 0.08% standard paper execution taker fee

export const money = (n: number, minDec = 2, maxDec = 2): string => {
  if (!Number.isFinite(n)) return '$0.00';
  if (Math.abs(n) < 0.01 && Math.abs(n) > 0) {
    return '$' + n.toFixed(4);
  }
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: minDec,
      maximumFractionDigits: maxDec,
    })
  );
};

export const formatQty = (qty: number, asset: Asset): string => {
  if (!Number.isFinite(qty)) return '0';
  const dec = META[asset]?.decimals ?? 4;
  return qty.toLocaleString('en-US', { maximumFractionDigits: dec });
};

/**
 * Calculates current total portfolio liquidation value (cash + mark-to-market positions).
 */
export function portfolioValue(
  state: Pick<AppState, 'cash' | 'positions'>,
  markets: Record<Asset, Market | undefined>
): number {
  const cash = Number.isFinite(state.cash) ? state.cash : 0;
  const positionsVal = ASSETS.reduce((sum, a) => {
    const units = state.positions[a] || 0;
    const price = markets[a]?.price || 0;
    return sum + (units > 0 && price > 0 ? units * price : 0);
  }, 0);
  return cash + positionsVal;
}

/**
 * Mark-to-market valuation for a single asset position.
 */
export function positionValue(
  state: Pick<AppState, 'positions'>,
  markets: Record<Asset, Market | undefined>,
  asset: Asset
): number {
  const units = state.positions[asset] || 0;
  const price = markets[asset]?.price || 0;
  return units > 0 && price > 0 ? units * price : 0;
}

/**
 * Calculates unrealized P&L and return for a given open position against its volume-weighted cost basis.
 */
export function positionPnl(
  state: Pick<AppState, 'positions' | 'avgBuyPrice'>,
  markets: Record<Asset, Market | undefined>,
  asset: Asset
): { amount: number; pct: number; costBasis: number; currentValue: number } {
  const units = state.positions[asset] || 0;
  const currentPrice = markets[asset]?.price || 0;
  const avgBuy = state.avgBuyPrice?.[asset] || currentPrice;

  if (units <= 1e-8 || !currentPrice) {
    return { amount: 0, pct: 0, costBasis: 0, currentValue: 0 };
  }

  const costBasis = units * avgBuy;
  const currentValue = units * currentPrice;
  const amount = currentValue - costBasis;
  const pct = costBasis > 0 ? (amount / costBasis) * 100 : 0;

  return { amount, pct, costBasis, currentValue };
}

/**
 * Comprehensive portfolio P&L breakdown separating realized and unrealized performance.
 */
export function totalPortfolioPnl(
  state: Pick<AppState, 'cash' | 'positions' | 'avgBuyPrice' | 'startingEquity' | 'realizedPnl'>,
  markets: Record<Asset, Market | undefined>
): {
  totalValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  amount: number;
  pct: number;
  startingEquity: number;
} {
  const totalVal = portfolioValue(state, markets);
  const realized = Number.isFinite(state.realizedPnl) ? state.realizedPnl : 0;

  let unrealized = 0;
  for (const a of ASSETS) {
    const pnl = positionPnl(state, markets, a);
    unrealized += pnl.amount;
  }

  const totalPnl = realized + unrealized;
  const startingEquity = state.startingEquity > 0 ? state.startingEquity : (totalVal || 50000);
  const pct = startingEquity > 0 ? (totalPnl / startingEquity) * 100 : 0;

  return {
    totalValue: totalVal,
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    totalPnl,
    amount: totalPnl,
    pct,
    startingEquity,
  };
}
