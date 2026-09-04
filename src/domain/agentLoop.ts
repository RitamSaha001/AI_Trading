import { Asset, AppState, Market, AIActionProposal } from '../types';
import { LLMProvider, LLMMessage } from './llmProvider';
import { QUANT_TOOLS, ToolExecutionContext } from './quantTools';
import { buildStructuredMarketContext, StructuredMarketContext } from './marketContext';
import { buildQuantSystemPrompt } from './quantSystemPrompt';
import { UserPreferences, extractPreferencesFromText } from './userPreferences';
import { TradingDecision, formatDecisionMarkdown } from './decision';
import { challengeTradingDecision } from './challenger';
import { MarketDataValidityGuard } from './marketValidity';
import { getRiskPolicy } from './riskPolicy';
import { validateAIProposal } from '../services/safetyGate';
import { calculateRiskBasedPositionSize } from './positionSizing';
import { portfolioValue } from './portfolio';
import {
  calculateAgenticAllocation,
  senseMarketDanger,
  synthesizeStrategyBot,
  generateSmartDCAPlan,
  compareTokensAlpha,
  simulatePortfolioStressTest,
} from './agentic';

export interface AgentTelemetry {
  aiMode: string;
  reasoningTier: string;
  toolsUsed: string[];
  dataFreshnessSec: number;
  dataQualityScore: number;
  signalScore?: number;
  portfolioRiskLabel: string;
  portfolioRiskScore: number;
  counterArgument?: string;
  loopIterations: number;
}

export interface AgentLoopResult {
  reply: string;
  actionProposal?: AIActionProposal | null;
  decision?: TradingDecision | null;
  telemetry: AgentTelemetry;
  engine: string;
  updatedPreferences?: UserPreferences;
}

/**
 * Runs the bounded multi-turn agent loop with tool-calling, quantitative execution,
 * challenger verification, and safety validation.
 */
export async function runAgentLoop(params: {
  query: string;
  state: AppState;
  markets: Record<Asset, Market | undefined>;
  history: { role: 'user' | 'assistant'; text: string }[];
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  userPreferences?: UserPreferences;
  maxIterations?: number;
}): Promise<AgentLoopResult> {
  const { query, state, markets, history, provider, model, apiKey, maxIterations = 5 } = params;

  // 1. Session Memory & User Constraints Update
  const currentPrefs = params.userPreferences || {
    riskTolerance: 'moderate',
    preferredAssets: [],
    excludedAssets: [],
    investmentHorizon: 'swing',
    strategyPreferences: [],
    specialInstructions: [],
  };
  const updatedPreferences = extractPreferencesFromText(query, currentPrefs);

  // 2. Build Structured Market Context
  const context: StructuredMarketContext = buildStructuredMarketContext(state, markets);
  const systemInstruction = buildQuantSystemPrompt(context, updatedPreferences);
  const policy = getRiskPolicy(state);
  const toolExecCtx: ToolExecutionContext = { state, markets, policy };

  // 3. Format Conversation History for LLM
  const messages: LLMMessage[] = [];
  const recentHistory = history.slice(-6);
  for (const h of recentHistory) {
    messages.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      content: h.text,
    });
  }

  // Append latest user prompt
  messages.push({
    role: 'user',
    content: query,
  });

  const toolsUsed: string[] = [];
  const toolRegistry = QUANT_TOOLS;
  const toolDefinitions = Object.values(toolRegistry);

  let finalRawText = '';
  let iterations = 0;

  // 4. Bounded Agent Loop
  while (iterations < maxIterations) {
    iterations++;

    const response = await provider.generate({
      model,
      apiKey,
      systemInstruction,
      messages,
      tools: toolDefinitions,
      thinking: true,
      temperature: 0.2,
    });

    if (response.toolCalls && response.toolCalls.length > 0) {
      // Execute each tool sequentially
      const results: { name: string; result: any }[] = [];

      for (const tc of response.toolCalls) {
        toolsUsed.push(tc.name);
        const toolDef = toolRegistry[tc.name];
        let result: any;
        if (toolDef) {
          try {
            result = await toolDef.execute(tc.args || {}, toolExecCtx);
          } catch (err: any) {
            result = { success: false, error: err?.message || 'Tool execution failed' };
          }
        } else {
          result = { success: false, error: `Tool ${tc.name} is not recognized.` };
        }
        results.push({ name: tc.name, result });
      }

      // Record model tool call and tool execution observations in message history
      // Preserve rawModelParts for Gemini 3 thought_signature continuity
      messages.push({
        role: 'model',
        toolCalls: response.toolCalls,
        rawModelParts: response.rawModelParts,
      });

      messages.push({
        role: 'user',
        toolResults: results,
      });
    } else if (response.text) {
      finalRawText = response.text;
      break;
    } else {
      // Empty candidate response
      break;
    }
  }

  if (!finalRawText) {
    finalRawText = 'Analysis completed across quantitative tools.';
  }

  // 5. Parse Decision Payload if present
  let cleanText = finalRawText;
  let parsedDecision: TradingDecision | null = null;
  let actionProposal: AIActionProposal | null = null;

  const decisionMatch = finalRawText.match(/<<<DECISION\s*([\s\S]*?)\s*DECISION>>>/);
  if (decisionMatch) {
    try {
      parsedDecision = JSON.parse(decisionMatch[1]);
      cleanText = finalRawText.replace(/<<<DECISION[\s\S]*?DECISION>>>/, '').trim();
    } catch (e) {
      console.warn('Failed to parse DECISION block JSON:', e);
    }
  }

  // 6. Challenger Pass & Multi-Type Action Proposal Synthesis
  let challengerCounterArg: string | undefined;
  if (parsedDecision && parsedDecision.action && parsedDecision.action !== 'NONE') {
    // Run Challenger pass
    const challenger = challengeTradingDecision(parsedDecision, state, markets, policy);
    challengerCounterArg = challenger.counterArgument;
    parsedDecision.counterArgument = challenger.counterArgument;

    const targetAsset = parsedDecision.asset || state.selectedAsset;
    const m = markets[targetAsset];

    if (parsedDecision.proposedAction) {
      // Direct action proposal passed in decision
      const safety = validateAIProposal(parsedDecision.proposedAction, state, markets);
      if (safety.valid) {
        actionProposal = parsedDecision.proposedAction;
      } else {
        cleanText += `\n\n> ⚠️ **Execution Gate Block**: Proposed action disabled: ${safety.errors.join('; ')}`;
      }
    } else if (parsedDecision.action === 'BUY' || parsedDecision.action === 'SELL') {
      const side = parsedDecision.action === 'BUY' ? 'buy' : 'sell';

      // Verify market data validity (No fake prices!)
      const validity = MarketDataValidityGuard.validate(m, targetAsset, policy, { requireExecutionGrade: true });

      if (!validity.canExecute || !m || !m.price || m.price <= 0) {
        cleanText += `\n\n> ⚠️ **Execution Gate Block**: Order proposal disabled due to missing or invalid market feed: ${validity.errors.join('; ') || 'Data unavailable'}`;
      } else {
        const spot = m.price;
        const pv = portfolioValue(state, markets);

        // Derive risk-budgeted size if not explicitly valid
        let amount = parsedDecision.quantity;
        if (!amount || amount <= 0) {
          const sized = calculateRiskBasedPositionSize({
            asset: targetAsset,
            side,
            entryPrice: spot,
            stopPrice: parsedDecision.stopLoss,
            targetPrice: parsedDecision.takeProfit,
            portfolioEquity: pv,
            availableCash: state.cash,
            currentHolding: state.positions[targetAsset] || 0,
            currentHoldingNotional: (state.positions[targetAsset] || 0) * spot,
            market: m,
            policy,
          });
          amount = sized.quantity;
        }

        if (amount <= 0) {
          cleanText += `\n\n> ⚠️ **Execution Gate Block**: Order quantity is 0 under risk budget and capital constraints.`;
        } else {
          const proposalCandidate: AIActionProposal = {
            type: 'order',
            asset: targetAsset,
            side,
            amount,
            rationale: parsedDecision.thesis || `Risk-budgeted ${side} execution on ${targetAsset}`,
            confidence: parsedDecision.modelConfidence && parsedDecision.modelConfidence > 75 ? 'high' : 'medium',
            riskSummary: parsedDecision.portfolioRiskImpact || `Trade notional: $${((parsedDecision.notional || amount * spot)).toFixed(2)} with stop at $${(parsedDecision.stopLoss || spot * 0.96).toFixed(2)}`,
            requiresConfirmation: true,
          };

          const safety = validateAIProposal(proposalCandidate, state, markets);
          if (safety.valid) {
            actionProposal = proposalCandidate;
          } else {
            const issues = [...validity.errors, ...safety.errors];
            cleanText += `\n\n> ⚠️ **Execution Gate Block**: Order proposal disabled due to safety bounds: ${issues.join('; ')}`;
          }
        }
      }
    } else if (parsedDecision.action === 'REBALANCE') {
      const plan = calculateAgenticAllocation(state, markets, 'risk_parity');
      const candidate: AIActionProposal = {
        type: 'rebalance',
        asset: targetAsset,
        rationale: parsedDecision.thesis || 'Agentic portfolio rebalancing to optimize risk-adjusted returns',
        confidence: 'high',
        riskSummary: `Rebalances portfolio across ${plan.steps.length} transactions preserving ${(plan.cashTargetPct).toFixed(0)}% cash cushion.`,
        rebalanceTargets: plan.targetWeights,
        cashTargetPct: plan.cashTargetPct,
        rebalanceSteps: plan.steps,
        requiresConfirmation: true,
      };
      const safety = validateAIProposal(candidate, state, markets);
      if (safety.valid) {
        actionProposal = candidate;
      } else {
        cleanText += `\n\n> ⚠️ **Execution Gate Block**: Rebalance proposal disabled: ${safety.errors.join('; ')}`;
      }
    } else if (parsedDecision.action === 'DEFEND') {
      const danger = senseMarketDanger(state, markets);
      const candidate: AIActionProposal = danger.defensiveProposal || {
        type: 'emergency_defend',
        asset: targetAsset,
        dangerLevel: 'HIGH',
        hazardSource: 'Autonomous Risk Sentinel',
        rationale: parsedDecision.thesis || 'Emergency capital defense: De-risking into liquid cash cushion',
        confidence: 'high',
        riskSummary: 'Restoring mandatory cash liquidity buffer and reducing concentrated risk.',
        requiresConfirmation: true,
      };
      const safety = validateAIProposal(candidate, state, markets);
      if (safety.valid) {
        actionProposal = candidate;
      } else {
        cleanText += `\n\n> ⚠️ **Execution Gate Block**: Defense proposal disabled: ${safety.errors.join('; ')}`;
      }
    } else if (parsedDecision.action === 'DEPLOY_BOT') {
      const synthesized = synthesizeStrategyBot(targetAsset, 'vwap_trend', state, markets);
      const candidate: AIActionProposal = {
        type: 'deploy_strategy',
        asset: targetAsset,
        rationale: parsedDecision.thesis || `Automated ${synthesized.name} bot calibrated for ${targetAsset}`,
        confidence: 'high',
        riskSummary: `Allocates up to ${((synthesized.maxAllocation || 0.25) * 100).toFixed(0)}% of portfolio into automated execution`,
        requiresConfirmation: true,
        strategyParams: {
          kind: synthesized.kind,
          name: synthesized.name,
          maxAllocation: synthesized.maxAllocation,
          cooldownSec: synthesized.cooldownSec,
          targetProfitPct: synthesized.targetProfitPct,
          trailingStopPct: synthesized.trailingStopPct,
          params: synthesized.params,
        },
      };
      const safety = validateAIProposal(candidate, state, markets);
      if (safety.valid) {
        actionProposal = candidate;
      } else {
        cleanText += `\n\n> ⚠️ **Execution Gate Block**: Strategy bot deployment disabled: ${safety.errors.join('; ')}`;
      }
    } else if (parsedDecision.action === 'SMART_DCA') {
      const dcaPlan = generateSmartDCAPlan(targetAsset, 200, state, markets);
      const candidate: AIActionProposal = {
        type: 'smart_dca',
        asset: targetAsset,
        rationale: parsedDecision.thesis || `Automated Value-Weighted DCA plan for ${targetAsset}`,
        confidence: 'high',
        riskSummary: `Allocates $${dcaPlan.baseAmountUsd}/week with dynamic dip buying multipliers`,
        requiresConfirmation: true,
        dcaPlan,
      };
      const safety = validateAIProposal(candidate, state, markets);
      if (safety.valid) {
        actionProposal = candidate;
      } else {
        cleanText += `\n\n> ⚠️ **Execution Gate Block**: DCA plan proposal disabled: ${safety.errors.join('; ')}`;
      }
    } else if (parsedDecision.action === 'STRESS_TEST') {
      const simulated = simulatePortfolioStressTest(state, markets, 'btc_flash_crash_20');
      actionProposal = {
        type: 'stress_test',
        asset: targetAsset,
        rationale: parsedDecision.thesis || `Simulated stress testing under ${simulated.title}`,
        confidence: 'high',
        riskSummary: `Projected portfolio impact: -${simulated.simulatedDrawdownPct}% ($${simulated.simulatedLossUsd.toLocaleString()})`,
        requiresConfirmation: true,
        stressTest: simulated,
      };
    } else if (parsedDecision.action === 'TOKEN_COMPARE') {
      const comparison = compareTokensAlpha(['BTC', 'ETH', 'SOL', 'AVAX'] as Asset[], markets);
      actionProposal = {
        type: 'token_compare',
        asset: targetAsset,
        rationale: parsedDecision.thesis || comparison.verdict,
        confidence: 'high',
        riskSummary: `Peer alpha analysis across ${comparison.tokens.length} assets`,
        requiresConfirmation: true,
        tokenComparison: comparison,
      };
    } else if (parsedDecision.action === 'ALERT') {
      const spotPrice = m?.price || parsedDecision.entry;
      if (spotPrice && spotPrice > 0) {
        actionProposal = {
          type: 'alert',
          asset: targetAsset,
          alertType: 'above',
          value: parsedDecision.entry || Math.round(spotPrice * 1.05),
          rationale: parsedDecision.thesis || `Volatility sentinel alert for ${targetAsset}`,
          confidence: 'medium',
          riskSummary: 'Informational price trigger; does not execute trades.',
          requiresConfirmation: true,
        };
      }
    }
  }

  const telemetry: AgentTelemetry = {
    aiMode: `${model.replace(/^models\//, '')}`,
    reasoningTier: 'High (Thinking Engine Active)',
    toolsUsed: Array.from(new Set(toolsUsed)),
    dataFreshnessSec: context.assets[context.primaryAsset]?.dataFreshnessSec ?? 2,
    dataQualityScore: context.metadata.overallDataQualityScore,
    signalScore: parsedDecision?.signalScore,
    portfolioRiskLabel: context.portfolio.cashReservePct < 15 ? 'Elevated' : 'Moderate',
    portfolioRiskScore: Math.round(context.portfolio.var95Pct * 20),
    counterArgument: challengerCounterArg,
    loopIterations: iterations,
  };

  return {
    reply: cleanText,
    actionProposal,
    decision: parsedDecision,
    telemetry,
    engine: `Nexus Frontier Agent (${model})`,
    updatedPreferences,
  };
}
