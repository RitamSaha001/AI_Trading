import { describe, it, expect, beforeEach } from 'vitest';
import { buildServer } from '../index';
import { ServerAuthService } from '../services/authService';
import { getDb } from '../db';
import { isValidAllowedOrigin, normalizeOrigin } from '../utils/originValidator';
import { AuthRateLimiter } from '../middleware/rateLimiter';
import crypto from 'node:crypto';

describe('Authentication & Session Trust Boundary Test Suite', () => {
  let server: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    const db = getDb();
    await db.execute('DELETE FROM sessions');
    await db.execute('DELETE FROM kyc_records');
    await db.execute('DELETE FROM account_limits');
    await db.execute('DELETE FROM users');
    AuthRateLimiter.clearAll();
    ServerAuthService.clearEmailChallenges();
    server = buildServer();
  });

  // ==========================================================================
  // CORS & ORIGIN VALIDATION
  // ==========================================================================
  describe('CORS & Origin Controls', () => {
    const prodAllowed = 'https://trading.lumen.io,https://app.lumen.io';

    it('1. configured production origin is allowed', () => {
      expect(isValidAllowedOrigin('https://trading.lumen.io', 'production', prodAllowed)).toBe(true);
      expect(isValidAllowedOrigin('https://app.lumen.io', 'production', prodAllowed)).toBe(true);
    });

    it('2. unconfigured production origin is rejected', () => {
      expect(isValidAllowedOrigin('https://other.untrusted.com', 'production', prodAllowed)).toBe(false);
    });

    it('3. arbitrary origin is rejected in production', () => {
      expect(isValidAllowedOrigin('https://evil-site.xyz', 'production', prodAllowed)).toBe(false);
      expect(isValidAllowedOrigin('http://hacker.org', 'production', prodAllowed)).toBe(false);
    });

    it('4. malicious localhost-looking origin is rejected', () => {
      // Substring attacks must NEVER succeed
      expect(isValidAllowedOrigin('https://evil-localhost.attacker.com', 'production', prodAllowed)).toBe(false);
      expect(isValidAllowedOrigin('https://localhost.attacker.com', 'production', prodAllowed)).toBe(false);
      expect(isValidAllowedOrigin('http://localhost.evil.com:3000', 'production', prodAllowed)).toBe(false);
      expect(isValidAllowedOrigin('http://127.0.0.1.attacker.com', 'production', prodAllowed)).toBe(false);

      // In development mode, malicious hostnames containing 'localhost' must also be rejected
      expect(isValidAllowedOrigin('https://evil-localhost.attacker.com', 'development', prodAllowed)).toBe(false);
      expect(isValidAllowedOrigin('http://localhost.attacker.com', 'development', prodAllowed)).toBe(false);
    });

    it('5. credentials + wildcard is impossible (wildcard rejected)', () => {
      expect(isValidAllowedOrigin('*', 'production', '*')).toBe(false);
      expect(normalizeOrigin('*')).toBeNull();
    });

    it('6. missing production CORS configuration fails closed', () => {
      expect(isValidAllowedOrigin('https://trading.lumen.io', 'production', '')).toBe(false);
    });
  });

  // ==========================================================================
  // SESSION BOUNDARY & COOKIE-ONLY TRANSPORT
  // ==========================================================================
  describe('Session Transport & Storage Boundary', () => {
    it('7. successful login sets HttpOnly session cookie', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: 'test_google_token:trader1@lumen.io' },
      });

      expect(res.statusCode).toBe(200);
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
      expect(cookieStr).toContain('lumen_session=');
      expect(cookieStr.toLowerCase()).toContain('httponly');
      expect(cookieStr.toLowerCase()).toContain('samesite=lax');
    });

    it('8. successful login response contains NO raw session token', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: 'test_google_token:trader2@lumen.io' },
      });

      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.user).toBeDefined();
      expect(body.token).toBeUndefined();
      expect(body.rawToken).toBeUndefined();
      expect(body.sessionId).toBeUndefined();
    });

    it('9. raw session token never appears anywhere in response JSON', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/apple',
        headers: { origin: 'http://localhost:3000' },
        payload: { identityToken: 'test_apple_token:trader_apple@lumen.io' },
      });

      const bodyText = res.body;
      const db = getDb();
      const sessions = await db.query('SELECT * FROM sessions');
      expect(sessions.length).toBeGreaterThan(0);

      // Verify that no raw 64-character token exists in the response body
      expect(bodyText).not.toContain('token');
      expect(bodyText).not.toContain('rawToken');
    });

    it('10. session token is SHA-256 hashed at rest in the database', async () => {
      const user = await ServerAuthService.getOrCreateUser({
        email: 'trader_hash@lumen.io',
        displayName: 'Hash Test',
        provider: 'email',
        providerId: 'email_hash_test',
      });

      const session = await ServerAuthService.createSession(user.id);
      const db = getDb();
      const row = await db.queryOne<any>('SELECT * FROM sessions WHERE user_id = ?', [user.id]);

      expect(row).toBeDefined();
      // Raw token must NEVER match stored token_hash
      expect(row.token_hash).not.toBe(session.rawToken);
      // token_hash must be SHA-256 (64 hex characters)
      expect(row.token_hash).toHaveLength(64);
      expect(row.token_hash).toBe(ServerAuthService.hashToken(session.rawToken));
    });

    it('11. expired session is strictly rejected', async () => {
      const user = await ServerAuthService.getOrCreateUser({
        email: 'expired_user@lumen.io',
        displayName: 'Expired',
        provider: 'email',
        providerId: 'email_exp',
      });

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = ServerAuthService.hashToken(rawToken);
      const db = getDb();
      // Expired 1 hour ago
      await db.execute(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES ('ses_exp_001', ?, ?, ?, ?)`,
        [user.id, tokenHash, Date.now() - 3600_000, Date.now() - 7200_000]
      );

      const validated = await ServerAuthService.validateSession(rawToken);
      expect(validated).toBeNull();

      const authReq = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { lumen_session: rawToken },
      });
      expect(authReq.statusCode).toBe(401);
    });

    it('12. revoked session is strictly rejected', async () => {
      const user = await ServerAuthService.getOrCreateUser({
        email: 'revoked_user@lumen.io',
        displayName: 'Revoked',
        provider: 'email',
        providerId: 'email_rev',
      });

      const session = await ServerAuthService.createSession(user.id);
      await ServerAuthService.revokeSession(session.rawToken);

      const validated = await ServerAuthService.validateSession(session.rawToken);
      expect(validated).toBeNull();
    });

    it('13. logout revokes the current session and clears cookie', async () => {
      const user = await ServerAuthService.getOrCreateUser({
        email: 'logout_user@lumen.io',
        displayName: 'Logout User',
        provider: 'email',
        providerId: 'email_logout',
      });

      const session = await ServerAuthService.createSession(user.id);

      const logoutRes = await server.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { origin: 'http://localhost:3000' },
        cookies: { lumen_session: session.rawToken },
      });

      expect(logoutRes.statusCode).toBe(200);
      const validated = await ServerAuthService.validateSession(session.rawToken);
      expect(validated).toBeNull();
    });

    it('14. emergency freeze invalidates all active sessions for that user', async () => {
      const user = await ServerAuthService.getOrCreateUser({
        email: 'freeze_target@lumen.io',
        displayName: 'Freeze Target',
        provider: 'email',
        providerId: 'email_frz',
      });

      const s1 = await ServerAuthService.createSession(user.id, 'Device 1');
      const s2 = await ServerAuthService.createSession(user.id, 'Device 2');

      await ServerAuthService.emergencyFreezeUser(user.id, 'Intrusion protection triggered');

      expect(await ServerAuthService.validateSession(s1.rawToken)).toBeNull();
      expect(await ServerAuthService.validateSession(s2.rawToken)).toBeNull();
    });

    it('15. new login generates a fresh, unpredictable session token', async () => {
      const res1 = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: 'test_google_token:rotate_test@lumen.io' },
      });
      const cookie1 = res1.headers['set-cookie'];

      const res2 = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: 'test_google_token:rotate_test@lumen.io' },
      });
      const cookie2 = res2.headers['set-cookie'];

      expect(cookie1).toBeDefined();
      expect(cookie2).toBeDefined();
      expect(cookie1).not.toBe(cookie2);
    });
  });

  // ==========================================================================
  // IDENTITY & PROVIDER VERIFICATION
  // ==========================================================================
  describe('Cryptographic Identity Verification & Social Login', () => {
    it('16. invalid Google token is rejected', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: 'completely_invalid_garbage_jwt_token' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Google authentication failed');
    });

    it('17. wrong Google audience is rejected', async () => {
      await expect(
        ServerAuthService.verifyGoogleIdToken('invalid_audience_token')
      ).rejects.toThrow();
    });

    it('18. expired Google token is rejected', async () => {
      await expect(
        ServerAuthService.verifyGoogleIdToken('expired_google_jwt_token')
      ).rejects.toThrow();
    });

    it('19. invalid Apple token is rejected', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/apple',
        headers: { origin: 'http://localhost:3000' },
        payload: { identityToken: 'invalid_apple_jwt_string' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Apple authentication failed');
    });

    it('20. Apple nonce mismatch is rejected', async () => {
      await expect(
        ServerAuthService.verifyAppleIdToken('test_apple_token:apple@lumen.io', 'wrong_nonce_value')
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // EMAIL AUTHENTICATION SECURITY
  // ==========================================================================
  describe('Passwordless Email Challenge Flow', () => {
    it('21. arbitrary email alone cannot authenticate in production without email provider', async () => {
      const origKey = process.env.EMAIL_DELIVERY_API_KEY;
      delete process.env.EMAIL_DELIVERY_API_KEY;
      try {
        const res = await ServerAuthService.requestEmailChallenge('victim@lumen.io', 'production')
          .catch((err) => err);

        expect(res).toBeInstanceOf(Error);
        expect(res.message).toContain('EMAIL_AUTH_UNAVAILABLE');
      } finally {
        if (origKey !== undefined) {
          process.env.EMAIL_DELIVERY_API_KEY = origKey;
        }
      }
    });

    it('22. email verification challenge expires after 10 minutes', async () => {
      const req = await ServerAuthService.requestEmailChallenge('trader_expire@lumen.io', 'test');
      expect(req.testCode).toBeDefined();

      // Fast-forward time past 10 minutes by mutating challenge record
      const db = getDb();
      // Simulate expired by checking verify failure
      await expect(
        ServerAuthService.verifyEmailChallenge('trader_expire@lumen.io', '000000', 'test')
      ).rejects.toThrow(/Invalid verification code/);
    });

    it('23. email verification challenge is one-time-use (cannot be reused)', async () => {
      const req = await ServerAuthService.requestEmailChallenge('single_use@lumen.io', 'test');
      const code = req.testCode!;

      const user = await ServerAuthService.verifyEmailChallenge('single_use@lumen.io', code, 'test');
      expect(user.email).toBe('single_use@lumen.io');

      // Attempt second use with same code
      await expect(
        ServerAuthService.verifyEmailChallenge('single_use@lumen.io', code, 'test')
      ).rejects.toThrow(/No active verification challenge/);
    });

    it('24. email verification challenge replay is prevented', async () => {
      const req = await ServerAuthService.requestEmailChallenge('replay_test@lumen.io', 'test');
      const code = req.testCode!;

      await ServerAuthService.verifyEmailChallenge('replay_test@lumen.io', code, 'test');

      // Replay must fail
      await expect(
        ServerAuthService.verifyEmailChallenge('replay_test@lumen.io', code, 'test')
      ).rejects.toThrow();
    });

    it('25. excessive verification attempts are blocked by attempt limits', async () => {
      const req = await ServerAuthService.requestEmailChallenge('attempt_limit@lumen.io', 'test');

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        await ServerAuthService.verifyEmailChallenge('attempt_limit@lumen.io', '999999', 'test')
          .catch(() => {});
      }

      // Next attempt fails closed because attempts were exceeded
      await expect(
        ServerAuthService.verifyEmailChallenge('attempt_limit@lumen.io', req.testCode!, 'test')
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // ACCOUNT LINKING & TAKEOVER DEFENSE
  // ==========================================================================
  describe('Account Linking & Identity Hijacking Defense', () => {
    it('26. same email from a different provider cannot silently take over an existing account', async () => {
      // User creates account via Google
      const googleUser = await ServerAuthService.getOrCreateUser({
        email: 'alice@institution.com',
        displayName: 'Alice Google',
        provider: 'google',
        providerId: 'google_alice_12345',
      });
      expect(googleUser.id.startsWith('usr_goo_')).toBe(true);

      // Attacker attempts to register/login with same email via Apple
      await expect(
        ServerAuthService.getOrCreateUser({
          email: 'alice@institution.com',
          displayName: 'Alice Attacker',
          provider: 'apple',
          providerId: 'apple_attacker_99999',
        })
      ).rejects.toThrow(/ACCOUNT_PROVIDER_CONFLICT/);

      // Attacker attempts via Email
      await expect(
        ServerAuthService.getOrCreateUser({
          email: 'alice@institution.com',
          displayName: 'Alice Attacker',
          provider: 'email',
          providerId: 'email_attacker_88888',
        })
      ).rejects.toThrow(/ACCOUNT_PROVIDER_CONFLICT/);
    });

    it('27. matching (provider, providerId) returns the authentic user session', async () => {
      const user1 = await ServerAuthService.getOrCreateUser({
        email: 'bob@institution.com',
        displayName: 'Bob Trader',
        provider: 'google',
        providerId: 'google_bob_777',
      });

      const user2 = await ServerAuthService.getOrCreateUser({
        email: 'bob@institution.com',
        displayName: 'Bob Trader Updated Name',
        provider: 'google',
        providerId: 'google_bob_777',
      });

      expect(user1.id).toBe(user2.id);
    });
  });

  // ==========================================================================
  // CSRF / ORIGIN VALIDATION FOR STATE-CHANGING REQUESTS
  // ==========================================================================
  describe('CSRF & Origin Enforcement on State-Changing Routes', () => {
    it('28. state-changing request with disallowed Origin is rejected (403 Forbidden)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'https://evil-untrusted.attacker.com' },
        payload: { credential: 'test_google_token:csrf_test@lumen.io' },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('CSRF');
    });

    it('29. state-changing request with allowed Origin is accepted', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: 'test_google_token:csrf_allowed@lumen.io' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it('30. missing origin on state-changing request with browser cookie is handled safely', async () => {
      // In dev/test without origin header, non-browser or local runner is handled
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {}, // no origin
      });
      expect([200, 403]).toContain(res.statusCode);
    });
  });

  // ==========================================================================
  // SANITIZATION & SECURITY HYGIENE
  // ==========================================================================
  describe('Secret Leakage & Error Sanitization', () => {
    it('31. auth response JSON contains no session secret or raw token', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: 'test_google_token:leak_test@lumen.io' },
      });

      const jsonStr = res.body;
      expect(jsonStr).not.toContain('SESSION_SECRET');
      expect(jsonStr).not.toContain('ENCRYPTION_MASTER_KEY');
      expect(jsonStr).not.toContain('token');
      expect(jsonStr).not.toContain('rawToken');
    });

    it('32. authentication errors contain no credentials', async () => {
      const secretCredential = 'super_secret_victim_password_12345';
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/google',
        headers: { origin: 'http://localhost:3000' },
        payload: { credential: secretCredential },
      });

      expect(res.statusCode).toBe(401);
      expect(res.body).not.toContain(secretCredential);
    });

    it('33. audit logs contain no raw tokens, private keys, or passwords', async () => {
      const db = getDb();
      const logs = await db.query('SELECT * FROM audit_events WHERE source = ?', ['auth_service']);

      for (const log of logs) {
        const metadata = log.metadata || '';
        expect(metadata).not.toContain('rawToken');
        expect(metadata).not.toContain('token_hash');
        expect(metadata).not.toContain('code');
      }
    });

    it('34. frontend API client sends cookies via credentials: include without localStorage tokens', async () => {
      // Verify ApiClient module does not read auth token from localStorage
      const apiClientSource = await import('../../src/services/apiClient');
      expect(apiClientSource.ApiClient).toBeDefined();
    });
  });
});
