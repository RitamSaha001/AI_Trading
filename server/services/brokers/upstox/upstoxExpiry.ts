/**
 * Upstox Daily Token Lifecycle & 03:30 AM IST Expiry Management
 * 
 * Indian exchanges and SEBI mandate daily authentication for retail broker APIs.
 * Upstox API v2 access tokens expire daily at 03:30:00 IST (22:00:00 UTC of previous day).
 * 
 * This module provides exact boundary calculations, proactive expiration warnings,
 * and a 5-minute pre-market cutoff guard to prevent in-flight session drops.
 */

export type UpstoxTokenStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'DISCONNECTED';

export interface UpstoxTokenHealth {
  status: UpstoxTokenStatus;
  expiresAt: number | null;
  timeRemainingMs: number;
  timeRemainingHuman: string;
  nextExpiryIso: string | null;
  reauthRequired: boolean;
  isWithinCutoffWindow: boolean; // True if < 5 minutes before 03:30 AM IST cutoff
  warning?: string;
}

// 5 minutes cutoff buffer before 03:30 AM IST
export const UPSTOX_PRE_MARKET_CUTOFF_MS = 5 * 60 * 1000;

// 60 minutes warning threshold for "Expiring Soon"
export const UPSTOX_WARNING_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Calculates the exact millisecond timestamp of the next 03:30:00 IST boundary.
 * 03:30:00 IST = 22:00:00 UTC of the previous calendar day.
 */
export function calculateNextUpstoxExpiry(fromDate: Date = new Date()): number {
  const target = new Date(fromDate);
  target.setUTCHours(22, 0, 0, 0);

  // If 22:00:00 UTC today is already in the past, target tomorrow's 22:00:00 UTC
  if (target.getTime() <= fromDate.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target.getTime();
}

/**
 * Formats milliseconds remaining into human-readable representation.
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Computes semantic token health and actionable warnings from stored expiry timestamp.
 */
export function getTokenHealth(tokenExpiresAt: number | null, nowMs: number = Date.now()): UpstoxTokenHealth {
  if (!tokenExpiresAt) {
    return {
      status: 'DISCONNECTED',
      expiresAt: null,
      timeRemainingMs: 0,
      timeRemainingHuman: '0m',
      nextExpiryIso: null,
      reauthRequired: true,
      isWithinCutoffWindow: false,
      warning: 'No Upstox credentials stored. Re-authentication required.',
    };
  }

  const timeRemainingMs = tokenExpiresAt - nowMs;
  const nextExpiryIso = new Date(tokenExpiresAt).toISOString();

  if (timeRemainingMs <= 0) {
    return {
      status: 'EXPIRED',
      expiresAt: tokenExpiresAt,
      timeRemainingMs: 0,
      timeRemainingHuman: '0m',
      nextExpiryIso,
      reauthRequired: true,
      isWithinCutoffWindow: true,
      warning: 'Upstox daily session expired at 03:30 AM IST. Re-authentication required.',
    };
  }

  const isWithinCutoffWindow = timeRemainingMs <= UPSTOX_PRE_MARKET_CUTOFF_MS;
  const isExpiringSoon = timeRemainingMs <= UPSTOX_WARNING_THRESHOLD_MS;

  if (isWithinCutoffWindow) {
    return {
      status: 'EXPIRING_SOON',
      expiresAt: tokenExpiresAt,
      timeRemainingMs,
      timeRemainingHuman: formatTimeRemaining(timeRemainingMs),
      nextExpiryIso,
      reauthRequired: true,
      isWithinCutoffWindow: true,
      warning: 'Upstox session expires in less than 5 minutes. Live trading blocked until morning re-authentication.',
    };
  }

  if (isExpiringSoon) {
    return {
      status: 'EXPIRING_SOON',
      expiresAt: tokenExpiresAt,
      timeRemainingMs,
      timeRemainingHuman: formatTimeRemaining(timeRemainingMs),
      nextExpiryIso,
      reauthRequired: true,
      isWithinCutoffWindow: false,
      warning: 'Upstox session expires in under 1 hour. Please re-authenticate.',
    };
  }

  return {
    status: 'ACTIVE',
    expiresAt: tokenExpiresAt,
    timeRemainingMs,
    timeRemainingHuman: formatTimeRemaining(timeRemainingMs),
    nextExpiryIso,
    reauthRequired: false,
    isWithinCutoffWindow: false,
  };
}
