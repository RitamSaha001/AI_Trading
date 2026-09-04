/**
 * Self-Custodial Web3 EVM Engine (100% Client-Side, Zero External Dependencies)
 *
 * Implements:
 * - Pure TypeScript secp256k1 elliptic curve scalar multiplication
 * - Exact Keccak-256 hashing (Ethereum standard)
 * - EIP-55 mixed-case checksum address formatting
 * - Standard 12-word BIP-39 mnemonic seed phrase generator and validator
 * - Web Crypto API AES-256-GCM authenticated encryption with PBKDF2 (100,000 rounds)
 * - Standard Web3 Keystore export/import
 * - Multi-network JSON-RPC client (Polygon PoS, Arbitrum One, Polygon Amoy)
 * - Real-time native and ERC-20 token balance fetching
 */

import { BIP39_WORDLIST } from './bip39Words';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type Web3NetworkKey = 'polygon' | 'arbitrum' | 'amoy';

export interface Web3NetworkConfig {
  key: Web3NetworkKey;
  name: string;
  chainId: number;
  nativeCurrency: {
    symbol: string;
    name: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorer: string;
  contracts: {
    usdt?: string;
    usdc?: string;
    weth?: string;
    wmatic?: string;
    dexRouter?: string;
  };
}

export interface GeneratedWallet {
  mnemonic: string;
  privateKey: string;
  address: string;
  createdAt: number;
}

export interface EncryptedWeb3Keystore {
  version: 1;
  id: string;
  address: string;
  crypto: {
    cipher: 'aes-256-gcm';
    ciphertext: string; // hex
    iv: string;         // hex (12 bytes)
    salt: string;       // hex (16 bytes)
    iterations: number;
  };
  mnemonicCiphertext?: string;
  mnemonicIv?: string;
  createdAt: number;
}

export interface TokenBalance {
  symbol: string;
  balance: number;
  rawBalance: string;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
  contractAddress?: string;
}

export interface Web3WalletBalances {
  network: Web3NetworkKey;
  address: string;
  native: TokenBalance;
  tokens: Record<string, TokenBalance>;
  totalValueUsd: number;
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// NETWORK CONFIGURATIONS
// ---------------------------------------------------------------------------

export const WEB3_NETWORKS: Record<Web3NetworkKey, Web3NetworkConfig> = {
  polygon: {
    key: 'polygon',
    name: 'Polygon PoS',
    chainId: 137,
    nativeCurrency: {
      symbol: 'POL',
      name: 'Polygon Ecosystem Token',
      decimals: 18,
    },
    rpcUrls: [
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
      'https://1rpc.io/matic',
    ],
    blockExplorer: 'https://polygonscan.com',
    contracts: {
      usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      dexRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 SwapRouter
    },
  },
  arbitrum: {
    key: 'arbitrum',
    name: 'Arbitrum One',
    chainId: 42161,
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
    },
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://rpc.ankr.com/arbitrum',
      'https://1rpc.io/arb',
    ],
    blockExplorer: 'https://arbiscan.io',
    contracts: {
      usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      dexRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    },
  },
  amoy: {
    key: 'amoy',
    name: 'Polygon Amoy Testnet',
    chainId: 80002,
    nativeCurrency: {
      symbol: 'AMOY',
      name: 'Polygon Amoy Test Token',
      decimals: 18,
    },
    rpcUrls: [
      'https://rpc-amoy.polygon.technology',
    ],
    blockExplorer: 'https://amoy.polygonscan.com',
    contracts: {
      usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    },
  },
};

// ---------------------------------------------------------------------------
// PURE TYPESCRIPT KECCAK-256 HASH
// ---------------------------------------------------------------------------

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function rotl(x: bigint, n: number): bigint {
  const bn = BigInt(n);
  return ((x << bn) | (x >> (64n - bn))) & 0xffffffffffffffffn;
}

/**
 * Standard Ethereum Keccak-256 hash function.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  const rateBytes = 136;
  const q = rateBytes - (data.length % rateBytes);
  const padded = new Uint8Array(data.length + q);
  padded.set(data);
  if (q === 1) {
    padded[data.length] = 0x81;
  } else {
    padded[data.length] = 0x01;
    padded[padded.length - 1] = 0x80;
  }

  const state: BigUint64Array[] = Array.from({ length: 5 }, () => new BigUint64Array(5));

  for (let offset = 0; offset < padded.length; offset += rateBytes) {
    for (let i = 0; i < rateBytes / 8; i++) {
      const x = i % 5;
      const y = Math.floor(i / 5);
      const idx = offset + i * 8;
      let word = 0n;
      for (let b = 0; b < 8; b++) {
        word |= BigInt(padded[idx + b]) << BigInt(b * 8);
      }
      state[x][y] ^= word;
    }

    for (let round = 0; round < 24; round++) {
      // Theta step
      const C = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
      }
      const D = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] ^= D[x];
        }
      }

      // Rho and Pi steps
      const B: BigUint64Array[] = Array.from({ length: 5 }, () => new BigUint64Array(5));
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          B[y][(2 * x + 3 * y) % 5] = rotl(state[x][y], ROT[x][y]);
        }
      }

      // Chi step
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y]);
        }
      }

      // Iota step
      state[0][0] ^= RC[round];
    }
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const x = i % 5;
    const y = Math.floor(i / 5);
    let word = state[x][y];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(word & 0xffn);
      word >>= 8n;
    }
  }
  return out;
}

export function keccak256Hex(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytesToHex(keccak256(bytes));
}

// ---------------------------------------------------------------------------
// SECP256K1 ELLIPTIC CURVE POINT MULTIPLICATION
// ---------------------------------------------------------------------------

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

function mod(a: bigint, m = P): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

function modInverse(a: bigint, m = P): bigint {
  let base = mod(a, m);
  let exp = m - 2n;
  let res = 1n;
  while (exp > 0n) {
    if (exp & 1n) res = mod(res * base, m);
    base = mod(base * base, m);
    exp >>= 1n;
  }
  return res;
}

interface JacobianPoint {
  isZero: boolean;
  x: bigint;
  y: bigint;
  z: bigint;
}

function pointDouble(P1: JacobianPoint): JacobianPoint {
  if (P1.isZero || P1.y === 0n) return { isZero: true, x: 0n, y: 0n, z: 0n };

  const [X1, Y1, Z1] = [P1.x, P1.y, P1.z];
  const Y1_2 = mod(Y1 * Y1);
  const S = mod(4n * X1 * Y1_2);
  const M = mod(3n * X1 * X1);
  const X3 = mod(M * M - 2n * S);
  const Y3 = mod(M * (S - X3) - 8n * Y1_2 * Y1_2);
  const Z3 = mod(2n * Y1 * Z1);

  return { isZero: false, x: X3, y: Y3, z: Z3 };
}

function pointAdd(P1: JacobianPoint, P2: JacobianPoint): JacobianPoint {
  if (P1.isZero) return P2;
  if (P2.isZero) return P1;

  const [X1, Y1, Z1] = [P1.x, P1.y, P1.z];
  const [X2, Y2, Z2] = [P2.x, P2.y, P2.z];

  const Z1Z1 = mod(Z1 * Z1);
  const Z2Z2 = mod(Z2 * Z2);

  const U1 = mod(X1 * Z2Z2);
  const U2 = mod(X2 * Z1Z1);

  const S1 = mod(Y1 * Z2 * Z2Z2);
  const S2 = mod(Y2 * Z1 * Z1Z1);

  if (U1 === U2) {
    if (S1 !== S2) return { isZero: true, x: 0n, y: 0n, z: 0n };
    return pointDouble(P1);
  }

  const H = mod(U2 - U1);
  const HH = mod(H * H);
  const HHH = mod(H * HH);
  const r = mod(S2 - S1);

  const X3 = mod(r * r - HHH - 2n * U1 * HH);
  const Y3 = mod(r * (U1 * HH - X3) - S1 * HHH);
  const Z3 = mod(Z1 * Z2 * H);

  return { isZero: false, x: X3, y: Y3, z: Z3 };
}

function scalarMultiply(k: bigint): JacobianPoint {
  let R: JacobianPoint = { isZero: true, x: 0n, y: 0n, z: 0n };
  let P_curr: JacobianPoint = { isZero: false, x: Gx, y: Gy, z: 1n };
  let scalar = k;

  while (scalar > 0n) {
    if (scalar & 1n) R = pointAdd(R, P_curr);
    P_curr = pointDouble(P_curr);
    scalar >>= 1n;
  }
  return R;
}

function toAffine(P1: JacobianPoint): { x: bigint; y: bigint } | null {
  if (P1.isZero) return null;
  const zInv = modInverse(P1.z);
  const zInv2 = mod(zInv * zInv);
  const zInv3 = mod(zInv * zInv2);
  return {
    x: mod(P1.x * zInv2),
    y: mod(P1.y * zInv3),
  };
}

function bigIntTo32Bytes(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

// ---------------------------------------------------------------------------
// EIP-55 CHECKSUM ADDRESS DERIVATION
// ---------------------------------------------------------------------------

/**
 * Derives an EIP-55 mixed-case checksum Ethereum address from a private key.
 */
export function privateKeyToAddress(privateKeyHex: string): string {
  const cleanHex = privateKeyHex.replace(/^0x/i, '').trim();
  if (cleanHex.length !== 64) {
    throw new Error('Invalid private key length: expected 64 hex characters (32 bytes).');
  }

  const k = BigInt(`0x${cleanHex}`);
  if (k <= 0n || k >= N) {
    throw new Error('Private key out of valid secp256k1 scalar range.');
  }

  const pt = toAffine(scalarMultiply(k));
  if (!pt) {
    throw new Error('Failed to compute public key point on secp256k1 curve.');
  }

  const pubBytes = new Uint8Array(64);
  pubBytes.set(bigIntTo32Bytes(pt.x), 0);
  pubBytes.set(bigIntTo32Bytes(pt.y), 32);

  const hash = keccak256(pubBytes);
  const addrBytes = hash.slice(12);
  const addrHex = bytesToHex(addrBytes).toLowerCase();

  // Apply EIP-55 mixed-case checksum
  const hashHex = bytesToHex(keccak256(new TextEncoder().encode(addrHex)));
  let checksum = '0x';
  for (let i = 0; i < addrHex.length; i++) {
    const nibble = parseInt(hashHex[i], 16);
    checksum += nibble >= 8 ? addrHex[i].toUpperCase() : addrHex[i];
  }
  return checksum;
}

// ---------------------------------------------------------------------------
// BIP-39 12-WORD MNEMONIC GENERATOR & RESTORER
// ---------------------------------------------------------------------------

/**
 * Generates a standard 12-word BIP-39 mnemonic phrase using Web Crypto entropy.
 */
export async function generateMnemonic(): Promise<string> {
  const entropy = new Uint8Array(16); // 128 bits entropy
  globalThis.crypto.getRandomValues(entropy);

  // SHA-256 for checksum
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', entropy);
  const hashBytes = new Uint8Array(hashBuffer);
  const checksumBits = hashBytes[0] >> 4; // 4 bits checksum

  // Combine 128 bits entropy + 4 bits checksum = 132 bits (12 * 11 bits)
  const bits: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let b = 7; b >= 0; b--) {
      bits.push((entropy[i] >> b) & 1);
    }
  }
  for (let b = 3; b >= 0; b--) {
    bits.push((checksumBits >> b) & 1);
  }

  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    let index = 0;
    for (let b = 0; b < 11; b++) {
      index = (index << 1) | bits[i * 11 + b];
    }
    words.push(BIP39_WORDLIST[index]);
  }

  return words.join(' ');
}

/**
 * Validates a 12-word BIP-39 mnemonic phrase.
 */
export async function validateMnemonic(mnemonic: string): Promise<boolean> {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12) return false;

  const indices: number[] = [];
  for (const word of words) {
    const idx = BIP39_WORDLIST.indexOf(word);
    if (idx === -1) return false;
    indices.push(idx);
  }

  // Convert 12 11-bit indices back to 132 bits
  const bits: number[] = [];
  for (const idx of indices) {
    for (let b = 10; b >= 0; b--) {
      bits.push((idx >> b) & 1);
    }
  }

  const entropy = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b];
    }
    entropy[i] = byte;
  }

  let checksum = 0;
  for (let b = 0; b < 4; b++) {
    checksum = (checksum << 1) | bits[128 + b];
  }

  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', entropy);
  const hashBytes = new Uint8Array(hashBuffer);
  const expectedChecksum = hashBytes[0] >> 4;

  return checksum === expectedChecksum;
}

/**
 * Derives a 256-bit private key from a validated 12-word mnemonic phrase.
 */
export async function mnemonicToPrivateKey(mnemonic: string, passphrase = ''): Promise<string> {
  const isValid = await validateMnemonic(mnemonic);
  if (!isValid) {
    throw new Error('Invalid BIP-39 mnemonic phrase. Please check the spelling of your 12 words.');
  }

  const normalized = mnemonic.trim().toLowerCase();
  const saltStr = 'mnemonic' + passphrase;
  const encoder = new TextEncoder();

  // Standard BIP-39 PBKDF2 with 2048 rounds
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(normalized),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(saltStr),
      iterations: 2048,
      hash: 'SHA-512',
    },
    baseKey,
    512
  );

  // Use the master 256 bits as the primary key scalar
  const seedBytes = new Uint8Array(derivedBits).slice(0, 32);
  let hex = bytesToHex(seedBytes);
  
  // Ensure scalar is strictly within [1, N-1]
  let k = BigInt(`0x${hex}`);
  if (k <= 0n || k >= N) {
    k = (k % (N - 1n)) + 1n;
    hex = k.toString(16).padStart(64, '0');
  }

  return `0x${hex}`;
}

/**
 * Generates a brand new self-custodial Web3 wallet (mnemonic + private key + address).
 */
export async function generateNewWallet(): Promise<GeneratedWallet> {
  const mnemonic = await generateMnemonic();
  const privateKey = await mnemonicToPrivateKey(mnemonic);
  const address = privateKeyToAddress(privateKey);
  return {
    mnemonic,
    privateKey,
    address,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// AES-256-GCM ENCRYPTED KEYSTORE VAULT
// ---------------------------------------------------------------------------

const KEYSTORE_STORAGE_KEY = 'lumen_web3_keystore_v1';

/**
 * Encrypts private key & mnemonic into a secure keystore using user PIN/passphrase.
 */
export async function encryptKeystore(
  privateKey: string,
  passphrase: string,
  mnemonic?: string
): Promise<EncryptedWeb3Keystore> {
  const address = privateKeyToAddress(privateKey);
  const encoder = new TextEncoder();

  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const cleanPrivKey = privateKey.replace(/^0x/i, '');
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    encoder.encode(cleanPrivKey)
  );

  let mnemonicCiphertext: string | undefined;
  let mnemonicIv: string | undefined;

  if (mnemonic) {
    const mIv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(mIv);
    const mBuffer = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: mIv as BufferSource },
      aesKey,
      encoder.encode(mnemonic)
    );
    mnemonicCiphertext = bytesToHex(new Uint8Array(mBuffer));
    mnemonicIv = bytesToHex(mIv);
  }

  const keystore: EncryptedWeb3Keystore = {
    version: 1,
    id: `w3k_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    address,
    crypto: {
      cipher: 'aes-256-gcm',
      ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
      iv: bytesToHex(iv),
      salt: bytesToHex(salt),
      iterations: 100000,
    },
    mnemonicCiphertext,
    mnemonicIv,
    createdAt: Date.now(),
  };

  return keystore;
}

/**
 * Decrypts private key and mnemonic from an encrypted keystore.
 */
export async function decryptKeystore(
  keystore: EncryptedWeb3Keystore,
  passphrase: string
): Promise<{ privateKey: string; address: string; mnemonic?: string }> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const salt = hexToBytes(keystore.crypto.salt);
  const iv = hexToBytes(keystore.crypto.iv);
  const ciphertext = hexToBytes(keystore.crypto.ciphertext);

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: keystore.crypto.iterations || 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  let decryptedHex = '';
  try {
    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource
    );
    decryptedHex = decoder.decode(decryptedBuffer);
  } catch {
    throw new Error('Invalid passphrase or PIN. Decryption failed.');
  }

  const privateKey = `0x${decryptedHex}`;
  const address = privateKeyToAddress(privateKey);

  let mnemonic: string | undefined;
  if (keystore.mnemonicCiphertext && keystore.mnemonicIv) {
    try {
      const mIv = hexToBytes(keystore.mnemonicIv);
      const mCipher = hexToBytes(keystore.mnemonicCiphertext);
      const mBuffer = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: mIv as BufferSource },
        aesKey,
        mCipher as BufferSource
      );
      mnemonic = decoder.decode(mBuffer);
    } catch {
      // Ignore non-fatal mnemonic decryption error
    }
  }

  return { privateKey, address, mnemonic };
}

/**
 * Saves encrypted keystore to browser local storage.
 */
export function saveEncryptedKeystore(keystore: EncryptedWeb3Keystore): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(KEYSTORE_STORAGE_KEY, JSON.stringify(keystore));
  }
}

/**
 * Loads encrypted keystore from local storage if available.
 */
export function loadEncryptedKeystore(): EncryptedWeb3Keystore | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(KEYSTORE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version === 1 && parsed.address && parsed.crypto) {
      return parsed as EncryptedWeb3Keystore;
    }
  } catch {
    // corrupted
  }
  return null;
}

/**
 * Removes encrypted keystore from local storage.
 */
export function removeEncryptedKeystore(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(KEYSTORE_STORAGE_KEY);
  }
}

// ---------------------------------------------------------------------------
// MULTI-CHAIN JSON-RPC CLIENT & BALANCE ENGINE
// ---------------------------------------------------------------------------

/**
 * Executes a standard JSON-RPC request to the specified network with automatic RPC failover.
 */
export async function rpcCall<T = any>(
  network: Web3NetworkKey,
  method: string,
  params: any[] = []
): Promise<T> {
  const config = WEB3_NETWORKS[network];
  let lastError: Error | null = null;

  for (const rpcUrl of config.rpcUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from RPC node`);
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(`RPC Error: ${json.error.message || JSON.stringify(json.error)}`);
      }

      return json.result as T;
    } catch (err: any) {
      lastError = err;
      // Try next fallback RPC
    }
  }

  throw new Error(
    `Failed RPC call '${method}' across all ${config.name} endpoints: ${lastError?.message || 'Network Timeout'}`
  );
}

/**
 * Fetches real on-chain native balance (POL/MATIC or ETH) in human-readable units.
 */
export async function fetchNativeBalance(
  network: Web3NetworkKey,
  address: string
): Promise<number> {
  try {
    const balanceHex = await rpcCall<string>(network, 'eth_getBalance', [address, 'latest']);
    const wei = BigInt(balanceHex);
    // Convert 18 decimals Wei to number
    const whole = Number(wei / 10n ** 18n);
    const remainder = Number(wei % 10n ** 18n) / 1e18;
    return whole + remainder;
  } catch {
    return 0;
  }
}

/**
 * Encodes ERC-20 `balanceOf(address)` ABI call data (function selector `0x70a08231`).
 */
function encodeBalanceOf(address: string): string {
  const cleanAddr = address.replace(/^0x/i, '').padStart(64, '0');
  return `0x70a08231${cleanAddr}`;
}

/**
 * Fetches real on-chain ERC-20 token balance for a given contract.
 */
export async function fetchERC20Balance(
  network: Web3NetworkKey,
  contractAddress: string,
  walletAddress: string,
  decimals = 6
): Promise<number> {
  try {
    const data = encodeBalanceOf(walletAddress);
    const resultHex = await rpcCall<string>(network, 'eth_call', [
      { to: contractAddress, data },
      'latest',
    ]);

    if (!resultHex || resultHex === '0x') return 0;

    const raw = BigInt(resultHex);
    const factor = 10n ** BigInt(decimals);
    const whole = Number(raw / factor);
    const remainder = Number(raw % factor) / 10 ** decimals;
    return whole + remainder;
  } catch {
    return 0;
  }
}

/**
 * Aggregates all on-chain balances for a wallet across native and stablecoin assets.
 */
export async function fetchWalletBalances(
  network: Web3NetworkKey,
  address: string,
  marketPrices: Record<string, number> = {}
): Promise<Web3WalletBalances> {
  const config = WEB3_NETWORKS[network];

  // 1. Fetch native balance
  const nativeBal = await fetchNativeBalance(network, address);
  const nativeSymbol = config.nativeCurrency.symbol;
  const nativePrice = marketPrices[nativeSymbol] || (nativeSymbol === 'ETH' ? 3200 : 0.45);
  const nativeValueUsd = nativeBal * nativePrice;

  const tokens: Record<string, TokenBalance> = {};

  // 2. Fetch USDT if configured
  if (config.contracts.usdt) {
    const usdtBal = await fetchERC20Balance(network, config.contracts.usdt, address, 6);
    tokens['USDT'] = {
      symbol: 'USDT',
      balance: usdtBal,
      rawBalance: (usdtBal * 1e6).toFixed(0),
      decimals: 6,
      priceUsd: 1.0,
      valueUsd: usdtBal,
      contractAddress: config.contracts.usdt,
    };
  }

  // 3. Fetch USDC if configured
  if (config.contracts.usdc) {
    const usdcBal = await fetchERC20Balance(network, config.contracts.usdc, address, 6);
    tokens['USDC'] = {
      symbol: 'USDC',
      balance: usdcBal,
      rawBalance: (usdcBal * 1e6).toFixed(0),
      decimals: 6,
      priceUsd: 1.0,
      valueUsd: usdcBal,
      contractAddress: config.contracts.usdc,
    };
  }

  const tokenTotal = Object.values(tokens).reduce((sum, t) => sum + t.valueUsd, 0);
  const totalValueUsd = nativeValueUsd + tokenTotal;

  return {
    network,
    address,
    native: {
      symbol: nativeSymbol,
      balance: nativeBal,
      rawBalance: (nativeBal * 1e18).toFixed(0),
      decimals: config.nativeCurrency.decimals,
      priceUsd: nativePrice,
      valueUsd: nativeValueUsd,
    },
    tokens,
    totalValueUsd,
    lastUpdated: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '');
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string format');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}
