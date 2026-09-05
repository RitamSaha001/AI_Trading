import { getDb } from '../db';
import crypto from 'node:crypto';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
});

export interface AuditEventPayload {
  userId?: string;
  eventType: string;
  source: string;
  correlationId?: string;
  idempotencyKey?: string;
  actor: string; // 'user' | 'system' | 'risk_engine' | 'reconciliation_worker' | 'webhook'
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  externalId?: string;
  metadata?: Record<string, any>;
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  error?: string;
}

export class AuditService {
  /**
   * Records an immutable, append-only institutional audit log entry to the database and structured logger.
   */
  static async logEvent(payload: AuditEventPayload): Promise<string> {
    const db = getDb();
    const eventId = `aud_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = Date.now();
    const correlationId = payload.correlationId || `corr_${crypto.randomBytes(8).toString('hex')}`;

    // Structured JSON log (never log secrets, API keys, private keys, or passwords)
    logger.info({
      eventId,
      eventType: payload.eventType,
      userId: payload.userId,
      actor: payload.actor,
      result: payload.result,
      source: payload.source,
      correlationId,
      metadata: payload.metadata,
      error: payload.error,
    }, `AUDIT: [${payload.eventType}] by ${payload.actor} -> ${payload.result}`);

    try {
      await db.execute(
        `INSERT INTO audit_events (
          id, event_id, user_id, timestamp, event_type, source,
          correlation_id, idempotency_key, actor, before_state,
          after_state, external_id, metadata, result, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          eventId,
          payload.userId || null,
          timestamp,
          payload.eventType,
          payload.source,
          correlationId,
          payload.idempotencyKey || null,
          payload.actor,
          payload.beforeState ? JSON.stringify(payload.beforeState, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : null,
          payload.afterState ? JSON.stringify(payload.afterState, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : null,
          payload.externalId || null,
          payload.metadata ? JSON.stringify(payload.metadata, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : null,
          payload.result,
          payload.error || null,
        ]
      );
    } catch (err: any) {
      logger.error({ err, eventId }, 'CRITICAL: Failed to persist audit event to database');
    }

    return eventId;
  }

  /**
   * Retrieves audit events for a given user or system entity with optional filtering.
   */
  static async getEvents(options: {
    userId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const db = getDb();
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options.eventType) {
      conditions.push('event_type = ?');
      params.push(options.eventType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    params.push(limit, offset);

    return db.query(
      `SELECT * FROM audit_events ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      params
    );
  }
}

export { logger };
