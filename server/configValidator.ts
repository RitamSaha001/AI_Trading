import { z } from 'zod';

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test';

export interface ServerConfig {
  NODE_ENV: AppEnvironment;
  PORT: number;
  HOST: string;
  DATABASE_URL?: string;
  SQLITE_PATH: string;
  SESSION_SECRET: string;
  ENCRYPTION_MASTER_KEY: string;
  GOOGLE_CLIENT_ID: string;
  APPLE_CLIENT_ID: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  PAYMENT_PROVIDER: 'phonepe' | 'razorpay' | 'stripe' | 'sandbox';
  PAYMENT_PROVIDER_KEY: string;
  PAYMENT_PROVIDER_SECRET: string;
  PAYMENT_WEBHOOK_SECRET: string;
  PHONEPE_MERCHANT_ID: string;
  PHONEPE_SALT_KEY: string;
  PHONEPE_SALT_INDEX: string;
  PHONEPE_HOST_URL: string;
  PHONEPE_CALLBACK_URL: string;
  BINANCE_ENV: 'testnet' | 'mainnet';
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  ALLOWED_ORIGINS: string;
}

export interface SecurityConfigAuditResult {
  environment: AppEnvironment;
  databaseConfigured: boolean;
  databaseEngine: 'postgresql' | 'sqlite';
  sessionSecretConfigured: boolean;
  encryptionKeyConfigured: boolean;
  paymentProvider: string;
  paymentConfigured: boolean;
  binanceConfigured: boolean;
  binanceEnv: 'testnet' | 'mainnet';
  unsafeDefaultsDetected: boolean;
  productionSafe: boolean;
  issues: string[]; // Sanitized messages ONLY - no secret values
}

export interface ValidationResult {
  success: boolean;
  data?: ServerConfig;
  errors: string[];
}

// Development & Test safe fallbacks - STRICTLY INACTIVE in production/staging
const DEV_TEST_FALLBACKS = {
  SESSION_SECRET: 'lumen_dev_session_secret_min_32_characters_safe_2026',
  ENCRYPTION_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  GOOGLE_CLIENT_ID: 'mock-google-client-id.apps.googleusercontent.com',
  APPLE_CLIENT_ID: 'com.lumen.trading.client',
  APPLE_TEAM_ID: 'APPLE_TEAM_ID',
  APPLE_KEY_ID: 'APPLE_KEY_ID',
  PAYMENT_PROVIDER: 'sandbox' as const,
  PAYMENT_PROVIDER_KEY: 'rzp_test_mock_key',
  PAYMENT_PROVIDER_SECRET: 'mock_payment_secret',
  PAYMENT_WEBHOOK_SECRET: 'whsec_lumen_enterprise_mock_webhook_secret_2026',
  PHONEPE_MERCHANT_ID: 'PGTESTPAYUAT',
  PHONEPE_SALT_KEY: '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
  PHONEPE_SALT_INDEX: '1',
  PHONEPE_HOST_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  PHONEPE_CALLBACK_URL: 'http://localhost:3001/api/webhooks/phonepe',
  BINANCE_ENV: 'testnet' as const,
};

// Known default/placeholder values that MUST be rejected in production and staging
const KNOWN_INSECURE_ENCRYPTION_KEYS = new Set([
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '1111111111111111111111111111111111111111111111111111111111111111',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
]);

const KNOWN_INSECURE_SESSION_SECRETS = new Set([
  'lumen_enterprise_super_secret_session_key_min_32_characters_long_2026',
  'lumen_dev_session_secret_min_32_characters_safe_2026',
]);

const FORBIDDEN_SESSION_KEYWORDS = [
  'mock',
  'test',
  'demo',
  'example',
  'default',
  'placeholder',
  'super_secret',
  'lumen_enterprise_super_secret',
];

/**
 * Validates ENCRYPTION_MASTER_KEY strictly:
 * - Must be 64 hexadecimal characters (32 bytes) for AES-256-GCM
 * - Must not be a known example or trivial repetitive key
 * - Sanitizes all error messages (never prints key value)
 */
export function validateEncryptionMasterKey(
  key: unknown,
  env: AppEnvironment
): { valid: boolean; error?: string } {
  if (typeof key !== 'string' || !key.trim()) {
    if (env === 'production' || env === 'staging') {
      return {
        valid: false,
        error: 'ENCRYPTION_MASTER_KEY is strictly required in production/staging mode. Generate via openssl rand -hex 32.',
      };
    }
    return { valid: true };
  }

  const trimmed = key.trim();

  if (trimmed.length !== 64) {
    return {
      valid: false,
      error: `ENCRYPTION_MASTER_KEY must be exactly 64 hexadecimal characters (32 bytes). Received length: ${trimmed.length}.`,
    };
  }

  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'ENCRYPTION_MASTER_KEY contains non-hexadecimal characters. Only 0-9 and a-f are permitted.',
    };
  }

  // Reject known defaults/placeholders and low-entropy keys in production and staging
  if (env === 'production' || env === 'staging') {
    const lower = trimmed.toLowerCase();

    if (KNOWN_INSECURE_ENCRYPTION_KEYS.has(lower)) {
      return {
        valid: false,
        error: 'ENCRYPTION_MASTER_KEY matches a known public repository default or trivial key. Refusing to start.',
      };
    }

    // Reject repeating patterns with very low character entropy
    const uniqueChars = new Set(lower);
    if (uniqueChars.size <= 4) {
      return {
        valid: false,
        error: 'ENCRYPTION_MASTER_KEY has insufficient character entropy (trivial pattern).',
      };
    }

    if (lower.startsWith('deadbeef') && /^(deadbeef)+$/i.test(lower)) {
      return {
        valid: false,
        error: 'ENCRYPTION_MASTER_KEY contains obvious mock/placeholder pattern.',
      };
    }
  }

  return { valid: true };
}

/**
 * Validates SESSION_SECRET strictly:
 * - Must be at least 32 characters
 * - Must not contain obvious mock/test/placeholder keywords
 * - Rejects known repository defaults
 * - Sanitizes all error messages
 */
export function validateSessionSecret(
  secret: unknown,
  env: AppEnvironment
): { valid: boolean; error?: string } {
  if (typeof secret !== 'string' || !secret.trim()) {
    if (env === 'production' || env === 'staging') {
      return {
        valid: false,
        error: 'SESSION_SECRET is strictly required in production/staging mode.',
      };
    }
    return { valid: true };
  }

  const trimmed = secret.trim();

  if (trimmed.length < 32) {
    return {
      valid: false,
      error: `SESSION_SECRET must be at least 32 characters long. Received length: ${trimmed.length}.`,
    };
  }

  if (env === 'production' || env === 'staging') {
    if (KNOWN_INSECURE_SESSION_SECRETS.has(trimmed)) {
      return {
        valid: false,
        error: 'SESSION_SECRET matches a known public repository default. Generate an unpredictable secret in your secret manager.',
      };
    }

    const lower = trimmed.toLowerCase();
    for (const word of FORBIDDEN_SESSION_KEYWORDS) {
      if (lower.includes(word)) {
        return {
          valid: false,
          error: `SESSION_SECRET contains forbidden insecure pattern ('${word}'). Provide an unpredictable production secret.`,
        };
      }
    }

    // Reject trivial repeating characters
    if (/^(.)\1*$/.test(trimmed)) {
      return {
        valid: false,
        error: 'SESSION_SECRET cannot be a single repeating character.',
      };
    }
  }

  return { valid: true };
}

/**
 * Validates server configuration strictly with fail-closed production semantics.
 * Never leaks secret values in error messages.
 */
export function validateServerConfig(rawEnv: Record<string, any>): ValidationResult {
  const errors: string[] = [];

  const rawNodeEnv = (rawEnv.NODE_ENV || 'development').trim();
  const envResult = z
    .enum(['development', 'staging', 'production', 'test'])
    .safeParse(rawNodeEnv);

  const env: AppEnvironment = envResult.success ? envResult.data : 'development';
  if (!envResult.success) {
    errors.push(`Invalid NODE_ENV: '${rawNodeEnv}'. Allowed values: development, staging, production, test.`);
  }

  const isProd = env === 'production';
  const isStaging = env === 'staging';
  const isTest = env === 'test';
  const isDev = env === 'development';

  // Base Schema with typed coercion
  const baseSchema = z.object({
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default(env),
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().optional(),
    SQLITE_PATH: z.string().default(':memory:'),
    SESSION_SECRET: z.string().optional(),
    ENCRYPTION_MASTER_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    PAYMENT_PROVIDER: z.enum(['phonepe', 'razorpay', 'stripe', 'sandbox']).default(
      isProd ? 'phonepe' : 'sandbox'
    ),
    PAYMENT_PROVIDER_KEY: z.string().optional(),
    PAYMENT_PROVIDER_SECRET: z.string().optional(),
    PAYMENT_WEBHOOK_SECRET: z.string().optional(),
    PHONEPE_MERCHANT_ID: z.string().optional(),
    PHONEPE_SALT_KEY: z.string().optional(),
    PHONEPE_SALT_INDEX: z.string().default('1'),
    PHONEPE_HOST_URL: z.string().optional(),
    PHONEPE_CALLBACK_URL: z.string().optional(),
    BINANCE_ENV: z.enum(['testnet', 'mainnet']).default(isProd ? 'mainnet' : 'testnet'),
    BINANCE_API_KEY: z.string().optional(),
    BINANCE_API_SECRET: z.string().optional(),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000'),
  });

  const parsedBase = baseSchema.safeParse(rawEnv);
  if (!parsedBase.success) {
    for (const issue of parsedBase.error.issues) {
      errors.push(`Field '${issue.path.join('.')}': ${issue.message}`);
    }
  }

  const candidate = parsedBase.success ? parsedBase.data : (rawEnv as any);

  // Apply development/test defaults ONLY when in development or test mode
  const sessionSecret = candidate.SESSION_SECRET || (isDev || isTest ? DEV_TEST_FALLBACKS.SESSION_SECRET : '');
  const encryptionKey = candidate.ENCRYPTION_MASTER_KEY || (isDev || isTest ? DEV_TEST_FALLBACKS.ENCRYPTION_MASTER_KEY : '');
  const googleClientId = candidate.GOOGLE_CLIENT_ID || (isDev || isTest ? DEV_TEST_FALLBACKS.GOOGLE_CLIENT_ID : '');
  const appleClientId = candidate.APPLE_CLIENT_ID || (isDev || isTest ? DEV_TEST_FALLBACKS.APPLE_CLIENT_ID : '');
  const appleTeamId = candidate.APPLE_TEAM_ID || (isDev || isTest ? DEV_TEST_FALLBACKS.APPLE_TEAM_ID : '');
  const appleKeyId = candidate.APPLE_KEY_ID || (isDev || isTest ? DEV_TEST_FALLBACKS.APPLE_KEY_ID : '');
  const paymentProvider = candidate.PAYMENT_PROVIDER || (isDev || isTest ? DEV_TEST_FALLBACKS.PAYMENT_PROVIDER : 'phonepe');
  const paymentProviderKey = candidate.PAYMENT_PROVIDER_KEY || (isDev || isTest ? DEV_TEST_FALLBACKS.PAYMENT_PROVIDER_KEY : '');
  const paymentProviderSecret = candidate.PAYMENT_PROVIDER_SECRET || (isDev || isTest ? DEV_TEST_FALLBACKS.PAYMENT_PROVIDER_SECRET : '');
  const paymentWebhookSecret = candidate.PAYMENT_WEBHOOK_SECRET || (isDev || isTest ? DEV_TEST_FALLBACKS.PAYMENT_WEBHOOK_SECRET : '');
  const phonepeMerchantId = candidate.PHONEPE_MERCHANT_ID || (isDev || isTest ? DEV_TEST_FALLBACKS.PHONEPE_MERCHANT_ID : '');
  const phonepeSaltKey = candidate.PHONEPE_SALT_KEY || (isDev || isTest ? DEV_TEST_FALLBACKS.PHONEPE_SALT_KEY : '');
  const phonepeSaltIndex = candidate.PHONEPE_SALT_INDEX || DEV_TEST_FALLBACKS.PHONEPE_SALT_INDEX;
  const phonepeHostUrl = candidate.PHONEPE_HOST_URL || (isDev || isTest ? DEV_TEST_FALLBACKS.PHONEPE_HOST_URL : '');
  const phonepeCallbackUrl = candidate.PHONEPE_CALLBACK_URL || (isDev || isTest ? DEV_TEST_FALLBACKS.PHONEPE_CALLBACK_URL : '');
  const binanceEnv = candidate.BINANCE_ENV || (isDev || isTest ? DEV_TEST_FALLBACKS.BINANCE_ENV : 'mainnet');

  // Strict Validation: SESSION_SECRET
  const sessionValidation = validateSessionSecret(sessionSecret, env);
  if (!sessionValidation.valid) {
    errors.push(sessionValidation.error!);
  }

  // Strict Validation: ENCRYPTION_MASTER_KEY
  const encKeyValidation = validateEncryptionMasterKey(encryptionKey, env);
  if (!encKeyValidation.valid) {
    errors.push(encKeyValidation.error!);
  }

  // Production Fail-Closed Rules
  if (isProd) {
    // 1. Mandatory PostgreSQL Database
    if (!candidate.DATABASE_URL || !candidate.DATABASE_URL.trim()) {
      errors.push('DATABASE_URL (PostgreSQL) is strictly required in production mode.');
    } else {
      const dbUrl = candidate.DATABASE_URL.trim().toLowerCase();
      if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
        errors.push('DATABASE_URL must be a valid PostgreSQL connection URI (postgres:// or postgresql://) in production mode.');
      }
      if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') || dbUrl.includes('0.0.0.0') || dbUrl.includes('::1')) {
        errors.push('DATABASE_URL cannot point to localhost/127.0.0.1 in production mode.');
      }
    }

    // 2. Prohibit sandbox payment provider in production
    if (paymentProvider === 'sandbox') {
      errors.push("PAYMENT_PROVIDER cannot be 'sandbox' in production mode. Configure a real provider (e.g., 'phonepe').");
    }

    // 3. If PhonePe is used in production, require real credentials
    if (paymentProvider === 'phonepe') {
      if (!phonepeMerchantId || phonepeMerchantId === 'PGTESTPAYUAT' || /mock|test|demo|sandbox/i.test(phonepeMerchantId)) {
        errors.push("Production PHONEPE_MERCHANT_ID is required and cannot be sandbox default ('PGTESTPAYUAT').");
      }
      if (!phonepeSaltKey || phonepeSaltKey === '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399' || /mock|test/i.test(phonepeSaltKey)) {
        errors.push('Production PHONEPE_SALT_KEY is required and cannot be sandbox test key.');
      }
      if (!phonepeHostUrl || phonepeHostUrl.includes('api-preprod.phonepe.com') || phonepeHostUrl.includes('localhost')) {
        errors.push('PHONEPE_HOST_URL cannot point to preprod sandbox or localhost in production mode.');
      }
      if (!phonepeCallbackUrl || phonepeCallbackUrl.includes('localhost') || phonepeCallbackUrl.includes('127.0.0.1')) {
        errors.push('PHONEPE_CALLBACK_URL must be an external HTTPS endpoint in production mode (cannot be localhost).');
      }
      if (!paymentWebhookSecret || paymentWebhookSecret === 'whsec_lumen_enterprise_mock_webhook_secret_2026' || paymentWebhookSecret.length < 32 || /mock|test|demo/i.test(paymentWebhookSecret)) {
        errors.push('PAYMENT_WEBHOOK_SECRET must be at least 32 characters and cannot use default mock value in production mode.');
      }
    }

    // 4. Binance Execution Gateway in Production
    // If live trading is configured or API keys provided
    const hasBinanceKey = Boolean(candidate.BINANCE_API_KEY && candidate.BINANCE_API_KEY.trim());
    const hasBinanceSecret = Boolean(candidate.BINANCE_API_SECRET && candidate.BINANCE_API_SECRET.trim());

    if (hasBinanceKey || hasBinanceSecret || binanceEnv === 'mainnet') {
      if (binanceEnv === 'testnet') {
        errors.push("BINANCE_ENV cannot be 'testnet' in production when live exchange trading is configured.");
      }
      if (!hasBinanceKey || /mock|test|example/i.test(candidate.BINANCE_API_KEY || '')) {
        errors.push('BINANCE_API_KEY is required and cannot be a mock/placeholder value when live exchange trading is enabled.');
      }
      if (!hasBinanceSecret || /mock|test|example/i.test(candidate.BINANCE_API_SECRET || '')) {
        errors.push('BINANCE_API_SECRET is required and cannot be a mock/placeholder value when live exchange trading is enabled.');
      }
    }

    // 5. Social OAuth credentials in Production
    if (googleClientId && (/mock-google-client-id/i.test(googleClientId) || /your-client-id/i.test(googleClientId))) {
      errors.push('GOOGLE_CLIENT_ID contains mock or example placeholder in production mode.');
    }
    if (appleTeamId && (appleTeamId === 'APPLE_TEAM_ID' || /mock/i.test(appleTeamId))) {
      errors.push('APPLE_TEAM_ID contains placeholder value in production mode.');
    }
    if (appleKeyId && (appleKeyId === 'APPLE_KEY_ID' || /mock/i.test(appleKeyId))) {
      errors.push('APPLE_KEY_ID contains placeholder value in production mode.');
    }
  }

  // Staging Fail-Closed Rules
  if (isStaging) {
    if (!candidate.SESSION_SECRET || KNOWN_INSECURE_SESSION_SECRETS.has(candidate.SESSION_SECRET)) {
      errors.push('SESSION_SECRET is required in staging mode and cannot use repository default.');
    }
    if (!candidate.ENCRYPTION_MASTER_KEY || KNOWN_INSECURE_ENCRYPTION_KEYS.has(candidate.ENCRYPTION_MASTER_KEY.toLowerCase())) {
      errors.push('ENCRYPTION_MASTER_KEY is required in staging mode and cannot use repository default.');
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  const finalConfig: ServerConfig = {
    NODE_ENV: env,
    PORT: candidate.PORT ?? 3001,
    HOST: candidate.HOST ?? '0.0.0.0',
    DATABASE_URL: candidate.DATABASE_URL,
    SQLITE_PATH: candidate.SQLITE_PATH ?? ':memory:',
    SESSION_SECRET: sessionSecret,
    ENCRYPTION_MASTER_KEY: encryptionKey,
    GOOGLE_CLIENT_ID: googleClientId,
    APPLE_CLIENT_ID: appleClientId,
    APPLE_TEAM_ID: appleTeamId,
    APPLE_KEY_ID: appleKeyId,
    PAYMENT_PROVIDER: paymentProvider,
    PAYMENT_PROVIDER_KEY: paymentProviderKey,
    PAYMENT_PROVIDER_SECRET: paymentProviderSecret,
    PAYMENT_WEBHOOK_SECRET: paymentWebhookSecret,
    PHONEPE_MERCHANT_ID: phonepeMerchantId,
    PHONEPE_SALT_KEY: phonepeSaltKey,
    PHONEPE_SALT_INDEX: phonepeSaltIndex,
    PHONEPE_HOST_URL: phonepeHostUrl,
    PHONEPE_CALLBACK_URL: phonepeCallbackUrl,
    BINANCE_ENV: binanceEnv,
    BINANCE_API_KEY: candidate.BINANCE_API_KEY,
    BINANCE_API_SECRET: candidate.BINANCE_API_SECRET,
    ALLOWED_ORIGINS: candidate.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000',
  };

  return {
    success: true,
    data: finalConfig,
    errors: [],
  };
}

/**
 * Runs a security audit on the server configuration.
 * Exposes ONLY sanitized metadata, status flags, and sanitized issue descriptions.
 * NEVER leaks secrets, tokens, or encryption keys.
 */
export function auditServerSecurityConfig(
  config: Partial<ServerConfig>,
  rawEnv?: Record<string, any>
): SecurityConfigAuditResult {
  const env = (config.NODE_ENV || rawEnv?.NODE_ENV || 'development') as AppEnvironment;
  const validation = validateServerConfig(rawEnv || (config as any));

  const hasPostgres = Boolean(config.DATABASE_URL && config.DATABASE_URL.startsWith('postgres'));
  const sessionValid = validateSessionSecret(config.SESSION_SECRET, env).valid;
  const encKeyValid = validateEncryptionMasterKey(config.ENCRYPTION_MASTER_KEY, env).valid;
  const binanceConfigured = Boolean(config.BINANCE_API_KEY && config.BINANCE_API_SECRET);
  const paymentConfigured = config.PAYMENT_PROVIDER === 'phonepe'
    ? Boolean(config.PHONEPE_MERCHANT_ID && config.PHONEPE_SALT_KEY)
    : config.PAYMENT_PROVIDER === 'sandbox';

  const isProd = env === 'production';
  const issues = validation.errors;

  const unsafeDefaultsDetected = issues.length > 0 || (
    isProd && (
      !sessionValid ||
      !encKeyValid ||
      !hasPostgres ||
      config.PAYMENT_PROVIDER === 'sandbox'
    )
  );

  const productionSafe = isProd ? issues.length === 0 && !unsafeDefaultsDetected : true;

  return {
    environment: env,
    databaseConfigured: Boolean(config.DATABASE_URL || config.SQLITE_PATH),
    databaseEngine: hasPostgres ? 'postgresql' : 'sqlite',
    sessionSecretConfigured: sessionValid,
    encryptionKeyConfigured: encKeyValid,
    paymentProvider: config.PAYMENT_PROVIDER || 'unknown',
    paymentConfigured,
    binanceConfigured,
    binanceEnv: config.BINANCE_ENV || 'testnet',
    unsafeDefaultsDetected,
    productionSafe,
    issues,
  };
}
