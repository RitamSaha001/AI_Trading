import { BinanceGateway } from './binanceGateway';
import { ReconciliationWorker } from './reconciliationWorker';
import { CircuitBreakerService } from './circuitBreakerService';
import { AuditService, logger } from './auditService';
import { config } from '../config';

export type StreamHealthState = 'ACTIVE' | 'UNHEALTHY' | 'DISCONNECTED' | 'RECONNECTING';

export interface UserStreamSession {
  userId: string;
  listenKey: string;
  createdAt: number;
  lastKeepAliveAt: number;
  status: StreamHealthState;
  reconnectAttempts: number;
}

export class UserDataStreamManager {
  private static sessions: Map<string, UserStreamSession> = new Map();
  private static keepAliveTimer: NodeJS.Timeout | null = null;
  private static readonly KEEP_ALIVE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Initializes or refreshes a user data stream listenKey.
   */
  static async acquireListenKey(userId: string): Promise<string | null> {
    const creds = await BinanceGateway.getCredentials(userId);
    if (!creds) {
      logger.warn(`[UserDataStreamManager] No credentials found for user ${userId}`);
      return null;
    }

    if (
      process.env.NODE_ENV === 'test' ||
      config.NODE_ENV === 'test' ||
      creds.apiKey.startsWith('test_') ||
      creds.apiKey.startsWith('mock_') ||
      creds.apiKey.startsWith('binance_test_')
    ) {
      const mockKey = `test_listen_key_${userId.slice(0, 8)}_${Date.now()}`;
      this.sessions.set(userId, {
        userId,
        listenKey: mockKey,
        createdAt: Date.now(),
        lastKeepAliveAt: Date.now(),
        status: 'ACTIVE',
        reconnectAttempts: 0,
      });
      return mockKey;
    }

    const baseUrl = creds.environment === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com';

    try {
      const res = await fetch(`${baseUrl}/api/v3/userDataStream`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': creds.apiKey },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as { listenKey: string };
      this.sessions.set(userId, {
        userId,
        listenKey: data.listenKey,
        createdAt: Date.now(),
        lastKeepAliveAt: Date.now(),
        status: 'ACTIVE',
        reconnectAttempts: 0,
      });

      logger.info(`[UserDataStreamManager] Acquired listenKey for user ${userId}`);
      return data.listenKey;
    } catch (err: any) {
      logger.error(`[UserDataStreamManager] Failed to acquire listenKey for ${userId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Sends keepalive ping (PUT) to keep the listenKey active.
   */
  static async keepAlive(userId: string): Promise<boolean> {
    const session = this.sessions.get(userId);
    if (!session) return false;

    const creds = await BinanceGateway.getCredentials(userId);
    if (!creds) return false;

    if (
      process.env.NODE_ENV === 'test' ||
      config.NODE_ENV === 'test' ||
      creds.apiKey.startsWith('test_') ||
      creds.apiKey.startsWith('mock_')
    ) {
      session.lastKeepAliveAt = Date.now();
      session.status = 'ACTIVE';
      return true;
    }

    const baseUrl = creds.environment === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com';

    try {
      const res = await fetch(`${baseUrl}/api/v3/userDataStream?listenKey=${encodeURIComponent(session.listenKey)}`, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': creds.apiKey },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      session.lastKeepAliveAt = Date.now();
      session.status = 'ACTIVE';
      return true;
    } catch (err: any) {
      logger.error(`[UserDataStreamManager] Keepalive failed for user ${userId}: ${err.message}`);
      await this.handleLostListenKey(userId, `Keepalive failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Closes the user data stream listenKey on shutdown.
   */
  static async closeStream(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    const creds = await BinanceGateway.getCredentials(userId);
    if (creds && !creds.apiKey.startsWith('mock_') && !creds.apiKey.startsWith('test_')) {
      const baseUrl = creds.environment === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com';
      try {
        await fetch(`${baseUrl}/api/v3/userDataStream?listenKey=${encodeURIComponent(session.listenKey)}`, {
          method: 'DELETE',
          headers: { 'X-MBX-APIKEY': creds.apiKey },
        });
      } catch (err: any) {
        logger.warn(`[UserDataStreamManager] Failed to delete listenKey for user ${userId}: ${err.message}`);
      }
    }

    this.sessions.delete(userId);
  }

  /**
   * Invoked when a listen-key is lost, expired, or rejected.
   */
  static async handleLostListenKey(userId: string, reason: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      session.status = 'UNHEALTHY';
    }

    logger.warn(`[UserDataStreamManager] ListenKey lost for ${userId}: ${reason}. Triggering REST reconciliation.`);

    await CircuitBreakerService.trip(
      'websocket_outage',
      'ACCOUNT',
      userId,
      `UserDataStream listen-key lost: ${reason}`,
      'Re-acquire listen-key and verify REST reconciliation'
    );

    await AuditService.logEvent({
      userId,
      eventType: 'LISTEN_KEY_LOST',
      source: 'user_data_stream_manager',
      actor: 'system',
      metadata: { reason },
      result: 'BLOCKED',
    });

    // Reconcile via REST to catch any missed executions while key was lost
    try {
      await ReconciliationWorker.runReconciliation(userId);
    } catch (err: any) {
      logger.error(`[UserDataStreamManager] Reconciliation failed after lost listen key: ${err.message}`);
    }

    // Re-acquire fresh listenKey
    const freshKey = await this.acquireListenKey(userId);
    if (freshKey) {
      await CircuitBreakerService.reset('websocket_outage', 'ACCOUNT', userId, 'system', 'Acquired replacement key');
    }
  }

  /**
   * Invoked upon WebSocket disconnection.
   */
  static async handleDisconnect(userId: string, reason: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      session.status = 'DISCONNECTED';
      session.reconnectAttempts++;
    }

    logger.warn(`[UserDataStreamManager] User ${userId} WebSocket disconnected: ${reason}`);

    await AuditService.logEvent({
      userId,
      eventType: 'WEBSOCKET_DISCONNECTED',
      source: 'user_data_stream_manager',
      actor: 'system',
      metadata: { reason },
      result: 'BLOCKED',
    });
  }

  /**
   * Invoked upon WebSocket reconnect. Triggers targeted REST reconciliation.
   */
  static async handleReconnect(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      session.status = 'RECONNECTING';
    }

    logger.info(`[UserDataStreamManager] User ${userId} WebSocket reconnected. Performing REST reconciliation.`);

    // Rule 3 & 4: Do not blindly assume nothing was missed. Trigger targeted REST reconciliation.
    const recResult = await ReconciliationWorker.runReconciliation(userId);

    if (session) {
      session.status = recResult.status === 'FAILED' ? 'UNHEALTHY' : 'ACTIVE';
      session.reconnectAttempts = 0;
    }

    await AuditService.logEvent({
      userId,
      eventType: 'WEBSOCKET_RECOVERED',
      source: 'user_data_stream_manager',
      actor: 'system',
      metadata: { reconciliationStatus: recResult.status, mismatches: recResult.mismatchesFound },
      result: 'SUCCESS',
    });
  }

  /**
   * Starts periodic keepalive timer for all active sessions.
   */
  static startKeepAliveLoop(): void {
    if (this.keepAliveTimer) return;
    this.keepAliveTimer = setInterval(async () => {
      for (const [userId] of this.sessions.entries()) {
        await this.keepAlive(userId);
      }
    }, this.KEEP_ALIVE_INTERVAL_MS);
  }

  /**
   * Stops keepalive loop and resets sessions (tests).
   */
  static stop(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.sessions.clear();
  }

  static getSession(userId: string): UserStreamSession | undefined {
    return this.sessions.get(userId);
  }
}
