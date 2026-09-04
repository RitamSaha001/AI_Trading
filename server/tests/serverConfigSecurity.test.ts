import { describe, it, expect } from 'vitest';
import {
  validateServerConfig,
  validateEncryptionMasterKey,
  validateSessionSecret,
  auditServerSecurityConfig,
} from '../configValidator';

describe('Production Server Configuration & Secret Security Boundary', () => {
  // Deterministic valid test fixtures for production testing
  // 64-character valid random hex key
  const validProductionEncKey = 'a1b2c3d4e5f67890123456789abcdef048204918204981023948102938471029';
  // 40-character valid random session secret
  const validProductionSessionSecret = 'k9F#mP2$vL8*xR5!wQ4^zN7@yB1&tC6%uH3~jK8=pE';
  const validProductionDbUrl = 'postgresql://lumen_app:SecureDbPass2026@db.prod.internal.lumen.io:5432/lumen_production?sslmode=require';
  const validPhonepeHost = 'https://api.phonepe.com/apis/hermes';
  const validPhonepeCallback = 'https://trading.lumen.io/api/webhooks/phonepe';
  const validWebhookSecret = 'whsec_98f48204981023948102938471029384a8c8e1';

  const validProductionBaseEnv = {
    NODE_ENV: 'production',
    PORT: '3001',
    HOST: '0.0.0.0',
    DATABASE_URL: validProductionDbUrl,
    SESSION_SECRET: validProductionSessionSecret,
    ENCRYPTION_MASTER_KEY: validProductionEncKey,
    PAYMENT_PROVIDER: 'phonepe',
    PHONEPE_MERCHANT_ID: 'LUMENMERCHANTPROD',
    PHONEPE_SALT_KEY: '8f9e0a1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b',
    PHONEPE_SALT_INDEX: '1',
    PHONEPE_HOST_URL: validPhonepeHost,
    PHONEPE_CALLBACK_URL: validPhonepeCallback,
    PAYMENT_WEBHOOK_SECRET: validWebhookSecret,
    BINANCE_ENV: 'mainnet',
    BINANCE_API_KEY: 'binance_live_api_key_valid_entropy_998811223344',
    BINANCE_API_SECRET: 'binance_live_api_secret_valid_entropy_556677889900',
    GOOGLE_CLIENT_ID: '77889900-prodclientid.apps.googleusercontent.com',
    APPLE_CLIENT_ID: 'com.lumen.trading.client',
    APPLE_TEAM_ID: 'TEAMID12345',
    APPLE_KEY_ID: 'KEYID12345',
  };

  it('1. production + missing SESSION_SECRET fails validation', () => {
    const env = { ...validProductionBaseEnv, SESSION_SECRET: '' };
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes('SESSION_SECRET is strictly required'))).toBe(true);
  });

  it('2. production + default repository SESSION_SECRET fails validation', () => {
    const env = {
      ...validProductionBaseEnv,
      SESSION_SECRET: 'lumen_enterprise_super_secret_session_key_min_32_characters_long_2026',
    };
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes('matches a known public repository default'))).toBe(true);
  });

  it('3. production + weak SESSION_SECRET (short or forbidden word) fails validation', () => {
    // Too short (<32 chars)
    const shortRes = validateServerConfig({ ...validProductionBaseEnv, SESSION_SECRET: 'short_secret_under_32_chars' });
    expect(shortRes.success).toBe(false);
    expect(shortRes.errors.some((e) => e.includes('at least 32 characters long'))).toBe(true);

    // Contains forbidden word 'mock'
    const mockRes = validateServerConfig({
      ...validProductionBaseEnv,
      SESSION_SECRET: 'this_is_a_mock_production_session_secret_with_32_chars',
    });
    expect(mockRes.success).toBe(false);
    expect(mockRes.errors.some((e) => e.includes("forbidden insecure pattern ('mock')"))).toBe(true);

    // Contains forbidden word 'test'
    const testRes = validateServerConfig({
      ...validProductionBaseEnv,
      SESSION_SECRET: 'test_session_secret_for_production_testing_with_length',
    });
    expect(testRes.success).toBe(false);
    expect(testRes.errors.some((e) => e.includes("forbidden insecure pattern ('test')"))).toBe(true);
  });

  it('4. production + missing ENCRYPTION_MASTER_KEY fails validation', () => {
    const env = { ...validProductionBaseEnv, ENCRYPTION_MASTER_KEY: '' };
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes('ENCRYPTION_MASTER_KEY is strictly required'))).toBe(true);
  });

  it('5. production + wrong-length encryption key fails validation', () => {
    const env = { ...validProductionBaseEnv, ENCRYPTION_MASTER_KEY: 'a1b2c3d4e5f6' }; // 12 chars instead of 64
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes('must be exactly 64 hexadecimal characters'))).toBe(true);
  });

  it('6. production + non-hex encryption key fails validation', () => {
    // 64 chars, but contains invalid characters 'z' and 'g'
    const nonHexKey = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzgggggggggggggggggggggggggggggggg';
    const env = { ...validProductionBaseEnv, ENCRYPTION_MASTER_KEY: nonHexKey };
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes('non-hexadecimal characters'))).toBe(true);
  });

  it('7. production + default/known encryption key fails validation', () => {
    // Known repo default
    const envDefault = {
      ...validProductionBaseEnv,
      ENCRYPTION_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    const resDefault = validateServerConfig(envDefault);
    expect(resDefault.success).toBe(false);
    expect(resDefault.errors.some((e) => e.includes('matches a known public repository default'))).toBe(true);

    // All zeros
    const envZeros = {
      ...validProductionBaseEnv,
      ENCRYPTION_MASTER_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const resZeros = validateServerConfig(envZeros);
    expect(resZeros.success).toBe(false);
    expect(resZeros.errors.some((e) => e.includes('matches a known public repository default'))).toBe(true);
  });

  it('8. production + sandbox/mock payment configuration fails validation', () => {
    const env = { ...validProductionBaseEnv, PAYMENT_PROVIDER: 'sandbox' };
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes("PAYMENT_PROVIDER cannot be 'sandbox' in production mode"))).toBe(true);

    // PhonePe with sandbox merchant ID
    const envPhonepeMock = {
      ...validProductionBaseEnv,
      PHONEPE_MERCHANT_ID: 'PGTESTPAYUAT',
    };
    const resPhonepeMock = validateServerConfig(envPhonepeMock);
    expect(resPhonepeMock.success).toBe(false);
    expect(resPhonepeMock.errors.some((e) => e.includes("cannot be sandbox default ('PGTESTPAYUAT')"))).toBe(true);

    // PhonePe with sandbox salt key
    const envPhonepeSalt = {
      ...validProductionBaseEnv,
      PHONEPE_SALT_KEY: '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
    };
    const resPhonepeSalt = validateServerConfig(envPhonepeSalt);
    expect(resPhonepeSalt.success).toBe(false);
    expect(resPhonepeSalt.errors.some((e) => e.includes('cannot be sandbox test key'))).toBe(true);

    // PhonePe with sandbox host URL
    const envPhonepeHost = {
      ...validProductionBaseEnv,
      PHONEPE_HOST_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    };
    const resPhonepeHost = validateServerConfig(envPhonepeHost);
    expect(resPhonepeHost.success).toBe(false);
    expect(resPhonepeHost.errors.some((e) => e.includes('cannot point to preprod sandbox'))).toBe(true);
  });

  it('9. production + testnet Binance configuration when live trading is enabled fails validation', () => {
    const env = {
      ...validProductionBaseEnv,
      BINANCE_ENV: 'testnet',
    };
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes("BINANCE_ENV cannot be 'testnet' in production"))).toBe(true);
  });

  it('10. production + placeholder OAuth configuration fails validation', () => {
    const env = {
      ...validProductionBaseEnv,
      GOOGLE_CLIENT_ID: 'mock-google-client-id.apps.googleusercontent.com',
      APPLE_TEAM_ID: 'APPLE_TEAM_ID',
    };
    const res = validateServerConfig(env);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes('GOOGLE_CLIENT_ID contains mock or example placeholder'))).toBe(true);
    expect(res.errors.some((e) => e.includes('APPLE_TEAM_ID contains placeholder value'))).toBe(true);
  });

  it('11. staging rejects placeholder security secrets', () => {
    const stagingWithDefaults = {
      NODE_ENV: 'staging',
      SESSION_SECRET: 'lumen_enterprise_super_secret_session_key_min_32_characters_long_2026',
      ENCRYPTION_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    const res = validateServerConfig(stagingWithDefaults);
    expect(res.success).toBe(false);
    expect(res.errors.some((e) => e.includes('SESSION_SECRET is required in staging mode and cannot use repository default'))).toBe(true);
    expect(res.errors.some((e) => e.includes('ENCRYPTION_MASTER_KEY is required in staging mode and cannot use repository default'))).toBe(true);
  });

  it('12. test environment can initialize safely without real production credentials', () => {
    const testEnv = {
      NODE_ENV: 'test',
    };
    const res = validateServerConfig(testEnv);
    expect(res.success).toBe(true);
    expect(res.data?.NODE_ENV).toBe('test');
    expect(res.data?.SQLITE_PATH).toBe(':memory:');
    expect(res.data?.SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(res.data?.ENCRYPTION_MASTER_KEY.length).toBe(64);
  });

  it('13. valid production configuration passes validation completely', () => {
    const res = validateServerConfig(validProductionBaseEnv);
    expect(res.success).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.data?.NODE_ENV).toBe('production');
    expect(res.data?.DATABASE_URL).toBe(validProductionDbUrl);
    expect(res.data?.PAYMENT_PROVIDER).toBe('phonepe');
    expect(res.data?.BINANCE_ENV).toBe('mainnet');
  });

  it('14. configuration errors never contain actual secret values', () => {
    const secretInput = 'my_super_sensitive_cleartext_secret_value_12345';
    const invalidEncKey = 'super_secret_cleartext_encryption_key_leaked_value_999999999999';

    const res = validateServerConfig({
      ...validProductionBaseEnv,
      SESSION_SECRET: secretInput,
      ENCRYPTION_MASTER_KEY: invalidEncKey,
    });

    expect(res.success).toBe(false);
    const joinedErrors = res.errors.join(' ');
    // Ensure secret text is completely absent from all error messages
    expect(joinedErrors).not.toContain(secretInput);
    expect(joinedErrors).not.toContain(invalidEncKey);
  });

  it('15. configuration self-audit output is strictly sanitized without leaking secrets', () => {
    const audit = auditServerSecurityConfig(validProductionBaseEnv as any, validProductionBaseEnv);

    expect(audit.environment).toBe('production');
    expect(audit.productionSafe).toBe(true);
    expect(audit.databaseConfigured).toBe(true);
    expect(audit.databaseEngine).toBe('postgresql');
    expect(audit.sessionSecretConfigured).toBe(true);
    expect(audit.encryptionKeyConfigured).toBe(true);
    expect(audit.binanceConfigured).toBe(true);
    expect(audit.unsafeDefaultsDetected).toBe(false);

    // Verify audit object structure does not have secret keys
    const auditKeys = Object.keys(audit);
    expect(auditKeys).not.toContain('SESSION_SECRET');
    expect(auditKeys).not.toContain('ENCRYPTION_MASTER_KEY');
    expect(auditKeys).not.toContain('BINANCE_API_SECRET');
    expect(auditKeys).not.toContain('PHONEPE_SALT_KEY');

    // Serialized audit must not contain the sensitive values
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain(validProductionEncKey);
    expect(serialized).not.toContain(validProductionSessionSecret);
    expect(serialized).not.toContain('binance_live_api_secret');
  });
});
