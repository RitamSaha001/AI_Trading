/**
 * Client-Side Encrypted Key Vault (Web Crypto API)
 *
 * Implements zero-knowledge credential encryption using:
 * - PBKDF2 key derivation (SHA-256, 100,000 iterations, 16-byte cryptographically random salt)
 * - AES-GCM 256-bit authenticated encryption (12-byte random IV, 128-bit auth tag)
 * - In-memory decrypted credentials with automatic 30-minute inactivity lock timer
 * - Safe memory zeroing on disconnect, lock, or page unload
 * - Zero third-party server exposure
 */

export type ExchangeEnvironment = 'testnet' | 'mainnet';

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  environment: ExchangeEnvironment;
}

export interface EncryptedVaultPayload {
  version: 1;
  ciphertext: string; // hex
  iv: string;         // hex (12 bytes)
  salt: string;       // hex (16 bytes)
  updatedAt: number;
}

export class InvalidPassphraseError extends Error {
  constructor(message = 'Invalid master passphrase or corrupted vault payload') {
    super(message);
    this.name = 'InvalidPassphraseError';
  }
}

export class VaultLockedError extends Error {
  constructor(message = 'Vault is locked. Unlock with master passphrase to access exchange credentials') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

export class VaultCorruptionError extends Error {
  constructor(message = 'Vault storage payload is corrupted or invalid schema version') {
    super(message);
    this.name = 'VaultCorruptionError';
  }
}

export const VAULT_STORAGE_KEY = 'lumen_key_vault_v1';
export const DEFAULT_AUTO_LOCK_MS = 30 * 60 * 1000; // 30 minutes
const PBKDF2_ITERATIONS = 100000;

// Fallback in-memory storage for non-browser environments
const fallbackStore = new Map<string, string>();

export function getStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, val: string) => void;
  removeItem: (key: string) => void;
  clear?: () => void;
} {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch {
    // Access denied or not available
  }
  return {
    getItem: (key: string) => fallbackStore.get(key) ?? null,
    setItem: (key: string, val: string) => fallbackStore.set(key, val),
    removeItem: (key: string) => fallbackStore.delete(key),
    clear: () => fallbackStore.clear(),
  };
}

// Hex utility conversions
function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new VaultCorruptionError('Invalid hex string format');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives an AES-GCM-256 CryptoKey from a master passphrase string and salt.
 */
async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// In-memory decrypted credentials and timer references
let inMemoryCredentials: ExchangeCredentials | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
let autoLockDurationMs: number = DEFAULT_AUTO_LOCK_MS;
let onLockCallbacks: Set<() => void> = new Set();

/**
 * Resets the inactivity auto-lock countdown timer.
 */
export function recordVaultActivity(): void {
  if (!inMemoryCredentials) return;
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
  if (autoLockDurationMs > 0) {
    autoLockTimer = setTimeout(() => {
      lockVault();
    }, autoLockDurationMs);
  }
}

/**
 * Sets the auto-lock inactivity duration in milliseconds (0 to disable).
 */
export function setAutoLockDuration(durationMs: number): void {
  autoLockDurationMs = Math.max(0, durationMs);
  recordVaultActivity();
}

/**
 * Registers a callback invoked whenever the vault is locked.
 */
export function onVaultLock(callback: () => void): () => void {
  onLockCallbacks.add(callback);
  return () => onLockCallbacks.delete(callback);
}

/**
 * Locks the in-memory vault and zeros out credentials in memory.
 */
export function lockVault(): void {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
  if (inMemoryCredentials) {
    // Overwrite fields before dropping reference
    inMemoryCredentials.apiKey = '';
    inMemoryCredentials.apiSecret = '';
    inMemoryCredentials = null;
  }
  for (const cb of onLockCallbacks) {
    try {
      cb();
    } catch (e) {
      console.warn('Error in vault lock callback:', e);
    }
  }
}

/**
 * Checks if encrypted credentials exist in local storage.
 */
export function isVaultConfigured(): boolean {
  try {
    const raw = getStorage().getItem(VAULT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === 1 && Boolean(parsed.ciphertext);
  } catch {
    return false;
  }
}

/**
 * Checks whether credentials are currently decrypted and ready in memory.
 */
export function isVaultUnlocked(): boolean {
  return inMemoryCredentials !== null && Boolean(inMemoryCredentials.apiKey);
}

/**
 * Returns currently unlocked credentials or throws VaultLockedError.
 */
export function getUnlockedCredentials(): ExchangeCredentials {
  if (!inMemoryCredentials || !inMemoryCredentials.apiKey) {
    throw new VaultLockedError();
  }
  recordVaultActivity();
  return { ...inMemoryCredentials };
}

/**
 * Encrypts credentials with the master passphrase and persists to localStorage.
 * Automatically unlocks the in-memory vault with the newly saved credentials.
 */
export async function saveCredentials(
  credentials: ExchangeCredentials,
  passphrase: string
): Promise<EncryptedVaultPayload> {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('Master passphrase must be at least 6 characters');
  }
  if (!credentials.apiKey || !credentials.apiSecret) {
    throw new Error('API Key and API Secret are required');
  }

  // 16-byte random salt for PBKDF2
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);

  // 12-byte random IV for AES-GCM
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const key = await deriveKeyFromPassphrase(passphrase, salt);

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(credentials));

  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  );

  const payload: EncryptedVaultPayload = {
    version: 1,
    ciphertext: bytesToHex(new Uint8Array(cipherBuffer)),
    iv: bytesToHex(iv),
    salt: bytesToHex(salt),
    updatedAt: Date.now(),
  };

  try {
    getStorage().setItem(VAULT_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to save encrypted vault payload to storage', err);
  }

  // Unlock in memory immediately
  inMemoryCredentials = { ...credentials };
  recordVaultActivity();

  return payload;
}

/**
 * Decrypts the stored payload using the provided master passphrase.
 * If successful, unlocks credentials into memory and returns them.
 */
export async function unlockVault(passphrase: string): Promise<ExchangeCredentials> {
  const raw = getStorage().getItem(VAULT_STORAGE_KEY);
  if (!raw) {
    throw new VaultLockedError('No vault credentials found in storage');
  }

  let payload: EncryptedVaultPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new VaultCorruptionError('Corrupted JSON in vault storage');
  }

  if (!payload || payload.version !== 1 || !payload.ciphertext || !payload.iv || !payload.salt) {
    throw new VaultCorruptionError('Missing required encrypted fields or unsupported version');
  }

  const salt = hexToBytes(payload.salt);
  const iv = hexToBytes(payload.iv);
  const cipherBytes = hexToBytes(payload.ciphertext);

  const key = await deriveKeyFromPassphrase(passphrase, salt);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource
    );
  } catch {
    throw new InvalidPassphraseError();
  }

  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(decryptedBuffer);

  let parsed: ExchangeCredentials;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new VaultCorruptionError('Decrypted payload is not valid JSON');
  }

  if (!parsed.apiKey || !parsed.apiSecret || !parsed.environment) {
    throw new VaultCorruptionError('Decrypted credentials lack required fields');
  }

  inMemoryCredentials = {
    apiKey: parsed.apiKey,
    apiSecret: parsed.apiSecret,
    environment: parsed.environment,
  };

  recordVaultActivity();
  return { ...inMemoryCredentials };
}

/**
 * Completely purges encrypted credentials from storage and resets memory.
 */
export function purgeVault(): void {
  lockVault();
  try {
    getStorage().removeItem(VAULT_STORAGE_KEY);
  } catch (err) {
    console.warn('Error removing vault key from storage:', err);
  }
}

// Clean up memory on window unload if in browser environment
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    lockVault();
  });
}

const DEVICE_KEY_STORAGE_KEY = 'lumen_device_entropy_v1';

function getOrCreateDeviceSecret(): string {
  const storage = getStorage();
  let secret = storage.getItem(DEVICE_KEY_STORAGE_KEY);
  if (!secret) {
    const bytes = new Uint8Array(32);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    secret = bytesToHex(bytes);
    try {
      storage.setItem(DEVICE_KEY_STORAGE_KEY, secret);
    } catch {
      // ignore
    }
  }
  return secret;
}

export function isEncryptedApiKey(key?: string): boolean {
  return typeof key === 'string' && key.startsWith('enc:v1:aes-gcm:');
}

/**
 * Encrypts a sensitive string (like Gemini API key) using AES-GCM 256-bit encryption before persisting.
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  if (!plaintext || typeof plaintext !== 'string') return '';
  const trimmed = plaintext.trim();
  if (!trimmed) return '';
  if (isEncryptedApiKey(trimmed)) return trimmed;

  try {
    const secret = getOrCreateDeviceSecret();
    const salt = new Uint8Array(16);
    globalThis.crypto.getRandomValues(salt);
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);

    const key = await deriveKeyFromPassphrase(secret, salt);
    const encoder = new TextEncoder();
    const cipherBuffer = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encoder.encode(trimmed)
    );

    const cipherHex = bytesToHex(new Uint8Array(cipherBuffer));
    const saltHex = bytesToHex(salt);
    const ivHex = bytesToHex(iv);

    return `enc:v1:aes-gcm:${saltHex}:${ivHex}:${cipherHex}`;
  } catch (err) {
    console.warn('Failed to encrypt API key with AES-GCM:', err);
    return trimmed;
  }
}

/**
 * Decrypts an encrypted API key ciphertext or returns the plain string as fallback.
 */
export async function decryptApiKey(ciphertextOrPlain?: string): Promise<string> {
  if (!ciphertextOrPlain || typeof ciphertextOrPlain !== 'string') return '';
  const val = ciphertextOrPlain.trim();
  if (!val) return '';
  if (!isEncryptedApiKey(val)) {
    return val;
  }

  try {
    const parts = val.split(':');
    // Expected: enc:v1:aes-gcm:<saltHex>:<ivHex>:<cipherHex>
    if (parts.length !== 6 || parts[0] !== 'enc' || parts[1] !== 'v1' || parts[2] !== 'aes-gcm') {
      return val;
    }
    const saltHex = parts[3];
    const ivHex = parts[4];
    const cipherHex = parts[5];

    const secret = getOrCreateDeviceSecret();
    const salt = hexToBytes(saltHex);
    const iv = hexToBytes(ivHex);
    const cipherBytes = hexToBytes(cipherHex);

    const key = await deriveKeyFromPassphrase(secret, salt);
    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.warn('Failed to decrypt API key with AES-GCM:', err);
    return '';
  }
}
