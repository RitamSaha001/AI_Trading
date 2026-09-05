import { FastifyRequest, FastifyReply } from 'fastify';
import { ServerAuthService, AuthenticatedUser } from '../services/authService';
import { isValidAllowedOrigin, normalizeOrigin } from '../utils/originValidator';
import { config } from '../config';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Extracts session token from incoming request.
 * Prioritizes HttpOnly cookie for browser sessions, with Bearer header fallback for API/non-browser clients.
 */
export function extractSessionToken(req: FastifyRequest): string | null {
  // 1. Primary: From HttpOnly Cookie
  const cookies = (req as any).cookies;
  if (cookies && cookies.lumen_session) {
    return cookies.lumen_session;
  }

  // 2. Secondary: From Authorization Bearer header (for headless/programmatic API clients)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * CSRF / Origin Defense for State-Changing Requests (POST, PUT, PATCH, DELETE).
 * Verifies that incoming requests originate from an allowed origin.
 */
export async function verifyOriginOrCsrf(req: FastifyRequest, reply: FastifyReply) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return;
  }

  const rawOrigin = req.headers.origin;
  const rawReferer = req.headers.referer;

  let requestOrigin: string | null = null;
  if (rawOrigin) {
    requestOrigin = normalizeOrigin(rawOrigin);
  } else if (rawReferer) {
    try {
      requestOrigin = new URL(rawReferer).origin.toLowerCase();
    } catch {
      requestOrigin = null;
    }
  }

  // If an Origin or Referer is present, it MUST be an allowed origin
  if (requestOrigin) {
    const isAllowed = isValidAllowedOrigin(requestOrigin, config.NODE_ENV, config.ALLOWED_ORIGINS);
    if (!isAllowed) {
      return reply.status(403).send({
        success: false,
        error: 'Cross-origin state-changing request blocked by CSRF / Origin policy.',
      });
    }
    return;
  }

  // If neither Origin nor Referer is present, check if request uses browser cookie credentials
  const hasCookieSession = Boolean((req as any).cookies?.lumen_session);
  if (hasCookieSession && (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging')) {
    // In production/staging, browser state-changing requests using cookie authentication MUST provide Origin or Referer
    return reply.status(403).send({
      success: false,
      error: 'State-changing cookie requests must provide a valid Origin header.',
    });
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const token = extractSessionToken(req);
  if (!token) return;

  const user = await ServerAuthService.validateSession(token);
  if (user) {
    req.user = user;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  await authenticate(req, reply);
  if (!req.user) {
    return reply.status(401).send({
      success: false,
      error: 'Authentication required. Please sign in with Google, Apple, or Email.',
    });
  }
}

export async function requireActive(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (req.user?.isEmergencyFrozen) {
    return reply.status(403).send({
      success: false,
      error: 'Account is emergency frozen. Live trading and withdrawals are halted.',
    });
  }
}

export function requireKYC(minTier: 'tier1_basic' | 'tier2_verified') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireActive(req, reply);
    if (!req.user) return;

    if (req.user.kycStatus !== 'verified') {
      return reply.status(403).send({
        success: false,
        error: `KYC verification required. Current status: ${req.user.kycStatus}.`,
      });
    }

    if (minTier === 'tier2_verified' && req.user.kycTier !== 'tier2_verified') {
      return reply.status(403).send({
        success: false,
        error: 'Tier 2 full identity verification required for this operation.',
      });
    }
  };
}

/**
 * Administrator Authorization Guard.
 * Enforces that caller is an authenticated, non-frozen administrator.
 * Validates against process.env.ADMIN_EMAIL, company domain (@lumen.io),
 * or non-production testing override headers.
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  // Non-production test bypass support
  if (config.NODE_ENV === 'test' && req.headers['x-admin-bypass'] === 'true') {
    if (!req.user) {
      req.user = {
        id: 'usr_admin_mock_001',
        email: 'admin@lumen.io',
        displayName: 'System Administrator',
        provider: 'email',
        providerId: 'usr_admin_mock_001',
        kycTier: 'tier2_verified',
        kycStatus: 'verified',
        accountMode: 'live',
        isEmergencyFrozen: false,
        createdAt: Date.now(),
      };
    }
    return;
  }

  await requireActive(req, reply);
  if (!req.user) return; // Response sent by requireAuth

  const userEmail = (req.user.email || '').toLowerCase().trim();
  const configuredAdmin = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

  const isConfiguredAdmin = configuredAdmin !== '' && userEmail === configuredAdmin;
  const isLumenAdminDomain = userEmail.endsWith('@lumen.io') && (userEmail.startsWith('admin') || userEmail.startsWith('compliance') || userEmail.startsWith('audit'));
  const isNonProdBypass = config.NODE_ENV !== 'production' && (userEmail.includes('admin') || req.headers['x-admin-bypass'] === 'true');

  if (!isConfiguredAdmin && !isLumenAdminDomain && !isNonProdBypass) {
    return reply.status(403).send({
      success: false,
      error: 'Administrative or compliance auditor privileges required for this operation.',
    });
  }
}
