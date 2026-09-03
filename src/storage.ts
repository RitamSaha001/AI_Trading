import {AppState,ASSETS} from './types';
const KEY='lumen-ai-trading-v3';
export function freshState():AppState{return{cash:30000,initialCash:30000,positions:{BTC:1.842,ETH:12.4,SOL:210,ADA:8200},watchlist:[...ASSETS],orders:[],alerts:[],strategies:ASSETS.map(asset=>({asset,enabled:false,maxAllocation:.05,cooldownSec:30})),settings:{geminiApiKey:'',geminiModel:'gemini-3.7-flash'},notifications:[],timeframe:'1D',selectedAsset:'BTC'}}
export function loadState():AppState{try{const raw=localStorage.getItem(KEY);if(raw)return {...freshState(),...JSON.parse(raw)} as AppState}catch{}return freshState()}
export function saveState(s:AppState){localStorage.setItem(KEY,JSON.stringify(s))}
export function resetState(){const s=freshState();saveState(s);return s}
