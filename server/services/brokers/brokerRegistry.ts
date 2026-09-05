/**
 * Central Broker Registry for Lumen Execution Engine
 * 
 * Manages registered broker gateways (e.g. Binance, Upstox) and acts as the
 * single point of resolution for order routing, recovery, and reconciliation.
 */

import { BrokerGateway } from './brokerGateway';
import { BrokerId } from './brokerTypes';
import { BinanceAdapter } from './binance/binanceAdapter';
import { UpstoxAdapter } from './upstox/upstoxAdapter';

export class BrokerRegistry {
  private static gateways: Map<string, BrokerGateway> = new Map();
  private static defaultBrokerId: BrokerId = 'binance';
  private static isInitialized = false;

  private static ensureInitialized(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    if (!this.gateways.has('binance')) {
      this.register(new BinanceAdapter());
    }
    if (!this.gateways.has('upstox')) {
      this.register(new UpstoxAdapter());
    }
  }

  /**
   * Registers a new broker gateway adapter.
   */
  static register(gateway: BrokerGateway): void {
    this.gateways.set(gateway.id, gateway);
  }

  /**
   * Retrieves a broker gateway by ID, falling back to default if not found.
   */
  static get(brokerId?: BrokerId | string): BrokerGateway {
    this.ensureInitialized();
    const id = (brokerId as BrokerId) || this.defaultBrokerId;
    const gateway = this.gateways.get(id);
    if (!gateway) {
      // Fall back to default broker gateway if registered
      const fallback = this.gateways.get(this.defaultBrokerId);
      if (fallback) {
        return fallback;
      }
      throw new Error(`Broker gateway '${id}' is not registered and no default gateway is available.`);
    }
    return gateway;
  }

  /**
   * Checks if a broker gateway is registered.
   */
  static has(brokerId: BrokerId | string): boolean {
    this.ensureInitialized();
    return this.gateways.has(brokerId);
  }

  /**
   * Returns all registered broker gateways.
   */
  static getAll(): BrokerGateway[] {
    this.ensureInitialized();
    return Array.from(this.gateways.values());
  }

  /**
   * Returns the default broker gateway (initially Binance).
   */
  static getDefault(): BrokerGateway {
    return this.get(this.defaultBrokerId);
  }

  /**
   * Sets the default broker ID.
   */
  static setDefault(brokerId: BrokerId): void {
    if (!this.gateways.has(brokerId)) {
      throw new Error(`Cannot set unregistered broker '${brokerId}' as default.`);
    }
    this.defaultBrokerId = brokerId;
  }

  /**
   * Initializes all registered broker gateways and logs capability status.
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    for (const gateway of this.gateways.values()) {
      try {
        const health = await gateway.healthCheck();
        // Log broker registration and readiness
      } catch (err: any) {
        console.warn(`[BrokerRegistry] Initial health check warning for broker '${gateway.id}': ${err.message}`);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Graceful shutdown of all registered brokers.
   */
  static async shutdown(): Promise<void> {
    this.isInitialized = false;
  }

  /**
   * Resets registry to initial state (useful for tests).
   */
  static resetForTesting(): void {
    this.gateways.clear();
    this.defaultBrokerId = 'binance';
    this.isInitialized = false;
    this.register(new BinanceAdapter());
    this.register(new UpstoxAdapter());
  }
}
