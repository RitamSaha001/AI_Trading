/**
 * LUMEN ASTRA MULTI-TURN DIALOGUE & CONVERSATIONAL INTELLIGENCE TEST SUITE
 * 
 * Verifies:
 * 1. Multi-turn context memory and anaphora/pronoun resolution across dialogue turns.
 * 2. Adaptive depth modulation (ELI5 everyday analogies vs. exhaustive quantitative deep-dives).
 * 3. Point-level drilldowns referencing numbered items from prior turns.
 * 4. Comparative synthesis across entities (e.g. Ukraine vs. Russia, Lit Order Books vs. Dark Pools).
 * 5. Dialogue state tracking, entity stacks, and conversational recap memory.
 * 6. Natural conversational banter and personal pronoun resolution ("his downfall").
 */

import { describe, it, expect } from 'vitest';
import { DialogueStateTracker } from '../standalone/dialogueStateTracker';
import { reasonAndSynthesize } from '../standalone/semanticReasoner';

describe('Lumen Astra: Multi-Turn Conversational Intelligence & DST', () => {
  describe('1. Geopolitical & Macroeconomic Multi-Turn Dialogue Flow', () => {
    it('seamlessly tracks state across 6 consecutive turns without losing context', () => {
      const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];

      // TURN 1: Initial exploration
      const t1 = reasonAndSynthesize('Tell me about Ukraine', history);
      expect(t1.intent).toBe('COUNTRY_GEOPOLITICS');
      expect(t1.responseMarkdown).toContain('Kyiv');
      expect(t1.responseMarkdown).toContain('Borders');
      history.push({ role: 'user', text: 'Tell me about Ukraine' });
      history.push({ role: 'assistant', text: t1.responseMarkdown });

      // TURN 2: Sub-topic follow-up with pronoun ("its economy")
      const t2 = reasonAndSynthesize('What about its economy?', history);
      expect(t2.intent).toBe('COUNTRY_SUBTOPIC');
      expect(t2.subject).toContain('Ukraine');
      expect(t2.thoughtTrace).toContain('Resolved antecedent "Ukraine"');
      expect(t2.responseMarkdown).toContain('Economic Architecture & Trade Dynamics: Ukraine');
      history.push({ role: 'user', text: 'What about its economy?' });
      history.push({ role: 'assistant', text: t2.responseMarkdown });

      // TURN 3: Depth modulation -> ELI5 simplification
      const t3 = reasonAndSynthesize("Explain it to me like I'm 10 with a simple analogy", history);
      expect(t3.intent).toBe('SIMPLIFICATION_ELI5');
      expect(t3.responseMarkdown).toContain("Ukraine's Economy in Simple Terms");
      expect(t3.responseMarkdown).toContain('household or workshop');
      history.push({ role: 'user', text: "Explain it to me like I'm 10 with a simple analogy" });
      history.push({ role: 'assistant', text: t3.responseMarkdown });

      // TURN 4: Depth modulation -> Exhaustive deep-dive
      const t4 = reasonAndSynthesize('Give me an exhaustive deep dive with numbers and data', history);
      expect(t4.intent).toBe('EXHAUSTIVE_DEEP_DIVE');
      expect(t4.responseMarkdown).toContain('Exhaustive Quantitative & Structural Breakdown: Ukraine');
      expect(t4.responseMarkdown).toContain('Macroeconomic Matrix & Industrial Core');
      history.push({ role: 'user', text: 'Give me an exhaustive deep dive with numbers and data' });
      history.push({ role: 'assistant', text: t4.responseMarkdown });

      // TURN 5: Comparative contrast ("How does this compare to Russia?")
      const t5 = reasonAndSynthesize('How does this compare to Russia?', history);
      expect(t5.intent).toBe('COMPARISON_CONTRAST');
      expect(t5.subject).toContain('Ukraine vs Russia');
      expect(t5.responseMarkdown).toContain('Strategic Comparison: Ukraine vs. Russia');
      expect(t5.responseMarkdown).toContain('Ukraine');
      expect(t5.responseMarkdown).toContain('Russia');
      history.push({ role: 'user', text: 'How does this compare to Russia?' });
      history.push({ role: 'assistant', text: t5.responseMarkdown });

      // TURN 6: Conversation memory recall
      const t6 = reasonAndSynthesize('What did we talk about earlier today?', history);
      expect(t6.intent).toBe('RECALL_RECAP');
      expect(t6.responseMarkdown).toContain('Conversation Recap & Dialogue History');
      expect(t6.responseMarkdown).toContain('Ukraine');
      expect(t6.responseMarkdown).toContain('Russia');
    });
  });

  describe('2. Science & Everyday Analogies Flow', () => {
    it('explains aerodynamics, simplifies via car window analogy, and engages in friendly banter', () => {
      const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];

      // TURN 1: How airplanes fly
      const t1 = reasonAndSynthesize('How do airplanes fly?', history);
      expect(t1.intent).toBe('GENERAL_WORLD_KNOWLEDGE');
      expect(t1.responseMarkdown).toContain('Aerodynamics: How Airplanes Fly');
      expect(t1.responseMarkdown).toContain('Bernoulli');
      history.push({ role: 'user', text: 'How do airplanes fly?' });
      history.push({ role: 'assistant', text: t1.responseMarkdown });

      // TURN 2: Ask for everyday analogy
      const t2 = reasonAndSynthesize('Give me an everyday analogy for that', history);
      expect(t2.intent).toBe('SIMPLIFICATION_ELI5');
      expect(t2.responseMarkdown).toContain('window of a fast-moving car');
      history.push({ role: 'user', text: 'Give me an everyday analogy for that' });
      history.push({ role: 'assistant', text: t2.responseMarkdown });

      // TURN 3: Friendly banter reaction
      const t3 = reasonAndSynthesize('That makes total sense, awesome explanation!', history);
      expect(t3.intent).toBe('CONVERSATIONAL_BANTER');
      expect(t3.responseMarkdown).toContain('Delighted');
    });
  });

  describe('3. Point-Level Structured Drilldowns', () => {
    it('accurately resolves references to numbered points from the prior turn', () => {
      const history: Array<{ role: 'user' | 'assistant'; text: string }> = [
        {
          role: 'user',
          text: 'What can you help me with?',
        },
        {
          role: 'assistant',
          text: `### 🌐 Lumen Astra Core Capabilities

#### 1. Global Geopolitics & Conflict Analysis
Deep state-level profiles, sovereign border security, and military doctrines.

#### 2. The Five Core Macro Pillars
Stock market microstructure, global commerce corridors, central bank monetary policy, defense procurement, and energy markets.

#### 3. Science & Technical Decomposition
Aerodynamics, semiconductor physics, biochemistry, and quantitative algorithms.`,
        },
      ];

      const res = reasonAndSynthesize('Tell me more about that second point', history);
      expect(res.intent).toBe('POINT_DRILLDOWN');
      expect(res.subject).toContain('The Five Core Macro Pillars');
      expect(res.responseMarkdown).toContain('Deep Dive: The Five Core Macro Pillars (Point #2)');
      expect(res.responseMarkdown).toContain('The Five Core Macro Pillars');
    });
  });

  describe('4. Equity Microstructure & Dark Pools Comparison', () => {
    it('compares lit order books and dark pools with a dedicated comparative matrix', () => {
      const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];

      const t1 = reasonAndSynthesize('How do limit order books work in equity markets?', history);
      expect(t1.intent).toBe('MACRO_SECTOR');
      expect(t1.responseMarkdown).toContain('limit order books');
      history.push({ role: 'user', text: 'How do limit order books work in equity markets?' });
      history.push({ role: 'assistant', text: t1.responseMarkdown });

      const t2 = reasonAndSynthesize('How does this compare to dark pools?', history);
      expect(t2.intent).toBe('COMPARISON_CONTRAST');
      expect(t2.responseMarkdown).toContain('Public Lit Exchanges (LOB) vs. Dark Pools');
      expect(t2.responseMarkdown).toContain('Pre-Trade Price Transparency');
      expect(t2.responseMarkdown).toContain('price discovery');
    });
  });

  describe('5. Personal Pronoun & Historical Figure Resolution', () => {
    it('resolves "his downfall" to Napoleon Bonaparte after introductory inquiry', () => {
      const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];

      const t1 = reasonAndSynthesize('Who was Napoleon Bonaparte?', history);
      expect(t1.intent).toBe('GENERAL_WORLD_KNOWLEDGE');
      expect(t1.responseMarkdown).toContain('Napoleon Bonaparte');
      history.push({ role: 'user', text: 'Who was Napoleon Bonaparte?' });
      history.push({ role: 'assistant', text: t1.responseMarkdown });

      const t2 = reasonAndSynthesize('What caused his downfall?', history);
      expect(t2.intent).toBe('GENERAL_WORLD_KNOWLEDGE');
      expect(t2.subject).toContain('Napoleon');
      expect(t2.responseMarkdown).toContain('Waterloo');
      expect(t2.responseMarkdown).toContain('Russian Campaign');
    });
  });

  describe('6. DialogueStateTracker Component Unit Tests', () => {
    it('classifies intents with high precision', () => {
      const tracker = new DialogueStateTracker();
      expect(tracker.classifyIntent('explain like im 10', true)).toBe('SIMPLIFICATION_ELI5');
      expect(tracker.classifyIntent('give me a detailed breakdown with numbers', true)).toBe('EXHAUSTIVE_DEEP_DIVE');
      expect(tracker.classifyIntent('tell me more about point 3', true)).toBe('POINT_DRILLDOWN');
      expect(tracker.classifyIntent('compare this to china', true)).toBe('COMPARISON_CONTRAST');
      expect(tracker.classifyIntent('what did we talk about earlier?', true)).toBe('SUMMARY_RECAP');
      expect(tracker.classifyIntent('thanks that was great!', true)).toBe('CONVERSATIONAL_BANTER');
    });

    it('generates rich conversational recaps', () => {
      const tracker = new DialogueStateTracker();
      tracker.rebuildFromHistory([
        { role: 'user', text: 'Tell me about India' },
        { role: 'assistant', text: '### 🌍 Geopolitical & Strategic Profile: India\n- Capital: New Delhi' },
        { role: 'user', text: 'How do airplanes fly?' },
        { role: 'assistant', text: '### 🌐 Aerodynamics: How Airplanes Fly\nLift and drag forces.' },
      ]);

      const recap = tracker.generateConversationRecap();
      expect(recap).toContain('India');
      expect(recap).toContain('Aerodynamics');
      expect(recap).toContain('Conversation Recap & Dialogue History');
    });
  });
});
