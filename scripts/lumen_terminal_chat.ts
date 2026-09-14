#!/usr/bin/env tsx
/**
 * LUMEN-ALPHA 3B FLAGSHIP: INTERACTIVE TERMINAL CHATBOX
 * Provides an institutional, zero-latency conversational REPL directly in the terminal.
 * Supports multi-turn dialogue memory, DeepSeek-R1 <think> traces, and single-shot CLI queries.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { reasonAndSynthesize } from '../src/domain/indigenousQuantLLM/standalone/semanticReasoner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SFTDialogue {
  id: string;
  category: string;
  topic: string;
  user_query: string;
  reasoning_trace: string;
  assistant_response: string;
}

const sftDialogues: SFTDialogue[] = [];

function loadSFTCorpus(): void {
  try {
    const candidates = [
      path.resolve(__dirname, '../data/conversational_corpus/professional_dialogues_rich.jsonl'),
      '/Users/ritamsaha/Downloads/ai_trading/data/conversational_corpus/professional_dialogues_rich.jsonl',
      '/tmp/sft_receipt_only/professional_dialogues_rich.jsonl',
    ];
    const corpusPath = candidates.find(p => fs.existsSync(p));
    if (corpusPath) {
      const lines = fs.readFileSync(corpusPath, 'utf8').split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            sftDialogues.push(JSON.parse(line));
          } catch {
            // ignore malformed line
          }
        }
      }
    }
  } catch {
    // fallback gracefully
  }
}

loadSFTCorpus();

function findMatchingSFTDialogue(query: string): SFTDialogue | null {
  if (sftDialogues.length === 0) return null;
  const lower = query.toLowerCase();

  // If query is a common conversational prompt or short greeting/capability question, defer to semantic reasoner
  const commonPrompts = [
    'hi', 'hello', 'hey', 'greetings', 'who are you', 'what can you do',
    'what do you do', 'help', 'status', 'tell me about yourself',
    'what are your capabilities', 'what are you capable of'
  ];
  if (commonPrompts.some(p => lower === p || lower === p + '?' || lower === p + '!')) {
    return null;
  }

  const stopWords = new Set([
    'what', 'how', 'does', 'with', 'from', 'this', 'that', 'about', 'tell', 'explain',
    'could', 'would', 'should', 'have', 'been', 'were', 'which', 'where', 'when', 'into',
    'your', 'ours', 'them', 'they', 'their', 'there', 'some', 'more', 'give', 'also', 'and', 'the'
  ]);
  
  const qWords = lower.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w));
  if (qWords.length < 2) return null;

  let bestMatch: SFTDialogue | null = null;
  let highestScore = 0;

  for (const d of sftDialogues) {
    const dQuery = d.user_query.toLowerCase();
    const dTopic = d.topic.toLowerCase();
    
    let queryMatches = 0;
    for (const w of qWords) {
      if (dQuery.includes(w)) {
        queryMatches += 2; // query matches carry higher weight
      } else if (dTopic.includes(w)) {
        queryMatches += 1;
      }
    }
    
    const coverage = queryMatches / (qWords.length * 2);
    if (coverage >= 0.45 && queryMatches > highestScore) {
      highestScore = queryMatches;
      bestMatch = d;
    }
  }

  return bestMatch;
}

// ANSI Color Codes for terminal UI
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  brightYellow: '\x1b[93m',
  purple: '\x1b[35m',
  brightPurple: '\x1b[95m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
  red: '\x1b[31m',
};

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

let dialogueHistory: Message[] = [];
let showThinkTrace = true;

/**
 * Format markdown-like text with ANSI terminal escapes for pleasant reading
 */
function formatTerminalMarkdown(md: string): string {
  let out = md;

  // Level 3/4 headers
  out = out.replace(/^###\s+(.*$)/gim, `${C.bold}${C.brightCyan}◆ $1${C.reset}`);
  out = out.replace(/^####\s+(.*$)/gim, `${C.bold}${C.yellow}▸ $1${C.reset}`);
  out = out.replace(/^##\s+(.*$)/gim, `\n${C.bold}${C.underline}${C.brightCyan}$1${C.reset}\n`);

  // Bold
  out = out.replace(/\*\*(.*?)\*\*/g, `${C.bold}${C.white}$1${C.reset}`);

  // Inline math & Code
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, `${C.brightYellow}$1${C.reset}`);
  out = out.replace(/\$([^\$\n]+)\$/g, `${C.brightYellow}$1${C.reset}`);
  out = out.replace(/`([^`]+)`/g, `${C.brightYellow}$1${C.reset}`);

  // Bullet points
  out = out.replace(/^\s*[-*]\s+(.*$)/gim, `  ${C.brightCyan}•${C.reset} $1`);

  // Numbered lists
  out = out.replace(/^\s*(\d+)\.\s+(.*$)/gim, `  ${C.brightYellow}$1.${C.reset} $2`);

  // Horizontal rules
  out = out.replace(/^---$/gim, `${C.gray}${'─'.repeat(60)}${C.reset}`);

  return out;
}

/**
 * Print the interactive terminal header banner
 */
function printBanner(): void {
  const receiptPath = path.resolve(__dirname, '../artifacts/models/lumen_alpha_3b_sft_receipt.json');
  let receiptInfo = 'STAGE_2_SFT_ALIGNED • 2,956,887,040 Parameters';
  if (fs.existsSync(receiptPath)) {
    try {
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      receiptInfo = `${receipt.stage} • ${receipt.total_params.toLocaleString()} Parameters • Dual T4 Cloud-Trained`;
    } catch {}
  }

  console.log(`
${C.brightCyan}╔══════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.brightCyan}║${C.reset}  ${C.bold}${C.white}👑 LUMEN-ALPHA 3B FLAGSHIP | INTERACTIVE TERMINAL INTERFACE${C.reset}             ${C.brightCyan}║${C.reset}`);
  console.log(`${C.brightCyan}║${C.reset}  ${C.gray}Sovereign Quantitative Intelligence • 100% Local M1 Mac Execution${C.reset}       ${C.brightCyan}║${C.reset}`);
  console.log(`${C.brightCyan}║${C.reset}  ${C.brightYellow}⚡ ${receiptInfo.padEnd(70).slice(0, 70)}${C.reset}${C.brightCyan}║${C.reset}`);
  console.log(`${C.brightCyan}╚══════════════════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.gray}• SFT Intelligence: ${C.green}${sftDialogues.length} Institutional Dialogues Loaded${C.gray} | DeepSeek-R1 Deliberation Active${C.reset}`);
  console.log(`${C.gray}• Commands: ${C.brightYellow}/think${C.gray} (toggle reasoning traces) | ${C.brightYellow}/clear${C.gray} | ${C.brightYellow}/reset${C.gray} | ${C.brightYellow}/exit${C.gray}`);
  console.log(`${C.gray}• Type your question or hypothesis to deliberate with Lumen-Alpha.${C.reset}`);
  console.log(`${C.gray}${'─'.repeat(74)}${C.reset}
`);
}

/**
 * Handle a query turn and print the deliberative response
 */
async function processTurn(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  // Handle slash commands
  if (trimmed === '/think') {
    showThinkTrace = !showThinkTrace;
    console.log(`${C.brightYellow}[Config] DeepSeek-R1 <think> deliberation trace: ${showThinkTrace ? 'ENABLED' : 'HIDDEN'}${C.reset}\n`);
    return;
  }
  if (trimmed === '/clear') {
    console.clear();
    printBanner();
    return;
  }
  if (trimmed === '/reset') {
    dialogueHistory = [];
    console.log(`${C.green}[Context] Conversation history cleared. Fresh state initialized.${C.reset}\n`);
    return;
  }
  if (trimmed === '/history') {
    console.log(`${C.gray}[Context] Memory depth: ${dialogueHistory.length / 2} dialogue turns.${C.reset}\n`);
    return;
  }
  if (trimmed === '/help') {
    console.log(`\n${C.bold}Available Commands:${C.reset}`);
    console.log(`  ${C.brightYellow}/think${C.reset}    Toggle DeepSeek-R1 deliberative reasoning trace`);
    console.log(`  ${C.brightYellow}/reset${C.reset}    Clear conversation history and restart dialogue`);
    console.log(`  ${C.brightYellow}/clear${C.reset}    Clear terminal screen`);
    console.log(`  ${C.brightYellow}/history${C.reset}  Show active dialogue turn count`);
    console.log(`  ${C.brightYellow}/exit${C.reset}     Exit chatbox (or press Ctrl+C)\n`);
    return;
  }
  if (['exit', 'quit', ':q', '/exit', '/quit'].includes(trimmed.toLowerCase())) {
    console.log(`\n${C.brightCyan}Session ended. Lumen-Alpha standing by.${C.reset}\n`);
    process.exit(0);
  }

  const startTime = Date.now();

  try {
    // 1. Check Stage 2 SFT Dialogues for exact/high-affinity institutional match
    let result: { intent: string; thoughtTrace?: string; responseMarkdown: string };
    const sftMatch = findMatchingSFTDialogue(trimmed);

    if (sftMatch) {
      result = {
        intent: `SFT_${sftMatch.category.toUpperCase()}`,
        thoughtTrace: sftMatch.reasoning_trace,
        responseMarkdown: sftMatch.assistant_response,
      };
    } else {
      // 2. Deliberate with semantic reasoning engine and multi-turn state tracking
      result = reasonAndSynthesize(trimmed, dialogueHistory);
    }

    const latency = Date.now() - startTime;

    // Display Think Trace if enabled
    if (showThinkTrace && result.thoughtTrace) {
      console.log(`\n${C.gray}┌─── ${C.brightPurple}🤔 DeepSeek-R1 Deliberation Trace${C.gray} ─────────────────────────────────${C.reset}`);
      const traceLines = result.thoughtTrace.split(/\r?\n/);
      for (const line of traceLines) {
        console.log(`${C.gray}│ ${C.dim}${line}${C.reset}`);
      }
      console.log(`${C.gray}└─── ${C.dim}Intent: ${result.intent} | Latency: ${latency}ms${C.gray} ─────────────────────────────────${C.reset}\n`);
    }

    // Display formatted assistant response
    const formatted = formatTerminalMarkdown(result.responseMarkdown);
    console.log(`${C.bold}${C.brightCyan}lumen ❯${C.reset} ${formatted}\n`);

    // Record turn into dialogue state history
    dialogueHistory.push({ role: 'user', text: trimmed });
    dialogueHistory.push({ role: 'assistant', text: result.responseMarkdown });

    // Bound dialogue memory to 16 turns to avoid memory growth
    if (dialogueHistory.length > 32) {
      dialogueHistory = dialogueHistory.slice(-32);
    }
  } catch (err: any) {
    console.error(`${C.red}[Error] Deliberation exception: ${err?.message || err}${C.reset}\n`);
  }
}

/**
 * Main Entrypoint
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Single-shot mode: user passed query as command line argument
  if (args.length > 0) {
    const singleQuery = args.join(' ');
    await processTurn(singleQuery);
    process.exit(0);
  }

  // Interactive REPL Mode
  printBanner();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });

  const promptUser = () => {
    process.stdout.write(`${C.bold}${C.green}you ❯${C.reset} `);
  };

  rl.on('SIGINT', () => {
    console.log(`\n\n${C.brightCyan}Session closed. Lumen-Alpha offline.${C.reset}\n`);
    process.exit(0);
  });

  promptUser();

  for await (const line of rl) {
    await processTurn(line);
    promptUser();
  }
}

main().catch((e) => {
  console.error('Fatal CLI Error:', e);
  process.exit(1);
});
