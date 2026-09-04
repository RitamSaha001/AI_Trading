import { ASSETS, Asset, AppState, Market, MarketCategory } from '../types';

export const META: Record<
  Asset,
  { name: string; symbol: string; cbSymbol: string; basePrice: number; decimals: number; iconColor: string; category: MarketCategory }
> = {
  BTC: { name: 'Bitcoin', symbol: 'BTCUSDT', cbSymbol: 'BTC-USD', basePrice: 67850, decimals: 5, iconColor: '#f7931a', category: 'Layer 1' },
  ETH: { name: 'Ethereum', symbol: 'ETHUSDT', cbSymbol: 'ETH-USD', basePrice: 3520, decimals: 4, iconColor: '#627eea', category: 'Layer 1' },
  SOL: { name: 'Solana', symbol: 'SOLUSDT', cbSymbol: 'SOL-USD', basePrice: 152.4, decimals: 3, iconColor: '#14f195', category: 'Layer 1' },
  BNB: { name: 'BNB', symbol: 'BNBUSDT', cbSymbol: 'BNB-USD', basePrice: 588.2, decimals: 3, iconColor: '#f3ba2f', category: 'Layer 1' },
  XRP: { name: 'XRP', symbol: 'XRPUSDT', cbSymbol: 'XRP-USD', basePrice: 0.584, decimals: 2, iconColor: '#23292f', category: 'Layer 1' },
  DOGE: { name: 'Dogecoin', symbol: 'DOGEUSDT', cbSymbol: 'DOGE-USD', basePrice: 0.124, decimals: 1, iconColor: '#c2a633', category: 'Meme' },
  ADA: { name: 'Cardano', symbol: 'ADAUSDT', cbSymbol: 'ADA-USD', basePrice: 0.482, decimals: 2, iconColor: '#0033ad', category: 'Layer 1' },
  AVAX: { name: 'Avalanche', symbol: 'AVAXUSDT', cbSymbol: 'AVAX-USD', basePrice: 28.6, decimals: 3, iconColor: '#e84142', category: 'Layer 1' },
  SUI: { name: 'Sui', symbol: 'SUIUSDT', cbSymbol: 'SUI-USD', basePrice: 1.84, decimals: 3, iconColor: '#4da2ff', category: 'Layer 1' },
  SHIB: { name: 'Shiba Inu', symbol: 'SHIBUSDT', cbSymbol: 'SHIB-USD', basePrice: 0.0000185, decimals: 0, iconColor: '#ff9900', category: 'Meme' },
  TON: { name: 'Toncoin', symbol: 'TONUSDT', cbSymbol: 'TON-USD', basePrice: 5.62, decimals: 3, iconColor: '#0088cc', category: 'Layer 1' },
  LINK: { name: 'Chainlink', symbol: 'LINKUSDT', cbSymbol: 'LINK-USD', basePrice: 14.8, decimals: 3, iconColor: '#375bd2', category: 'Infra' },
  NEAR: { name: 'NEAR Protocol', symbol: 'NEARUSDT', cbSymbol: 'NEAR-USD', basePrice: 5.24, decimals: 3, iconColor: '#000000', category: 'AI & Compute' },
  DOT: { name: 'Polkadot', symbol: 'DOTUSDT', cbSymbol: 'DOT-USD', basePrice: 4.88, decimals: 3, iconColor: '#e6007a', category: 'Layer 1' },
  BCH: { name: 'Bitcoin Cash', symbol: 'BCHUSDT', cbSymbol: 'BCH-USD', basePrice: 382.5, decimals: 3, iconColor: '#8dc351', category: 'Layer 1' },
  PEPE: { name: 'Pepe', symbol: 'PEPEUSDT', cbSymbol: 'PEPE-USD', basePrice: 0.0000098, decimals: 0, iconColor: '#44a047', category: 'Meme' },
  UNI: { name: 'Uniswap', symbol: 'UNIUSDT', cbSymbol: 'UNI-USD', basePrice: 8.42, decimals: 3, iconColor: '#ff007a', category: 'DeFi' },
  APT: { name: 'Aptos', symbol: 'APTUSDT', cbSymbol: 'APT-USD', basePrice: 9.15, decimals: 3, iconColor: '#202124', category: 'Layer 1' },
  LTC: { name: 'Litecoin', symbol: 'LTCUSDT', cbSymbol: 'LTC-USD', basePrice: 68.4, decimals: 3, iconColor: '#345d9d', category: 'Layer 1' },
  ICP: { name: 'Internet Computer', symbol: 'ICPUSDT', cbSymbol: 'ICP-USD', basePrice: 8.85, decimals: 3, iconColor: '#29abe2', category: 'AI & Compute' },
  FET: { name: 'Artificial Superintelligence', symbol: 'FETUSDT', cbSymbol: 'FET-USD', basePrice: 1.48, decimals: 3, iconColor: '#1d2a44', category: 'AI & Compute' },
  KAS: { name: 'Kaspa', symbol: 'KASUSDT', cbSymbol: 'KAS-USD', basePrice: 0.142, decimals: 2, iconColor: '#70c7ba', category: 'Layer 1' },
  POL: { name: 'Polygon (POL)', symbol: 'POLUSDT', cbSymbol: 'POL-USD', basePrice: 0.412, decimals: 3, iconColor: '#8247e5', category: 'Layer 1' },
  XLM: { name: 'Stellar', symbol: 'XLMUSDT', cbSymbol: 'XLM-USD', basePrice: 0.102, decimals: 2, iconColor: '#14b6eb', category: 'Layer 1' },
  XMR: { name: 'Monero', symbol: 'XMRUSDT', cbSymbol: 'XMR-USD', basePrice: 154.2, decimals: 3, iconColor: '#ff6600', category: 'Layer 1' },
  TIA: { name: 'Celestia', symbol: 'TIAUSDT', cbSymbol: 'TIA-USD', basePrice: 5.85, decimals: 3, iconColor: '#7b2bf9', category: 'Infra' },
  RENDER: { name: 'Render', symbol: 'RENDERUSDT', cbSymbol: 'RENDER-USD', basePrice: 6.35, decimals: 3, iconColor: '#e5192d', category: 'AI & Compute' },
  STX: { name: 'Stacks', symbol: 'STXUSDT', cbSymbol: 'STX-USD', basePrice: 1.88, decimals: 3, iconColor: '#5546ff', category: 'Layer 1' },
  TAO: { name: 'Bittensor', symbol: 'TAOUSDT', cbSymbol: 'TAO-USD', basePrice: 486.0, decimals: 3, iconColor: '#2e2e2e', category: 'AI & Compute' },
  AAVE: { name: 'Aave', symbol: 'AAVEUSDT', cbSymbol: 'AAVE-USD', basePrice: 164.5, decimals: 3, iconColor: '#b6509e', category: 'DeFi' },
  ARB: { name: 'Arbitrum', symbol: 'ARBUSDT', cbSymbol: 'ARB-USD', basePrice: 0.58, decimals: 3, iconColor: '#28a0f0', category: 'Layer 1' },
  OP: { name: 'Optimism', symbol: 'OPUSDT', cbSymbol: 'OP-USD', basePrice: 1.62, decimals: 3, iconColor: '#ff0420', category: 'Layer 1' },
  INJ: { name: 'Injective', symbol: 'INJUSDT', cbSymbol: 'INJ-USD', basePrice: 22.4, decimals: 3, iconColor: '#00d2ff', category: 'DeFi' },
  FIL: { name: 'Filecoin', symbol: 'FILUSDT', cbSymbol: 'FIL-USD', basePrice: 3.75, decimals: 3, iconColor: '#0090ff', category: 'Infra' },
  OKB: { name: 'OKB', symbol: 'OKBUSDT', cbSymbol: 'OKB-USD', basePrice: 41.2, decimals: 3, iconColor: '#205fec', category: 'Infra' },
  IMX: { name: 'Immutable', symbol: 'IMXUSDT', cbSymbol: 'IMX-USD', basePrice: 1.45, decimals: 3, iconColor: '#0d0d0d', category: 'Gaming' },
  VET: { name: 'VeChain', symbol: 'VETUSDT', cbSymbol: 'VET-USD', basePrice: 0.024, decimals: 1, iconColor: '#15bdff', category: 'Infra' },
  MNT: { name: 'Mantle', symbol: 'MNTUSDT', cbSymbol: 'MNT-USD', basePrice: 0.62, decimals: 3, iconColor: '#000000', category: 'Layer 1' },
  CRO: { name: 'Cronos', symbol: 'CROUSDT', cbSymbol: 'CRO-USD', basePrice: 0.088, decimals: 2, iconColor: '#002d74', category: 'Layer 1' },
  FTM: { name: 'Fantom', symbol: 'FTMUSDT', cbSymbol: 'FTM-USD', basePrice: 0.72, decimals: 3, iconColor: '#1969ff', category: 'Layer 1' },
  WIF: { name: 'dogwifhat', symbol: 'WIFUSDT', cbSymbol: 'WIF-USD', basePrice: 2.38, decimals: 3, iconColor: '#a16641', category: 'Meme' },
  FLOKI: { name: 'FLOKI', symbol: 'FLOKIUSDT', cbSymbol: 'FLOKI-USD', basePrice: 0.000155, decimals: 0, iconColor: '#e0a92e', category: 'Meme' },
  BONK: { name: 'Bonk', symbol: 'BONKUSDT', cbSymbol: 'BONK-USD', basePrice: 0.0000215, decimals: 0, iconColor: '#f7931a', category: 'Meme' },
  GRT: { name: 'The Graph', symbol: 'GRTUSDT', cbSymbol: 'GRT-USD', basePrice: 0.165, decimals: 3, iconColor: '#6f4cff', category: 'AI & Compute' },
  THETA: { name: 'Theta Network', symbol: 'THETAUSDT', cbSymbol: 'THETA-USD', basePrice: 1.35, decimals: 3, iconColor: '#2ab8e6', category: 'AI & Compute' },
  SEI: { name: 'Sei', symbol: 'SEIUSDT', cbSymbol: 'SEI-USD', basePrice: 0.445, decimals: 3, iconColor: '#961d1d', category: 'Layer 1' },
  JUP: { name: 'Jupiter', symbol: 'JUPUSDT', cbSymbol: 'JUP-USD', basePrice: 0.94, decimals: 3, iconColor: '#34c759', category: 'DeFi' },
  RUNE: { name: 'THORChain', symbol: 'RUNEUSDT', cbSymbol: 'RUNE-USD', basePrice: 5.12, decimals: 3, iconColor: '#33ff99', category: 'DeFi' },
  PYTH: { name: 'Pyth Network', symbol: 'PYTHUSDT', cbSymbol: 'PYTH-USD', basePrice: 0.35, decimals: 3, iconColor: '#e6dafe', category: 'Infra' },
  HBAR: { name: 'Hedera', symbol: 'HBARUSDT', cbSymbol: 'HBAR-USD', basePrice: 0.058, decimals: 2, iconColor: '#222222', category: 'Layer 1' },
  OM: { name: 'MANTRA', symbol: 'OMUSDT', cbSymbol: 'OM-USD', basePrice: 1.42, decimals: 3, iconColor: '#e0427f', category: 'DeFi' },
  LDO: { name: 'Lido DAO', symbol: 'LDOUSDT', cbSymbol: 'LDO-USD', basePrice: 1.22, decimals: 3, iconColor: '#00a3ff', category: 'DeFi' },
  ALGO: { name: 'Algorand', symbol: 'ALGOUSDT', cbSymbol: 'ALGO-USD', basePrice: 0.138, decimals: 3, iconColor: '#000000', category: 'Layer 1' },
  MKR: { name: 'Maker', symbol: 'MKRUSDT', cbSymbol: 'MKR-USD', basePrice: 1650.0, decimals: 3, iconColor: '#1aab9b', category: 'DeFi' },
  BSV: { name: 'Bitcoin SV', symbol: 'BSVUSDT', cbSymbol: 'BSV-USD', basePrice: 48.5, decimals: 3, iconColor: '#eab300', category: 'Layer 1' },
  JASMY: { name: 'JasmyCoin', symbol: 'JASMYUSDT', cbSymbol: 'JASMY-USD', basePrice: 0.021, decimals: 1, iconColor: '#f18c27', category: 'AI & Compute' },
  ENA: { name: 'Ethena', symbol: 'ENAUSDT', cbSymbol: 'ENA-USD', basePrice: 0.395, decimals: 3, iconColor: '#111111', category: 'DeFi' },
  AR: { name: 'Arweave', symbol: 'ARUSDT', cbSymbol: 'AR-USD', basePrice: 19.8, decimals: 3, iconColor: '#222326', category: 'AI & Compute' },
  CORE: { name: 'Core', symbol: 'COREUSDT', cbSymbol: 'CORE-USD', basePrice: 1.05, decimals: 3, iconColor: '#ff7700', category: 'Layer 1' },
  BTT: { name: 'BitTorrent', symbol: 'BTTUSDT', cbSymbol: 'BTT-USD', basePrice: 0.00000095, decimals: 0, iconColor: '#000000', category: 'Infra' },
  NOT: { name: 'Notcoin', symbol: 'NOTUSDT', cbSymbol: 'NOT-USD', basePrice: 0.0084, decimals: 1, iconColor: '#000000', category: 'Gaming' },
  ONDO: { name: 'Ondo Finance', symbol: 'ONDOUSDT', cbSymbol: 'ONDO-USD', basePrice: 0.78, decimals: 3, iconColor: '#1a365d', category: 'DeFi' },
  WLD: { name: 'Worldcoin', symbol: 'WLDUSDT', cbSymbol: 'WLD-USD', basePrice: 1.88, decimals: 3, iconColor: '#111827', category: 'AI & Compute' },
  PENDLE: { name: 'Pendle', symbol: 'PENDLEUSDT', cbSymbol: 'PENDLE-USD', basePrice: 4.55, decimals: 3, iconColor: '#19c3b0', category: 'DeFi' },
  BEAM: { name: 'Beam', symbol: 'BEAMUSDT', cbSymbol: 'BEAM-USD', basePrice: 0.0175, decimals: 1, iconColor: '#00ffff', category: 'Gaming' },
  DYDX: { name: 'dYdX', symbol: 'DYDXUSDT', cbSymbol: 'DYDX-USD', basePrice: 1.15, decimals: 3, iconColor: '#6966ff', category: 'DeFi' },
  STRK: { name: 'Starknet', symbol: 'STRKUSDT', cbSymbol: 'STRK-USD', basePrice: 0.42, decimals: 3, iconColor: '#1c1b2b', category: 'Layer 1' },
  GALA: { name: 'Gala', symbol: 'GALAUSDT', cbSymbol: 'GALA-USD', basePrice: 0.024, decimals: 1, iconColor: '#101010', category: 'Gaming' },
  BLUR: { name: 'Blur', symbol: 'BLURUSDT', cbSymbol: 'BLUR-USD', basePrice: 0.28, decimals: 3, iconColor: '#ff5e00', category: 'Infra' },
  CRV: { name: 'Curve DAO', symbol: 'CRVUSDT', cbSymbol: 'CRV-USD', basePrice: 0.295, decimals: 3, iconColor: '#4070f4', category: 'DeFi' },
  CHZ: { name: 'Chiliz', symbol: 'CHZUSDT', cbSymbol: 'CHZ-USD', basePrice: 0.068, decimals: 2, iconColor: '#cd0124', category: 'Gaming' },
  SNX: { name: 'Synthetix', symbol: 'SNXUSDT', cbSymbol: 'SNX-USD', basePrice: 1.65, decimals: 3, iconColor: '#00d1ff', category: 'DeFi' },
  AXS: { name: 'Axie Infinity', symbol: 'AXSUSDT', cbSymbol: 'AXS-USD', basePrice: 5.25, decimals: 3, iconColor: '#0055d5', category: 'Gaming' },
  SAND: { name: 'The Sandbox', symbol: 'SANDUSDT', cbSymbol: 'SAND-USD', basePrice: 0.27, decimals: 3, iconColor: '#0084ff', category: 'Gaming' },
  MANA: { name: 'Decentraland', symbol: 'MANAUSDT', cbSymbol: 'MANA-USD', basePrice: 0.32, decimals: 3, iconColor: '#ff2d55', category: 'Gaming' },
  ENJ: { name: 'Enjin', symbol: 'ENJUSDT', cbSymbol: 'ENJ-USD', basePrice: 0.165, decimals: 3, iconColor: '#7866d5', category: 'Gaming' },
  FLOW: { name: 'Flow', symbol: 'FLOWUSDT', cbSymbol: 'FLOW-USD', basePrice: 0.58, decimals: 3, iconColor: '#2ebd85', category: 'Layer 1' },
  QNT: { name: 'Quant', symbol: 'QNTUSDT', cbSymbol: 'QNT-USD', basePrice: 72.5, decimals: 3, iconColor: '#000000', category: 'Infra' },
  NEO: { name: 'NEO', symbol: 'NEOUSDT', cbSymbol: 'NEO-USD', basePrice: 11.2, decimals: 3, iconColor: '#58bf00', category: 'Layer 1' },
  EOS: { name: 'EOS', symbol: 'EOSUSDT', cbSymbol: 'EOS-USD', basePrice: 0.52, decimals: 3, iconColor: '#000000', category: 'Layer 1' },
  IOTA: { name: 'IOTA', symbol: 'IOTAUSDT', cbSymbol: 'IOTA-USD', basePrice: 0.135, decimals: 3, iconColor: '#131f37', category: 'Layer 1' },
  KAVA: { name: 'Kava', symbol: 'KAVAUSDT', cbSymbol: 'KAVA-USD', basePrice: 0.38, decimals: 3, iconColor: '#ff564f', category: 'DeFi' },
  MINA: { name: 'Mina', symbol: 'MINAUSDT', cbSymbol: 'MINA-USD', basePrice: 0.58, decimals: 3, iconColor: '#ff603b', category: 'Layer 1' },
  ROSE: { name: 'Oasis Network', symbol: 'ROSEUSDT', cbSymbol: 'ROSE-USD', basePrice: 0.082, decimals: 2, iconColor: '#0092f6', category: 'Layer 1' },
  ZIL: { name: 'Zilliqa', symbol: 'ZILUSDT', cbSymbol: 'ZIL-USD', basePrice: 0.0165, decimals: 1, iconColor: '#29c5c2', category: 'Layer 1' },
  KLAY: { name: 'Kaia', symbol: 'KLAYUSDT', cbSymbol: 'KLAY-USD', basePrice: 0.145, decimals: 3, iconColor: '#2b2b2b', category: 'Layer 1' },
  CFX: { name: 'Conflux', symbol: 'CFXUSDT', cbSymbol: 'CFX-USD', basePrice: 0.162, decimals: 3, iconColor: '#1e3c72', category: 'Layer 1' },
  RON: { name: 'Ronin', symbol: 'RONUSDT', cbSymbol: 'RON-USD', basePrice: 1.82, decimals: 3, iconColor: '#1273ea', category: 'Gaming' },
  APE: { name: 'ApeCoin', symbol: 'APEUSDT', cbSymbol: 'APE-USD', basePrice: 0.85, decimals: 3, iconColor: '#0054fa', category: 'Gaming' },
  '1INCH': { name: '1inch', symbol: '1INCHUSDT', cbSymbol: '1INCH-USD', basePrice: 0.315, decimals: 3, iconColor: '#1b314f', category: 'DeFi' },
  COMP: { name: 'Compound', symbol: 'COMPUSDT', cbSymbol: 'COMP-USD', basePrice: 48.2, decimals: 3, iconColor: '#00d395', category: 'DeFi' },
  OSMO: { name: 'Osmosis', symbol: 'OSMOUSDT', cbSymbol: 'OSMO-USD', basePrice: 0.46, decimals: 3, iconColor: '#8000ff', category: 'DeFi' },
  GMX: { name: 'GMX', symbol: 'GMXUSDT', cbSymbol: 'GMX-USD', basePrice: 28.5, decimals: 3, iconColor: '#38394e', category: 'DeFi' },
  RAY: { name: 'Raydium', symbol: 'RAYUSDT', cbSymbol: 'RAY-USD', basePrice: 2.15, decimals: 3, iconColor: '#366ce8', category: 'DeFi' },
  JTO: { name: 'Jito', symbol: 'JTOUSDT', cbSymbol: 'JTO-USD', basePrice: 2.65, decimals: 3, iconColor: '#30c58d', category: 'DeFi' },
  ORDI: { name: 'ORDI', symbol: 'ORDIUSDT', cbSymbol: 'ORDI-USD', basePrice: 38.2, decimals: 3, iconColor: '#111111', category: 'Meme' },
  SATS: { name: 'SATS', symbol: '1000SATSUSDT', cbSymbol: 'SATS-USD', basePrice: 0.00028, decimals: 0, iconColor: '#f7931a', category: 'Meme' },
  W: { name: 'Wormhole', symbol: 'WUSDT', cbSymbol: 'W-USD', basePrice: 0.32, decimals: 3, iconColor: '#000000', category: 'Infra' },
  TNSR: { name: 'Tensor', symbol: 'TNSRUSDT', cbSymbol: 'TNSR-USD', basePrice: 0.54, decimals: 3, iconColor: '#1e293b', category: 'Infra' },
  EIGEN: { name: 'EigenLayer', symbol: 'EIGENUSDT', cbSymbol: 'EIGEN-USD', basePrice: 3.45, decimals: 3, iconColor: '#233876', category: 'Infra' },
  NEIRO: { name: 'First Neiro on Ethereum', symbol: 'NEIROUSDT', cbSymbol: 'NEIRO-USD', basePrice: 0.00165, decimals: 0, iconColor: '#ffbf00', category: 'Meme' },
  TURBO: { name: 'Turbo', symbol: 'TURBOUSDT', cbSymbol: 'TURBO-USD', basePrice: 0.0068, decimals: 0, iconColor: '#f59e0b', category: 'Meme' },
  POPCAT: { name: 'Popcat', symbol: 'POPCATUSDT', cbSymbol: 'POPCAT-USD', basePrice: 1.25, decimals: 3, iconColor: '#ec4899', category: 'Meme' },
  MEME: { name: 'Memecoin', symbol: 'MEMEUSDT', cbSymbol: 'MEME-USD', basePrice: 0.0135, decimals: 1, iconColor: '#000000', category: 'Meme' },
  ME: { name: 'Magic Eden', symbol: 'MEUSDT', cbSymbol: 'ME-USD', basePrice: 2.85, decimals: 3, iconColor: '#e11d48', category: 'Infra' },
  ZK: { name: 'ZKsync', symbol: 'ZKUSDT', cbSymbol: 'ZK-USD', basePrice: 0.155, decimals: 3, iconColor: '#4f46e5', category: 'Layer 1' },
  MORPHO: { name: 'Morpho', symbol: 'MORPHOUSDT', cbSymbol: 'MORPHO-USD', basePrice: 1.35, decimals: 3, iconColor: '#2563eb', category: 'DeFi' },
  COW: { name: 'CoW Protocol', symbol: 'COWUSDT', cbSymbol: 'COW-USD', basePrice: 0.48, decimals: 3, iconColor: '#0d9488', category: 'DeFi' },
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
 * Seamlessly supports dual-account segregation:
 * When accountMode === 'exchange', evaluates verified exchange USDT cash + active exchange asset holdings.
 * When accountMode === 'paper' (default), evaluates virtual cash and positions.
 */
export const STABLECOINS = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'] as const;

export function portfolioValue(
  state: Pick<AppState, 'cash' | 'positions'> & Partial<Pick<AppState, 'accountMode' | 'exchangeAccount' | 'web3Account' | 'web3Positions'>>,
  markets: Record<Asset, Market | undefined>
): number {
  if (state.accountMode === 'exchange' && state.exchangeAccount?.balances) {
    const balances = state.exchangeAccount.balances;
    const stableCash = STABLECOINS.reduce(
      (sum, coin) => sum + (balances[coin]?.free || 0) + (balances[coin]?.locked || 0),
      0
    );
    const cryptoVal = ASSETS.reduce((sum, a) => {
      const b = balances[a];
      const units = (b?.free || 0) + (b?.locked || 0);
      const price = markets[a]?.price || 0;
      return sum + (units > 0 && price > 0 ? units * price : 0);
    }, 0);
    return stableCash + cryptoVal;
  }

  if (state.accountMode === 'web3' && state.web3Account) {
    const w3 = state.web3Account;
    const stableCash = (w3.balances?.['USDT'] || 0) + (w3.balances?.['USDC'] || 0);
    const nativePrice = markets[w3.nativeSymbol as Asset]?.price || (w3.network === 'polygon' ? 0.45 : 3200);
    const nativeVal = (w3.nativeBalance || 0) * nativePrice;
    const positions = (state.web3Positions || {}) as Partial<Record<Asset, number>>;
    const balances = (w3.balances || {}) as Record<string, number>;
    const cryptoVal = ASSETS.reduce((sum, a) => {
      const isCashLike = (a as string) === 'USDT' || (a as string) === 'USDC' || (a as string) === w3.nativeSymbol;
      const units = (positions[a] || 0) + (!isCashLike ? (balances[a] || 0) : 0);
      const price = markets[a]?.price || 0;
      return sum + (units > 0 && price > 0 ? units * price : 0);
    }, 0);
    return stableCash + nativeVal + cryptoVal;
  }

  const cash = Number.isFinite(state.cash) ? state.cash : 0;
  const positionsVal = ASSETS.reduce((sum, a) => {
    const units = state.positions?.[a] || 0;
    const price = markets[a]?.price || 0;
    return sum + (units > 0 && price > 0 ? units * price : 0);
  }, 0);
  return cash + positionsVal;
}

/**
 * Returns active liquid cash based on account mode (stablecoins for exchange/web3, cash for paper).
 */
export function getActiveLiquidCash(
  state: Pick<AppState, 'cash'> & Partial<Pick<AppState, 'accountMode' | 'exchangeAccount' | 'web3Account'>>
): number {
  if (state.accountMode === 'exchange' && state.exchangeAccount?.balances) {
    return STABLECOINS.reduce(
      (sum, coin) => sum + (state.exchangeAccount?.balances[coin]?.free || 0),
      0
    );
  }
  if (state.accountMode === 'web3' && state.web3Account?.balances) {
    return (state.web3Account.balances['USDT'] || 0) + (state.web3Account.balances['USDC'] || 0);
  }
  return Number.isFinite(state.cash) ? state.cash : 0;
}

/**
 * Returns active position units for an asset based on account mode.
 */
export function getActiveAssetUnits(
  state: Pick<AppState, 'positions'> & Partial<Pick<AppState, 'accountMode' | 'exchangeAccount' | 'web3Account' | 'web3Positions'>>,
  asset: Asset
): number {
  if (state.accountMode === 'exchange' && state.exchangeAccount?.balances) {
    return state.exchangeAccount.balances[asset]?.free || 0;
  }
  if (state.accountMode === 'web3') {
    return state.web3Positions?.[asset] || state.web3Account?.balances?.[asset] || 0;
  }
  return state.positions?.[asset] || 0;
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
 * Strictly guarantees the accounting invariant: portfolioValue - startingEquity === totalPnl
 * and totalPnl === realizedPnl + unrealizedPnl.
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
  const startingEquity = state.startingEquity > 0 ? state.startingEquity : Math.max(1, totalVal - totalPnl);
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

/**
 * Computes total cash currently reserved by open/pending limit buy orders (including estimated taker fee).
 */
export function getReservedCash(state: Pick<AppState, 'orders'> & { accountMode?: AppState['accountMode'] }): number {
  const currentMode = state.accountMode || 'paper';
  return (state.orders || []).reduce((sum, o) => {
    const oMode = o.accountMode || 'paper';
    if (oMode === currentMode && o.status === 'pending' && o.side === 'buy' && o.type === 'limit') {
      const price = o.limitPrice ?? o.price;
      const notional = price * o.amount;
      const fee = notional * FEE_RATE;
      return sum + (o.reservedCash ?? (notional + fee));
    }
    return sum;
  }, 0);
}

/**
 * Returns currently available liquid cash after subtracting funds reserved for pending limit buys.
 */
export function getAvailableCash(state: Pick<AppState, 'cash' | 'orders'> & { accountMode?: AppState['accountMode']; exchangeAccount?: AppState['exchangeAccount']; web3Account?: AppState['web3Account'] }): number {
  if (state.accountMode === 'exchange' && state.exchangeAccount) {
    return ['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'].reduce(
      (sum, coin) => sum + (state.exchangeAccount?.balances[coin]?.free || 0),
      0
    );
  }
  if (state.accountMode === 'web3' && state.web3Account?.balances) {
    return (state.web3Account.balances['USDT'] || 0) + (state.web3Account.balances['USDC'] || 0);
  }
  const reserved = getReservedCash(state);
  return Math.max(0, (state.cash || 0) - reserved);
}

/**
 * Computes asset units currently reserved by open/pending limit sell orders.
 */
export function getReservedPosition(state: Pick<AppState, 'orders'> & { accountMode?: AppState['accountMode'] }, asset: Asset): number {
  const currentMode = state.accountMode || 'paper';
  return (state.orders || []).reduce((sum, o) => {
    const oMode = o.accountMode || 'paper';
    if (oMode === currentMode && o.status === 'pending' && o.side === 'sell' && o.asset === asset) {
      return sum + (o.reservedAmount ?? o.amount);
    }
    return sum;
  }, 0);
}

/**
 * Returns available asset units after subtracting units reserved by pending limit sells.
 */
export function getAvailablePosition(
  state: Pick<AppState, 'positions' | 'orders'> & {
    accountMode?: AppState['accountMode'];
    exchangeAccount?: AppState['exchangeAccount'];
    web3Account?: AppState['web3Account'];
    web3Positions?: AppState['web3Positions'];
  },
  asset: Asset
): number {
  if (state.accountMode === 'exchange' && state.exchangeAccount) {
    return state.exchangeAccount.balances[asset]?.free || 0;
  }
  if (state.accountMode === 'web3') {
    return state.web3Positions?.[asset] || state.web3Account?.balances?.[asset] || 0;
  }
  const holding = state.positions[asset] || 0;
  const reserved = getReservedPosition(state, asset);
  return Math.max(0, holding - reserved);
}

/**
 * Creates a fully populated Record<Asset, number> initialized with 0s and optional overrides.
 */
export function createPositionsRecord(init: Partial<Record<Asset, number>> = {}): Record<Asset, number> {
  const rec: Record<string, number> = {};
  for (const a of ASSETS) rec[a] = init[a] ?? 0;
  return rec as Record<Asset, number>;
}
