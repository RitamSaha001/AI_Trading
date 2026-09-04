/**
 * Server-Side Strict Origin & CORS Validator
 * Enforces exact origin matching (protocol + hostname + port), eliminates
 * insecure substring checks, and implements fail-closed production controls.
 */

const STANDARD_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * Parses and normalizes an Origin or URL string to exact protocol + host + port.
 * Rejects invalid protocols, credentials, and malformed strings.
 */
export function normalizeOrigin(rawOrigin: string | undefined | null): string | null {
  if (!rawOrigin || typeof rawOrigin !== 'string') return null;
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed === 'null') return null;

  try {
    const parsed = new URL(trimmed);

    // Only HTTP and HTTPS schemes are permitted
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Reject userinfo (e.g., http://user:pass@domain.com)
    if (parsed.username || parsed.password) {
      return null;
    }

    // Return exact origin (protocol + host + port if non-standard)
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns the parsed list of allowed origins based on configuration and environment.
 */
export function getAllowedOriginsList(env: string, allowedOriginsConfig: string): string[] {
  const configured = (allowedOriginsConfig || '')
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter((o): o is string => Boolean(o));

  if (env === 'development') {
    const combined = new Set([...configured, ...STANDARD_DEV_ORIGINS]);
    return Array.from(combined);
  }

  if (env === 'test') {
    const combined = new Set([...configured, ...STANDARD_DEV_ORIGINS]);
    return Array.from(combined);
  }

  // Production and Staging: Strictly configured origins only
  return configured;
}

/**
 * Validates whether an incoming request Origin is permitted under current environment rules.
 * Uses exact matching ONLY. Never uses substring matching.
 */
export function isValidAllowedOrigin(
  origin: string | undefined | null,
  env: string,
  allowedOriginsConfig: string
): boolean {
  if (!origin) return false;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowedList = getAllowedOriginsList(env, allowedOriginsConfig);

  // In production/staging, fail closed if no origins are configured
  if ((env === 'production' || env === 'staging') && allowedList.length === 0) {
    return false;
  }

  return allowedList.includes(normalized);
}
