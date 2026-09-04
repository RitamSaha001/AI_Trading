import { describe, it, expect, beforeEach } from 'vitest';
import { ServerAuthService } from '../services/authService';
import { getDb } from '../db';

describe('Server Authentication & Identity Service', () => {
  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM sessions`);
    await db.execute(`DELETE FROM kyc_records`);
    await db.execute(`DELETE FROM account_limits`);
    await db.execute(`DELETE FROM users`);
  });

  it('verifies provider token and creates a database user with Tier 0 unverified status', async () => {
    const token = 'test_google_token:trader@lumen.io';
    const verified = await ServerAuthService.verifyGoogleIdToken(token);
    expect(verified.email).toBe('trader@lumen.io');

    const user = await ServerAuthService.getOrCreateUser({
      email: verified.email,
      displayName: verified.name || 'Ritam',
      photoUrl: verified.picture,
      provider: 'google',
      providerId: verified.sub,
    });

    expect(user.id.startsWith('usr_goo_')).toBe(true);
    expect(user.email).toBe('trader@lumen.io');
    expect(user.kycTier).toBe('tier0_unverified'); // Non-negotiable: never fabricated as tier 2!
    expect(user.kycStatus).toBe('unverified');
    expect(user.accountMode).toBe('paper');
    expect(user.isEmergencyFrozen).toBe(false);
  });

  it('creates cryptographic session tokens and validates them via SHA-256 database hashes', async () => {
    const user = await ServerAuthService.getOrCreateUser({
      email: 'test@lumen.io',
      displayName: 'Test User',
      provider: 'email',
      providerId: 'email_test',
    });

    const session = await ServerAuthService.createSession(user.id, 'TestRunner/1.0', '127.0.0.1');
    expect(session.rawToken.length).toBe(64); // 32 bytes hex
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    // Validate raw session token
    const authenticated = await ServerAuthService.validateSession(session.rawToken);
    expect(authenticated).not.toBeNull();
    expect(authenticated?.id).toBe(user.id);
    expect(authenticated?.email).toBe('test@lumen.io');

    // Revocation works
    await ServerAuthService.revokeSession(session.rawToken);
    const postRevoke = await ServerAuthService.validateSession(session.rawToken);
    expect(postRevoke).toBeNull();
  });

  it('executes server emergency freeze, halts access, and revokes active sessions', async () => {
    const user = await ServerAuthService.getOrCreateUser({
      email: 'freeze_me@lumen.io',
      displayName: 'Freeze User',
      provider: 'email',
      providerId: 'email_freeze',
    });

    const session = await ServerAuthService.createSession(user.id);
    expect(await ServerAuthService.validateSession(session.rawToken)).not.toBeNull();

    // Trigger emergency freeze
    await ServerAuthService.emergencyFreezeUser(user.id, 'Suspicious intrusion detected');

    // Session is revoked
    const postFreezeSession = await ServerAuthService.validateSession(session.rawToken);
    expect(postFreezeSession).toBeNull();

    // Re-fetching user shows emergency frozen state
    const db = getDb();
    const limits = await db.queryOne<any>(`SELECT * FROM account_limits WHERE user_id = ?`, [user.id]);
    expect(Boolean(limits.is_emergency_frozen)).toBe(true);
    expect(limits.freeze_reason).toBe('Suspicious intrusion detected');
  });
});
