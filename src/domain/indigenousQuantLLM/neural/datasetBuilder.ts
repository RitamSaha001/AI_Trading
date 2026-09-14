/**
 * LUMEN-ASTRA-FIN NEURAL: SCENARIO DATASET BUILDER
 * Ingests thousands of trading scenarios from 5-year replay audits and stress test suites.
 * Constructs paired (Prompt, Target CoT, Policy Label, Return Value) training sequences.
 */

import { DomainTokenizer, ACTION_TOKENS } from './vocabulary';

export interface ScenarioExample {
  id: string;
  inputTokens: number[];
  targetTokens: number[];
  targetActionIdx: number;
  targetValue: number; // [-1.0, 1.0]
  rawText: string;
  thoughtText: string;
  actionName: string;
  domain?: 'finance' | 'safety' | 'math' | 'communication' | 'quant_trading';
}

export interface DPOPreferencePair {
  id: string;
  prompt: string;
  scenarioPrompt: string;
  promptTokens: number[];
  winningThought: string;
  winningTokens: number[];
  winningActionIdx: number;
  losingThought: string;
  losingTokens: number[];
  losingActionIdx: number;
  actionName: string;
  marginReturnDelta: number;
  marginBenefit: number;
}

export interface TokenizerInterface {
  encode: (text: string) => number[];
  decode?: (tokens: number[]) => string;
}

export class ScenarioDatasetBuilder {
  /**
   * Loads scenarios from raw audit data and stress test distributions.
   * Fully platform-independent (runs in browser, Node, and test runners).
   */
  public static buildCorpus(rawAuditDataList?: any[], maxScenarios: number = 5000): ScenarioExample[] {
    const scenarios: ScenarioExample[] = [];

    // 1. Ingest Real Closed Trades from passed audit objects
    if (rawAuditDataList && Array.isArray(rawAuditDataList)) {
      for (let i = 0; i < rawAuditDataList.length; i++) {
        if (scenarios.length >= maxScenarios) break;
        const data = rawAuditDataList[i];
        if (data) {
          this.extractTradesFromAudit(data, `audit-${i}`, scenarios, maxScenarios);
        }
      }
    }

    // 2. Synthesize Deterministic Scenarios from the 1,000 Monte Carlo Stress Suite
    this.synthesizeStressTestScenarios(scenarios, maxScenarios);

    return scenarios;
  }

  /**
   * Builds a balanced multi-task training corpus combining real NVIDIA Nemotron datasets
   * (Finance, Safety/Danger, Math, Communication) with real 5-year quant trade scenarios.
   */
  public static buildMultiTaskNemotronCorpus(options: {
    nemotronFinance?: any[];
    nemotronSafety?: any[];
    nemotronMath?: any[];
    nemotronCommunication?: any[];
    conversationalRecords?: any[];
    rawAuditDataList?: any[];
    maxTotal?: number;
    tokenizer?: TokenizerInterface;
  }): ScenarioExample[] {
    const maxTotal = options.maxTotal || 5000;
    const scenarios: ScenarioExample[] = [];
    const tok = options.tokenizer || DomainTokenizer;

    // 1. Ingest Curated Multi-Turn Conversational Dialogue, Reasoning & Personality
    if (options.conversationalRecords && options.conversationalRecords.length > 0) {
      const convLimit = Math.floor(maxTotal * 0.30);
      const convExamples = this.ingestConversationalRecords(options.conversationalRecords, tok, convLimit);
      scenarios.push(...convExamples);
    }

    // 2. Ingest Nemotron Finance (SEC 10-K/10-Q disclosures & solvency)
    if (options.nemotronFinance && options.nemotronFinance.length > 0) {
      const finLimit = Math.floor(maxTotal * 0.20);
      const finExamples = this.ingestNemotronFinance(options.nemotronFinance, tok, finLimit);
      scenarios.push(...finExamples);
    }

    // 3. Ingest Nemotron Safety & Danger Sensing (Risk taxonomy, DeepSeek-R1 <think> reasoning)
    if (options.nemotronSafety && options.nemotronSafety.length > 0) {
      const safeLimit = Math.floor(maxTotal * 0.15);
      const safeExamples = this.ingestNemotronSafety(options.nemotronSafety, tok, safeLimit);
      scenarios.push(...safeExamples);
    }

    // 4. Ingest Nemotron Math & Quantitative Proofs
    if (options.nemotronMath && options.nemotronMath.length > 0) {
      const mathLimit = Math.floor(maxTotal * 0.15);
      const mathExamples = this.ingestNemotronMath(options.nemotronMath, tok, mathLimit);
      scenarios.push(...mathExamples);
    }

    // 5. Ingest Nemotron HelpSteer2 Communication (Instruction following & clarity)
    if (options.nemotronCommunication && options.nemotronCommunication.length > 0) {
      const commLimit = Math.floor(maxTotal * 0.10);
      const commExamples = this.ingestNemotronCommunication(options.nemotronCommunication, tok, commLimit);
      scenarios.push(...commExamples);
    }

    // 6. Ingest Real Quant Trades from 5-Year Replays
    if (options.rawAuditDataList && options.rawAuditDataList.length > 0) {
      const quantLimit = Math.floor(maxTotal * 0.10);
      for (let i = 0; i < options.rawAuditDataList.length; i++) {
        if (scenarios.length >= maxTotal) break;
        const data = options.rawAuditDataList[i];
        if (data) {
          this.extractTradesFromAudit(data, `audit-${i}`, scenarios, scenarios.length + quantLimit);
        }
      }
    }

    // 7. Synthesize Advanced Quantitative Microstructure & Stochastic Trajectories
    const advQuantLimit = Math.max(10, Math.min(2500, Math.floor(maxTotal * 0.15)));
    this.synthesizeAdvancedQuantMicrostructureScenarios(scenarios, tok, advQuantLimit);

    // 8. Synthesize Premium Institutional Multi-Desk Scenarios
    const premiumLimit = Math.max(10, Math.min(2500, Math.floor(maxTotal * 0.15)));
    const premiumExamples = this.synthesizePremiumInstitutionalCorpus(tok, premiumLimit);
    scenarios.push(...premiumExamples);

    // If still room, supplement with edge-case stress suite
    if (scenarios.length < maxTotal) {
      this.synthesizeStressTestScenarios(scenarios, maxTotal);
    }

    return scenarios.slice(0, maxTotal);
  }


  /**
   * Ingests real SEC 10-K/10-Q corporate financial QA records from Nemotron-Finance.
   */
  public static ingestNemotronFinance(records: any[], tok: TokenizerInterface, maxCount = 1000): ScenarioExample[] {
    const examples: ScenarioExample[] = [];
    const actionName = 'ASSESS_FUNDAMENTALS';
    const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(actionName as any));

    for (let i = 0; i < records.length && examples.length < maxCount; i++) {
      const rec = records[i];
      if (!rec || !Array.isArray(rec.messages)) continue;

      let userQuery = '';
      let assistantAnswer = '';
      for (const msg of rec.messages) {
        if (msg.role === 'user') userQuery = String(msg.content || '');
        if (msg.role === 'assistant') assistantAnswer = String(msg.content || '');
      }

      if (!userQuery || !assistantAnswer) continue;

      // Extract a clean salient slice
      const promptClean = userQuery.replace(/\s+/g, ' ').substring(0, 160).trim();
      const answerClean = assistantAnswer.replace(/\s+/g, ' ').substring(0, 180).trim();

      const promptText = `<scenario> DOMAIN_FINANCE_SEC ${promptClean} </scenario>`;
      const thoughtText = `<thought> analyzing balance sheet and 10-K disclosures: ${answerClean} </thought> <action> ASSESS_FUNDAMENTALS </action>`;

      examples.push({
        id: `nemotron-fin-${i}`,
        inputTokens: tok.encode(promptText),
        targetTokens: tok.encode(thoughtText),
        targetActionIdx,
        targetValue: 0.8,
        rawText: promptText,
        thoughtText,
        actionName,
        domain: 'finance',
      });
    }

    return examples;
  }

  /**
   * Ingests real danger sensing and safety reasoning traces from Nemotron-Content-Safety.
   */
  public static ingestNemotronSafety(records: any[], tok: TokenizerInterface, maxCount = 1000): ScenarioExample[] {
    const examples: ScenarioExample[] = [];

    for (let i = 0; i < records.length && examples.length < maxCount; i++) {
      const rec = records[i];
      if (!rec || !rec.prompt) continue;

      const label = String(rec.prompt_harm_label || '').toLowerCase().trim();
      const isHarmful = (label.includes('harm') && !label.includes('unharm')) ||
        (Array.isArray(rec.violated_categories) && rec.violated_categories.length > 0);

      const actionName = isHarmful ? 'EMERGENCY_VETO' : 'VERIFIED_SAFE';
      const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(actionName as any));
      const targetValue = isHarmful ? -1.0 : 0.5;

      const reasoningTrace = rec.efficient_reasoning_deepseek_r1_0528 ||
        rec.safety_reasoning_deepseek_r1_0528 ||
        rec.safety_reasoning_gpt_oss_120b ||
        (isHarmful ? 'threat detected governance protocol mandates emergency veto' : 'verified safe within risk parameters');

      const promptClean = String(rec.prompt).replace(/\s+/g, ' ').substring(0, 150).trim();
      const traceClean = String(reasoningTrace).replace(/\s+/g, ' ').substring(0, 200).trim();

      const promptText = `<scenario> DOMAIN_RISK_SAFETY ${promptClean} </scenario>`;
      const thoughtText = traceClean.startsWith('<think>')
        ? `${traceClean} <action> ${actionName} </action>`
        : `<thought> ${traceClean} </thought> <action> ${actionName} </action>`;

      examples.push({
        id: `nemotron-safe-${i}`,
        inputTokens: tok.encode(promptText),
        targetTokens: tok.encode(thoughtText),
        targetActionIdx,
        targetValue,
        rawText: promptText,
        thoughtText,
        actionName,
        domain: 'safety',
      });
    }

    return examples;
  }

  /**
   * Ingests real quantitative mathematics and formal proof traces from Nemotron-Math-Proofs.
   */
  public static ingestNemotronMath(records: any[], tok: TokenizerInterface, maxCount = 1000): ScenarioExample[] {
    const examples: ScenarioExample[] = [];
    const actionName = 'QUANT_VERIFIED';
    const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(actionName as any));

    for (let i = 0; i < records.length && examples.length < maxCount; i++) {
      const rec = records[i];
      if (!rec || !Array.isArray(rec.messages)) continue;

      let userQuery = '';
      let assistantSolution = '';
      for (const msg of rec.messages) {
        if (msg.role === 'user') userQuery = String(msg.content || '');
        if (msg.role === 'assistant') assistantSolution = String(msg.content || '');
      }

      if (!userQuery || !assistantSolution) continue;

      const promptClean = userQuery.replace(/\s+/g, ' ').substring(0, 160).trim();
      const solClean = assistantSolution.replace(/\s+/g, ' ').substring(0, 180).trim();

      const promptText = `<scenario> DOMAIN_QUANT_MATH ${promptClean} </scenario>`;
      const thoughtText = `<thought> calculating quantitative proof: ${solClean} </thought> <action> QUANT_VERIFIED </action>`;

      examples.push({
        id: `nemotron-math-${i}`,
        inputTokens: tok.encode(promptText),
        targetTokens: tok.encode(thoughtText),
        targetActionIdx,
        targetValue: 1.0,
        rawText: promptText,
        thoughtText,
        actionName,
        domain: 'math',
      });
    }

    return examples;
  }

  /**
   * Ingests real multi-turn linguistic communication and instruction following from HelpSteer2.
   */
  public static ingestNemotronCommunication(records: any[], tok: TokenizerInterface, maxCount = 1000): ScenarioExample[] {
    const examples: ScenarioExample[] = [];
    const actionName = 'COMMUNICATE';
    const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(actionName as any));

    for (let i = 0; i < records.length && examples.length < maxCount; i++) {
      const rec = records[i];
      if (!rec || !rec.prompt || !rec.response) continue;

      const promptClean = String(rec.prompt).replace(/\s+/g, ' ').substring(0, 150).trim();
      const respClean = String(rec.response).replace(/\s+/g, ' ').substring(0, 180).trim();

      const promptText = `<scenario> DOMAIN_COMMUNICATION ${promptClean} </scenario>`;
      const thoughtText = `<thought> formulating coherent communication: ${respClean} </thought> <action> COMMUNICATE </action>`;

      examples.push({
        id: `nemotron-comm-${i}`,
        inputTokens: tok.encode(promptText),
        targetTokens: tok.encode(thoughtText),
        targetActionIdx,
        targetValue: 0.5,
        rawText: promptText,
        thoughtText,
        actionName,
        domain: 'communication',
      });
    }

    return examples;
  }

  /**
   * Ingests curated multi-turn conversational dialogue, reasoning, conceptual QA, and personality records.
   */
  public static ingestConversationalRecords(records: any[], tok: TokenizerInterface, maxCount = 1000): ScenarioExample[] {
    const examples: ScenarioExample[] = [];

    for (let i = 0; i < records.length && examples.length < maxCount; i++) {
      const rec = records[i];
      if (!rec || !rec.prompt || !rec.response) continue;

      const promptClean = String(rec.prompt).replace(/\s+/g, ' ').substring(0, 160).trim();
      const respClean = String(rec.response).replace(/\s+/g, ' ').substring(0, 200).trim();
      const thoughtClean = rec.thought ? String(rec.thought).replace(/\s+/g, ' ').substring(0, 160).trim() : 'formulating articulate conversational response';
      const actionName = rec.action || 'COMMUNICATE_DIALOGUE';
      const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(actionName as any));

      const promptText = `<scenario> DOMAIN_COMMUNICATION ${promptClean} </scenario>`;
      const thoughtText = `<thought> ${thoughtClean}: ${respClean} </thought> <action> ${actionName} </action>`;

      examples.push({
        id: `conv-data-${i}`,
        inputTokens: tok.encode(promptText),
        targetTokens: tok.encode(thoughtText),
        targetActionIdx,
        targetValue: 0.9,
        rawText: promptText,
        thoughtText,
        actionName,
        domain: 'communication',
      });
    }

    return examples;
  }

  /**
   * Extracts winning vs losing trajectory pairs for Direct Preference Optimization (DPO),
   * covering both quantitative trading execution and articulate conversational dialogue.
   */
  public static buildDPOPreferencePairs(
    trades: any[],
    tok: TokenizerInterface = DomainTokenizer,
    maxPairs = 500,
    conversationalRecords?: any[]
  ): DPOPreferencePair[] {
    const pairs: DPOPreferencePair[] = [];
    const winners: any[] = [];
    const losers: any[] = [];

    for (const t of trades) {
      if (!t.asset || t.pnl === undefined) continue;
      const pnl = Number(t.pnl) || 0;
      if (pnl > 80) winners.push(t);
      else if (pnl < -80) losers.push(t);
    }

    // 1. Add Conversational DPO Preference Pairs (Articulate vs Robotic)
    if (conversationalRecords && conversationalRecords.length > 0) {
      for (let i = 0; i < Math.min(conversationalRecords.length, 120); i++) {
        const c = conversationalRecords[i];
        if (!c.prompt || !c.response) continue;
        const prompt = `<scenario> DOMAIN_COMMUNICATION ${c.prompt} </scenario>`;
        const winningThought = `<thought> ${c.thought || 'formulating articulate response'}: ${c.response.slice(0, 140)} </thought> <action> ${c.action || 'COMMUNICATE_DIALOGUE'} </action>`;
        const losingThought = `<thought> robotic fallback evaluating: "${c.prompt.slice(0, 30)}" total capital equity: $45000 </thought> <action> STAND_ASIDE </action>`;
        const winIdx = Math.max(0, ACTION_TOKENS.indexOf((c.action || 'COMMUNICATE_DIALOGUE') as any));
        const loseIdx = Math.max(0, ACTION_TOKENS.indexOf('STAND_ASIDE' as any));

        pairs.push({
          id: `dpo-conv-${i}`,
          prompt,
          scenarioPrompt: prompt,
          promptTokens: tok.encode(prompt),
          winningThought,
          winningTokens: tok.encode(winningThought),
          winningActionIdx: winIdx,
          losingThought,
          losingTokens: tok.encode(losingThought),
          losingActionIdx: loseIdx,
          actionName: c.action || 'COMMUNICATE_DIALOGUE',
          marginReturnDelta: 1.0,
          marginBenefit: 1.0,
        });
      }
    }

    // 2. Pair winning trade with losing trade
    for (let i = 0; i < Math.min(winners.length, losers.length, maxPairs); i++) {
      const win = winners[i];
      const loss = losers[i];
      const asset = String(win.asset).toUpperCase();

      const isBreakout = (win.pnl > 120);
      const isPullback = (win.pnl > 40 && win.pnl <= 120);
      const winAction = isBreakout ? 'BUY_BREAKOUT' : isPullback ? 'VWAP_PULLBACK' : 'PROFIT_HARVEST';
      const loseAction = (loss.pnl < -120) ? 'EMERGENCY_VETO' : 'STAND_ASIDE';
      const regime = isBreakout ? 'REGIME_BULL_TREND' : 'REGIME_HIGH_VOLATILITY';
      const vwapStatus = isBreakout ? 'ABOVE_VWAP_EXPANSION' : 'AT_VWAP_SUPPORT';
      const prompt = `<scenario> ${asset} ${regime} ACI_STRONG_75_84 ${vwapStatus} VOLUME_SURGE_STRONG_2X </scenario>`;
      const winningThought = `<thought> volume surge confirmed at vwap support locking runner target with trailing ratchet </thought> <action> ${winAction} </action>`;
      const losingThought = `<thought> ignoring risk boundaries counter-trend entry </thought> <action> ${loseAction} </action>`;

      const winningActionIdx = Math.max(0, ACTION_TOKENS.indexOf(winAction as any));
      const losingActionIdx = Math.max(0, ACTION_TOKENS.indexOf(loseAction as any));
      const marginDelta = Number(win.pnl) - Number(loss.pnl);

      pairs.push({
        id: `dpo-pair-${i}`,
        prompt,
        scenarioPrompt: prompt,
        promptTokens: tok.encode(prompt),
        winningThought,
        winningTokens: tok.encode(winningThought),
        winningActionIdx,
        losingThought,
        losingTokens: tok.encode(losingThought),
        losingActionIdx,
        actionName: winAction,
        marginReturnDelta: marginDelta,
        marginBenefit: marginDelta,
      });
    }

    return pairs;
  }

  /**
   * Directly converts a list of closed trade objects into ScenarioExamples.
   */
  public static ingestTrades(trades: any[], sourceName: string = 'fleet-audit', maxScenarios: number = 5000): ScenarioExample[] {
    const scenarios: ScenarioExample[] = [];
    this.processTradeList(trades, sourceName, scenarios, maxScenarios);
    return scenarios;
  }

  /**
   * Extracts trades from a parsed audit JSON object.
   */
  public static extractTradesFromAudit(
    data: any,
    fileName: string,
    scenarios: ScenarioExample[],
    maxScenarios: number
  ): void {
    const candidateDays: any[] = [];
    if (Array.isArray(data.dailyBreakdown)) {
      candidateDays.push(...data.dailyBreakdown);
    }
    if (Array.isArray(data.allClosedTrades)) {
      this.processTradeList(data.allClosedTrades, fileName, scenarios, maxScenarios);
      return;
    }

    for (const day of candidateDays) {
      if (scenarios.length >= maxScenarios) break;
      if (Array.isArray(day.closedTrades)) {
        this.processTradeList(day.closedTrades, fileName, scenarios, maxScenarios);
      }
    }
  }

  /**
   * Processes a list of closed trades into training examples.
   */
  private static processTradeList(
    trades: any[],
    sourceName: string,
    scenarios: ScenarioExample[],
    maxScenarios: number
  ): void {
    for (let i = 0; i < trades.length; i++) {
      if (scenarios.length >= maxScenarios) break;
      const t = trades[i];
      if (!t.asset || t.pnl === undefined) continue;

      const asset = String(t.asset).toUpperCase();
      const pnl = Number(t.pnl) || 0;
      const strategy = String(t.strategy || 'Auto-Pilot');
      const exitReason = String(t.exitReason || '');

      // Parse ACI score if embedded in strategy string
      const aciMatch = strategy.match(/ACI:\s*(\d+)/i);
      const aciScore = aciMatch ? parseInt(aciMatch[1], 10) : 75;
      const aciToken =
        aciScore >= 85
          ? 'ACI_EXEMPLARY_85_PLUS'
          : aciScore >= 75
            ? 'ACI_STRONG_75_84'
            : aciScore >= 65
              ? 'ACI_MODERATE_65_74'
              : 'ACI_SUBPAR_BELOW_65';

      // Infer VWAP status from exitReason or strategy
      const isVwapBroken = exitReason.toLowerCase().includes('broke below institutional vwap');
      const isStopHit = exitReason.toLowerCase().includes('stop loss');
      const isTarget1 = exitReason.toLowerCase().includes('tranche 1');
      const isRatchet = exitReason.toLowerCase().includes('ratchet');
      const isStagnant = exitReason.toLowerCase().includes('stagnan');

      const vwapToken = isVwapBroken ? 'BELOW_VWAP_FAILED' : 'ABOVE_VWAP_EXPANSION';
      const volToken = pnl > 0 ? 'VOLUME_SURGE_STRONG_2X' : 'VOLUME_NORMAL_1X';
      const regimeToken = 'REGIME_BULL_TREND';

      // Determine Target Action & Value based on Ground-Truth Outcome
      let actionName: string;
      let targetValue: number;
      let thoughtText: string;

      // Diversified institutional quantitative reasoning templates (eliminating repetitive loops)
      const stopHitTemplates = [
        `<thought> volume fading and aci score indicates adverse excursion; capital defense mandates immediate exit to prevent drawdown </thought> <action> DEFENSIVE_EXIT </action>`,
        `<thought> stop loss threshold reached; risk budget exhausted; executing defensive liquidation to preserve trading capital </thought> <action> DEFENSIVE_EXIT </action>`,
        `<thought> adverse volatility shock detected; sentinel risk hurdle breached; closing position to safeguard margin </thought> <action> DEFENSIVE_EXIT </action>`,
      ];
      const vwapBrokenTemplates = [
        `<thought> institutional vwap support broken; breakout failed; capital defense mandates immediate defensive liquidation </thought> <action> DEFENSIVE_EXIT </action>`,
        `<thought> price closed below dynamic vwap boundary; invalidating bullish trend hypothesis; standing down </thought> <action> DEFENSIVE_EXIT </action>`,
        `<thought> order flow selling pressure breached anchor vwap; exiting trade to preserve capital liquidity </thought> <action> DEFENSIVE_EXIT </action>`,
      ];
      const profitHarvestTemplates = [
        `<thought> confirmed breakout above morning high; healthy expectancy; allocating runner target with trailing ratchet </thought> <action> PROFIT_HARVEST </action>`,
        `<thought> profit target hurdle reached; locking partial gains with dynamic atr ratchet stop </thought> <action> PROFIT_HARVEST </action>`,
        `<thought> positive convexity expansion achieved; harvesting gains systematically into market strength </thought> <action> PROFIT_HARVEST </action>`,
      ];
      const stagnantTemplates = [
        `<thought> position stagnant and volume fading; standing aside to preserve cash liquidity </thought> <action> STAND_ASIDE </action>`,
        `<thought> momentum decayed below minimum threshold; rotating capital out of stagnant instrument </thought> <action> STAND_ASIDE </action>`,
        `<thought> trade stagnancy duration exceeded; closing position to liberate capital allocation </thought> <action> STAND_ASIDE </action>`,
      ];
      const breakoutTemplates = [
        `<thought> volume surge detected at institutional vwap support; trend rider entry validated with positive expectancy </thought> <action> BUY_BREAKOUT </action>`,
        `<thought> systematic alpha scan confirms persistent trend structure; order flow depth supports breakout entry </thought> <action> BUY_BREAKOUT </action>`,
        `<thought> liquidity absorption confirmed above morning range; executing disciplined breakout tranche </thought> <action> BUY_BREAKOUT </action>`,
      ];
      const asideTemplates = [
        `<thought> low conviction and high entropy; standing aside to preserve cash reserve floor </thought> <action> STAND_ASIDE </action>`,
        `<thought> alpha confidence index below threshold; no statistical edge detected; standing aside </thought> <action> STAND_ASIDE </action>`,
        `<thought> risk hurdle not satisfied; maintaining disciplined cash allocation </thought> <action> STAND_ASIDE </action>`,
      ];

      if (isStopHit || pnl < -150) {
        actionName = 'DEFENSIVE_EXIT';
        targetValue = -1.0;
        thoughtText = stopHitTemplates[i % stopHitTemplates.length];
      } else if (isVwapBroken) {
        actionName = 'DEFENSIVE_EXIT';
        targetValue = -0.2;
        thoughtText = vwapBrokenTemplates[i % vwapBrokenTemplates.length];
      } else if (isTarget1 || isRatchet || pnl > 100) {
        actionName = 'PROFIT_HARVEST';
        targetValue = 1.0;
        thoughtText = profitHarvestTemplates[i % profitHarvestTemplates.length];
      } else if (isStagnant) {
        actionName = 'STAND_ASIDE';
        targetValue = 0.0;
        thoughtText = stagnantTemplates[i % stagnantTemplates.length];
      } else if (pnl > 0) {
        actionName = 'BUY_BREAKOUT';
        targetValue = 0.6;
        thoughtText = breakoutTemplates[i % breakoutTemplates.length];
      } else {
        actionName = 'STAND_ASIDE';
        targetValue = -0.1;
        thoughtText = asideTemplates[i % asideTemplates.length];
      }

      const promptText = `<scenario> ${asset} ${regimeToken} ${aciToken} ${vwapToken} ${volToken} </scenario>`;
      const inputTokens = DomainTokenizer.encode(promptText);
      const targetTokens = DomainTokenizer.encode(thoughtText);
      const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(actionName as any));

      scenarios.push({
        id: `audit-${sourceName}-${i}`,
        inputTokens,
        targetTokens,
        targetActionIdx,
        targetValue,
        rawText: promptText,
        thoughtText,
        actionName,
      });
    }
  }

  /**
   * Synthesizes 1,000 distinct stress scenarios covering edge-case market distributions.
   */
  private static synthesizeStressTestScenarios(scenarios: ScenarioExample[], maxScenarios: number): void {
    const assets = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TATAMOTORS', 'SBIN', 'HAL', 'BEL', 'ONGC'];
    const stressTypes = [
      {
        regime: 'REGIME_VOLATILITY_SHOCK',
        aci: 'ACI_SUBPAR_BELOW_65',
        vwap: 'BELOW_VWAP_FAILED',
        vol: 'VOLUME_SURGE_EXTREME_3X',
        action: 'EMERGENCY_VETO',
        val: -1.0,
        thought: 'analyzing market conditions for ASSET extreme volatility shock detected veto engaged governance red flag stand aside preserve cash',
      },
      {
        regime: 'REGIME_BULL_TREND',
        aci: 'ACI_EXEMPLARY_85_PLUS',
        vwap: 'ABOVE_VWAP_EXPANSION',
        vol: 'VOLUME_SURGE_EXTREME_3X',
        action: 'BUY_BREAKOUT',
        val: 1.0,
        thought: 'analyzing market conditions for ASSET volume surge detected at institutional vwap support aci score indicates high conviction trend rider entry valid',
      },
      {
        regime: 'REGIME_RANGE_BOUND',
        aci: 'ACI_MODERATE_65_74',
        vwap: 'AT_VWAP_SUPPORT',
        vol: 'VOLUME_NORMAL_1X',
        action: 'MEAN_REVERT',
        val: 0.5,
        thought: 'analyzing market conditions for ASSET range bound regime confirmed institutional vwap support reversion probable moderate conviction',
      },
      {
        regime: 'REGIME_BEAR_TREND',
        aci: 'ACI_SUBPAR_BELOW_65',
        vwap: 'BELOW_VWAP_FAILED',
        vol: 'VOLUME_FADING_SUB_1X',
        action: 'STAND_ASIDE',
        val: -0.5,
        thought: 'analyzing market conditions for ASSET bear trend regime below vwap failed capital defense mandates stand aside preserve cash',
      },
      {
        regime: 'REGIME_HIGH_VOLATILITY',
        aci: 'ACI_STRONG_75_84',
        vwap: 'ABOVE_VWAP_EXPANSION',
        vol: 'VOLUME_SURGE_STRONG_2X',
        action: 'VWAP_PULLBACK',
        val: 0.8,
        thought: 'analyzing market conditions for ASSET volume surge confirmed at vwap support halving risk due elevated volatility regime allocating runner target',
      },
    ];

    let synthId = 0;
    for (let loop = 0; loop < 200; loop++) {
      if (scenarios.length >= maxScenarios) break;
      for (const asset of assets) {
        if (scenarios.length >= maxScenarios) break;
        const st = stressTypes[synthId % stressTypes.length];
        synthId++;

        const promptText = `<scenario> ${asset} ${st.regime} ${st.aci} ${st.vwap} ${st.vol} </scenario>`;
        const thoughtText = `<thought> ${st.thought.replace('ASSET', asset)} </thought> <action> ${st.action} </action>`;
        const inputTokens = DomainTokenizer.encode(promptText);
        const targetTokens = DomainTokenizer.encode(thoughtText);
        const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(st.action as any));

        scenarios.push({
          id: `stress-synth-${synthId}`,
          inputTokens,
          targetTokens,
          targetActionIdx,
          targetValue: st.val,
          rawText: promptText,
          thoughtText,
          actionName: st.action,
        });
      }
    }
  }

  /**
   * Synthesizes rich quantitative finance trajectories:
   * 1. Analytical Black-Scholes Greeks (Delta, Gamma, Vega, Theta, Vanna, Volga) & Taylor expansion P&L.
   * 2. Heston stochastic volatility & Feller boundary checks (2*kappa*theta > sigma_v^2).
   * 3. Order book microstructure (Bid-Ask volume imbalance, Amihud illiquidity, Roll & Corwin-Schultz spreads).
   * 4. Pairs cointegration Z-scores & Ornstein-Uhlenbeck mean-reversion drift.
   * 5. NSE Indian equities micro-invariants (tick size ₹0.05, integer lot sizing, ₹2,000 liquid reserve floor).
   */
  public static synthesizeAdvancedQuantMicrostructureScenarios(
    scenarios: ScenarioExample[],
    tok: TokenizerInterface,
    maxCount = 2000
  ): void {
    const assets = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TATAPOWER', 'BTC', 'ETH', 'SOL'];
    const quantTemplates = [
      // Template 1: Analytical Greeks & Delta Hedging
      (asset: string, idx: number) => {
        const spot = 2000 + (idx % 20) * 50;
        const delta = (0.45 + (idx % 40) * 0.01).toFixed(2);
        const gamma = (0.02 + (idx % 10) * 0.005).toFixed(3);
        const vega = (12.0 + (idx % 15) * 1.2).toFixed(1);
        const promptText = `<scenario> DOMAIN_QUANT_GREEKS ${asset} spot=${spot} delta=${delta} gamma=${gamma} vega=${vega} compute dynamic hedge ratio </scenario>`;
        const thoughtText = `<thought> second-order Taylor expansion: dPi = delta*dS + 0.5*gamma*dS^2 + vega*dVol; adjusting hedge lot size </thought> <action> QUANT_VERIFIED </action>`;
        return { promptText, thoughtText, actionName: 'QUANT_VERIFIED', targetValue: 0.85 };
      },
      // Template 2: Heston Stochastic Volatility & Feller Invariant
      (asset: string, idx: number) => {
        const kappa = 2.0;
        const theta = 0.04;
        const sigmaV = (idx % 2 === 0) ? 0.35 : 0.45;
        const fellerLhs = (2 * kappa * theta).toFixed(3);
        const fellerRhs = (sigmaV * sigmaV).toFixed(3);
        const isFellerSafe = 2 * kappa * theta > sigmaV * sigmaV;
        const action = isFellerSafe ? 'QUANT_VERIFIED' : 'DEFENSIVE_EXIT';
        const promptText = `<scenario> DOMAIN_STOCHASTIC_VOL ${asset} Heston kappa=${kappa} theta=${theta} sigma_v=${sigmaV} test Feller condition 2*kappa*theta > sigma_v^2 </scenario>`;
        const thoughtText = `<thought> LHS=${fellerLhs} vs RHS=${fellerRhs}: ${isFellerSafe ? 'Feller satisfied; variance process strictly positive' : 'Feller boundary violated; explosion hazard detected'} </thought> <action> ${action} </action>`;
        return { promptText, thoughtText, actionName: action, targetValue: isFellerSafe ? 0.9 : -0.8 };
      },
      // Template 3: Order Book Microstructure & Amihud Illiquidity
      (asset: string, idx: number) => {
        const bidVol = 10000 + (idx % 50) * 500;
        const askVol = 8000 + ((idx * 7) % 50) * 500;
        const imbalance = ((bidVol - askVol) / (bidVol + askVol)).toFixed(3);
        const amihud = (0.000015 * (1 + (idx % 10))).toFixed(6);
        const isBullImbalance = Number(imbalance) > 0.15;
        const action = isBullImbalance ? 'BUY_BREAKOUT' : 'STAND_ASIDE';
        const promptText = `<scenario> DOMAIN_MICROSTRUCTURE ${asset} bid_vol=${bidVol} ask_vol=${askVol} imbalance=${imbalance} amihud_ratio=${amihud} </scenario>`;
        const thoughtText = `<thought> order book depth shows ${isBullImbalance ? 'heavy bid skew; aggressive liquidity absorption' : 'symmetric liquidity; no directional edge'} </thought> <action> ${action} </action>`;
        return { promptText, thoughtText, actionName: action, targetValue: isBullImbalance ? 0.75 : 0.0 };
      },
      // Template 4: Pairs Cointegration & OU Mean-Reversion
      (asset: string, idx: number) => {
        const zScore = (-2.8 + (idx % 60) * 0.1).toFixed(2);
        const zNum = Number(zScore);
        let action = 'STAND_ASIDE';
        let val = 0.0;
        if (zNum < -2.0) { action = 'BUY_BREAKOUT'; val = 0.8; }
        else if (zNum > 2.0) { action = 'PROFIT_HARVEST'; val = 0.8; }
        const promptText = `<scenario> DOMAIN_PAIRS_COINTEGRATION ${asset} spread z_score=${zScore} ADF_stationary p_val=0.008 </scenario>`;
        const thoughtText = `<thought> Ornstein-Uhlenbeck mean-reversion drift: z=${zScore} is ${Math.abs(zNum) > 2.0 ? 'statistically extreme beyond 2 sigma' : 'inside fair-value band'} </thought> <action> ${action} </action>`;
        return { promptText, thoughtText, actionName: action, targetValue: val };
      },
      // Template 5: NSE Indian Equities Invariants (Tick size ₹0.05, integer shares, ₹2000 cash floor)
      (asset: string, idx: number) => {
        const cash = 1500 + (idx % 30) * 200;
        const price = 1800 + (idx % 20) * 40;
        const spendable = Math.max(0, cash - 2000);
        const shares = Math.floor(spendable / price);
        const tickAligned = (Math.round((price * 0.99) * 20) / 20).toFixed(2);
        const action = shares >= 1 ? 'BUY_BREAKOUT' : 'STAND_ASIDE';
        const promptText = `<scenario> DOMAIN_NSE_MICROSTRUCTURE ${asset} cash=${cash} price=${price} limit=${tickAligned} </scenario>`;
        const thoughtText = `<thought> spendable cash above ₹2,000 floor is ₹${spendable}; ${shares >= 1 ? `sized at ${shares} integer shares; tick size ₹0.05 verified` : 'insufficient cash above floor for 1 share; standing aside'} </thought> <action> ${action} </action>`;
        return { promptText, thoughtText, actionName: action, targetValue: shares >= 1 ? 0.7 : 0.0 };
      },
    ];

    let count = 0;
    while (count < maxCount) {
      const asset = assets[count % assets.length];
      const template = quantTemplates[count % quantTemplates.length];
      const res = template(asset, count);
      const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(res.actionName as any));

      scenarios.push({
        id: `quant-adv-${count}`,
        inputTokens: tok.encode(res.promptText),
        targetTokens: tok.encode(res.thoughtText),
        targetActionIdx,
        targetValue: res.targetValue,
        rawText: res.promptText,
        thoughtText: res.thoughtText,
        actionName: res.actionName,
        domain: 'quant_trading',
      });
      count++;
    }
  }

  /**
   * Synthesizes elite institutional quantitative finance reasoning across 6 specialized desks:
   * 1. Quantitative Macro & Equity Long/Short (Systematic alpha, Hurst persistence, Amihud liquidity)
   * 2. Derivatives & Dynamic Greeks (Taylor series expansion, Gamma convexity, Delta hedging)
   * 3. Microstructure & Order Flow (Order book skew, toxic flow, tick quantization)
   * 4. Statistical Arbitrage & Cointegration (Ornstein-Uhlenbeck drift, ADF stationary, Z-scores)
   * 5. Corporate Solvency & Fundamental Analysis (SEC 10-K/10-Q, debt maturity cliff, cash flow)
   * 6. Sentinel Risk & Statutory Governance (₹0.05 tick size, integer lot sizing, ₹2,000 cash reserve)
   */
  public static synthesizePremiumInstitutionalCorpus(
    tok: TokenizerInterface = DomainTokenizer,
    maxCount: number = 600
  ): ScenarioExample[] {
    const assets = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TATAPOWER', 'SBIN', 'BHARTIARTL', 'LT'];
    const scenarios: ScenarioExample[] = [];

    const deskTemplates = [
      // Desk 1: Equity Long/Short & Macro Trend
      (asset: string, idx: number) => {
        const hurst = (0.62 + (idx % 15) * 0.015).toFixed(2);
        const promptText = `<scenario> DOMAIN_EQUITY_ALPHA ${asset} HURST_${hurst} REGIME_BULL_TREND ACI_STRONG_75_84 VWAP_EXPANSION VOLUME_SURGE_STRONG_2X </scenario>`;
        const thoughts = [
          `<thought> systematic alpha scan confirms persistent trend structure with hurst exponent ${hurst}; order book liquidity supports breakout with asymmetric expectancy </thought> <action> BUY_BREAKOUT </action>`,
          `<thought> price retested institutional vwap support on declining volume; order flow depth affirms strong limit bid absorption with positive convexity </thought> <action> VWAP_PULLBACK </action>`,
          `<thought> target hurdle achieved; locking partial profits and raising trailing ratchet stop to safeguard institutional alpha </thought> <action> PROFIT_HARVEST </action>`,
        ];
        const actionNames = ['BUY_BREAKOUT', 'VWAP_PULLBACK', 'PROFIT_HARVEST'];
        const pick = Math.floor(idx / 6) % 3;
        return { promptText, thoughtText: thoughts[pick], actionName: actionNames[pick], targetValue: 0.85 };
      },

      // Desk 2: Derivatives & Dynamic Greeks
      (asset: string, idx: number) => {
        const delta = (0.50 + (idx % 20) * 0.01).toFixed(2);
        const gamma = (0.025 + (idx % 10) * 0.002).toFixed(3);
        const vega = (14.2 + (idx % 12) * 0.8).toFixed(1);
        const promptText = `<scenario> DOMAIN_DERIVATIVES_GREEKS ${asset} DELTA_${delta} GAMMA_${gamma} VEGA_${vega} TAYLOR_EXPANSION_HEDGE </scenario>`;
        const thoughts = [
          `<thought> second-order taylor expansion yields positive gamma convexity; calibrating dynamic delta hedge ratio to neutralize directional drift </thought> <action> QUANT_VERIFIED </action>`,
          `<thought> implied volatility skew displays steep call-wing premium; executing volatility-calibrated sizing with feller condition verified </thought> <action> QUANT_VERIFIED </action>`,
          `<thought> implied volatility crush detected post-catalyst; rapid vega decay threatens margin; closing long gamma exposure </thought> <action> DEFENSIVE_EXIT </action>`,
        ];
        const actionNames = ['QUANT_VERIFIED', 'QUANT_VERIFIED', 'DEFENSIVE_EXIT'];
        const pick = Math.floor(idx / 6) % 3;
        return { promptText, thoughtText: thoughts[pick], actionName: actionNames[pick], targetValue: pick === 2 ? -0.7 : 0.9 };
      },

      // Desk 3: Microstructure & Order Flow
      (asset: string, idx: number) => {
        const imbalance = (0.18 + (idx % 25) * 0.01).toFixed(2);
        const promptText = `<scenario> DOMAIN_MICROSTRUCTURE ${asset} BID_ASK_IMBALANCE_${imbalance} AMIHUD_LIQUIDITY_FAVORABLE </scenario>`;
        const thoughts = [
          `<thought> limit order book imbalance indicates institutional bid absorption; bid-ask spread compressed below 0.05 nse tick threshold </thought> <action> BUY_BREAKOUT </action>`,
          `<thought> order flow toxic imbalance detected; aggressive market sell orders breaching depth levels; enacting defensive liquidity withdrawal </thought> <action> DEFENSIVE_EXIT </action>`,
          `<thought> amihud illiquidity ratio elevated; order execution risk excessive; standing aside to prevent market impact slippage </thought> <action> STAND_ASIDE </action>`,
        ];
        const actionNames = ['BUY_BREAKOUT', 'DEFENSIVE_EXIT', 'STAND_ASIDE'];
        const pick = Math.floor(idx / 6) % 3;
        return { promptText, thoughtText: thoughts[pick], actionName: actionNames[pick], targetValue: pick === 0 ? 0.8 : pick === 1 ? -0.8 : 0.0 };
      },

      // Desk 4: Statistical Arbitrage & Cointegration
      (asset: string, idx: number) => {
        const zScore = (2.1 + (idx % 15) * 0.1).toFixed(2);
        const promptText = `<scenario> DOMAIN_STAT_ARB ${asset} SPREAD_Z_SCORE_${zScore} ADF_STATIONARY_P001 OU_MEAN_REVERSION </scenario>`;
        const thoughts = [
          `<thought> spread cointegration z-score deviates beyond two standard deviations; ornstein-uhlenbeck drift dictates mean-reverting harvest tranche </thought> <action> PROFIT_HARVEST </action>`,
          `<thought> spread converged to mean reversion target; executing profit harvest across long-short pair to crystallize edge </thought> <action> PROFIT_HARVEST </action>`,
          `<thought> cointegration relationship broken; adf test p-value rose above 0.10; liquidating stat arb basket immediately </thought> <action> DEFENSIVE_EXIT </action>`,
        ];
        const actionNames = ['PROFIT_HARVEST', 'PROFIT_HARVEST', 'DEFENSIVE_EXIT'];
        const pick = Math.floor(idx / 6) % 3;
        return { promptText, thoughtText: thoughts[pick], actionName: actionNames[pick], targetValue: pick === 2 ? -0.75 : 0.85 };
      },

      // Desk 5: Corporate Solvency & Fundamental Sentinel
      (asset: string, idx: number) => {
        const coverage = (3.5 + (idx % 20) * 0.2).toFixed(1);
        const promptText = `<scenario> DOMAIN_CORPORATE_SOLVENCY ${asset} INTEREST_COVERAGE_${coverage}X OPERATING_CASH_FLOW_HEALTHY </scenario>`;
        const thoughts = [
          `<thought> sec disclosure and operating cash flow metrics confirm solvent debt coverage; enterprise balance sheet resilient against interest shocks </thought> <action> ASSESS_FUNDAMENTALS </action>`,
          `<thought> subordinated debt maturity cliff approaching; interest coverage deteriorated; downgrading allocation conviction </thought> <action> STAND_ASIDE </action>`,
          `<thought> balance sheet solvency and cash flow runway exceed covenant hurdles; confirming fundamental safety margin </thought> <action> ASSESS_FUNDAMENTALS </action>`,
        ];
        const actionNames = ['ASSESS_FUNDAMENTALS', 'STAND_ASIDE', 'ASSESS_FUNDAMENTALS'];
        const pick = Math.floor(idx / 6) % 3;
        return { promptText, thoughtText: thoughts[pick], actionName: actionNames[pick], targetValue: pick === 1 ? -0.3 : 0.8 };
      },

      // Desk 6: Sentinel Risk & Statutory Governance
      (asset: string, idx: number) => {
        const promptText = `<scenario> DOMAIN_SENTINEL_GOVERNANCE ${asset} TICK_0_05 INTEGER_LOTS CASH_FLOOR_2000 ACI_GOVERNANCE </scenario>`;
        const thoughts = [
          `<thought> exchange invariant audit passed: order tick quantized to 0.05, integer lot sizing enforced, and 2000 liquid reserve floor strictly preserved </thought> <action> QUANT_VERIFIED </action>`,
          `<thought> volatility shock threshold breached; circuit breaker guard activated; mandate immediate capital defense and stand aside </thought> <action> DEFENSIVE_EXIT </action>`,
          `<thought> available cash within 2000 liquid reserve floor; sizing zero integer shares to protect statutory boundary </thought> <action> STAND_ASIDE </action>`,
        ];
        const actionNames = ['QUANT_VERIFIED', 'DEFENSIVE_EXIT', 'STAND_ASIDE'];
        const pick = Math.floor(idx / 6) % 3;
        return { promptText, thoughtText: thoughts[pick], actionName: actionNames[pick], targetValue: pick === 0 ? 0.95 : pick === 1 ? -0.9 : 0.0 };
      },
    ];

    let count = 0;
    while (count < maxCount) {
      const asset = assets[count % assets.length];
      const desk = deskTemplates[count % deskTemplates.length];
      const res = desk(asset, count);
      const targetActionIdx = Math.max(0, ACTION_TOKENS.indexOf(res.actionName as any));

      scenarios.push({
        id: `premium-inst-${count}`,
        inputTokens: tok.encode(res.promptText),
        targetTokens: tok.encode(res.thoughtText),
        targetActionIdx,
        targetValue: res.targetValue,
        rawText: res.promptText,
        thoughtText: res.thoughtText,
        actionName: res.actionName,
        domain: 'quant_trading',
      });
      count++;
    }

    return scenarios;
  }

  /**
   * Constructs high-elo DPO preference pairs aligning the model with institutional professionalism:
   * Chosen (Winner): Crisp, rigorous, mathematically grounded quantitative reasoning.
   * Rejected (Loser): Repetitive token loops, colloquial phrasing, or rule-violating gambles.
   */
  public static buildProfessionalismDPOPairs(
    tok: TokenizerInterface = DomainTokenizer,
    maxPairs: number = 300
  ): DPOPreferencePair[] {
    const assets = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TATAPOWER'];
    const pairs: DPOPreferencePair[] = [];

    const dpoScenarios = [
      // 1. Anti-repetition: professional quant vs looping prompt echo
      (asset: string) => ({
        prompt: `<scenario> ${asset} REGIME_BULL_TREND ACI_STRONG_75_84 ABOVE_VWAP_EXPANSION VOLUME_SURGE_STRONG_2X </scenario>`,
        winningThought: `<thought> systematic alpha scan confirms persistent trend structure with asymmetric expectancy; order flow depth supports breakout entry </thought> <action> BUY_BREAKOUT </action>`,
        losingThought: `<thought> analyzing market conditions for ${asset} analyzing market conditions for ${asset} market conditions buy breakout </thought> <action> BUY_BREAKOUT </action>`,
        winAction: 'BUY_BREAKOUT',
        loseAction: 'BUY_BREAKOUT',
        margin: 350,
      }),

      // 2. Risk discipline: systematic exit vs ignoring stop loss
      (asset: string) => ({
        prompt: `<scenario> ${asset} REGIME_VOLATILITY_SHOCK ACI_SUBPAR_BELOW_65 BELOW_VWAP_FAILED VOLUME_SURGE_EXTREME_3X </scenario>`,
        winningThought: `<thought> adverse volatility shock detected; sentinel risk hurdle breached; closing position to safeguard margin </thought> <action> DEFENSIVE_EXIT </action>`,
        losingThought: `<thought> ignoring risk boundaries counter-trend entry averaging down hoping for reversal </thought> <action> BUY_BREAKOUT </action>`,
        winAction: 'DEFENSIVE_EXIT',
        loseAction: 'BUY_BREAKOUT',
        margin: 450,
      }),

      // 3. Mathematical precision: Taylor series expansion vs naive guessing
      (asset: string) => ({
        prompt: `<scenario> DOMAIN_DERIVATIVES_GREEKS ${asset} DELTA_0_55 GAMMA_0_03 VEGA_14_2 TAYLOR_EXPANSION </scenario>`,
        winningThought: `<thought> second-order taylor expansion yields positive gamma convexity; calibrating dynamic delta hedge ratio to neutralize directional drift </thought> <action> QUANT_VERIFIED </action>`,
        losingThought: `<thought> guessing market direction without computing greek derivatives or delta hedge </thought> <action> STAND_ASIDE </action>`,
        winAction: 'QUANT_VERIFIED',
        loseAction: 'STAND_ASIDE',
        margin: 400,
      }),

      // 4. Invariant compliance: ₹0.05 tick & ₹2000 cash floor vs fractional/unhedged gamble
      (asset: string) => ({
        prompt: `<scenario> DOMAIN_NSE_MICROSTRUCTURE ${asset} CASH_3500 PRICE_2450 LIMIT_ORDER </scenario>`,
        winningThought: `<thought> spendable cash above 2000 floor is 1500; sized at 0 integer shares; tick size 0.05 verified; preserving cash floor </thought> <action> STAND_ASIDE </action>`,
        losingThought: `<thought> buying 1.5 fractional shares at unaligned tick 2450.33 ignoring cash reserve floor </thought> <action> BUY_BREAKOUT </action>`,
        winAction: 'STAND_ASIDE',
        loseAction: 'BUY_BREAKOUT',
        margin: 500,
      }),

      // 5. Profit harvesting: trailing ratchet vs greed/stagnancy
      (asset: string) => ({
        prompt: `<scenario> ${asset} TRANCHE_1_REACHED +1.5_ATR RUNNER_TARGET_ACTIVE </scenario>`,
        winningThought: `<thought> profit target hurdle reached; locking partial gains with dynamic atr ratchet stop </thought> <action> PROFIT_HARVEST </action>`,
        losingThought: `<thought> holding full size without locking profits hoping for infinite runner ignoring trailing stops </thought> <action> STAND_ASIDE </action>`,
        winAction: 'PROFIT_HARVEST',
        loseAction: 'STAND_ASIDE',
        margin: 300,
      }),
    ];

    let count = 0;
    while (count < maxPairs) {
      const asset = assets[count % assets.length];
      const template = dpoScenarios[count % dpoScenarios.length];
      const item = template(asset);

      const winningActionIdx = Math.max(0, ACTION_TOKENS.indexOf(item.winAction as any));
      const losingActionIdx = Math.max(0, ACTION_TOKENS.indexOf(item.loseAction as any));

      pairs.push({
        id: `dpo-prof-${count}`,
        prompt: item.prompt,
        scenarioPrompt: item.prompt,
        promptTokens: tok.encode(item.prompt),
        winningThought: item.winningThought,
        winningTokens: tok.encode(item.winningThought),
        winningActionIdx,
        losingThought: item.losingThought,
        losingTokens: tok.encode(item.losingThought),
        losingActionIdx,
        actionName: item.winAction,
        marginReturnDelta: item.margin,
        marginBenefit: item.margin,
      });
      count++;
    }

    return pairs;
  }
}

