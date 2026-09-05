/**
 * Broker Abstraction Layer Index
 * 
 * Exports domain types, interfaces, adapters, and ensures standard
 * broker adapters are registered upon import.
 */

import { BrokerRegistry } from './brokerRegistry';
import { BinanceAdapter } from './binance/binanceAdapter';
import { UpstoxAdapter } from './upstox/upstoxAdapter';

// Register standard production adapters
const binanceAdapter = new BinanceAdapter();
BrokerRegistry.register(binanceAdapter);
const upstoxAdapter = new UpstoxAdapter();
BrokerRegistry.register(upstoxAdapter);

export * from './brokerTypes';
export * from './brokerGateway';
export * from './brokerRegistry';
export * from './binance/binanceAdapter';
export * from './upstox/upstoxAdapter';
export * from './upstox/upstoxClient';
export * from './upstox/upstoxInstrumentProvider';
export * from './upstox/upstoxInstrumentRegistry';
export * from './upstox/indianMarketCalendar';
export * from './upstox/upstoxConnectivityValidator';
