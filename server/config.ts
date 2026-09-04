import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional(),
  SQLITE_PATH: z.string().default(':memory:'),
  SESSION_SECRET: z.string().default('lumen_enterprise_super_secret_session_key_min_32_characters_long_2026'),
  ENCRYPTION_MASTER_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'), // 32-byte hex
  GOOGLE_CLIENT_ID: z.string().default('mock-google-client-id.apps.googleusercontent.com'),
  APPLE_CLIENT_ID: z.string().default('com.lumen.trading.client'),
  APPLE_TEAM_ID: z.string().default('APPLE_TEAM_ID'),
  APPLE_KEY_ID: z.string().default('APPLE_KEY_ID'),
  PAYMENT_PROVIDER: z.enum(['phonepe', 'razorpay', 'stripe', 'sandbox']).default('sandbox'),
  PAYMENT_PROVIDER_KEY: z.string().default('rzp_test_mock_key'),
  PAYMENT_PROVIDER_SECRET: z.string().default('mock_payment_secret'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('whsec_lumen_enterprise_mock_webhook_secret_2026'),
  // PhonePe Payment Gateway Credentials
  PHONEPE_MERCHANT_ID: z.string().default('PGTESTPAYUAT'),
  PHONEPE_SALT_KEY: z.string().default('099eb0cd-02cf-4e2a-8aca-3e6c6aff0399'),
  PHONEPE_SALT_INDEX: z.string().default('1'),
  PHONEPE_HOST_URL: z.string().default('https://api-preprod.phonepe.com/apis/pg-sandbox'),
  PHONEPE_CALLBACK_URL: z.string().default('http://localhost:3001/api/webhooks/phonepe'),
  BINANCE_ENV: z.enum(['testnet', 'mainnet']).default('testnet'),
  BINANCE_API_KEY: z.string().optional(),
  BINANCE_API_SECRET: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000'),
}).refine(
  (data) => {
    // Fail-closed rule in production: require canonical PostgreSQL database
    if (data.NODE_ENV === 'production' && !data.DATABASE_URL) {
      return false;
    }
    return true;
  },
  {
    message: 'DATABASE_URL (PostgreSQL) is strictly required when running in production mode',
    path: ['DATABASE_URL'],
  }
).refine(
  (data) => {
    // Fail-closed rule in production: if payment provider is phonepe, credentials cannot be default sandbox test values
    if (data.NODE_ENV === 'production' && data.PAYMENT_PROVIDER === 'phonepe') {
      if (!data.PHONEPE_MERCHANT_ID || data.PHONEPE_MERCHANT_ID === 'PGTESTPAYUAT') {
        return false;
      }
      if (!data.PHONEPE_SALT_KEY || data.PHONEPE_SALT_KEY === '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399') {
        return false;
      }
    }
    return true;
  },
  {
    message: 'Production PhonePe credentials (PHONEPE_MERCHANT_ID and PHONEPE_SALT_KEY) are required in production mode',
    path: ['PHONEPE_MERCHANT_ID'],
  }
);

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid server configuration environment variables:', parsed.error.format());
  throw new Error('Invalid server configuration');
}

export const config = parsed.data;

export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
