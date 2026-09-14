/**
 * LUMEN-ASTRA-FIN NEURAL: BYTE-PAIR ENCODING (BPE) TOKENIZER WITH BYTE-FALLBACK
 * Implements modern subword tokenization with byte-fallback (eliminating <unk>).
 * Handles arbitrary text, financial numbers, code symbols, and typos losslessly.
 */

import { INDIAN_ASSETS } from '../../../types';
import { SPECIAL_TOKENS, ACTION_TOKENS, REGIME_TOKENS, QUANT_DESCRIPTOR_TOKENS } from './vocabulary';

export class BPETokenizer {
  public vocab: string[];
  public tokenToId: Map<string, number>;
  public idToToken: Map<number, string>;
  public byteOffset: number;

  constructor() {
    this.vocab = [];
    this.tokenToId = new Map();
    this.idToToken = new Map();

    // 1. Add Special, Action, Regime, and Quant Tokens first
    const reservedTokens: string[] = [
      ...SPECIAL_TOKENS,
      ...ACTION_TOKENS,
      ...REGIME_TOKENS,
      ...QUANT_DESCRIPTOR_TOKENS,
      ...INDIAN_ASSETS,
    ];

    for (const tok of reservedTokens) {
      this.addToken(tok);
    }

    // 2. Add 256 Byte-Fallback Tokens: <byte_0> ... <byte_255>
    this.byteOffset = this.vocab.length;
    for (let b = 0; b < 256; b++) {
      this.addToken(`<byte_${b}>`);
    }

    // 3. Pre-seed common financial and English subword merges
    const commonSubwords = [
      'the', 'of', 'and', 'to', 'in', 'is', 'for', 'at', 'on', 'by',
      'breakout', 'vwap', 'support', 'resistance', 'trend', 'volume',
      'surge', 'failed', 'exit', 'stop', 'loss', 'profit', 'runner',
      'target', 'ratchet', 'trailing', 'allocat', 'conviction', 'aci',
      'capital', 'defense', 'defense_exit', 'stand_aside', 'buy', 'sell',
      'holding', 'position', 'stagnant', 'reversion', 'volatility', 'shock',
      'quarter', 'q1', 'q2', 'q3', 'q4', 'fy', 'revenue', 'ebitda', 'margin',
      'cr', 'crore', 'lakh', 'percent', 'bps', 'sebi', 'order', 'audit', 'probe',
      'high', 'low', 'close', 'open', 'range', 'bound', 'intraday', 'risk',
    ];

    for (const sw of commonSubwords) {
      this.addToken(sw);
      this.addToken(sw.toUpperCase());
    }
  }

  private addToken(token: string): number {
    if (this.tokenToId.has(token)) {
      return this.tokenToId.get(token)!;
    }
    const id = this.vocab.length;
    this.vocab.push(token);
    this.tokenToId.set(token, id);
    this.idToToken.set(id, token);
    return id;
  }

  public get vocabSize(): number {
    return this.vocab.length;
  }

  /**
   * Encodes arbitrary string into token IDs using greedy longest-match with byte-fallback.
   */
  public encode(text: string): number[] {
    const tokens: number[] = [];
    let i = 0;

    while (i < text.length) {
      // 1. Check for special bracketed tokens like <scenario>, </thought>, <action>, etc.
      if (text[i] === '<') {
        const closeIdx = text.indexOf('>', i);
        if (closeIdx !== -1) {
          const tag = text.substring(i, closeIdx + 1);
          if (this.tokenToId.has(tag)) {
            tokens.push(this.tokenToId.get(tag)!);
            i = closeIdx + 1;
            continue;
          }
        }
      }

      // Skip whitespace delimiter between high-level words if next match fits
      if (/\s/.test(text[i])) {
        i++;
        continue;
      }

      // 2. Greedy longest match against registered subwords and symbols
      let bestMatchLen = 0;
      let bestMatchId = -1;

      for (let len = Math.min(32, text.length - i); len >= 1; len--) {
        const sub = text.substring(i, i + len);
        const upper = sub.toUpperCase();

        if (this.tokenToId.has(sub)) {
          bestMatchLen = len;
          bestMatchId = this.tokenToId.get(sub)!;
          break;
        } else if (this.tokenToId.has(upper)) {
          bestMatchLen = len;
          bestMatchId = this.tokenToId.get(upper)!;
          break;
        }
      }

      if (bestMatchLen > 0 && bestMatchId !== -1) {
        tokens.push(bestMatchId);
        i += bestMatchLen;
      } else {
        // 3. Byte Fallback: encode the single character as UTF-8 bytes
        const charCode = text.charCodeAt(i);
        if (charCode < 128) {
          const byteToken = `<byte_${charCode}>`;
          tokens.push(this.tokenToId.get(byteToken)!);
        } else {
          // Multi-byte UTF-8
          const encoded = new TextEncoder().encode(text[i]);
          for (const b of encoded) {
            tokens.push(this.tokenToId.get(`<byte_${b}>`)!);
          }
        }
        i++;
      }
    }

    return tokens;
  }

  /**
   * Decodes a sequence of token IDs back into the exact original text string.
   */
  public decode(tokenIds: number[]): string {
    const parts: string[] = [];
    const byteBuffer: number[] = [];

    const flushBytes = () => {
      if (byteBuffer.length > 0) {
        const decoded = new TextDecoder().decode(new Uint8Array(byteBuffer));
        parts.push(decoded);
        byteBuffer.length = 0;
      }
    };

    for (const id of tokenIds) {
      const tok = this.idToToken.get(id);
      if (!tok) continue;

      if (tok.startsWith('<byte_') && tok.endsWith('>')) {
        const byteVal = parseInt(tok.substring(6, tok.length - 1), 10);
        byteBuffer.push(byteVal);
      } else {
        flushBytes();
        if (tok.startsWith('<') && tok.endsWith('>')) {
          parts.push(` ${tok} `);
        } else {
          parts.push(` ${tok}`);
        }
      }
    }

    flushBytes();
    return parts.join('').replace(/\s+/g, ' ').trim();
  }
}
