import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  saveCredentials,
  unlockVault,
  lockVault,
  purgeVault,
  isVaultConfigured,
  isVaultUnlocked,
  getUnlockedCredentials,
  setAutoLockDuration,
  onVaultLock,
  InvalidPassphraseError,
  VaultLockedError,
  VAULT_STORAGE_KEY,
  ExchangeCredentials,
  getStorage,
  encryptApiKey,
  decryptApiKey,
  isEncryptedApiKey,
} from './keyVault';

describe('Client-Side Encrypted Key Vault', () => {
  const mockCreds: ExchangeCredentials = {
    apiKey: 'binance-test-api-key-998877',
    apiSecret: 'binance-test-api-secret-11223344556677889900',
    environment: 'testnet',
  };
  const masterPass = 'SuperSecretPassphrase123!';

  beforeEach(() => {
    getStorage().clear?.();
    purgeVault();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates distinct ciphertexts and random IVs for identical inputs (semantic security)', async () => {
    const payload1 = await saveCredentials(mockCreds, masterPass);
    const rawStored1 = getStorage().getItem(VAULT_STORAGE_KEY);
    purgeVault();

    const payload2 = await saveCredentials(mockCreds, masterPass);
    const rawStored2 = getStorage().getItem(VAULT_STORAGE_KEY);

    expect(payload1.ciphertext).not.toBe(payload2.ciphertext);
    expect(payload1.iv).not.toBe(payload2.iv);
    expect(payload1.salt).not.toBe(payload2.salt);
    expect(rawStored1).not.toBe(rawStored2);
    expect(payload1.version).toBe(1);
    expect(payload2.version).toBe(1);
  });

  it('successfully encrypts and decrypts valid credentials with correct master passphrase', async () => {
    await saveCredentials(mockCreds, masterPass);
    expect(isVaultConfigured()).toBe(true);
    expect(isVaultUnlocked()).toBe(true);

    // Lock the in-memory vault
    lockVault();
    expect(isVaultUnlocked()).toBe(false);
    expect(() => getUnlockedCredentials()).toThrow(VaultLockedError);

    // Unlock with correct passphrase
    const decrypted = await unlockVault(masterPass);
    expect(decrypted.apiKey).toBe(mockCreds.apiKey);
    expect(decrypted.apiSecret).toBe(mockCreds.apiSecret);
    expect(decrypted.environment).toBe(mockCreds.environment);
    expect(isVaultUnlocked()).toBe(true);

    const memoryCreds = getUnlockedCredentials();
    expect(memoryCreds.apiKey).toBe(mockCreds.apiKey);
  });

  it('throws InvalidPassphraseError when given incorrect passphrase', async () => {
    await saveCredentials(mockCreds, masterPass);
    lockVault();

    await expect(unlockVault('WrongPassphrase999!')).rejects.toThrow(InvalidPassphraseError);
    expect(isVaultUnlocked()).toBe(false);
  });

  it('throws InvalidPassphraseError when ciphertext is tampered/corrupted', async () => {
    await saveCredentials(mockCreds, masterPass);
    lockVault();

    const stored = JSON.parse(getStorage().getItem(VAULT_STORAGE_KEY)!);
    // Tamper with the ciphertext
    const tamperedCipher = 'ff' + stored.ciphertext.slice(2);
    stored.ciphertext = tamperedCipher;
    getStorage().setItem(VAULT_STORAGE_KEY, JSON.stringify(stored));

    await expect(unlockVault(masterPass)).rejects.toThrow(InvalidPassphraseError);
    expect(isVaultUnlocked()).toBe(false);
  });

  it('purging vault clears both storage and in-memory credentials', async () => {
    await saveCredentials(mockCreds, masterPass);
    expect(isVaultConfigured()).toBe(true);
    expect(isVaultUnlocked()).toBe(true);

    purgeVault();
    expect(isVaultConfigured()).toBe(false);
    expect(isVaultUnlocked()).toBe(false);
    expect(getStorage().getItem(VAULT_STORAGE_KEY)).toBeNull();
    expect(() => getUnlockedCredentials()).toThrow(VaultLockedError);
  });

  it('automatically locks in-memory credentials after inactivity timeout', async () => {
    setAutoLockDuration(5000); // 5 seconds for test
    await saveCredentials(mockCreds, masterPass);
    expect(isVaultUnlocked()).toBe(true);

    let lockCallbackFired = false;
    const unsubscribe = onVaultLock(() => {
      lockCallbackFired = true;
    });

    // Advance 4.9s - should still be unlocked
    vi.advanceTimersByTime(4900);
    expect(isVaultUnlocked()).toBe(true);
    expect(lockCallbackFired).toBe(false);

    // Advance remaining time - should lock
    vi.advanceTimersByTime(200);
    expect(isVaultUnlocked()).toBe(false);
    expect(lockCallbackFired).toBe(true);
    expect(() => getUnlockedCredentials()).toThrow(VaultLockedError);

    unsubscribe();
  });

  it('validates minimum passphrase length and required fields', async () => {
    await expect(saveCredentials(mockCreds, '12345')).rejects.toThrow('Master passphrase must be at least 6 characters');
    await expect(saveCredentials({ ...mockCreds, apiKey: '' }, masterPass)).rejects.toThrow('API Key and API Secret are required');
    await expect(saveCredentials({ ...mockCreds, apiSecret: '' }, masterPass)).rejects.toThrow('API Key and API Secret are required');
  });

  describe('API Key AES-GCM Encryption', () => {
    it('encrypts plaintext API key into ciphertext format and decrypts back to original', async () => {
      const rawKey = 'AIzaSySecretGeminiApiKey1234567890';
      const cipher = await encryptApiKey(rawKey);

      expect(cipher).not.toBe(rawKey);
      expect(isEncryptedApiKey(cipher)).toBe(true);
      expect(cipher.startsWith('enc:v1:aes-gcm:')).toBe(true);

      const decrypted = await decryptApiKey(cipher);
      expect(decrypted).toBe(rawKey);
    });

    it('returns plaintext unchanged if already plaintext or empty', async () => {
      expect(await decryptApiKey('')).toBe('');
      expect(await decryptApiKey('plain-test-key')).toBe('plain-test-key');
    });

    it('does not re-encrypt already encrypted string', async () => {
      const rawKey = 'AIzaSySecretGeminiApiKey1234567890';
      const cipher = await encryptApiKey(rawKey);
      const cipher2 = await encryptApiKey(cipher);
      expect(cipher2).toBe(cipher);
    });
  });
});
