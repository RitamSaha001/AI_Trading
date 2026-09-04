import dotenv from 'dotenv';
import {
  validateServerConfig,
  auditServerSecurityConfig,
  validateEncryptionMasterKey,
  validateSessionSecret,
  ServerConfig,
  SecurityConfigAuditResult,
  AppEnvironment,
} from './configValidator';

dotenv.config();

const validation = validateServerConfig(process.env);

if (!validation.success) {
  const envName = (process.env.NODE_ENV || 'development').trim();
  console.error('================================================================================');
  console.error(`CONFIGURATION ERROR: Failed-closed server configuration in environment '${envName}':`);
  for (const err of validation.errors) {
    console.error(`  - ${err}`);
  }
  console.error('================================================================================');
  throw new Error(`Invalid server configuration: Refusing to start backend in unsafe configuration.`);
}

export const config: ServerConfig = validation.data!;
export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

export {
  validateServerConfig,
  auditServerSecurityConfig,
  validateEncryptionMasterKey,
  validateSessionSecret,
};
export type { ServerConfig, SecurityConfigAuditResult, AppEnvironment };
