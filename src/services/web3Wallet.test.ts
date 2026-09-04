import { describe, it, expect } from 'vitest';
import {
  keccak256,
  keccak256Hex,
  privateKeyToAddress,
  generateMnemonic,
  validateMnemonic,
  mnemonicToPrivateKey,
  generateNewWallet,
  encryptKeystore,
  decryptKeystore,
  bytesToHex,
  hexToBytes,
  WEB3_NETWORKS,
} from './web3Wallet';

describe('Web3 EVM Wallet Engine', () => {
  describe('Keccak-256 Hashing', () => {
    it('matches official Ethereum Keccak-256 empty string test vector', () => {
      const empty = new Uint8Array(0);
      const hash = bytesToHex(keccak256(empty));
      expect(hash).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    });

    it('computes correct Keccak-256 hash for ascii strings', () => {
      const hash = keccak256Hex('hello world');
      expect(hash).toBe('47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad');
    });
  });

  describe('Secp256k1 & EIP-55 Address Derivation', () => {
    it('derives correct Ethereum address for scalar k=1', () => {
      const privKey1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const address = privateKeyToAddress(privKey1);
      expect(address).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
    });

    it('derives correct Ethereum address for scalar k=2', () => {
      const privKey2 = '0x0000000000000000000000000000000000000000000000000000000000000002';
      const address = privateKeyToAddress(privKey2);
      expect(address).toBe('0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF');
    });

    it('rejects invalid private key length', () => {
      expect(() => privateKeyToAddress('0x1234')).toThrow(/expected 64 hex characters/i);
    });

    it('rejects zero or out-of-range private keys', () => {
      const zeroKey = '0x0000000000000000000000000000000000000000000000000000000000000000';
      expect(() => privateKeyToAddress(zeroKey)).toThrow(/scalar range/i);
    });
  });

  describe('BIP-39 Mnemonic Generator & Validator', () => {
    it('generates a valid 12-word BIP-39 mnemonic phrase', async () => {
      const mnemonic = await generateMnemonic();
      const words = mnemonic.split(' ');
      expect(words.length).toBe(12);

      const isValid = await validateMnemonic(mnemonic);
      expect(isValid).toBe(true);
    });

    it('rejects an invalid mnemonic with altered words or bad checksum', async () => {
      // 12 abandons has entropy=0, but SHA-256(0) checksum is 11 ('about'), so 12 abandons is guaranteed invalid checksum
      const invalidChecksum = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
      expect(await validateMnemonic(invalidChecksum)).toBe(false);

      // Invalid word not in wordlist
      const invalidWord = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon invalidword';
      expect(await validateMnemonic(invalidWord)).toBe(false);

      // Invalid word count
      expect(await validateMnemonic('abandon ability')).toBe(false);
    });

    it('deterministically derives private key and address from valid mnemonic', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const isValid = await validateMnemonic(mnemonic);
      expect(isValid).toBe(true);

      const privKey = await mnemonicToPrivateKey(mnemonic);
      expect(privKey.startsWith('0x')).toBe(true);
      expect(privKey.length).toBe(66);

      const address = privateKeyToAddress(privKey);
      expect(address.startsWith('0x')).toBe(true);
      expect(address.length).toBe(42);

      // Deterministic check
      const privKey2 = await mnemonicToPrivateKey(mnemonic);
      expect(privKey2).toBe(privKey);
    });

    it('generates a complete new self-custodial wallet bundle', async () => {
      const wallet = await generateNewWallet();
      expect(wallet.mnemonic.split(' ').length).toBe(12);
      expect(wallet.privateKey.length).toBe(66);
      expect(wallet.address.startsWith('0x')).toBe(true);
      expect(wallet.address.length).toBe(42);
      expect(wallet.createdAt).toBeGreaterThan(0);
    });
  });

  describe('AES-256-GCM Keystore Vault', () => {
    it('encrypts and decrypts a private key and mnemonic with passphrase', async () => {
      const privKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const pin = '482910';

      const keystore = await encryptKeystore(privKey, pin, mnemonic);
      expect(keystore.version).toBe(1);
      expect(keystore.crypto.cipher).toBe('aes-256-gcm');
      expect(keystore.address).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
      expect(keystore.crypto.ciphertext).toBeDefined();

      // Successful decryption
      const decrypted = await decryptKeystore(keystore, pin);
      expect(decrypted.privateKey.toLowerCase()).toBe(privKey.toLowerCase());
      expect(decrypted.address).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
      expect(decrypted.mnemonic).toBe(mnemonic);
    });

    it('fails decryption with incorrect PIN or passphrase', async () => {
      const privKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const keystore = await encryptKeystore(privKey, 'correct-passphrase');

      await expect(decryptKeystore(keystore, 'wrong-passphrase')).rejects.toThrow(
        /Invalid passphrase or PIN/i
      );
    });
  });

  describe('Network Configurations', () => {
    it('has valid RPCs and chain IDs for Polygon, Arbitrum, and Amoy', () => {
      expect(WEB3_NETWORKS.polygon.chainId).toBe(137);
      expect(WEB3_NETWORKS.polygon.nativeCurrency.symbol).toBe('POL');
      expect(WEB3_NETWORKS.polygon.rpcUrls.length).toBeGreaterThan(0);

      expect(WEB3_NETWORKS.arbitrum.chainId).toBe(42161);
      expect(WEB3_NETWORKS.arbitrum.nativeCurrency.symbol).toBe('ETH');

      expect(WEB3_NETWORKS.amoy.chainId).toBe(80002);
    });
  });

  describe('Hex conversion utilities', () => {
    it('converts bytes to hex and back without loss', () => {
      const original = new Uint8Array([0, 1, 15, 16, 255, 128, 42]);
      const hex = bytesToHex(original);
      const restored = hexToBytes(hex);
      expect(restored).toEqual(original);
    });
  });
});
