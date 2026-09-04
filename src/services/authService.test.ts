import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveUserUid,
  createSessionToken,
  verifySessionToken,
  signInWithGoogle,
  signInWithApple,
  signInWithEmail,
  signOut,
  loadCurrentSession,
  updateUserProfile,
} from './authService';

const mockStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
  removeItem: (k: string) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() {
    return mockStorage.size;
  },
};

describe('Authentication & Identity Service', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('derives deterministic and unique user IDs for email and provider combinations', async () => {
    const uid1 = await deriveUserUid('google', 'test@example.com');
    const uid2 = await deriveUserUid('google', 'test@example.com');
    const uid3 = await deriveUserUid('apple', 'test@example.com');
    const uid4 = await deriveUserUid('google', 'other@example.com');

    expect(uid1).toBe(uid2);
    expect(uid1.startsWith('usr_goog_')).toBe(true);
    expect(uid1).not.toBe(uid3);
    expect(uid1).not.toBe(uid4);
  });

  it('creates and cryptographically verifies HMAC-SHA256 session tokens', async () => {
    const session = await signInWithGoogle({ email: 'alice@quant.finance', displayName: 'Alice' });
    expect(session.isAuthenticated).toBe(true);
    expect(session.token).toBeDefined();

    const verification = await verifySessionToken(session.token!);
    expect(verification.valid).toBe(true);
    expect(verification.uid).toBe(session.user?.uid);
  });

  it('detects expired session tokens', async () => {
    const session = await signInWithGoogle({ email: 'bob@quant.finance' });
    const expiredToken = await createSessionToken(session.user!, Date.now() - 1000); // 1 sec in past
    const verification = await verifySessionToken(expiredToken);
    expect(verification.valid).toBe(false);
  });

  it('signs in with Apple ID and supports private relay email masking', async () => {
    const session = await signInWithApple({ hideEmail: true, displayName: 'Charlie' });
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.email).toContain('privaterelay.appleid.com');
    expect(session.user?.provider).toBe('apple');
    expect(session.user?.kycTier).toBe('tier1_basic');
  });

  it('validates email syntax for direct email sign-in', async () => {
    await expect(signInWithEmail('invalid-email')).rejects.toThrow('valid email address');
    const session = await signInWithEmail('david@desk.ai', 'David');
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.email).toBe('david@desk.ai');
  });

  it('persists and reloads session from local storage', async () => {
    await signInWithGoogle({ email: 'elena@trading.org' });
    const loaded = loadCurrentSession();
    expect(loaded.isAuthenticated).toBe(true);
    expect(loaded.user?.email).toBe('elena@trading.org');
  });

  it('signs out and destroys stored session', async () => {
    await signInWithGoogle();
    expect(loadCurrentSession().isAuthenticated).toBe(true);

    const afterSignOut = signOut();
    expect(afterSignOut.isAuthenticated).toBe(false);
    expect(afterSignOut.user).toBeNull();
    expect(loadCurrentSession().isAuthenticated).toBe(false);
  });

  it('updates profile fields and persists changes', async () => {
    const session = await signInWithGoogle();
    const updated = updateUserProfile(session, {
      currencyPreference: 'INR',
      panNumberMasked: 'ABCDE9999Z',
    });

    expect(updated.user?.currencyPreference).toBe('INR');
    expect(updated.user?.panNumberMasked).toBe('ABCDE9999Z');
    expect(loadCurrentSession().user?.currencyPreference).toBe('INR');
  });
});
