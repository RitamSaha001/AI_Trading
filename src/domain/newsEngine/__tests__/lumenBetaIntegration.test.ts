import { describe, it, expect, beforeEach } from 'vitest';
import {
  NewsCatalystRegistry,
  HistoricalCatalystFeed,
  HISTORICAL_CATALYST_FEED,
} from '../index';
import { evaluateStrategyMasterBrain } from '../../quantEngine/strategyMasterBrain';
import { tickAutonomousPilot, initializeFleetStatus, createDefaultRateLimitStatus } from '../../autonomousPilotEngine';
import { AppState, Asset, Market } from '../../../types';
import { createDefaultAutonomousPilotState } from '../../autonomousPilot';

describe('Lumen Beta (prototype_3_lumen_beta) News-Aware Quant Architecture', () => {
  beforeEach(() => {
    NewsCatalystRegistry.clear();
  });

  it('historical catalyst feed provides structured chronological events across 2022-2026', () => {
    expect(HISTORICAL_CATALYST_FEED.length).toBeGreaterThan(30);

    // Verify 2022 events
    const events2022 = HistoricalCatalystFeed.getEventsForDate('2022-01-03');
    expect(events2022.length).toBeGreaterThanOrEqual(1);
    expect(events2022[0].headline).toContain('Tata Motors');

    // Verify 2024 events
    const events2024 = HistoricalCatalystFeed.getEventsForDate('2024-01-15');
    expect(events2024.length).toBeGreaterThanOrEqual(1);
    expect(events2024[0].headline).toContain('TCS');
  });

  it('injects historical catalysts through AstraFinCognitiveEngine deliberation into NewsCatalystRegistry', () => {
    const timestamp = Date.parse('2024-01-15T09:15:00.000Z');
    const injected = HistoricalCatalystFeed.injectForBar('2024-01-15', 555, timestamp);
    expect(injected).toBe(1);

    const status = NewsCatalystRegistry.getTickerStatus('TCS', timestamp + 1000);
    expect(status.symbol).toBe('TCS');
    expect(status.activeCatalyst).toBe(true);
    expect(status.catalystReason).toContain('News Alpha Catalyst');

    const catalyst = NewsCatalystRegistry.checkAlphaCatalyst('TCS', timestamp + 1000);
    expect(catalyst.hasCatalyst).toBe(true);
    expect(catalyst.boostPoints).toBeGreaterThanOrEqual(8);
  });

  it('emergency adverse news reflex guard activates immediate veto', () => {
    const now = Date.now();
    NewsCatalystRegistry.processWithAstraFin(
      'SEBI issues severe order and search seizure penalty against Reliance promoters in forensic audit probe',
      'BSE_ANNOUNCEMENTS',
      now
    );

    const veto = NewsCatalystRegistry.checkEmergencyVeto('RELIANCE', now + 500);
    expect(veto.hasVeto).toBe(true);
    expect(veto.reason).toContain('Adverse News Veto');

    const dummyMacroBreadth: any = {
      totalAssetsEvaluated: 15,
      assetsAboveVwapCount: 10,
      breadthAboveVwapPct: 66.7,
      advancingAssetsCount: 10,
      decliningAssetsCount: 5,
      advanceDeclineRatio: 2.0,
      fleetMeanChangePct: 0.8,
      macroRegime: 'BULLISH',
      directionalPermission: 'ALL',
      convictionAdjustment: 5,
      rationale: 'Mock',
    };

    // Verify MasterBrain blocks entry under prototype_3_lumen_beta
    const directive = evaluateStrategyMasterBrain({
      istMinutes: 580,
      marketPrice: 2500,
      dayOpenPrice: 2480,
      vwap: 2490,
      atr: 35,
      hurst: 0.65,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.5,
      macroBreadth: dummyMacroBreadth,
      sectorRank: 1,
      sectorAvgChange: 1.5,
      sectorAdvanceRatio: 0.8,
      prototypeVersion: 'prototype_3_lumen_beta',
      newsSentiment: {
        activeVeto: veto.hasVeto,
        compositeSentiment: -0.85,
      },
    });

    expect(directive.actionPermission).toBe('BLOCKED_STAND_ASIDE');
    expect(directive.minAciThreshold).toBe(999);
    expect(directive.rationale).toContain('Lumen Beta News Veto');
  });

  it('verified news catalyst in Lumen Beta grants +3.25 ATR runner targets and margin boost', () => {
    const now = Date.now();
    const catalyst = {
      hasCatalyst: true,
      boostPoints: 14,
      reason: 'L&T secures landmark ₹12,000 crore mega order',
    };

    const dummyMacroBreadth: any = {
      totalAssetsEvaluated: 15,
      assetsAboveVwapCount: 12,
      breadthAboveVwapPct: 80,
      advancingAssetsCount: 12,
      decliningAssetsCount: 3,
      advanceDeclineRatio: 4.0,
      fleetMeanChangePct: 1.2,
      macroRegime: 'BULLISH',
      directionalPermission: 'ALL',
      convictionAdjustment: 5,
      rationale: 'Mock',
    };

    const directive = evaluateStrategyMasterBrain({
      istMinutes: 600,
      marketPrice: 3500,
      dayOpenPrice: 3450,
      vwap: 3480,
      atr: 45,
      hurst: 0.62,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.2,
      macroBreadth: dummyMacroBreadth,
      sectorRank: 1,
      sectorAvgChange: 2.0,
      sectorAdvanceRatio: 0.9,
      prototypeVersion: 'prototype_3_lumen_beta',
      newsCatalyst: catalyst,
    });

    expect(directive.actionPermission).toBe('PERMITTED');
    expect(directive.marginMultiplier).toBe(4.5);
    expect(directive.trancheTargets?.tranche2Atr).toBe(3.25);
    expect(directive.rationale).toContain('Lumen Beta Catalyst Surge');
  });

  it('prunes low-conviction setups by raising minAciThreshold to 74 when no catalyst exists', () => {
    const dummyMacroBreadth: any = {
      totalAssetsEvaluated: 15,
      assetsAboveVwapCount: 7,
      breadthAboveVwapPct: 50,
      advancingAssetsCount: 8,
      decliningAssetsCount: 7,
      advanceDeclineRatio: 1.14,
      fleetMeanChangePct: 0.1,
      macroRegime: 'CHOP',
      directionalPermission: 'ALL',
      convictionAdjustment: 0,
      rationale: 'Mock',
    };

    const directive = evaluateStrategyMasterBrain({
      istMinutes: 650,
      marketPrice: 1500,
      dayOpenPrice: 1500,
      vwap: 1500,
      atr: 20,
      hurst: 0.52,
      squeezeStatus: 'NO_SQUEEZE',
      ouZScore: 0.0,
      macroBreadth: dummyMacroBreadth,
      sectorRank: 3,
      sectorAvgChange: 0.2,
      sectorAdvanceRatio: 0.5,
      prototypeVersion: 'prototype_3_lumen_beta',
      // No news catalyst
    });

    // Without a catalyst, minAciThreshold is raised to 74 to prevent fee burn
    expect(directive.minAciThreshold).toBeGreaterThanOrEqual(74);
  });
});
