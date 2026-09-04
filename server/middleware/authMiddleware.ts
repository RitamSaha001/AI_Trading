import { FastifyRequest, FastifyReply } from 'fastify';
import { ServerAuthService, AuthenticatedUser } from '../services/authService';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function extractSessionToken(req: FastifyRequest): string | null {
  // 1. From Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. From Cookie
  const cookies = (req as any).cookies;
  if (cookies && cookies.lumen_session) {
    return cookies.lumen_session;
  }

  return null;
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
