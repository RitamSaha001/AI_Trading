/**
 * Broker Abstraction Layer Index
 * 
 * Exports domain types, interfaces, adapters, and ensures standard
 * broker adapters are registered upon import.
 */

import { BrokerRegistry } from './brokerRegistry';
import { BinanceAdapter } from './binance/binanceAdapter';

// Register standard production adapters
const binanceAdapter = new BinanceAdapter();
BrokerRegistry.register(binanceAdapter);

export * from './brokerTypes';
export * from './brokerGateway';
export * from './brokerRegistry';
export * from './binance/binanceAdapter';
export * from './upstox/upstoxAdapter';
export * from './upstox/upstoxClient';
export * from './upstox/upstoxInstrumentProvider';
export * from './upstox/upstoxConnectivityValidator';
