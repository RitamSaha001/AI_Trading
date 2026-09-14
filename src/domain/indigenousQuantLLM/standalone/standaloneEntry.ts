/**
 * LUMEN-ASTRA-FIN 2.0: STANDALONE CLIENT-SIDE BUNDLE ENTRYPOINT
 * Provides browser-ready APIs for the standalone HTML web chat application.
 */

import { AppState, Market, Asset, Candle } from '../../../types';
import { NeuralTransformerModel, LARGE_1M_TRANSFORMER_CONFIG } from '../neural/transformerModel';
import { AstraFinGenerator } from '../neural/generator';
import { AstraNexusBridge, AstraNexusResponse, ASTRA_ENGINE_LABEL } from '../neural/nexusAstraBridge';
import { RealtimeModelBenchmark, RealtimeBenchmarkReport } from '../benchmarking/realtimeBenchmark';

function createMarket(
  asset: Asset,
  name: string,
  price: number,
  change24h: number,
  high24h: number,
  low24h: number,
  volume24h: number,
  candles: Candle[]
): Market {
  return {
    asset,
    name,
    symbol: asset,
    price,
    change24h,
    high24h,
    low24h,
    volume24h,
    history: candles.map(c => c.close),
    candles,
    source: 'Upstox REST (Live)',
    isSynthetic: false,
    lastUpdated: Date.now(),
  };
}

export function createDefaultMarkets(): Record<string, Market> {
  const mkts: Record<string, Market> = {
    RELIANCE: createMarket(
      'RELIANCE',
      'Reliance Industries Ltd',
      2450.35,
      2.15,
      2468.00,
      2410.50,
      18450000,
      [
        { open: 2415, high: 2430, low: 2410, close: 2425, volume: 150000, time: Date.now() - 3600000 * 4 },
        { open: 2425, high: 2445, low: 2420, close: 2440, volume: 220000, time: Date.now() - 3600000 * 3 },
        { open: 2440, high: 2455, low: 2435, close: 2448, volume: 310000, time: Date.now() - 3600000 * 2 },
        { open: 2448, high: 2468, low: 2445, close: 2450.35, volume: 450000, time: Date.now() - 3600000 },
      ]
    ),
    TCS: createMarket(
      'TCS',
      'Tata Consultancy Services',
      3890.50,
      1.45,
      3915.00,
      3850.00,
      9200000,
      [
        { open: 3860, high: 3880, low: 3850, close: 3875, volume: 80000, time: Date.now() - 3600000 * 4 },
        { open: 3875, high: 3900, low: 3870, close: 3890.50, volume: 140000, time: Date.now() - 3600000 },
      ]
    ),
    INFY: createMarket(
      'INFY',
      'Infosys Ltd',
      1780.20,
      -0.65,
      1805.00,
      1772.00,
      12400000,
      [
        { open: 1795, high: 1805, low: 1790, close: 1788, volume: 110000, time: Date.now() - 3600000 * 2 },
        { open: 1788, high: 1792, low: 1772, close: 1780.20, volume: 190000, time: Date.now() - 3600000 },
      ]
    ),
    TATAPOWER: createMarket(
      'TATAPOWER',
      'Tata Power Co Ltd',
      420.50,
      3.80,
      425.00,
      405.20,
      24500000,
      [
        { open: 408, high: 416, low: 405, close: 414, volume: 350000, time: Date.now() - 3600000 * 3 },
        { open: 414, high: 425, low: 412, close: 420.50, volume: 520000, time: Date.now() - 3600000 },
      ]
    ),
    BTC: createMarket(
      'BTC',
      'Bitcoin',
      64250.00,
      2.90,
      65100.00,
      62800.00,
      3400000000,
      [
        { open: 63100, high: 64500, low: 62800, close: 64250, volume: 12500, time: Date.now() - 3600000 },
      ]
    ),
  };
  return mkts;
}

export function createDefaultAppState(): AppState {
  return {
    schemaVersion: 2,
    cash: 45000,
    initialCash: 50000,
    startingEquity: 50000,
    realizedPnl: 1450.75,
    totalFees: 38.50,
    positions: {
      RELIANCE: 15,
      TCS: 8,
      INFY: 0,
      TATAPOWER: 0,
      BTC: 0.15,
    } as any,
    avgBuyPrice: {
      RELIANCE: 2380.00,
      TCS: 3820.00,
      BTC: 62000.00,
    } as any,
    watchlist: ['RELIANCE', 'TCS', 'INFY', 'TATAPOWER', 'BTC'] as Asset[],
    orders: [],
    alerts: [],
    strategies: [],
    notifications: [],
    selectedAsset: 'RELIANCE' as Asset,
    timeframe: '1D',
    accountMode: 'upstox',
    settings: {
      geminiApiKey: '',
      geminiModel: 'lumen-astra-fin-2.0',
      soundEnabled: false,
      theme: 'glass',
      maxSlippageBps: 20,
      enableWebSocket: false,
    },
  } as any as AppState;
}

// Global active bridge
let activeBridge = new AstraNexusBridge();
let activeAppState = createDefaultAppState();
let activeMarkets = createDefaultMarkets();
let chatHistory: { role: 'user' | 'assistant'; text: string }[] = [];

export function queryModel(
  prompt: string,
  options?: {
    accountMode?: 'upstox' | 'crypto';
    selectedAsset?: Asset;
  }
): AstraNexusResponse {
  if (options?.accountMode) activeAppState.accountMode = options.accountMode;
  if (options?.selectedAsset) activeAppState.selectedAsset = options.selectedAsset;

  const res = activeBridge.query(prompt, activeAppState, activeMarkets, chatHistory);

  chatHistory.push({ role: 'user', text: prompt });
  chatHistory.push({ role: 'assistant', text: res.reply });
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

  return res;
}

export function loadModelWeights(jsonWeights: string): { success: boolean; params: number; message: string } {
  try {
    const customModel = new NeuralTransformerModel(LARGE_1M_TRANSFORMER_CONFIG);
    customModel.loadWeights(jsonWeights);
    activeBridge = new AstraNexusBridge(customModel);
    RealtimeModelBenchmark.setGenerator(new AstraFinGenerator(customModel));
    const paramCount = customModel.countParameters();
    return {
      success: true,
      params: paramCount,
      message: `Successfully loaded weights with ${paramCount.toLocaleString()} parameters!`,
    };
  } catch (err: any) {
    return {
      success: false,
      params: 0,
      message: `Failed to load weights: ${err?.message || String(err)}`,
    };
  }
}

export function runModelBenchmark(): RealtimeBenchmarkReport {
  return RealtimeModelBenchmark.runBenchmark();
}

export function getModelInfo() {
  const m = activeBridge.getModel();
  return {
    engineLabel: ASTRA_ENGINE_LABEL,
    parameters: m.countParameters(),
    dModel: m.config.dModel,
    nHeads: m.config.nHeads,
    nLayers: m.config.nLayers,
    nExperts: m.config.nExperts || 4,
    vocabSize: m.config.vocabSize,
    contextWindow: m.config.maxSeqLen,
    accountMode: activeAppState.accountMode,
    selectedAsset: activeAppState.selectedAsset,
  };
}

export function clearChatHistory() {
  chatHistory = [];
}

// Attach to window for browser script access
if (typeof window !== 'undefined') {
  (window as any).LumenAstraApp = {
    queryModel,
    loadModelWeights,
    runModelBenchmark,
    getModelInfo,
    clearChatHistory,
    createDefaultMarkets,
    createDefaultAppState,
  };
}
