#!/usr/bin/env tsx
/**
 * LUMEN-ALPHA 3B FLAGSHIP: INTERACTIVE TERMINAL CHATBOX
 * Provides an institutional, zero-latency conversational REPL directly in the terminal.
 * Supports multi-turn dialogue memory, DeepSeek-R1 <think> traces, and single-shot CLI queries.
 */

import * as readline from 'readline';
import { reasonAndSynthesize } from '../src/domain/indigenousQuantLLM/standalone/semanticReasoner';

// ANSI Color Codes for terminal UI
const C = {
  reset: '[0m',
  bold: '[1m',
  dim: '[2m',
  italic: '[3m',
  underline: '[4m',
  cyan: '[36m',
  brightCyan: '[96m',
  green: '[32m',
  brightGreen: '[92m',
  yellow: '[33m',
  brightYellow: '[93m',
  purple: '[35m',
  brightPurple: '[95m',
  blue: '[34m',
  gray: '[90m',
  white: '[97m',
  red: '[31m',
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
  out = out.replace(/^##\s+(.*$)/gim, `
${C.bold}${C.underline}${C.brightCyan}$1${C.reset}
`);

  // Bold
  out = out.replace(/\*\*(.*?)\*\*/g, `${C.bold}${C.white}$1${C.reset}`);

  // Italic / code
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
  console.log(`
${C.brightCyan}╔══════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.brightCyan}║${C.reset}  ${C.bold}${C.white}👑 LUMEN-ALPHA 3B FLAGSHIP | INTERACTIVE TERMINAL INTERFACE${C.reset}             ${C.brightCyan}║${C.reset}`);
  console.log(`${C.brightCyan}║${C.reset}  ${C.gray}Sovereign Quantitative Intelligence • 100% Local M1 Mac Execution${C.reset}       ${C.brightCyan}║${C.reset}`);
  console.log(`${C.brightCyan}╚══════════════════════════════════════════════════════════════════════════╝${C.reset}`);
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
    console.log(`${C.brightYellow}[Config] DeepSeek-R1 <think> deliberation trace: ${showThinkTrace ? 'ENABLED' : 'HIDDEN'}${C.reset}
`);
    return;
  }
  if (trimmed === '/clear') {
    console.clear();
    printBanner();
    return;
  }
  if (trimmed === '/reset') {
    dialogueHistory = [];
    console.log(`${C.green}[Context] Conversation history cleared. Fresh state initialized.${C.reset}
`);
    return;
  }
  if (trimmed === '/history') {
    console.log(`${C.gray}[Context] Memory depth: ${dialogueHistory.length / 2} dialogue turns.${C.reset}
`);
    return;
  }
  if (trimmed === '/help') {
    console.log(`
${C.bold}Available Commands:${C.reset}`);
    console.log(`  ${C.brightYellow}/think${C.reset}    Toggle DeepSeek-R1 deliberative reasoning trace`);
    console.log(`  ${C.brightYellow}/reset${C.reset}    Clear conversation history and restart dialogue`);
    console.log(`  ${C.brightYellow}/clear${C.reset}    Clear terminal screen`);
    console.log(`  ${C.brightYellow}/history${C.reset}  Show active dialogue turn count`);
    console.log(`  ${C.brightYellow}/exit${C.reset}     Exit chatbox (or press Ctrl+C)
`);
    return;
  }
  if (['exit', 'quit', ':q', '/exit', '/quit'].includes(trimmed.toLowerCase())) {
    console.log(`
${C.brightCyan}Session ended. Lumen-Alpha standing by.${C.reset}
`);
    process.exit(0);
  }

  const startTime = Date.now();

  try {
    // Deliberate with semantic reasoning engine and multi-turn state tracking
    const result = reasonAndSynthesize(trimmed, dialogueHistory);
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
    console.error(`${C.red}[Error] Deliberation exception: ${err?.message || err}${C.reset}
`);
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
    terminal: true,
  });

  const prompt = () => {
    rl.question(`${C.bold}${C.green}you ❯${C.reset} `, async (input) => {
      await processTurn(input);
      prompt();
    });
  };

  rl.on('SIGINT', () => {
    console.log(`

${C.brightCyan}Session closed. Lumen-Alpha offline.${C.reset}
`);
    process.exit(0);
  });

  prompt();
}

main().catch((e) => {
  console.error('Fatal CLI Error:', e);
  process.exit(1);
});
