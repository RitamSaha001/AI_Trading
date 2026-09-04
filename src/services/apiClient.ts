/**
 * Lumen Enterprise Client API Service
 * Connects the frontend application to the authoritative Fastify backend service.
 */

const API_BASE = '';

function getSessionToken(): string | null {
  try {
    const raw = localStorage.getItem('lumen_auth_session_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.token || null;
    }
  } catch {
    // ignore
  }
  return null;
}

async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const token = getSessionToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

export const ApiClient = {
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
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

  async createPaymentIntent(params: {
    amountMinor: number;
    currency: 'USD' | 'INR';
    method: 'card' | 'upi';
    idempotencyKey?: string;
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
    marketQuoteAgeMs: number;
    idempotencyKey?: string;
  }) {
    return apiRequest('/api/orders/submit', {
      method: 'POST',
      body: JSON.stringify(order),
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

  async cancelOrder(clientOrderId: string) {
    return apiRequest('/api/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ clientOrderId }),
    });
  },

  async runReconciliation() {
    return apiRequest('/api/reconciliation/run', { method: 'POST' });
  },

  async connectExchange(creds: { apiKey: string; apiSecret: string; environment: 'testnet' | 'mainnet' }) {
    return apiRequest<{ audit: any; message: string }>('/api/exchange/connect', {
      method: 'POST',
      body: JSON.stringify(creds),
    });
  },

  async disconnectExchange() {
    return apiRequest('/api/exchange/disconnect', { method: 'POST' });
  },

  async getExchangeAccount() {
    return apiRequest<{ account: any }>('/api/exchange/account');
  },

  async getExchangeListenKey() {
    return apiRequest<{ listenKey: string }>('/api/exchange/listen-key', { method: 'POST' });
  },

  async getAuditEvents() {
    return apiRequest('/api/audit/events');
  },
};
