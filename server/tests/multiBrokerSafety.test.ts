import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../index';
import { BrokerRegistry } from '../services/brokers/brokerRegistry';
import { getDb, initDb } from '../db';
import { ServerAuthService } from '../services/authService';
import { FlattradeAdapter } from '../services/brokers/flattrade/flattradeAdapter';
import { FlattradeClient } from '../services/brokers/flattrade/flattradeClient';
import { KotakNeoAdapter } from '../services/brokers/kotakNeo/kotakNeoAdapter';
import { KotakNeoClient } from '../services/brokers/kotakNeo/kotakNeoClient';
import { BrokerInstrumentCatalogService } from '../services/brokers/shared/brokerInstrumentCatalogService';

function response(data: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe('Kotak Neo and Flattrade guarded broker integration', () => {
  afterEach(() => {
    KotakNeoClient.resetForTesting();
    FlattradeClient.resetForTesting();
    BrokerRegistry.resetForTesting();
    vi.restoreAllMocks();
  });

  it('registers both brokers behind their explicit IDs', () => {
    expect(BrokerRegistry.get('kotak_neo')).toBeInstanceOf(KotakNeoAdapter);
    expect(BrokerRegistry.get('flattrade')).toBeInstanceOf(FlattradeAdapter);
    expect(() => BrokerRegistry.get('unregistered-broker')).toThrow(/not registered/i);
  });

  it('sends Kotak limits requests with documented session headers', async () => {
    const transport = vi.fn(async (url: string, options: any) => {
      expect(url).toBe('https://mis.kotaksecurities.com/quick/user/limits');
      expect(options.method).toBe('GET');
      expect(options.headers).toMatchObject({ Authorization: 'consumer-key', Sid: 'sid-value', Auth: 'trade-token' });
      return response({ stat: 'Ok', data: { Net: '10000', MarginUsed: '0' } });
    });
    KotakNeoClient.setTransport(transport);

    const result = await KotakNeoClient.getLimits({ consumerKey: 'consumer-key', sid: 'sid-value', sessionToken: 'trade-token', ucc: 'UCC1' });
    expect(result.data.Net).toBe('10000');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('encodes Flattrade requests as jData and jKey', async () => {
    const transport = vi.fn(async (url: string, options: any) => {
      expect(url).toBe('https://piconnect.flattrade.in/PiConnectAPI/Limits');
      expect(options.body).toContain('jData=');
      expect(options.body).toContain('jKey=daily-token');
      return response({ stat: 'Ok', cash: '10000', marginused: '0' });
    });
    FlattradeClient.setTransport(transport);

    const result = await FlattradeClient.getLimits({ accessToken: 'daily-token', userId: 'FT1', accountId: 'FT1' });
    expect(result.stat).toBe('Ok');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('enforces Flattrade’s documented 10 order requests per second cap', async () => {
    FlattradeClient.setTransport(async () => response({ stat: 'Ok', norenordno: 'order-1' }));
    const session = { accessToken: 'daily-token', userId: 'FT1', accountId: 'FT1' };
    const order = { exch: 'NSE', tsym: 'RELIANCE-EQ', qty: '1', prc: '100', prd: 'C', trantype: 'B', prctyp: 'LMT', ret: 'DAY' };

    await Promise.all(Array.from({ length: 10 }, () => FlattradeClient.placeOrder(session, order)));
    await expect(FlattradeClient.placeOrder(session, order)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('keeps both new broker adapters structurally unable to place, modify, or cancel an order', async () => {
    const request = {
      userId: 'user-1', broker: 'kotak_neo' as const, symbol: 'RELIANCE-EQ', side: 'BUY' as const,
      type: 'LIMIT', quantity: 1, price: 100, idempotencyKey: 'test-order', accountMode: 'live' as const,
    };
    const kotakPlaceSpy = vi.spyOn(KotakNeoClient, 'placeOrder');
    const flattradePlaceSpy = vi.spyOn(FlattradeClient, 'placeOrder');

    await expect(new KotakNeoAdapter().placeOrder(request)).rejects.toThrow(/execution is disabled/i);
    await expect(new FlattradeAdapter().placeOrder({ ...request, broker: 'flattrade' })).rejects.toThrow(/execution is locked/i);
    await expect(new KotakNeoAdapter().cancelOrder('user-1', 'order-1')).rejects.toThrow(/execution is disabled/i);

    expect(kotakPlaceSpy).not.toHaveBeenCalled();
    expect(flattradePlaceSpy).not.toHaveBeenCalled();
  });

  it('bootstraps broker-specific reference symbols as non-execution-eligible catalog entries', async () => {
    await initDb();
    await getDb().execute("DELETE FROM broker_instruments WHERE broker IN ('kotak_neo', 'flattrade')");

    const imported = await BrokerInstrumentCatalogService.bootstrapReferenceEquities('kotak_neo');
    const instruments = await BrokerInstrumentCatalogService.list('kotak_neo', { query: 'RELIANCE' });

    expect(imported).toBeGreaterThan(0);
    expect(instruments).toHaveLength(1);
    expect(instruments[0]).toMatchObject({
      instrumentKey: 'nse_cm|RELIANCE-EQ',
      tradingSymbol: 'RELIANCE-EQ',
      executionEligible: false,
      source: 'REFERENCE_MAPPING',
    });

    const derivatives = await BrokerInstrumentCatalogService.list('kotak_neo', { query: 'NIFTY_FUT' });
    expect(derivatives.find((instrument) => instrument.instrumentKey === 'nse_fo|NIFTY_FUT')).toMatchObject({
      instrumentKey: 'nse_fo|NIFTY_FUT',
      segment: 'nse_fo',
      instrumentType: 'FUT',
      executionEligible: false,
    });
  });

  it('exposes a complete read-only lifecycle while refusing order proposals before they reach a broker', async () => {
    await initDb();
    const user = await ServerAuthService.getOrCreateUser({
      email: `multibroker-${Date.now()}@lumen.test`, displayName: 'Multi Broker Test', provider: 'email', providerId: `multi-${Date.now()}`,
    });
    const session = await ServerAuthService.createSession(user.id, '127.0.0.1', 'Vitest');
    const server = buildServer();

    const readinessResponse = await server.inject({
      method: 'GET', url: '/api/brokers/kotak_neo/readiness', cookies: { lumen_session: session.rawToken },
    });
    expect(readinessResponse.statusCode).toBe(200);
    expect(JSON.parse(readinessResponse.body).readiness).toMatchObject({ state: 'NOT_CONNECTED', executionEnabled: false });

    const [ordersResponse, tradesResponse] = await Promise.all([
      server.inject({ method: 'GET', url: '/api/exchange/open-orders?broker=flattrade', cookies: { lumen_session: session.rawToken } }),
      server.inject({ method: 'GET', url: '/api/exchange/trades?broker=flattrade', cookies: { lumen_session: session.rawToken } }),
    ]);
    expect(JSON.parse(ordersResponse.body).orders).toEqual([]);
    expect(JSON.parse(tradesResponse.body).trades).toEqual([]);

    const proposalResponse = await server.inject({
      method: 'POST', url: '/api/orders/propose', cookies: { lumen_session: session.rawToken },
      payload: { broker: 'flattrade', symbol: 'RELIANCE-EQ', side: 'BUY', type: 'LIMIT', quantity: 1, price: 100, product: 'CNC' },
    });
    expect(proposalResponse.statusCode).toBe(409);
    expect(JSON.parse(proposalResponse.body)).toMatchObject({ code: 'BROKER_EXECUTION_LOCKED' });
  });
});
