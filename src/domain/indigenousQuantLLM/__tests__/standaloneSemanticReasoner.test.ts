/**
 * LUMEN ASTRA STANDALONE SEMANTIC REASONER & WORLD KNOWLEDGE TEST SUITE
 * 
 * Verifies:
 * 1. Encyclopedic world knowledge base coverage (nations, geography, borders, capitals).
 * 2. Conflicts, wars, and military strategy dossiers (Ukraine, Middle East, Taiwan, 1973 Oil Shock).
 * 3. Five core macro pillars (Stocks, Commerce, Central Banks, Defense Procurement, Commodities).
 * 4. Civil moderation guardrails (zero profanity/slurs, dignified de-escalation).
 * 5. Dynamic semantic reasoning (no static boilerplate templates, authentic <think> deliberation).
 * 6. Standalone client integration and suggested prompts.
 */

import { describe, it, expect } from 'vitest';
import {
  COUNTRY_DOSSIERS,
  CONFLICT_DOSSIERS,
  MACRO_SECTOR_DOSSIERS,
  findCountryDossier,
  findConflictDossier,
  findMacroSectorDossier,
  findScienceTopic,
  findPhilosophyTopic,
} from '../standalone/worldKnowledgeBase';
import {
  reasonAndSynthesize,
  checkCivilModeration,
} from '../standalone/semanticReasoner';
import {
  queryModel,
  getModelInfo,
  getSuggestedPrompts,
} from '../standalone/standaloneEntry';

describe('Lumen Astra: Standalone Semantic Reasoner & World Knowledge Base', () => {
  describe('1. Encyclopedic Country Dossiers', () => {
    it('contains comprehensive profiles for major global nations', () => {
      expect(COUNTRY_DOSSIERS.length).toBeGreaterThanOrEqual(15);
      const ukraine = findCountryDossier('where is ukraine?');
      expect(ukraine).toBeDefined();
      expect(ukraine?.capital).toContain('Kyiv');
      expect(ukraine?.borders.length).toBeGreaterThan(0);
      expect(ukraine?.strategicSignificance).toContain('Black Sea');

      const india = findCountryDossier('tell me about India');
      expect(india).toBeDefined();
      expect(india?.capital).toContain('New Delhi');
      expect(india?.economicPillars).toContain('pharmaceuticals');

      const taiwan = findCountryDossier('TSMC and Taiwan');
      expect(taiwan).toBeDefined();
      expect(taiwan?.strategicSignificance).toContain('Silicon Shield');

      const iran = findCountryDossier('Iran and the Strait of Hormuz');
      expect(iran).toBeDefined();
      expect(iran?.strategicSignificance).toContain('Strait of Hormuz');
    });
  });

  describe('2. Conflict & Military Strategy Dossiers', () => {
    it('retrieves strategic dossiers for historical and contemporary conflicts', () => {
      const ukraineWar = findConflictDossier('tell me about the war in ukraine');
      expect(ukraineWar).toBeDefined();
      expect(ukraineWar?.tacticsAndTechnology).toContain('FPV');
      expect(ukraineWar?.geopoliticalRepercussions).toContain('NATO');

      const oilShock = findConflictDossier('1973 oil crisis and embargo');
      expect(oilShock).toBeDefined();
      expect(oilShock?.geopoliticalRepercussions).toContain('Petrodollar');

      const doctrine = findConflictDossier('Clausewitz and military strategy');
      expect(doctrine).toBeDefined();
      expect(doctrine?.tacticsAndTechnology).toContain('Clausewitz');
    });
  });

  describe('3. Five Core Macro Pillars & Specialized Sectors', () => {
    it('covers all core macroeconomic pillars and specialized equity sectors', () => {
      expect(MACRO_SECTOR_DOSSIERS.length).toBeGreaterThanOrEqual(5);

      const stocks = findMacroSectorDossier('equity market microstructure');
      expect(stocks?.pillar).toBe('STOCKS');
      expect(stocks?.coreMechanisms).toContain('limit order books');

      const trade = findMacroSectorDossier('global supply chain and shipping');
      expect(trade?.pillar).toBe('COMMERCE');
      expect(trade?.transmissionChannels).toContain('choke points');

      const centralBanks = findMacroSectorDossier('interest rates and repo rate');
      expect(centralBanks?.pillar).toBe('CENTRAL_BANKS');
      expect(centralBanks?.keyInstitutionsAndAssets).toContain('Federal Reserve');

      const defense = findMacroSectorDossier('military defense procurement and hal');
      expect(defense?.pillar).toBe('DEFENSE');
      expect(defense?.keyInstitutionsAndAssets).toContain('Hindustan Aeronautics');

      const commodities = findMacroSectorDossier('crude oil and opec brent');
      expect(commodities?.pillar).toBe('COMMODITIES');
      expect(commodities?.transmissionChannels).toContain('importing');
    });
  });

  describe('4. Civil Moderation Guardrails', () => {
    it('intercepts hostile insults and profanity with respectful de-escalation', () => {
      const hostileResult = checkCivilModeration('you are an idiot and I hate you');
      expect(hostileResult).not.toBeNull();
      expect(hostileResult).toContain('Thoughtful Dialogue & Mutual Respect');

      const slurResult = checkCivilModeration('you stupid bitch');
      expect(slurResult).not.toBeNull();
      expect(slurResult).toContain('civil, and intellectually rigorous discourse');

      const cleanResult = checkCivilModeration('what is the capital of France?');
      expect(cleanResult).toBeNull();
    });
  });

  describe('5. Dynamic Semantic Reasoning Pipeline', () => {
    it('synthesizes rich, structured country answers', () => {
      const result = reasonAndSynthesize('Tell me about Ukraine and its borders');
      expect(result.intent).toBe('COUNTRY_GEOPOLITICS');
      expect(result.responseMarkdown).toContain('Kyiv');
      expect(result.responseMarkdown).toContain('Geopolitical & Strategic Profile: Ukraine');
      expect(result.thoughtTrace).toContain('Entity Extraction');
    });

    it('synthesizes comprehensive macro sector transmission chains', () => {
      const result = reasonAndSynthesize('Explain central bank monetary policy and interest rates');
      expect(result.intent).toBe('MACRO_SECTOR');
      expect(result.responseMarkdown).toContain('Macroeconomic Deep Dive:');
      expect(result.thoughtTrace).toContain('Macro Pillar');
    });

    it('decomposes novel open-ended queries dynamically without static boilerplate', () => {
      const result = reasonAndSynthesize('How does synthetic biology impact industrial agriculture?');
      expect(result.intent).toBe('ANALYTICAL_SYNTHESIS');
      expect(result.responseMarkdown).toContain('synthetic biology impact industrial agriculture');
      expect(result.responseMarkdown).toContain('Core Principles & Foundational Concept');
      expect(result.responseMarkdown).toContain('Key Mechanisms & How It Operates');
      // Verify no legacy static template text
      expect(result.responseMarkdown).not.toContain('At the heart of X lies');
      expect(result.responseMarkdown).not.toContain('The Foundational View: Stripping away assumptions');
    });
  });

  describe('6. Standalone Application Integration', () => {
    it('delivers complete GeneralChatResponse with telemetry and DeepSeek-R1 <think> block', () => {
      const response = queryModel('What is the capital of Ukraine?');
      expect(response.engine).toBe('Lumen Astra (Sovereign Conversational AI)');
      expect(response.reply).toContain('<think>');
      expect(response.reply).toContain('</think>');
      expect(response.reply).toContain('Kyiv');
      expect(response.telemetry.tokensGenerated).toBeGreaterThan(10);
      expect(response.telemetry.policyConfidence).toBeGreaterThan(0);
    });

    it('provides rich suggested prompts including all 5 macro sectors', () => {
      const prompts = getSuggestedPrompts();
      expect(prompts.length).toBeGreaterThanOrEqual(10);
      const macroCategories = prompts.map((p) => p.category);
      expect(macroCategories).toContain('Macro Pillars: Equities');
      expect(macroCategories).toContain('Macro Pillars: Trade & Tech');
      expect(macroCategories).toContain('Macro Pillars: Monetary Policy');
      expect(macroCategories).toContain('Macro Pillars: Defense & Warfare');
      expect(macroCategories).toContain('Macro Pillars: Energy & Oil');
    });

    it('reports accurate model architecture telemetry', () => {
      const info = getModelInfo();
      expect(info.parameters).toBe(4315128);
      expect(info.dModel).toBe(152);
      expect(info.nLayers).toBe(4);
      expect(info.nHeads).toBe(4);
      expect(info.nExperts).toBe(4);
    });
  });
});
