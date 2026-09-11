/**
 * Lumen Enterprise Client API Service
 * Connects the frontend application to the authoritative Fastify backend service.
 */

import type { Candle } from '../types';

const isMobileNative = typeof window !== 'undefined' && (
  Boolean((window as any)?.Capacitor) ||
  window.location.protocol === 'capacitor:' ||
  (window.location.hostname === 'localhost' && window.location.port === '')
);

const API_BASE = (typeof window !== 'undefined' && (window.location.hostname === 'ritamsaha001.github.io' || isMobileNative))
  ? 'https://87.76.191.49.nip.io'
  : '';

async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer personal_owner_token_ritam',
      ...(options.headers as Record<string, string> || {}),
    };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Ensures HttpOnly lumen_session cookie is transmitted with every request
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || data.message || `HTTP ${res.status}`, data };
    }
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

export const ApiClient = {
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { credentials: 'include' });
      const data = await res.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  },

  async loginGoogle(idToken?: string) {
    return apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken, credential: idToken }),
    });
  },

  async loginApple(identityToken: string, nonce?: string, displayName?: string) {
    return apiRequest('/api/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken, nonce, displayName }),
    });
  },

  async requestEmailChallenge(email: string) {
    return apiRequest('/api/auth/email/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async verifyEmailChallenge(email: string, code: string) {
    return apiRequest('/api/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  },

  async loginEmail(email: string, displayName?: string) {
    return apiRequest('/api/auth/email', {
      method: 'POST',
      body: JSON.stringify({ email, displayName }),
    });
  },

  async getMe() {
    return apiRequest('/api/auth/me');
  },

  async logout() {
    return apiRequest('/api/auth/logout', { method: 'POST' });
  },

  async emergencyFreeze() {
    return apiRequest('/api/auth/emergency-freeze', { method: 'POST' });
  },

  async getBalances() {
    return apiRequest('/api/wallet/balances');
  },

  async getLedger() {
    return apiRequest('/api/wallet/ledger');
  },

  async allocate(amountUSD: number, idempotencyKey?: string) {
    return apiRequest('/api/wallet/allocate', {
      method: 'POST',
      body: JSON.stringify({ amountUSD, idempotencyKey }),
    });
  },

  async recall(amountUSD: number, idempotencyKey?: string) {
    return apiRequest('/api/wallet/recall', {
      method: 'POST',
      body: JSON.stringify({ amountUSD, idempotencyKey }),
    });
  },

  async withdraw(params: { amount: number; currency: 'USD' | 'INR'; method: 'card' | 'upi' | 'bank'; pin?: string }) {
    return apiRequest('/api/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getPaymentStatus(orderId: string) {
    return apiRequest(`/api/payments/${orderId}/status`);
  },

  async createPaymentIntent(params: {
    amountMinor: number;
    currency: 'USD' | 'INR';
    method: 'card' | 'upi';
    idempotencyKey: string;
  }) {
    return apiRequest('/api/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async submitUTR(params: { utr: string; amountINR: number; orderId?: string }) {
    return apiRequest('/api/payments/submit-utr', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async submitOrder(order: {
    symbol: string;
    asset: string;
    quoteAsset: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT';
    quantity: number;
    price?: number;
    product?: string;
    broker?: string;
    accountMode?: string;
    marketQuoteAgeMs: number;
    idempotencyKey?: string;
    auto?: boolean;
    isAutonomous?: boolean;
    strategyName?: string;
    strategyId?: string;
  }) {
    return apiRequest('/api/orders/submit', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  },

  async proposeLiveOrder(proposal: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    quantity: number;
    price?: number;
    triggerPrice?: number;
    product: string;
    validity?: string;
    disclosedQuantity?: number;
    slice?: boolean;
    broker?: string;
  }) {
    return apiRequest<{ confirmation: any }>('/api/orders/propose', {
      method: 'POST',
      body: JSON.stringify(proposal),
    });
  },

  async confirmLiveOrder(confirmation: {
    confirmationId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    quantity: number;
    price?: number;
    triggerPrice?: number;
    product: string;
    validity?: string;
    disclosedQuantity?: number;
    slice?: boolean;
    broker?: string;
  }) {
    return apiRequest<{ order: any }>('/api/orders/confirm', {
      method: 'POST',
      body: JSON.stringify(confirmation),
    });
  },

  async getLiveOrderConfirmation(confirmationId: string) {
    return apiRequest<{ confirmation: any }>(`/api/orders/confirmation/${encodeURIComponent(confirmationId)}`);
  },

  async getEmergencyStatus() {
    return apiRequest<{ status: { state: 'TRADING_NORMAL' | 'TRADING_HALTED' | 'PANIC'; reason: string; updatedAt: number } }>('/api/emergency/status');
  },

  async triggerPanic(broker: string = 'upstox', reason?: string) {
    return apiRequest<{ summary: any }>('/api/emergency/panic', {
      method: 'POST',
      body: JSON.stringify({ broker, reason }),
    });
  },

  async triggerTradingHalt(reason?: string) {
    return apiRequest<{ status: any }>('/api/emergency/halt', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async resumeTrading(reason?: string) {
    return apiRequest<{ status: any }>('/api/emergency/resume', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getAuthoritativeAccountingSummary(mode: 'live' | 'paper' = 'live') {
    return apiRequest(`/api/accounting/summary?mode=${mode}`);
  },

  async replayAccountingState(mode: 'live' | 'paper' = 'live') {
    return apiRequest(`/api/accounting/replay?mode=${mode}`, { method: 'POST' });
  },

  async getOrders() {
    return apiRequest('/api/orders');
  },

  async cancelOrder(clientOrderId: string, broker?: string) {
    return apiRequest('/api/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ clientOrderId, broker }),
    });
  },

  async runReconciliation() {
    return apiRequest('/api/reconciliation/run', { method: 'POST' });
  },

  async connectExchange(creds: {
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    sessionToken?: string;
    consumerKey?: string;
    sid?: string;
    ucc?: string;
    userId?: string;
    accountId?: string;
    accountName?: string;
    code?: string;
    environment?: string;
    broker?: string;
  }) {
    return apiRequest<{ audit: any; message: string }>('/api/exchange/connect', {
      method: 'POST',
      body: JSON.stringify(creds),
    });
  },

  async disconnectExchange(broker: string = 'upstox') {
    return apiRequest(`/api/exchange/disconnect?broker=${encodeURIComponent(broker)}`, { method: 'POST' });
  },

  async getExchangeAccount(broker: string = 'upstox') {
    return apiRequest<{ account: any }>(`/api/exchange/account?broker=${encodeURIComponent(broker)}`);
  },

  async getUpstoxAuthUrl(redirectUri?: string) {
    const q = redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : '';
    return apiRequest<{ authUrl: string; expiresAt: number }>(`/api/exchange/upstox/auth-url${q}`);
  },

  async submitUpstoxCallback(code: string, state: string, redirectUri?: string) {
    return apiRequest<{ audit?: any; message?: string; code?: string; details?: string; accountId?: string }>('/api/exchange/upstox/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state, redirectUri }),
    });
  },

  async getUpstoxTokenHealth() {
    return apiRequest<{ health: any }>('/api/exchange/upstox/token-health');
  },

  async getUpstoxIpDiagnostics(force: boolean = false) {
    const q = force ? '?force=true' : '';
    return apiRequest<{ diagnostics: any }>(`/api/exchange/upstox/ip-diagnostics${q}`);
  },

  async getUpstoxConnectivityReport() {
    return apiRequest<{ report: any }>('/api/exchange/upstox/connectivity-check');
  },

  async getUpstoxInstruments() {
    return apiRequest<{ success: boolean; instruments: any[] }>('/api/market/instruments/upstox');
  },

  async getUpstoxMarketQuotes(symbols?: string[]) {
    const q = symbols && symbols.length > 0 ? `?symbols=${encodeURIComponent(symbols.join(','))}` : '';
    return apiRequest<{ success: boolean; quotes: Record<string, any> }>(`/api/market/quotes/upstox${q}`);
  },

  async getUpstoxCandles(symbol: string, timeframe: string = '1D') {
    return apiRequest<{ success: boolean; symbol: string; timeframe: string; count: number; candles: Candle[] }>(
      `/api/market/candles/upstox?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
    );
  },

  async getUpstoxCandlesBatch(symbols?: string[], timeframe: string = '1D') {
    const q = symbols && symbols.length > 0 ? `?symbols=${encodeURIComponent(symbols.join(','))}&timeframe=${encodeURIComponent(timeframe)}` : `?timeframe=${encodeURIComponent(timeframe)}`;
    return apiRequest<{ success: boolean; timeframe: string; count: number; candles: Record<string, Candle[]> }>(
      `/api/market/candles/upstox/batch${q}`
    );
  },

  async getFlattradeQuotes(symbols: string[], exchange: string = 'NSE') {
    return apiRequest<{ broker: string; quotes: Record<string, any>; executionLocked: boolean }>(
      `/api/market/quotes/flattrade?symbols=${encodeURIComponent(symbols.join(','))}&exchange=${encodeURIComponent(exchange)}`,
    );
  },

  async getFlattradeCandles(params: { symbol: string; exchange?: string; interval?: number; from?: string; to?: string; token?: string }) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    return apiRequest<{ broker: string; symbol: string; count: number; candles: any[]; executionLocked: boolean }>(`/api/market/candles/flattrade?${query.toString()}`);
  },

  async getFlattradeOptionChain(params: { symbol: string; strikePrice: string; exchange?: string; count?: number }) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    return apiRequest<{ broker: string; contracts: any[]; executionLocked: boolean }>(`/api/market/option-chain/flattrade?${query.toString()}`);
  },

  async getFlattradeOptionGreeks(params: { expiryDate: string; strikePrice: string; spotPrice: string; interestRate: string; volatility: string; optionType: 'CE' | 'PE' }) {
    const query = new URLSearchParams(params);
    return apiRequest<{ broker: string; greeks: any; executionLocked: boolean }>(`/api/market/option-greeks/flattrade?${query.toString()}`);
  },

  async getFlattradeStreamReadiness() {
    return apiRequest<{ stream: any; executionLocked: boolean }>('/api/brokers/flattrade/stream-readiness');
  },

  async getFlattradeInstrumentMasterStatus() {
    return apiRequest<{ status: any; executionLocked: boolean }>('/api/brokers/flattrade/instrument-master/status');
  },

  async getFlattradeOrderHistory(orderId: string) {
    return apiRequest<{ history: any[]; executionLocked: boolean }>(`/api/brokers/flattrade/orders/${encodeURIComponent(orderId)}/history`);
  },

  async getFlattradeGttOrders() {
    return apiRequest<{ gtt: { pending: any[]; enabled: any[] }; executionLocked: boolean }>('/api/brokers/flattrade/gtt');
  },

  async getFlattradeOrderMargin(input: Record<string, string | number>) {
    return apiRequest<{ margin: any; executionLocked: boolean }>('/api/brokers/flattrade/order-margin', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getBrokerFunds(broker: string = 'upstox') {
    return apiRequest<{ funds: any }>(`/api/exchange/funds?broker=${encodeURIComponent(broker)}`);
  },

  async getBrokerPositions(broker: string = 'upstox') {
    return apiRequest<{ positions: any[] }>(`/api/exchange/positions?broker=${encodeURIComponent(broker)}`);
  },

  async getBrokerHoldings(broker: string = 'upstox') {
    return apiRequest<{ holdings: any[] }>(`/api/exchange/holdings?broker=${encodeURIComponent(broker)}`);
  },

  async getBrokerOpenOrders(broker: string = 'upstox') {
    return apiRequest<{ broker: string; orders: any[] }>(`/api/exchange/open-orders?broker=${encodeURIComponent(broker)}`);
  },

  async getBrokerTrades(broker: string = 'upstox') {
    return apiRequest<{ broker: string; trades: any[] }>(`/api/exchange/trades?broker=${encodeURIComponent(broker)}`);
  },

  async getBrokerReadiness(broker: string) {
    return apiRequest<{ readiness: any; capabilities: any }>(`/api/brokers/${encodeURIComponent(broker)}/readiness`);
  },

  async getBrokerInstruments(broker: 'kotak_neo' | 'flattrade', query?: string) {
    const suffix = query?.trim() ? `?query=${encodeURIComponent(query.trim())}` : '';
    return apiRequest<{ broker: string; executionLocked: boolean; instruments: any[] }>(`/api/brokers/${broker}/instruments${suffix}`);
  },

  async getExchangeListenKey() {
    return apiRequest<{ listenKey: string }>('/api/exchange/listen-key', { method: 'POST' });
  },

  async getAuditEvents() {
    return apiRequest('/api/audit/events');
  },

  async getOperationalHealth() {
    return apiRequest<{ success: boolean; report: any }>('/api/operational/health');
  },

  async freezeKillSwitch(params: { scope: 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'; target?: string; reason: string }) {
    return apiRequest('/api/operational/kill-switch/freeze', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async unfreezeKillSwitch(params: { scope: 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'; target?: string; reason: string }) {
    return apiRequest('/api/operational/kill-switch/unfreeze', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async triggerReconciliation() {
    return apiRequest('/api/operational/reconciliation/run', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // --- AUTONOMOUS QUANT PILOT DUAL-MODE DAEMON CLIENT ---
  async getPilotState() {
    return apiRequest<{
      success: boolean;
      enabled: boolean;
      executionMode: 'full_autonomous' | 'semi_autonomous';
      profile: string;
      dailyStartingValue: number;
      riskPerTradePct: number;
      circuitBreakerTripped: boolean;
      circuitBreakerReason?: string;
      executionModeStatus: 'BROWSER_LINKED' | 'CLOUD_HEADLESS';
      lastClientHeartbeatAt: number;
      lastServerRunAt: number;
      activeFleet: Record<string, any>;
      actionLogs: any[];
      isMarketOpen: boolean;
      marketSession: string;
      tokenStatus?: string;
    }>('/api/pilot/state');
  },

  async updatePilotConfig(updates: {
    enabled?: boolean;
    executionMode?: 'full_autonomous' | 'semi_autonomous';
    profile?: string;
    dailyStartingValue?: number;
    riskPerTradePct?: number;
    resetCircuitBreaker?: boolean;
  }) {
    return apiRequest<{ success: boolean; [key: string]: any }>('/api/pilot/config', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  },

  async sendPilotHeartbeat() {
    return apiRequest<{ success: boolean; mode: 'BROWSER_LINKED'; lastHeartbeat: number }>(
      '/api/pilot/heartbeat',
      {
        method: 'POST',
        body: JSON.stringify({ active: true }),
      }
    );
  },

  async triggerPilotSweep() {
    return apiRequest<{ success: boolean; sweep: any }>('/api/pilot/sweep', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
