import {ASSETS,Asset,Market,Timeframe} from './types';
import {META} from './trading';
const BINANCE='https://api.binance.com';
const COINBASE='https://api.exchange.coinbase.com';
const cbSymbol:Record<Asset,string>={BTC:'BTC-USD',ETH:'ETH-USD',SOL:'SOL-USD',ADA:'ADA-USD'};
const tfMap:Record<Timeframe,{bin:string;count:number}>={'1H':{bin:'1m',count:60},'1D':{bin:'15m',count:96},'1W':{bin:'1h',count:168},'1M':{bin:'4h',count:180}};
const safe=async<T>(u:string):Promise<T>=>{const r=await fetch(u);if(!r.ok)throw new Error(String(r.status));return r.json()};
async function binance(asset:Asset,tf:Timeframe):Promise<Market>{const sym=META[asset].symbol;const t=await safe<any>(`${BINANCE}/api/v3/ticker/24hr?symbol=${sym}`);const rows=await safe<any[]>(`${BINANCE}/api/v3/klines?symbol=${sym}&interval=${tfMap[tf].bin}&limit=${tfMap[tf].count}`);const candles=rows.map(x=>({time:x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));return{asset,name:META[asset].name,price:+t.lastPrice,change24h:+t.priceChangePercent,high24h:+t.highPrice,low24h:+t.lowPrice,volume24h:+t.quoteVolume,history:candles.map(c=>c.close),candles,source:'Binance'}}
async function coinbase(asset:Asset,tf:Timeframe):Promise<Market>{const product=cbSymbol[asset],gran=tf==='1H'?60:tf==='1D'?900:tf==='1W'?3600:14400;const stats=await safe<any>(`${COINBASE}/products/${product}/stats`);const rows=await safe<any[]>(`${COINBASE}/products/${product}/candles?granularity=${gran}`);const cs=rows.slice(0,tfMap[tf].count).reverse().map(x=>({time:x[0]*1000,low:+x[1],high:+x[2],open:+x[3],close:+x[4],volume:+x[5]}));const price=+stats.last,open=+stats.open;return{asset,name:META[asset].name,price,change24h:open?((price-open)/open)*100:0,high24h:+stats.high,low24h:+stats.low,volume24h:price*(+stats.volume),history:cs.map(c=>c.close),candles:cs,source:'Coinbase'}}
export async function fetchMarket(asset:Asset,tf:Timeframe){try{return await binance(asset,tf)}catch{return await coinbase(asset,tf)}}
export async function fetchAll(tf:Timeframe){const results=await Promise.all(ASSETS.map(a=>fetchMarket(a,tf)));return Object.fromEntries(results.map(m=>[m.asset,m])) as Record<Asset,Market>}
