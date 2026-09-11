import { FlattradeSession } from './flattradeClient';

export type FlattradeStreamHealth = 'DISABLED' | 'READY_FOR_CERTIFICATION' | 'DEGRADED';

export interface FlattradeStreamEvent {
  type: 'ORDER' | 'POSITION' | 'TOUCHLINE' | 'DEPTH' | 'UNKNOWN';
  symbol?: string;
  orderId?: string;
  status?: string;
  raw: Record<string, unknown>;
}

export class FlattradeUserStreamTransport {
  private lastEventAt = 0;
  private health: FlattradeStreamHealth = 'DISABLED';

  constructor(private readonly session: FlattradeSession) {}

  getHealth(): FlattradeStreamHealth {
    return this.health;
  }

  getLastEventAt(): number {
    return this.lastEventAt;
  }

  getCertificationReadiness(): { ready: boolean; reason: string } {
    return {
      ready: false,
      reason: 'Flattrade streaming is implemented for protocol validation only and is disabled until broker-specific certification is complete.',
    };
  }

  buildConnectMessage(): string {
    this.health = 'READY_FOR_CERTIFICATION';
    return JSON.stringify({
      t: 'a',
      uid: this.session.userId,
      actid: this.session.accountId,
      source: 'API',
      accesstoken: this.session.accessToken,
    });
  }

  buildSubscriptionMessage(kind: 'TOUCHLINE' | 'DEPTH' | 'ORDER' | 'POSITION', instruments: string[] = []): string {
    const type = kind === 'TOUCHLINE' ? 't' : kind === 'DEPTH' ? 'd' : kind === 'ORDER' ? 'o' : 'p';
    const payload: Record<string, string> = { t: type };
    if (kind === 'ORDER' || kind === 'POSITION') payload.actid = this.session.accountId;
    if (instruments.length > 0) payload.k = instruments.join('#');
    return JSON.stringify(payload);
  }

  handleMessage(raw: string | Buffer): FlattradeStreamEvent | null {
    try {
      const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
      this.lastEventAt = Date.now();
      const type = String(parsed.t || '').toLowerCase();
      const eventType = type === 'om' || type === 'o' ? 'ORDER'
        : type === 'pm' || type === 'p' ? 'POSITION'
          : type === 'tk' || type === 'tf' ? 'TOUCHLINE'
            : type === 'dk' || type === 'df' ? 'DEPTH' : 'UNKNOWN';
      this.health = 'READY_FOR_CERTIFICATION';
      return {
        type: eventType,
        symbol: typeof parsed.tsym === 'string' ? parsed.tsym : undefined,
        orderId: typeof parsed.norenordno === 'string' ? parsed.norenordno : undefined,
        status: typeof parsed.status === 'string' ? parsed.status : undefined,
        raw: parsed,
      };
    } catch {
      this.health = 'DEGRADED';
      return null;
    }
  }
}
