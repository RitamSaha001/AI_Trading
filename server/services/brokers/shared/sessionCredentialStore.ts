import crypto from 'node:crypto';
import { getDb } from '../../../db';
import { UpstoxAdapter } from '../upstox/upstoxAdapter';

export interface StoredBrokerSession<T extends Record<string, unknown> = Record<string, unknown>> {
  session: T;
  environment: 'sandbox' | 'production';
  accountId: string;
  accountName?: string;
  canTrade: boolean;
  expiresAt: number;
}

export class SessionCredentialStore {
  static async save<T extends Record<string, unknown>>(
    userId: string,
    broker: string,
    details: StoredBrokerSession<T>,
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const encryptedSession = UpstoxAdapter.encryptSecret(JSON.stringify(details.session));

    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, account_name, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'session_token', ?, ?, ?, ?, ?, FALSE, TRUE, ?, ?, ?)
      ON CONFLICT(user_id, broker, environment) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        account_id = excluded.account_id,
        account_name = excluded.account_name,
        can_trade = excluded.can_trade,
        can_withdraw = excluded.can_withdraw,
        is_safe = excluded.is_safe,
        last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at`,
      [
        `cred_${broker}_${userId}_${crypto.randomUUID()}`,
        userId,
        broker,
        details.environment,
        encryptedSession,
        details.expiresAt,
        details.accountId,
        details.accountName || null,
        details.canTrade,
        now,
        now,
        now,
      ],
    );
  }

  static async load<T extends Record<string, unknown>>(
    userId: string,
    broker: string,
  ): Promise<StoredBrokerSession<T> | null> {
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT * FROM broker_credentials
       WHERE user_id = ? AND broker = ?
       ORDER BY updated_at DESC LIMIT 1`,
      [userId, broker],
    );
    if (!row?.access_token_encrypted || Number(row.token_expires_at || 0) <= Date.now()) return null;

    try {
      return {
        session: JSON.parse(UpstoxAdapter.decryptSecret(row.access_token_encrypted)) as T,
        environment: row.environment === 'production' ? 'production' : 'sandbox',
        accountId: row.account_id || '',
        accountName: row.account_name || undefined,
        canTrade: Boolean(row.can_trade),
        expiresAt: Number(row.token_expires_at),
      };
    } catch {
      return null;
    }
  }

  static async remove(userId: string, broker: string): Promise<void> {
    await getDb().execute('DELETE FROM broker_credentials WHERE user_id = ? AND broker = ?', [userId, broker]);
  }
}
