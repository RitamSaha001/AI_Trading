/**
 * Lumen Multi-Dimensional Readiness Service
 * Evaluates 7 discrete operational dimensions to ensure zero false readiness:
 * 1. APPLICATION_READY: Process liveness and graceful shutdown state
 * 2. DB_READY: Database connectivity, engine compliance (Postgres in prod), and migration freshness
 * 3. UPSTOX_AUTH_READY: Upstox API credentials and OAuth configuration
 * 4. INSTRUMENTS_READY: BOD instrument master cache freshness and validity
 * 5. QUOTE_SERVICE_READY: Market data quote feed registration and connectivity
 * 6. STATIC_IP_READY: Outbound public IP verification against Upstox registered IPs
 * 7. LIVE_EXECUTION_READY: Live trading gate evaluation (strictly false if UPSTOX_LIVE_TRADING_ENABLED=false)
 */

import { config } from '../config';
import { getDb, getMigrationStatus } from '../db';
import { BrokerRegistry, UpstoxClient } from './brokers';
import { UpstoxInstrumentMasterService } from './brokers/upstox/upstoxInstrumentMasterService';

export interface ReadinessDimensionStatus {
  ready: boolean;
  status: 'READY' | 'DEGRADED' | 'DOWN' | 'DISABLED';
  detail?: string;
}

export interface MultiDimensionalReadinessReport {
  status: 'READY' | 'DOWN';
  ready: boolean;
  operationalState: 'HEALTHY' | 'READY' | 'BROKER_READY' | 'LIVE_TRADING_READY' | 'DOWN';
  env: string;
  engine: string;
  schemaVersion: number;
  dimensions: {
    APPLICATION_READY: ReadinessDimensionStatus;
    DB_READY: ReadinessDimensionStatus;
    UPSTOX_AUTH_READY: ReadinessDimensionStatus;
    INSTRUMENTS_READY: ReadinessDimensionStatus;
    QUOTE_SERVICE_READY: ReadinessDimensionStatus;
    STATIC_IP_READY: ReadinessDimensionStatus;
    LIVE_EXECUTION_READY: ReadinessDimensionStatus;
  };
  issues: string[];
  timestamp: number;
}

export class ReadinessService {
  public static async evaluateReadiness(isShuttingDown: boolean): Promise<MultiDimensionalReadinessReport> {
    const issues: string[] = [];
    const timestamp = Date.now();

    // 1. APPLICATION_READY
    const appReady: ReadinessDimensionStatus = {
      ready: !isShuttingDown,
      status: isShuttingDown ? 'DOWN' : 'READY',
      detail: isShuttingDown ? 'Server is currently shutting down' : 'Server is active and accepting requests',
    };
    if (isShuttingDown) issues.push('Server is currently shutting down');

    // 2. DB_READY
    let dbReady: ReadinessDimensionStatus = { ready: false, status: 'DOWN' };
    let engine = 'unknown';
    let schemaVersion = 0;

    try {
      const db = getDb();
      engine = db.getEngine();
      await db.queryOne('SELECT 1 as ping');

      if (config.NODE_ENV === 'production' && !db.isPostgres()) {
        dbReady = {
          ready: false,
          status: 'DOWN',
          detail: 'Production mode strictly requires a PostgreSQL database instance',
        };
        issues.push(dbReady.detail!);
      } else {
        const migStatus = await getMigrationStatus(db);
        schemaVersion = migStatus.latestVersion;
        if (!migStatus.isUpToDate) {
          dbReady = {
            ready: false,
            status: 'DOWN',
            detail: `Database schema is not at expected migration version (pending: ${migStatus.pending.join(', ')})`,
          };
          issues.push(dbReady.detail!);
        } else {
          dbReady = {
            ready: true,
            status: 'READY',
            detail: `Database healthy (${engine}, schema v${schemaVersion})`,
          };
        }
      }
    } catch (err: any) {
      dbReady = {
        ready: false,
        status: 'DOWN',
        detail: `Database ping failed: ${err.message}`,
      };
      issues.push(dbReady.detail!);
    }

    // 3. UPSTOX_AUTH_READY
    const upstoxConfigured = Boolean(config.UPSTOX_API_KEY && config.UPSTOX_API_SECRET);
    let hasActiveSession = false;
    try {
      const db = getDb();
      const credRow = await db.queryOne<{ access_token: string; updated_at: number }>(
        `SELECT access_token, updated_at FROM broker_credentials WHERE broker = 'upstox' ORDER BY updated_at DESC LIMIT 1`
      );
      // Session is active if token exists and was updated within last 24 hours
      hasActiveSession = Boolean(credRow?.access_token && (Date.now() - (credRow?.updated_at || 0)) < 86400000);
    } catch {
      // DB not available — auth not ready
    }
    const upstoxAuthReady: ReadinessDimensionStatus = {
      ready: upstoxConfigured && hasActiveSession,
      status: hasActiveSession ? 'READY' : (upstoxConfigured ? 'DEGRADED' : 'NOT_CONFIGURED'),
      detail: hasActiveSession
        ? 'Upstox OAuth session active'
        : upstoxConfigured
          ? 'API credentials configured but no active OAuth session'
          : 'Upstox API credentials not configured',
    };

    // 4. INSTRUMENTS_READY
    const instrumentStatus = UpstoxInstrumentMasterService.getMasterStatus();
    const instrumentFresh = instrumentStatus.isFresh;
    const instrumentsReady: ReadinessDimensionStatus = {
      ready: instrumentFresh || config.NODE_ENV !== 'production',
      status: instrumentFresh ? 'READY' : (config.NODE_ENV === 'production' ? 'DEGRADED' : 'READY'),
      detail: instrumentFresh
        ? 'Instrument master snapshot fresh and verified'
        : 'Instrument master snapshot missing or stale (acceptable in sandbox/dev)',
    };

    // 5. QUOTE_SERVICE_READY
    const upstoxBroker = BrokerRegistry.get('upstox');
    const quoteReady = Boolean(upstoxBroker) && hasActiveSession;
    const quoteServiceReady: ReadinessDimensionStatus = {
      ready: quoteReady,
      status: quoteReady ? 'READY' : (upstoxBroker ? 'DEGRADED' : 'UNAVAILABLE'),
      detail: quoteReady
        ? 'Broker quote adapter registered with active session'
        : upstoxBroker
          ? 'Broker registered but no active OAuth session for quote retrieval'
          : 'No broker registered in BrokerRegistry',
    };

    // 6. STATIC_IP_READY
    let staticIpReady: ReadinessDimensionStatus = { ready: true, status: 'READY' };
    try {
      const ipDiag = await UpstoxClient.checkOutboundIp(false);
      if (ipDiag.status === 'FAIL') {
        staticIpReady = {
          ready: false,
          status: 'DOWN',
          detail: ipDiag.error || 'Outbound IP mismatch against registered Upstox IPs',
        };
        if (config.NODE_ENV === 'production') {
          issues.push(staticIpReady.detail!);
        }
      } else {
        staticIpReady = {
          ready: true,
          status: 'READY',
          detail: `Outbound IP ${ipDiag.outboundIp || 'sandbox'} verified (${ipDiag.verificationMode})`,
        };
      }
    } catch (err: any) {
      staticIpReady = {
        ready: config.NODE_ENV !== 'production',
        status: config.NODE_ENV === 'production' ? 'DOWN' : 'DEGRADED',
        detail: `IP diagnostic probe failed: ${err.message}`,
      };
    }

    // 7. LIVE_EXECUTION_READY
    const liveTradingEnabled = Boolean(config.UPSTOX_LIVE_TRADING_ENABLED);
    const liveExecutionReady: ReadinessDimensionStatus = {
      ready: false, // Default safety invariant
      status: liveTradingEnabled ? 'READY' : 'DISABLED',
      detail: liveTradingEnabled
        ? 'Live trading safety gate disengaged'
        : 'LIVE_TRADING_DISABLED_BY_SAFETY_GATE (UPSTOX_LIVE_TRADING_ENABLED=false)',
    };

    if (
      liveTradingEnabled &&
      appReady.ready &&
      dbReady.ready &&
      upstoxAuthReady.ready &&
      instrumentsReady.ready &&
      quoteServiceReady.ready &&
      staticIpReady.ready
    ) {
      liveExecutionReady.ready = true;
    }

    // Overall readiness is determined by core infrastructure (APP + DB + schema)
    const overallReady = appReady.ready && dbReady.ready;

    let operationalState: 'HEALTHY' | 'READY' | 'BROKER_READY' | 'LIVE_TRADING_READY' | 'DOWN' = 'DOWN';
    if (overallReady) {
      if (liveExecutionReady.ready) {
        operationalState = 'LIVE_TRADING_READY';
      } else if (quoteServiceReady.ready && upstoxAuthReady.ready && instrumentsReady.ready) {
        operationalState = 'BROKER_READY';
      } else {
        operationalState = 'READY';
      }
    }

    return {
      status: overallReady ? 'READY' : 'DOWN',
      ready: overallReady,
      operationalState,
      env: config.NODE_ENV,
      engine,
      schemaVersion,
      dimensions: {
        APPLICATION_READY: appReady,
        DB_READY: dbReady,
        UPSTOX_AUTH_READY: upstoxAuthReady,
        INSTRUMENTS_READY: instrumentsReady,
        QUOTE_SERVICE_READY: quoteServiceReady,
        STATIC_IP_READY: staticIpReady,
        LIVE_EXECUTION_READY: liveExecutionReady,
      },
      issues,
      timestamp,
    };
  }
}
