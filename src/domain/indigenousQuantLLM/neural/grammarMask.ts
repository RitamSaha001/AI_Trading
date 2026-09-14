/**
 * LUMEN-ASTRA-FIN NEURAL: GRAMMAR & SCHEMA-CONSTRAINED LOGIT MASKING
 * Enforces state-machine grammar constraints at generation time (similar to Outlines / SGLang).
 * Prevents invalid action hallucinations and malformed structured output.
 */

import { ACTION_TOKENS, TOKEN_TO_ID, EOS_TOKEN_ID } from './vocabulary';

export type GrammarState =
  | 'FREE_THINK'         // Generating chain-of-thought inside <think>...</think>
  | 'ACTION_SELECTION'   // Emitting exact policy action inside <action>...</action>
  | 'VERDICT'            // Emitting final verdict and exit tags
  | 'COMPLETED';         // Reached end of sequence

export class GrammarLogitMask {
  private validActionTokenIds: Set<number>;
  private endActionTokenId: number;
  private endThinkTokenId: number;
  private eosTokenId: number;

  constructor() {
    this.validActionTokenIds = new Set();
    for (const act of ACTION_TOKENS) {
      const id = TOKEN_TO_ID[act];
      if (id !== undefined) this.validActionTokenIds.add(id);
    }
    this.endActionTokenId = TOKEN_TO_ID['</action>'] ?? -1;
    this.endThinkTokenId = TOKEN_TO_ID['</think>'] ?? TOKEN_TO_ID['</thought>'] ?? -1;
    this.eosTokenId = EOS_TOKEN_ID;
  }

  /**
   * Identifies the current grammar state based on recent generated tokens.
   */
  public detectState(tokens: number[], idToToken: (id: number) => string): GrammarState {
    const recent = tokens.slice(-16).map(idToToken).join(' ');

    if (recent.includes('<verdict>') && recent.includes('</verdict>')) {
      return 'COMPLETED';
    }
    if (recent.includes('<action>') && !recent.includes('</action>')) {
      return 'ACTION_SELECTION';
    }
    if (recent.includes('<think>') || recent.includes('<thought>')) {
      if (!recent.includes('</think>') && !recent.includes('</thought>')) {
        return 'FREE_THINK';
      }
    }
    return 'FREE_THINK';
  }

  /**
   * Applies grammar mask in-place: sets disallowed token logits to -1e9.
   */
  public applyMask(logits: number[], state: GrammarState): number[] {
    const masked = [...logits];
    const FORBIDDEN_LOGIT = -1e9;

    if (state === 'ACTION_SELECTION') {
      // In ACTION_SELECTION state, only allow valid ACTION_TOKENS or </action>
      for (let i = 0; i < masked.length; i++) {
        if (!this.validActionTokenIds.has(i) && i !== this.endActionTokenId) {
          masked[i] = FORBIDDEN_LOGIT;
        }
      }
    } else if (state === 'COMPLETED') {
      // Force EOS
      for (let i = 0; i < masked.length; i++) {
        if (i !== this.eosTokenId) {
          masked[i] = FORBIDDEN_LOGIT;
        }
      }
    }

    return masked;
  }
}
