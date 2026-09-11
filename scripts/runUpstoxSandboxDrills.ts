#!/usr/bin/env tsx
/**
 * Upstox sandbox execution drill.
 *
 * This script is deliberately unable to run against a production host. It uses
 * a sandbox-only token, places one small limit order, modifies it, then cancels
 * it and saves a non-secret evidence report for review.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.sandbox', override: true, quiet: true });

const CONFIRMATION_PHRASE = 'RUN_SANDBOX_DRILL';
const REPORT_DIRECTORY = 'artifacts/upstox-sandbox-drills';

interface DrillStep {
  name: 'place' | 'modify' | 'cancel';
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  latencyMs?: number;
  orderId?: string;
  error?: string;
}

interface DrillReport {
  startedAt: string;
  completedAt: string;
  environment: string;
  apiBaseUrl: string;
  liveTradingEnabled: boolean;
  autonomousLiveEnabled: boolean;
  instrumentToken: string;
  quantity: number;
  steps: DrillStep[];
  success: boolean;
}

function requirePositiveNumber(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]') : 'Unknown error';
}

async function writeReport(report: DrillReport): Promise<string> {
  await mkdir(REPORT_DIRECTORY, { recursive: true });
  const timestamp = report.startedAt.replace(/[:.]/g, '-');
  const reportPath = join(REPORT_DIRECTORY, `sandbox-drill-${timestamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return reportPath;
}

async function main(): Promise<void> {
  const { config } = await import('../server/config');
  const { UpstoxClient } = await import('../server/services/brokers/upstox/upstoxClient');

  if (process.env.UPSTOX_SANDBOX_CONFIRM !== CONFIRMATION_PHRASE) {
    throw new Error(`Refusing to place a sandbox order. Set UPSTOX_SANDBOX_CONFIRM=${CONFIRMATION_PHRASE} explicitly.`);
  }
  if (config.UPSTOX_ENV !== 'sandbox' || !/^https:\/\/sandbox\.upstox\.com\/v2\/?$/i.test(config.UPSTOX_API_BASE_URL)) {
    throw new Error('Refusing to run: the configured Upstox endpoint is not the sandbox v2 host.');
  }
  if (config.UPSTOX_LIVE_TRADING_ENABLED || config.UPSTOX_AUTONOMOUS_LIVE_ENABLED) {
    throw new Error('Refusing to run: both live and autonomous live trading flags must be false for a sandbox drill.');
  }

  const accessToken = process.env.UPSTOX_SANDBOX_ACCESS_TOKEN?.trim();
  const instrumentToken = process.env.UPSTOX_SANDBOX_INSTRUMENT_TOKEN?.trim();
  if (!accessToken) {
    throw new Error('UPSTOX_SANDBOX_ACCESS_TOKEN is required. Do not use a production access token.');
  }
  if (!instrumentToken) {
    throw new Error('UPSTOX_SANDBOX_INSTRUMENT_TOKEN is required.');
  }

  const quantity = requirePositiveNumber('UPSTOX_SANDBOX_QUANTITY', process.env.UPSTOX_SANDBOX_QUANTITY || '1');
  const limitPrice = requirePositiveNumber('UPSTOX_SANDBOX_LIMIT_PRICE', process.env.UPSTOX_SANDBOX_LIMIT_PRICE);
  const modifiedLimitPrice = requirePositiveNumber('UPSTOX_SANDBOX_MODIFIED_LIMIT_PRICE', process.env.UPSTOX_SANDBOX_MODIFIED_LIMIT_PRICE);
  if (limitPrice === modifiedLimitPrice) {
    throw new Error('UPSTOX_SANDBOX_MODIFIED_LIMIT_PRICE must differ from UPSTOX_SANDBOX_LIMIT_PRICE.');
  }

  const startedAt = new Date().toISOString();
  const report: DrillReport = {
    startedAt,
    completedAt: startedAt,
    environment: config.UPSTOX_ENV,
    apiBaseUrl: config.UPSTOX_API_BASE_URL,
    liveTradingEnabled: config.UPSTOX_LIVE_TRADING_ENABLED,
    autonomousLiveEnabled: config.UPSTOX_AUTONOMOUS_LIVE_ENABLED,
    instrumentToken,
    quantity,
    steps: [],
    success: false,
  };
  let orderId: string | undefined;

  try {
    const placeStartedAt = Date.now();
    const placed = await UpstoxClient.placeOrder(accessToken, {
      quantity,
      product: 'D',
      validity: 'DAY',
      price: limitPrice,
      tag: 'lumen-sandbox-drill',
      instrument_token: instrumentToken,
      order_type: 'LIMIT',
      transaction_type: 'BUY',
    });
    orderId = placed.order_id || placed.order_ids?.[0];
    if (!orderId) {
      throw new Error('Sandbox placement response did not include an order ID.');
    }
    report.steps.push({ name: 'place', status: 'PASS', latencyMs: Date.now() - placeStartedAt, orderId });

    const modifyStartedAt = Date.now();
    try {
      await UpstoxClient.modifyOrder(accessToken, {
        order_id: orderId,
        quantity,
        price: modifiedLimitPrice,
        order_type: 'LIMIT',
        validity: 'DAY',
      });
      report.steps.push({ name: 'modify', status: 'PASS', latencyMs: Date.now() - modifyStartedAt, orderId });
    } catch (error) {
      report.steps.push({ name: 'modify', status: 'FAIL', latencyMs: Date.now() - modifyStartedAt, orderId, error: safeError(error) });
    }
  } catch (error) {
    report.steps.push({ name: 'place', status: 'FAIL', error: safeError(error) });
  } finally {
    if (orderId) {
      const cancelStartedAt = Date.now();
      try {
        await UpstoxClient.cancelOrder(accessToken, orderId);
        report.steps.push({ name: 'cancel', status: 'PASS', latencyMs: Date.now() - cancelStartedAt, orderId });
      } catch (error) {
        report.steps.push({ name: 'cancel', status: 'FAIL', latencyMs: Date.now() - cancelStartedAt, orderId, error: safeError(error) });
      }
    } else {
      report.steps.push({ name: 'cancel', status: 'SKIPPED', error: 'No broker order ID was returned by placement.' });
    }

    report.completedAt = new Date().toISOString();
    report.success = report.steps.length === 3 && report.steps.every((step) => step.status === 'PASS');
    const reportPath = await writeReport(report);
    console.log(`Sandbox drill ${report.success ? 'PASSED' : 'FAILED'}; report saved to ${reportPath}`);
  }

  if (!report.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Sandbox drill refused or failed: ${safeError(error)}`);
  process.exitCode = 1;
});
