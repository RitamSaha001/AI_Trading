/**
 * LUMEN ASTRA: MULTI-TURN DIALOGUE STATE TRACKER (DST) & DISCOURSE MEMORY
 * 
 * Provides true conversational intelligence:
 * 1. Anaphora & Coreference Resolution ("it", "its economy", "that second point", "they")
 * 2. Pragmatic Intent & Depth Modulation (ELI5, Exhaustive Deep-Dive, Comparison, Bullet Recap)
 * 3. Discourse Entity Memory & Topic Stack
 * 4. Point-level Reference Tracking across prior assistant turns
 * 5. Conversational Recall & Dialogue Summarization
 */

export interface DiscourseTurn {
  role: 'user' | 'assistant';
  text: string;
  entities: string[];
  keyPoints?: string[];
  subject?: string;
  intent?: string;
}

export type ConversationalIntent =
  | 'GREETING'
  | 'CAPABILITIES'
  | 'SIMPLIFICATION_ELI5'
  | 'EXHAUSTIVE_DEEP_DIVE'
  | 'POINT_DRILLDOWN'
  | 'COMPARISON_CONTRAST'
  | 'SUMMARY_RECAP'
  | 'EXAMPLE_REQUEST'
  | 'WHY_HOW_CAUSAL'
  | 'CHALLENGE_DEBATE'
  | 'CONVERSATIONAL_BANTER'
  | 'FACTUAL_INQUIRY'
  | 'STANDARD_SYNTHESIS';

export interface KeyPointReference {
  index: number;
  title: string;
  snippet: string;
}

export interface ResolvedQueryContext {
  originalPrompt: string;
  cleanPrompt: string;
  resolvedSubject: string;
  activeEntity: string | null;
  activeSubTopic: string | null;
  intent: ConversationalIntent;
  isFollowUp: boolean;
  isRecallRequest: boolean;
  referentPoint?: KeyPointReference;
  comparisonEntity?: string;
  priorEntities: string[];
  discourseHistory: DiscourseTurn[];
}

/**
 * Extracts numbered sections or bullet points from an assistant response
 */
export function extractKeyPointsFromMarkdown(text: string): KeyPointReference[] {
  const sections: KeyPointReference[] = [];
  const bullets: KeyPointReference[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match "#### 1. Title" or "### 1. Title" or "1. **Title**"
    const headerNumbered = trimmed.match(/^(?:#{1,4}\s*)?(\d+)\.\s*(?:\*\*)?([^*\n]+)(?:\*\*)?(?::|\s*-\s*|\s*)(.*)$/);
    if (headerNumbered) {
      const idx = parseInt(headerNumbered[1], 10);
      const title = headerNumbered[2].trim().replace(/^[^\w\s]+|[:\s-]+$/g, '').trim();
      const snippet = headerNumbered[3] ? headerNumbered[3].trim() : '';
      sections.push({ index: idx, title, snippet });
      continue;
    }

    const bulletMatch = trimmed.match(/^(?:-|\*)\s*\*\*([^*]+)\*\*(?::|\s*-\s*|\s*)(.*)$/);
    if (bulletMatch) {
      const title = bulletMatch[1].trim();
      const snippet = bulletMatch[2].trim();
      bullets.push({ index: bullets.length + 1, title, snippet });
    }
  }

  if (sections.length > 0) {
    return sections;
  }
  return bullets;
}

/**
 * Normalizes text to tokens
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

export class DialogueStateTracker {
  private turns: DiscourseTurn[] = [];
  private activeEntity: string | null = null;
  private activeSubTopic: string | null = null;
  private entityStack: string[] = [];

  constructor(initialHistory: { role: string; text: string }[] = []) {
    this.rebuildFromHistory(initialHistory);
  }

  /**
   * Rebuilds tracker state from raw history
   */
  public rebuildFromHistory(history: { role: string; text: string }[]): void {
    this.turns = [];
    this.entityStack = [];
    this.activeEntity = null;
    this.activeSubTopic = null;

    for (const msg of history) {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      const text = msg.text.trim();
      if (!text) continue;

      if (role === 'user') {
        const detected = this.detectEntities(text);
        const turn: DiscourseTurn = {
          role: 'user',
          text,
          entities: detected,
        };
        this.turns.push(turn);
        if (detected.length > 0) {
          this.activeEntity = detected[0];
          this.pushEntity(this.activeEntity);
        }
      } else {
        const keyPoints = extractKeyPointsFromMarkdown(text);
        // Extract title from assistant response header (e.g., "### 🌐 Aerodynamics: How Airplanes Fly" -> "Aerodynamics")
        const headerMatch = text.match(/^###\s+(?:[^\w\s]+\s+)?([^\n]+)/m);
        let headerEntity = '';
        if (headerMatch) {
          const rawHeader = headerMatch[1].trim();
          headerEntity = rawHeader
            .replace(/\s*\([^)]*\)$/, '')
            .replace(/^(?:Geopolitical & Strategic Profile:\s*|Economic Architecture & Trade Dynamics:\s*|Conflict Analysis:\s*|Macroeconomic Deep Dive:\s*|Analysis:\s*|Exhaustive Quantitative & Structural Breakdown:\s*|Exhaustive Structural Analysis:\s*|Simple Explanation:\s*)/i, '')
            .trim();
          if (headerEntity.includes(':')) {
            headerEntity = headerEntity.split(':')[0].trim();
          }
          if (headerEntity && !headerEntity.toLowerCase().includes('conversation recap') && !headerEntity.toLowerCase().includes('welcome')) {
            this.activeEntity = headerEntity;
            this.pushEntity(headerEntity);
          }
        }
        const detected = this.detectEntities(text);
        const turn: DiscourseTurn = {
          role: 'assistant',
          text,
          entities: detected,
          keyPoints: keyPoints.map((p) => `${p.index}. ${p.title}`),
          subject: headerEntity,
        };
        this.turns.push(turn);
      }
    }
  }

  private pushEntity(entity: string): void {
    if (!this.entityStack.includes(entity)) {
      this.entityStack.push(entity);
      if (this.entityStack.length > 10) {
        this.entityStack.shift();
      }
    }
  }

  /**
   * Simple entity detector across common proper nouns and known macro entities
   */
  private detectEntities(text: string): string[] {
    const known = [
      'Ukraine', 'Russia', 'United States', 'USA', 'America', 'China', 'India',
      'Taiwan', 'Iran', 'Israel', 'Saudi Arabia', 'Germany', 'France', 'UK',
      'Japan', 'South Korea', 'North Korea', 'Turkey', 'Egypt', 'UAE', 'Pakistan',
      'Quantum Computing', 'Quantum Entanglement', 'Transformer', 'Artificial Intelligence',
      'Stoicism', 'Existentialism', 'Monty Hall', 'Order Book', 'Limit Order Book',
      'Repo Rate', 'Federal Reserve', 'Reserve Bank of India', 'RBI', 'Brent Crude',
      'OPEC', 'FPV Drone', 'Strait of Hormuz', 'Strait of Malacca', 'Suez Canal',
      'ASML', 'TSMC', 'HAL', 'BEL', 'BDL', 'Roman Empire', 'World War II',
      'Photosynthesis', 'CRISPR', 'General Relativity', 'Special Relativity',
      'Thermodynamics', 'Inflation', 'Financial Crisis', 'Subprime', 'Aerodynamics',
      'Airplane', 'Airplanes', 'Flight', 'Immune System', 'Vaccine', 'Antibodies',
      'Microprocessor', 'Semiconductor', 'CPU', 'Dark Pools', 'Dark Pool',
      'Napoleon', 'Napoleon Bonaparte'
    ];

    const detected: string[] = [];
    const lower = text.toLowerCase();

    for (const ent of known) {
      const entLower = ent.toLowerCase();
      if (entLower.length <= 3) {
        const words = tokenize(text);
        if (words.includes(entLower)) detected.push(ent);
      } else if (lower.includes(entLower)) {
        detected.push(ent);
      }
    }
    // Deduplicate substrings (e.g. 'Dark Pool' inside 'Dark Pools', 'Napoleon' inside 'Napoleon Bonaparte')
    return detected.filter(
      (e1, idx) => !detected.some((e2, idx2) => idx !== idx2 && e2.toLowerCase().includes(e1.toLowerCase()) && e2.length > e1.length)
    );
  }

  /**
   * Detects conversational intent and depth requests
   */
  public classifyIntent(prompt: string, hasHistory: boolean): ConversationalIntent {
    const lower = prompt.toLowerCase().trim();

    // 1. Recall requests
    if (
      lower.includes('what did we talk about') ||
      lower.includes('what did we discuss') ||
      lower.includes('what have we discussed') ||
      lower.includes('what have we talked about') ||
      lower.includes('what was our first') ||
      lower.includes('summarize our chat') ||
      lower.includes('recap our conversation') ||
      lower.includes('remember what i asked') ||
      lower.includes('what was the previous topic') ||
      lower.includes('discuss earlier') ||
      lower.includes('talked about earlier') ||
      (lower.includes('earlier') && (lower.includes('discuss') || lower.includes('talk') || lower.includes('mention')))
    ) {
      return 'SUMMARY_RECAP';
    }

    // 2. Point drilldown
    if (
      /\b(second|2nd|first|1st|third|3rd|fourth|4th|fifth|5th|last)\s+(point|domain|item|pillar|section|part|concept)\b/i.test(lower) ||
      /\b(point|section|pillar)\s+(1|2|3|4|5|one|two|three|four|five)\b/i.test(lower) ||
      /\b(tell me more about that second|elaborate on the second|expand on the third)\b/i.test(lower)
    ) {
      return 'POINT_DRILLDOWN';
    }

    // 3. Simplification / ELI5
    if (
      lower.includes('simpler terms') ||
      lower.includes('explain simply') ||
      lower.includes('like i\'m 10') ||
      lower.includes('like im 10') ||
      lower.includes('like i am 10') ||
      lower.includes('like i am 5') ||
      lower.includes('like i\'m 5') ||
      lower.includes('eli5') ||
      lower.includes('analogy') ||
      lower.includes('analogies') ||
      lower.includes('for a beginner') ||
      lower.includes('in plain english') ||
      lower.includes('make it simple') ||
      lower.includes('dumb it down') ||
      lower.includes('easier to understand')
    ) {
      return 'SIMPLIFICATION_ELI5';
    }

    // 4. Exhaustive Deep-Dive / Detailed Breakdown
    if (
      lower.includes('detailed breakdown') ||
      lower.includes('in-depth') ||
      lower.includes('in depth') ||
      lower.includes('more detail') ||
      lower.includes('deep dive') ||
      lower.includes('with numbers') ||
      lower.includes('with math') ||
      lower.includes('technical breakdown') ||
      lower.includes('exhaustive') ||
      lower.includes('comprehensive analysis') ||
      lower.includes('full breakdown') ||
      lower.includes('exact details') ||
      lower.includes('data points')
    ) {
      return 'EXHAUSTIVE_DEEP_DIVE';
    }

    // 5. Comparison & Contrast
    if (
      /\b(compare|comparison|versus|vs|how does (?:this|that|it) compare|what is the difference|differ from|in contrast to)\b/i.test(lower)
    ) {
      return 'COMPARISON_CONTRAST';
    }

    // 6. Summary / Bullet points
    if (
      lower.includes('summarize') ||
      lower.includes('bullet points') ||
      lower.includes('in bullets') ||
      lower.includes('tl;dr') ||
      lower.includes('tldr') ||
      lower.includes('quick summary') ||
      lower.includes('key takeaways') ||
      lower.includes('in 3 bullets') ||
      lower.includes('in a nutshell')
    ) {
      return 'SUMMARY_RECAP';
    }

    // 7. Example request
    if (
      lower.includes('example') ||
      lower.includes('give me an example') ||
      lower.includes('show me an example') ||
      lower.includes('real-world scenario') ||
      lower.includes('real world case') ||
      lower.includes('concrete example') ||
      lower.includes('case study')
    ) {
      return 'EXAMPLE_REQUEST';
    }

    // 8. Why / How causal mechanism
    if (
      /^why\b/i.test(lower) ||
      /^how does (?:this|that|it) actually work\b/i.test(lower) ||
      lower.includes('what causes') ||
      lower.includes('what is the mechanism') ||
      lower.includes('how does that work')
    ) {
      return 'WHY_HOW_CAUSAL';
    }

    // 9. Challenge / Debate
    if (
      lower.includes('are you sure') ||
      lower.includes('is that true') ||
      lower.includes('is that really') ||
      lower.includes('counter-argument') ||
      lower.includes('counter argument') ||
      lower.includes('devil\'s advocate') ||
      lower.includes('criticisms of this') ||
      lower.includes('isn\'t that wrong')
    ) {
      return 'CHALLENGE_DEBATE';
    }

    // 10. Greetings & Salutations
    if (/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|namaste|howdy)(!|\.|\s|$)/i.test(lower) && lower.length < 30) {
      return 'GREETING';
    }

    // 11. Capabilities
    if (
      lower.includes('what can you do') ||
      lower.includes('what are your capabilities') ||
      lower.includes('what do you do') ||
      lower.includes('your skills')
    ) {
      return 'CAPABILITIES';
    }

    // 12. Banter & Conversational Reactions
    if (
      /\b(thanks|thank you|appreciate it|grateful|thx)\b/i.test(lower) ||
      (/\b(wow|cool|crazy|wild|awesome|fascinating|mind-blowing|neat|interesting|great job|makes sense|got it)\b/i.test(lower) && lower.length < 80) ||
      lower.startsWith('haha') ||
      lower.includes('do you agree') ||
      lower.includes('what do you think')
    ) {
      return 'CONVERSATIONAL_BANTER';
    }

    return 'STANDARD_SYNTHESIS';
  }

  /**
   * Resolves pronouns, anaphoric references, and continuations
   */
  public resolveQueryContext(prompt: string): ResolvedQueryContext {
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();
    const intent = this.classifyIntent(trimmed, this.turns.length > 0);

    const isRecallRequest =
      intent === 'SUMMARY_RECAP' &&
      (lower.includes('we talk about') ||
        lower.includes('we discuss') ||
        lower.includes('discussed') ||
        lower.includes('our chat') ||
        lower.includes('our conversation') ||
        lower.includes('previous topic') ||
        lower.includes('first question') ||
        lower.includes('earlier'));

    // Find entities present in current prompt
    const explicitEntities = this.detectEntities(trimmed);

    // Look for pronoun / anaphoric triggers
    const hasPronoun = /\b(it|its|they|their|them|that|this|these|those|he|him|his|she|her|the country|the nation|the concept|the war|the asset|the leader)\b/i.test(lower);
    const hasOrdinal = /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\s+(point|domain|item|pillar|section|part)\b/i.test(lower);
    const isContinuation =
      lower.startsWith('what about') ||
      lower.startsWith('how about') ||
      lower.startsWith('and its') ||
      lower.startsWith('and what about') ||
      lower.startsWith('tell me about its') ||
      lower.startsWith('why did they') ||
      lower.startsWith('who is their') ||
      lower.startsWith('what did you say about');

    let resolvedSubject = '';
    let activeEntity = explicitEntities.length > 0 ? explicitEntities[0] : this.activeEntity;
    let activeSubTopic: string | null = null;
    let referentPoint: KeyPointReference | undefined;
    let comparisonEntity: string | undefined;

    // Detect sub-aspects (economy, military, geography, history, religion, borders, nuclear, president, leader, trade)
    const aspectPatterns: { [key: string]: RegExp } = {
      economy: /\b(economy|economic|gdp|trade|exports|imports|currency|industry|debt|agriculture)\b/i,
      military: /\b(military|army|defense|defence|weapons|drones|missiles|navy|air force|troops|warfare)\b/i,
      geography: /\b(geography|borders|capital|location|terrain|rivers|mountains|map)\b/i,
      history: /\b(history|historical|origin|founded|past|origins|formation)\b/i,
      leadership: /\b(leader|president|prime minister|government|regime|who rules|ruler)\b/i,
      relations: /\b(allies|relations|nato|brics|diplomacy|bilateral|foreign policy)\b/i,
      microstructure: /\b(order book|slippage|tick size|spread|liquidity|queue|matching engine)\b/i,
      shipping: /\b(chokepoint|strait|canal|freight|baltic dry|vessels|tankers)\b/i,
      oil: /\b(oil|crude|brent|wti|opec|refining|crack spread|petroleum)\b/i,
      rates: /\b(repo|interest rate|yield curve|fed funds|monetary policy|inflation)\b/i,
    };

    for (const [aspect, regex] of Object.entries(aspectPatterns)) {
      if (regex.test(lower)) {
        activeSubTopic = aspect;
        break;
      }
    }

    // Check for ordinal reference to previous assistant message
    if (hasOrdinal || intent === 'POINT_DRILLDOWN') {
      const lastAssistantTurn = [...this.turns].reverse().find((t) => t.role === 'assistant');
      if (lastAssistantTurn) {
        const points = extractKeyPointsFromMarkdown(lastAssistantTurn.text);
        let targetIdx = 1;
        if (/\b(first|1st)\b/i.test(lower)) targetIdx = 1;
        else if (/\b(second|2nd)\b/i.test(lower)) targetIdx = 2;
        else if (/\b(third|3rd)\b/i.test(lower)) targetIdx = 3;
        else if (/\b(fourth|4th)\b/i.test(lower)) targetIdx = 4;
        else if (/\b(fifth|5th)\b/i.test(lower)) targetIdx = 5;
        else if (/\b(last)\b/i.test(lower)) targetIdx = points.length;

        const found = points.find((p) => p.index === targetIdx);
        if (found) {
          referentPoint = found;
          resolvedSubject = `${activeEntity || 'Topic'} - ${found.title}`;
        }
      }
    }

    // Check for comparison: "Compare that to Russia", "How does this compare to classical computers?"
    if (intent === 'COMPARISON_CONTRAST') {
      if (explicitEntities.length >= 2) {
        activeEntity = explicitEntities[0];
        comparisonEntity = explicitEntities[1];
        resolvedSubject = `${activeEntity} vs ${comparisonEntity}`;
      } else if (explicitEntities.length === 1 && this.activeEntity && explicitEntities[0] !== this.activeEntity) {
        comparisonEntity = explicitEntities[0];
        activeEntity = this.activeEntity;
        resolvedSubject = `${activeEntity} vs ${comparisonEntity}`;
      } else if (this.activeEntity) {
        resolvedSubject = `Comparison involving ${this.activeEntity}`;
      }
    }

    // Check continuation with pronoun or aspect
    if (!resolvedSubject) {
      if ((hasPronoun || isContinuation) && this.activeEntity) {
        activeEntity = this.activeEntity;
        if (activeSubTopic) {
          resolvedSubject = `${activeEntity} (${activeSubTopic})`;
        } else {
          resolvedSubject = activeEntity;
        }
      } else if (explicitEntities.length > 0) {
        activeEntity = explicitEntities[0];
        if (activeSubTopic) {
          resolvedSubject = `${activeEntity} (${activeSubTopic})`;
        } else {
          resolvedSubject = activeEntity;
        }
      } else if (this.activeEntity && (intent === 'SIMPLIFICATION_ELI5' || intent === 'EXHAUSTIVE_DEEP_DIVE' || intent === 'EXAMPLE_REQUEST' || intent === 'WHY_HOW_CAUSAL')) {
        activeEntity = this.activeEntity;
        resolvedSubject = activeEntity;
      } else {
        // Fallback to query normalization
        resolvedSubject = this.cleanPromptSubject(trimmed);
      }
    }

    // Update state for next turn if we found an entity
    if (activeEntity) {
      this.activeEntity = activeEntity;
      this.pushEntity(activeEntity);
    }
    if (activeSubTopic) {
      this.activeSubTopic = activeSubTopic;
    }

    return {
      originalPrompt: trimmed,
      cleanPrompt: lower,
      resolvedSubject,
      activeEntity,
      activeSubTopic,
      intent,
      isFollowUp: Boolean(this.turns.length > 0 && (hasPronoun || isContinuation || hasOrdinal || !explicitEntities.length)),
      isRecallRequest,
      referentPoint,
      comparisonEntity,
      priorEntities: [...this.entityStack],
      discourseHistory: [...this.turns],
    };
  }

  private cleanPromptSubject(prompt: string): string {
    let clean = prompt.trim().replace(/[?!.,;:]+$/, '');
    const prefixPatterns = [
      /^(?:can you|could you|please|tell me about|what is|what are|what was|what were|what caused|explain|describe|who is|who are|who was|who were|how does|why does|how did|why did|how do|why do|what do you think about|give me an overview of)\s+/i,
      /^(?:talk to me about|discuss|analyze|break down|unroll|elaborate on|show me|what about)\s+/i,
    ];
    for (const pat of prefixPatterns) {
      clean = clean.replace(pat, '');
    }
    return clean.trim();
  }

  /**
   * Generates a conversational recap of previous dialogue turns
   */
  public generateConversationRecap(): string {
    if (this.turns.length === 0) {
      return `We have just begun our conversation! Feel free to ask about geopolitics, world nations, market microstructure, central banks, defense technologies, quantum physics, or philosophy.`;
    }

    const topicsDiscussed = Array.from(new Set(this.turns.filter((t) => t.role === 'user').map((t) => t.text)));
    const entities = this.entityStack;

    let response = `### 📜 Conversation Recap & Dialogue History\n\n`;
    response += `Here is a structured overview of what we have explored in our conversation so far:\n\n`;

    let turnNumber = 1;
    for (const turn of this.turns) {
      if (turn.role === 'user') {
        response += `**Turn ${turnNumber++} (You)**: "${turn.text}"\n`;
      }
    }

    if (entities.length > 0) {
      response += `\n#### 🎯 Key Entities & Themes Explored\n`;
      response += `${entities.map((e) => `• **${e}**`).join(' ')}\n\n`;
    }

    response += `Our active focus currently sits on **${this.activeEntity || 'General Dialogue'}**. Where would you like to take our exploration next? We can drill deeper, examine an adjacent angle, or introduce an entirely new topic!`;

    return response;
  }
}
