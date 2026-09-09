import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AutonomousPilotWorker } from '../services/autonomousPilotWorker';
import { getDb } from '../db';
import { buildServer } from '../index';
import { FastifyInstance } from 'fastify';

describe('Autonomous Quant Pilot Server Daemon & Dual-Mode Integration Suite', () => {
  let server: FastifyInstance;
  const testUserId = `usr_pilot_test_${Date.now()}`;

  beforeEach(async () => {
    AutonomousPilotWorker.resetForTesting();
    server = buildServer();
    const db = getDb();
    // Clean up test user state and logs
    await db.execute(`DELETE FROM autonomous_pilot_state WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM autonomous_pilot_logs WHERE user_id = ?`, [testUserId]);
  });

  afterEach(async () => {
    AutonomousPilotWorker.resetForTesting();
    await server.close();
  });

  describe('AutonomousPilotWorker State Management', () => {
    it('1. automatically initializes default state on first getPilotState inquiry', async () => {
      const state = await AutonomousPilotWorker.getPilotState(testUserId);
      expect(state).toBeDefined();
      expect(state.enabled).toBe(false);
      expect(state.executionMode).toBe('full_autonomous');
      expect(state.profile).toBe('conservative');
      expect(state.dailyStartingValue).toBe(50000);
      expect(state.riskPerTradePct).toBe(0.75);
      expect(state.circuitBreakerTripped).toBe(false);
      expect(state.executionModeStatus).toBe('CLOUD_HEADLESS');
      expect(Object.keys(state.activeFleet).length).toBe(15);
    });

    it('2. updates user configuration deterministically and adjusts profile risk', async () => {
      const updated = await AutonomousPilotWorker.updatePilotConfig(testUserId, {
        enabled: true,
        profile: 'balanced',
        dailyStartingValue: 100000,
      });

      expect(updated.enabled).toBe(true);
      expect(updated.profile).toBe('balanced');
      expect(updated.dailyStartingValue).toBe(100000);
      expect(updated.riskPerTradePct).toBe(1.0); // Balanced profile risk (1.0%)
    });

    it('3. manages client heartbeat and transitions between BROWSER_LINKED and CLOUD_HEADLESS', async () => {
      const mockNow = 1788800000000;
      AutonomousPilotWorker.setMockNow(mockNow);

      // Record heartbeat from active browser tab
      const hb = await AutonomousPilotWorker.recordClientHeartbeat(testUserId);
      expect(hb.mode).toBe('BROWSER_LINKED');
      expect(hb.lastHeartbeat).toBe(mockNow);

      let state = await AutonomousPilotWorker.getPilotState(testUserId);
      expect(state.executionModeStatus).toBe('BROWSER_LINKED');

      // Fast-forward 10 seconds (browser tab remains linked)
      AutonomousPilotWorker.setMockNow(mockNow + 10_000);
      state = await AutonomousPilotWorker.getPilotState(testUserId);
      expect(state.executionModeStatus).toBe('BROWSER_LINKED');

      // Fast-forward 25 seconds without heartbeat (tab closed -> CLOUD_HEADLESS transition)
      AutonomousPilotWorker.setMockNow(mockNow + 25_000);
      state = await AutonomousPilotWorker.getPilotState(testUserId);
      expect(state.executionModeStatus).toBe('CLOUD_HEADLESS');

      // Reopening tab renews heartbeat back to BROWSER_LINKED
      await AutonomousPilotWorker.recordClientHeartbeat(testUserId);
      state = await AutonomousPilotWorker.getPilotState(testUserId);
      expect(state.executionModeStatus).toBe('BROWSER_LINKED');
    });
  });

  describe('Autonomous Pilot Sweep & Market Hours Safety', () => {
    it('4. blocks trade evaluation and placement when market session is CLOSED', async () => {
      // Enable pilot
      await AutonomousPilotWorker.updatePilotConfig(testUserId, { enabled: true });
      AutonomousPilotWorker.setMockSession('CLOSED');

      const result = await AutonomousPilotWorker.runPilotSweep(testUserId);
      expect(result.usersProcessed).toBe(1);
      expect(result.ordersDispatched).toBe(0);

      const state = await AutonomousPilotWorker.getPilotState(testUserId);
      expect(state.isMarketOpen).toBe(false);
      expect(state.marketSession).toBe('CLOSED');
    });

    it('5. allows execution sweep and updates server run timestamp when session is NORMAL', async () => {
      await AutonomousPilotWorker.updatePilotConfig(testUserId, {
        enabled: true,
        executionMode: 'full_autonomous',
      });
      AutonomousPilotWorker.setMockSession('NORMAL');

      const result = await AutonomousPilotWorker.runPilotSweep(testUserId);
      expect(result.usersProcessed).toBe(1);

      const state = await AutonomousPilotWorker.getPilotState(testUserId);
      expect(state.isMarketOpen).toBe(true);
      expect(state.marketSession).toBe('NORMAL');
      expect(state.lastServerRunAt).toBeGreaterThan(0);
    });
  });

  describe('REST Endpoints Integration (/api/pilot)', () => {
    it('6. GET /api/pilot/state returns authoritative pilot state', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/pilot/state',
        headers: {
          authorization: 'Bearer personal_owner_token_ritam',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.activeFleet).toBeDefined();
      expect(json.executionModeStatus).toBeDefined();
    });

    it('7. POST /api/pilot/config updates configuration via REST', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/pilot/config',
        headers: {
          authorization: 'Bearer personal_owner_token_ritam',
        },
        payload: {
          enabled: true,
          profile: 'aggressive',
          dailyStartingValue: 80000,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.enabled).toBe(true);
      expect(json.profile).toBe('aggressive');
      expect(json.dailyStartingValue).toBe(80000);
    });

    it('8. POST /api/pilot/heartbeat registers browser presence via REST', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/pilot/heartbeat',
        headers: {
          authorization: 'Bearer personal_owner_token_ritam',
        },
        payload: { active: true },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.mode).toBe('BROWSER_LINKED');
      expect(json.lastHeartbeat).toBeGreaterThan(0);
    });

    it('9. POST /api/pilot/sweep executes manual or background sweep via REST', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/pilot/sweep',
        headers: {
          authorization: 'Bearer personal_owner_token_ritam',
        },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.sweep).toBeDefined();
      expect(json.sweep.runId).toBeDefined();
    });
  });
});
