import { getDb } from '../db';
import { config } from '../config';
import { AuditService } from './auditService';
import * as jose from 'jose';
import crypto from 'node:crypto';

const GOOGLE_JWKS = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = jose.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  provider: 'google' | 'apple' | 'email';
  providerId: string;
  kycTier: string;
  kycStatus: string;
  accountMode: string;
  isEmergencyFrozen: boolean;
  createdAt: number;
}

export class ServerAuthService {
  /**
   * Hashes a raw session token using SHA-256 for secure database storage.
   */
  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Verifies Google Identity Services ID token cryptographically against Google's public JWKS.
   */
  static async verifyGoogleIdToken(idToken: string): Promise<{
    email: string;
    sub: string;
    name?: string;
    picture?: string;
    emailVerified: boolean;
  }> {
    // In test environment, support deterministic test tokens
    if (config.NODE_ENV === 'test' && idToken.startsWith('test_google_token:')) {
      const email = idToken.split(':')[1] || 'test_user@lumen.io';
      return {
        email,
        sub: `google_test_${crypto.createHash('md5').update(email).digest('hex')}`,
        name: 'Test Investor',
        picture: 'https://lh3.googleusercontent.com/a/default',
        emailVerified: true,
      };
    }

    try {
      const { payload } = await jose.jwtVerify(idToken, GOOGLE_JWKS, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: config.GOOGLE_CLIENT_ID,
      });

      if (!payload.email || typeof payload.email !== 'string') {
        throw new Error('Google ID token does not contain an email address');
      }

      return {
        email: payload.email,
        sub: payload.sub as string,
        name: (payload.name as string) || payload.email.split('@')[0],
        picture: payload.picture as string | undefined,
        emailVerified: Boolean(payload.email_verified),
      };
    } catch (err: any) {
      throw new Error(`Google token validation failed: ${err.message}`);
    }
  }

  /**
   * Verifies Sign in with Apple identity token cryptographically against Apple's public JWKS.
   */
  static async verifyAppleIdToken(idToken: string, nonce?: string): Promise<{
    email?: string;
    sub: string;
    emailVerified?: boolean;
    isPrivateEmail?: boolean;
  }> {
    // In test environment, support deterministic test tokens
    if (config.NODE_ENV === 'test' && idToken.startsWith('test_apple_token:')) {
      const email = idToken.split(':')[1] || 'r.saha.trading@privaterelay.appleid.com';
      return {
        email,
        sub: `apple_test_${crypto.createHash('md5').update(email).digest('hex')}`,
        emailVerified: true,
        isPrivateEmail: email.includes('privaterelay.appleid.com'),
      };
    }

    try {
      const { payload } = await jose.jwtVerify(idToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: config.APPLE_CLIENT_ID,
      });

      if (nonce && payload.nonce !== nonce) {
        throw new Error('Apple identity token nonce mismatch');
      }

      const email = payload.email as string | undefined;

      return {
        email,
        sub: payload.sub as string,
        emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
        isPrivateEmail: payload.is_private_email === 'true' || payload.is_private_email === true,
      };
    } catch (err: any) {
      throw new Error(`Apple token validation failed: ${err.message}`);
    }
  }

  /**
   * Finds or provisions an internal user and sets up KYC and risk records in an ACID transaction.
   */
  static async getOrCreateUser(params: {
    email: string;
    displayName: string;
    photoUrl?: string;
    provider: 'google' | 'apple' | 'email';
    providerId: string;
  }): Promise<AuthenticatedUser> {
    const db = getDb();
    const cleanEmail = params.email.trim().toLowerCase();

    return db.transaction(async (tx) => {
      let user = await tx.queryOne<any>(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
      const now = Date.now();

      if (!user) {
        const userId = `usr_${params.provider.slice(0, 3)}_${crypto.randomBytes(8).toString('hex')}`;
        await tx.execute(
          `INSERT INTO users (id, email, display_name, photo_url, provider, provider_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, cleanEmail, params.displayName, params.photoUrl || null, params.provider, params.providerId, now, now]
        );

        // Provision KYC record (Default: Tier 0 Unverified)
        const kycId = `kyc_${crypto.randomBytes(8).toString('hex')}`;
        await tx.execute(
          `INSERT INTO kyc_records (id, user_id, tier, status, country, updated_at)
           VALUES (?, ?, 'tier0_unverified', 'unverified', 'IN', ?)`,
          [kycId, userId, now]
        );

        // Provision Account Limits & Risk Policies
        const limitsId = `lim_${crypto.randomBytes(8).toString('hex')}`;
        await tx.execute(
          `INSERT INTO account_limits (id, user_id, account_mode, is_emergency_frozen, updated_at)
           VALUES (?, ?, 'paper', 0, ?)`,
          [limitsId, userId, now]
        );

        user = await tx.queryOne<any>(`SELECT * FROM users WHERE id = ?`, [userId]);

        await AuditService.logEvent({
          userId,
          eventType: 'USER_REGISTERED',
          source: 'auth_service',
          actor: 'user',
          metadata: { provider: params.provider, email: cleanEmail },
          result: 'SUCCESS',
        });
      }

      // Fetch user profile with KYC and Limits
      const kyc = await tx.queryOne<any>(`SELECT * FROM kyc_records WHERE user_id = ?`, [user.id]);
      const limits = await tx.queryOne<any>(`SELECT * FROM account_limits WHERE user_id = ?`, [user.id]);

      return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        photoUrl: user.photo_url,
        provider: user.provider,
        providerId: user.provider_id,
        kycTier: kyc?.tier || 'tier0_unverified',
        kycStatus: kyc?.status || 'unverified',
        accountMode: limits?.account_mode || 'paper',
        isEmergencyFrozen: Boolean(limits?.is_emergency_frozen),
        createdAt: Number(user.created_at),
      };
    });
  }

  /**
   * Creates a cryptographically random session token and stores its SHA-256 hash.
   */
  static async createSession(
    userId: string,
    deviceInfo = 'Browser/Desktop',
    ipAddress = '127.0.0.1'
  ): Promise<{ rawToken: string; expiresAt: number; sessionId: string }> {
    const db = getDb();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const sessionId = `ses_${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    await db.execute(
      `INSERT INTO sessions (id, user_id, token_hash, device_info, ip_address, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, userId, tokenHash, deviceInfo, ipAddress, expiresAt, now]
    );

    await AuditService.logEvent({
      userId,
      eventType: 'AUTH_SESSION_CREATED',
      source: 'auth_service',
      actor: 'user',
      metadata: { sessionId, deviceInfo, ipAddress },
      result: 'SUCCESS',
    });

    return { rawToken, expiresAt, sessionId };
  }

  /**
   * Validates a session token and returns the current user record.
   */
  static async validateSession(rawToken: string): Promise<AuthenticatedUser | null> {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const db = getDb();
    const tokenHash = this.hashToken(rawToken);

    const session = await db.queryOne<any>(
      `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash]
    );

    if (!session) return null;
    if (Number(session.expires_at) < Date.now()) {
      return null;
    }

    const user = await db.queryOne<any>(`SELECT * FROM users WHERE id = ?`, [session.user_id]);
    if (!user) return null;

    const kyc = await db.queryOne<any>(`SELECT * FROM kyc_records WHERE user_id = ?`, [user.id]);
    const limits = await db.queryOne<any>(`SELECT * FROM account_limits WHERE user_id = ?`, [user.id]);

    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      photoUrl: user.photo_url,
      provider: user.provider,
      providerId: user.provider_id,
      kycTier: kyc?.tier || 'tier0_unverified',
      kycStatus: kyc?.status || 'unverified',
      accountMode: limits?.account_mode || 'paper',
      isEmergencyFrozen: Boolean(limits?.is_emergency_frozen),
      createdAt: Number(user.created_at),
    };
  }

  /**
   * Revokes a session token.
   */
  static async revokeSession(rawToken: string): Promise<void> {
    const db = getDb();
    const tokenHash = this.hashToken(rawToken);
    await db.execute(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ?`, [Date.now(), tokenHash]);
  }

  /**
   * Emergency freeze: locks account, rejects future orders, and revokes all active sessions.
   */
  static async emergencyFreezeUser(userId: string, reason = 'User triggered emergency freeze'): Promise<void> {
    const db = getDb();
    const now = Date.now();

    await db.transaction(async (tx) => {
      await tx.execute(
        `UPDATE account_limits SET is_emergency_frozen = 1, frozen_at = ?, freeze_reason = ?, updated_at = ? WHERE user_id = ?`,
        [now, reason, now, userId]
      );
      await tx.execute(`UPDATE sessions SET revoked_at = ? WHERE user_id = ?`, [now, userId]);
    });

    await AuditService.logEvent({
      userId,
      eventType: 'EMERGENCY_FREEZE',
      source: 'auth_service',
      actor: 'user',
      metadata: { reason },
      result: 'SUCCESS',
    });
  }
}
