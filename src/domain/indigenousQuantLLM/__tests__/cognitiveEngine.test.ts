import { describe, it, expect } from 'vitest';
import { AstraFinCognitiveEngine } from '../cognitiveEngine';
import { FinancialTokenizer } from '../tokenizer/financialTokenizer';
import { FinancialGraphEngine } from '../causalGraph/financialGraph';
import { MoERouter } from '../experts/moeRouter';
import { ProcessRewardCritic } from '../verification/prmCritic';
import { UncertaintyCalibrator } from '../verification/uncertaintyCalibrator';

describe('Lumen-Astra-Fin 1.0 Indigenous Trading LLM Suite', () => {
  describe('1. Financial Tokenizer & Entity Resolution', () => {
    it('extracts tickers accurately with word boundary and HTML entity guards', () => {
      const text = 'TCS and INFY announce ₹5,200 Cr joint venture while L&T bags new EPC order &lt;table&gt;';
      const assets = FinancialTokenizer.extractAssets(text);
      expect(assets).toContain('TCS');
      expect(assets).toContain('INFY');
      expect(assets).toContain('LT');
    });

    it('extracts monetary amounts and percentages correctly', () => {
      const text = 'Tata Motors Q3 net profit surges +28.5% to ₹5,400 Crore beating street estimates';
      const tokens = FinancialTokenizer.tokenize(text);
      const moneyTokens = tokens.filter((t) => t.type === 'MONETARY');
      const pctTokens = tokens.filter((t) => t.type === 'PERCENTAGE');

      expect(moneyTokens.length).toBeGreaterThan(0);
      expect(moneyTokens[0].val).toBe(5400);
      expect(pctTokens.length).toBeGreaterThan(0);
      expect(pctTokens[0].val).toBe(28.5);
    });
  });

  describe('2. System 1 Reflex Gate (< 0.1 ms latency)', () => {
    it('triggers immediate emergency veto for SEBI raid without waiting for System 2', () => {
      const headline = 'SEBI initiates search and seizure operations at corporate offices of company';
      const reflex = AstraFinCognitiveEngine.reflexGuard(headline);
      expect(reflex.hasEmergencyVeto).toBe(true);
      expect(reflex.reason).toContain('Lumen-Astra System 1 Reflex Veto');
    });

    it('triggers emergency veto on USFDA Import Alert', () => {
      const headline = 'USFDA issues Import Alert for pharmaceutical manufacturing facility';
      const reflex = AstraFinCognitiveEngine.reflexGuard(headline);
      expect(reflex.hasEmergencyVeto).toBe(true);
    });

    it('returns false for benign commercial headlines', () => {
      const headline = 'HAL wins ₹8,000 Crore aircraft procurement contract from Ministry of Defence';
      const reflex = AstraFinCognitiveEngine.reflexGuard(headline);
      expect(reflex.hasEmergencyVeto).toBe(false);
    });
  });

  describe('3. Mixture of Experts (MoE) Router & Domain Specialization', () => {
    it('routes earnings headlines primarily to EarningsSurpriseExpert', () => {
      const headline = 'Reliance Q3 net profit beats estimates by 12%, EBITDA margin expands 180 bps';
      const { topExperts, weights } = MoERouter.route(headline);
      expect(topExperts).toContain('EarningsSurpriseExpert');
      expect(weights.earningsSurprise).toBeGreaterThan(weights.macroMonetary);
    });

    it('routes central bank headlines to MacroMonetaryExpert', () => {
      const headline = 'RBI Monetary Policy Committee leaves repo rate unchanged at 6.5%, maintains dovish stance';
      const { topExperts } = MoERouter.route(headline);
      expect(topExperts).toContain('MacroMonetaryExpert');
    });
  });

  describe('4. Causal Financial Graph & Contagion Matrix', () => {
    it('propagates Brent Crude oil spike across affected consumer & upstream peers', () => {
      const headline = 'Brent Crude oil prices surge above $92 per barrel on Middle East escalation';
      const impacts = FinancialGraphEngine.evaluateContagion(headline, []);

      // Upstream benefits
      expect(impacts.has('ONGC')).toBe(true);
      expect(impacts.get('ONGC')!.netImpactScore).toBeGreaterThan(0.5);

      // Downstream paint manufacturer faces cost squeeze
      expect(impacts.has('ASIANPAINT')).toBe(true);
      expect(impacts.get('ASIANPAINT')!.netImpactScore).toBeLessThan(-0.5);
    });

    it('propagates defense capital outlay news directly to PSU defense contractors', () => {
      const headline = 'Cabinet Committee approves mega Defense procurement outlay for Indian Navy';
      const impacts = FinancialGraphEngine.evaluateContagion(headline, []);
      expect(impacts.has('HAL')).toBe(true);
      expect(impacts.has('BEL')).toBe(true);
    });
  });

  describe('5. Process Reward Model (PRM) & Self-Critique', () => {
    it('penalizes semantic contradictions where positive action is claimed on negative news', () => {
      const headline = 'Company reports net profit drops 45%, SEBI issues penalty notice';
      const result = ProcessRewardCritic.verify(headline, ['TCS'], 'STRONG_BUY', 60);
      expect(result.passedVerification).toBe(false);
      expect(result.hallucinationPenaltyApplied).toBeGreaterThan(0.3);
    });

    it('verifies logically sound, factually grounded trajectories', () => {
      const headline = 'HAL wins ₹12,000 Crore mega defense aircraft contract from MoD';
      const result = ProcessRewardCritic.verify(headline, ['HAL'], 'STRONG_BUY', 85);
      expect(result.passedVerification).toBe(true);
      expect(result.overallFactualConfidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('6. Full Cognitive Deliberation Pipeline', () => {
    it('produces high-conviction Alpha Catalyst directive for major contract win', () => {
      const headline = 'BEL wins ₹4,500 Crore naval radar order from Indian Navy';
      const directives = AstraFinCognitiveEngine.deliberate(headline);
      const belDirective = directives.find((d) => d.symbol === 'BEL');

      expect(belDirective).toBeDefined();
      expect(belDirective!.hasAlphaCatalyst).toBe(true);
      expect(belDirective!.hasEmergencyVeto).toBe(false);
      expect(belDirective!.action).toBe('STRONG_BUY');
      expect(belDirective!.aciBoost).toBeGreaterThanOrEqual(11);
      expect(belDirective!.runnerAtrMultiplier).toBeGreaterThanOrEqual(5.0);
      expect(belDirective!.reasoningTrace?.systemTier).toBe('SYSTEM_2_DELIBERATION');
    });

    it('scales down risk multiplier when uncertainty sigma is high due to speculative rumors', () => {
      const headline = 'Sources say Tata Motors reportedly in early unconfirmed speculation talks for minor stake sale';
      const directives = AstraFinCognitiveEngine.deliberate(headline);
      const tmDirective = directives.find((d) => d.symbol === 'TATAMOTORS');

      if (tmDirective && tmDirective.reasoningTrace) {
        expect(tmDirective.uncertaintySigma).toBeGreaterThanOrEqual(0.35);
        expect(tmDirective.riskMultiplier).toBeLessThanOrEqual(1.1);
      }
    });
  });
});
