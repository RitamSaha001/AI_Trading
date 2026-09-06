import React, { useMemo, useState } from 'react';
import katex from 'katex';
import { Copy, Check, Sparkles, ChevronDown, Compass, ShieldCheck, Scale, AlertTriangle, Activity, Cpu } from 'lucide-react';

interface LatexRendererProps {
  content: string;
  className?: string;
}

function ThinkingBlock({ thought }: { thought: string }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // Extract intuitive summary metrics from thought trace
  const assetMatch = thought.match(/Primary Focus Asset:\s*([A-Za-z0-9_]+)/i);
  const spotMatch = thought.match(/Current Spot Quote:\s*([0-9,.]+)/i);
  const rsiMatch = thought.match(/RSI\(14\)\s*=\s*([0-9.]+)/i);
  const winnerMatch = thought.match(/Winning Hypothesis:\s*([^(\n]+)/i);
  const invalidationMatch = thought.match(/Invalidation Level:\s*([0-9,.]+)/i);
  const criticMatch = thought.match(/Nexus Adversarial Risk Auditor[^:]*:\s*\"([^\"]+)\"/i);
  const riskProfileMatch = thought.match(/Risk Profile\s*=\s*([A-Za-z_]+)/i);

  const asset = assetMatch ? assetMatch[1] : '';
  const spot = spotMatch ? spotMatch[1] : '';
  const rsi = rsiMatch ? parseFloat(rsiMatch[1]) : null;
  const winner = winnerMatch ? winnerMatch[1].trim() : 'Balanced Strategic Execution';
  const invalidation = invalidationMatch ? invalidationMatch[1] : null;
  const critic = criticMatch ? criticMatch[1] : null;
  const riskProfile = riskProfileMatch ? riskProfileMatch[1] : 'BALANCED';

  const marketPulse = rsi !== null
    ? (rsi > 68 ? 'Overheated (Caution Advised)' : rsi < 32 ? 'Oversold (Accumulation Opportunity)' : 'Calm & Steady Equilibrium')
    : 'Order Book Equilibrium';

  return (
    <div className="my-2.5 rounded-2xl border border-indigo-100/90 bg-gradient-to-r from-indigo-50/60 via-white to-purple-50/30 overflow-hidden text-xs shadow-2xs transition-all">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-indigo-950 hover:bg-indigo-50/40 transition-colors select-none group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold tracking-tight text-xs text-indigo-950">
                Nexus Cognitive Reasoning Trace
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-100/80 text-[9px] font-semibold text-indigo-800 font-sans uppercase tracking-wider">
                System 2
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-tight">
              {open ? 'Thought journey unfolded in plain terms' : 'Click to inspect how Nexus analyzed this request'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-indigo-600 font-medium text-xs group-hover:text-indigo-800">
          <span>{open ? 'Hide' : 'Inspect Thinking'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="p-3.5 border-t border-indigo-100/80 bg-white/90 space-y-3 animate-in fade-in duration-200">
          {/* Visual Status Chips */}
          <div className="flex flex-wrap gap-1.5">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-800 text-[10.5px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Market Pulse: <strong>{marketPulse}</strong></span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200/70 text-indigo-800 text-[10.5px] font-medium">
              <ShieldCheck className="w-3 h-3 text-indigo-600" />
              <span>Capital Defense: <strong>{riskProfile} (Cash Protected)</strong></span>
            </div>
            {asset && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200/70 text-zinc-800 text-[10.5px] font-medium font-mono">
                <span>Focus: <strong>{asset} {spot ? `@ $${spot}` : ''}</strong></span>
              </div>
            )}
          </div>

          {/* Simple Human-Friendly Reasoning View */}
          {!showRaw ? (
            <div className="space-y-2 text-[11.5px] text-zinc-700">
              {/* Step 1: Market Signal */}
              <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-900 font-semibold text-[11px]">
                  <Compass className="w-3.5 h-3.5 text-indigo-600" />
                  <span>1. Reading Market Signals &amp; Momentum</span>
                </div>
                <p className="text-zinc-600 leading-relaxed text-[11px]">
                  {asset ? `Inspecting spot conditions for ${asset}${spot ? ` around $${spot}` : ''}. ` : 'Scanning broad market conditions. '}
                  {rsi !== null
                    ? `Momentum gauge (RSI ${rsi.toFixed(1)}) indicates the asset is currently ${rsi > 68 ? 'hot and extended — chasing here carries downside risk.' : rsi < 32 ? 'deeply discounted, presenting potential asymmetric value.' : 'stable in a healthy consolidation equilibrium.'}`
                    : 'Order book depth and volume curves are balanced without excessive liquidation pressure.'}
                </p>
              </div>

              {/* Step 2: Portfolio Check */}
              <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-900 font-semibold text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Portfolio Health &amp; Capital Floor Audit</span>
                </div>
                <p className="text-zinc-600 leading-relaxed text-[11px]">
                  Verified your liquidity reserves. The mandatory cash reserve buffer is strictly preserved so you never face forced liquidation or margin calls during sudden volatility shocks.
                </p>
              </div>

              {/* Step 3: Scenario Tournament */}
              <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-900 font-semibold text-[11px]">
                  <Scale className="w-3.5 h-3.5 text-blue-600" />
                  <span>3. Weighing Market Scenarios</span>
                </div>
                <p className="text-zinc-600 leading-relaxed text-[11px]">
                  Comparing upside continuation against pullback probabilities. Prevailing outlook favors <strong>{winner}</strong>.
                  {invalidation && (
                    <span className="block mt-0.5 text-blue-900 font-medium">
                      Safety floor defined: Trade idea is invalidated if price crosses <strong>${invalidation}</strong>.
                    </span>
                  )}
                </p>
              </div>

              {/* Step 4: Devil's Advocate */}
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-900 font-semibold text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>4. Devil's Advocate (Red Team Risk Check)</span>
                </div>
                <p className="text-amber-950/80 leading-relaxed text-[11px]">
                  {critic || 'What if an unexpected news catalyst causes a sudden flash drop? Position sizing is strictly dialed down to Half-Kelly limits to guarantee survival.'}
                </p>
              </div>
            </div>
          ) : (
            /* Advanced Raw Telemetry View */
            <div className="p-3 rounded-xl bg-zinc-900 text-zinc-200 font-mono text-[10.5px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[300px]">
              {thought}
            </div>
          )}

          {/* Toggle between Simple and Advanced */}
          <div className="pt-1 flex items-center justify-between border-t border-zinc-100 text-[10.5px]">
            <span className="text-zinc-400">
              {showRaw ? 'Showing raw quantitative formulas' : 'Simplified for intuitive human clarity'}
            </span>
            <button
              type="button"
              onClick={() => setShowRaw(!showRaw)}
              className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
            >
              <Cpu className="w-3 h-3" />
              <span>{showRaw ? 'Switch to Simple Terms' : 'Show Raw Math & Greeks'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tokenizes and renders text containing inline ($...$) and block ($$...$$ or \[...\]) LaTeX formulas
 * alongside standard markdown features (bold, bullets, code blocks, tables).
 */
export const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = '' }) => {
  const renderedElements = useMemo(() => {
    if (!content) return null;

    // Check for <thinking>...</thinking> block
    const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
    let thinkingText = '';
    let bodyContent = content;
    if (thinkingMatch) {
      thinkingText = thinkingMatch[1].trim();
      bodyContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }

    // Split text into lines/blocks
    const lines = bodyContent.split('\n');
    const elements: React.ReactNode[] = [];

    if (thinkingText) {
      elements.push(
        <ThinkingBlock key="thinking-block" thought={thinkingText} />
      );
    }

    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockLines: string[] = [];

    lines.forEach((line, lineIdx) => {
      // Handle Code Block start/end
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = line.trim().replace(/^```/, '');
          codeBlockLines = [];
        } else {
          inCodeBlock = false;
          const codeText = codeBlockLines.join('\n');
          elements.push(
            <CodeBlock key={`code-${lineIdx}`} code={codeText} lang={codeBlockLang} />
          );
          codeBlockLines = [];
        }
        return;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        return;
      }

      // Check if line is block LaTeX: $$ ... $$ or \[ ... \]
      const trimmed = line.trim();
      if ((trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 3) ||
          (trimmed.startsWith('\\[') && trimmed.endsWith('\\]'))) {
        const formula = trimmed.replace(/^(\$\$|\\\[)/, '').replace(/(\$\$|\\\])$/, '').trim();
        try {
          const html = katex.renderToString(formula, { displayMode: true, throwOnError: false, trust: false, strict: 'error' });
          elements.push(
            <div
              key={`block-math-${lineIdx}`}
              className="my-3 py-2 px-3 bg-zinc-50 border border-zinc-200/80 rounded-xl overflow-x-auto text-center shadow-xs"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
          return;
        } catch {
          // fallback to plain text
        }
      }

      // Headers
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={`h3-${lineIdx}`} className="text-sm font-bold text-zinc-900 mt-2.5 mb-1 flex items-center gap-1.5">
            {renderInlineMarkdown(line.slice(4))}
          </h4>
        );
        return;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={`h2-${lineIdx}`} className="text-sm font-extrabold text-zinc-900 mt-3 mb-1.5">
            {renderInlineMarkdown(line.slice(3))}
          </h3>
        );
        return;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2 key={`h1-${lineIdx}`} className="text-base font-bold text-zinc-900 mt-3 mb-2">
            {renderInlineMarkdown(line.slice(2))}
          </h2>
        );
        return;
      }

      // Bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletText = line.trim().replace(/^[-*]\s+/, '');
        elements.push(
          <div key={`bullet-${lineIdx}`} className="flex items-start gap-2 my-1 pl-1">
            <span className="text-indigo-500 font-bold leading-relaxed text-sm select-none">•</span>
            <span className="flex-1 text-[13px] leading-relaxed text-zinc-800">
              {renderInlineLatexAndFormatting(bulletText)}
            </span>
          </div>
        );
        return;
      }

      // Numbered lists (1. 2. etc)
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        elements.push(
          <div key={`num-${lineIdx}`} className="flex items-start gap-2 my-1 pl-1">
            <span className="text-indigo-600 font-semibold text-xs min-w-4 text-right select-none pt-0.5">
              {numMatch[1]}.
            </span>
            <span className="flex-1 text-[13px] leading-relaxed text-zinc-800">
              {renderInlineLatexAndFormatting(numMatch[2])}
            </span>
          </div>
        );
        return;
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<div key={`spacer-${lineIdx}`} className="h-2" />);
        return;
      }

      // Regular paragraph line
      elements.push(
        <p key={`p-${lineIdx}`} className="text-[13px] leading-relaxed text-zinc-800 my-0.5">
          {renderInlineLatexAndFormatting(line)}
        </p>
      );
    });

    // If code block remains unclosed
    if (inCodeBlock && codeBlockLines.length > 0) {
      elements.push(
        <CodeBlock key="unclosed-code" code={codeBlockLines.join('\n')} lang={codeBlockLang} />
      );
    }

    return elements;
  }, [content]);

  return <div className={`latex-markdown-container space-y-0.5 ${className}`}>{renderedElements}</div>;
};

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 overflow-hidden text-xs font-mono shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-800/80 text-[11px] text-zinc-400">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors p-1"
          title="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Parses inline LaTeX formulas ($...$ or \(...\)) and inline markdown (**bold**, `code`, etc.)
 */
function renderInlineLatexAndFormatting(text: string): React.ReactNode[] {
  // Regex splitting by math ($...$ or \(...\))
  const mathRegex = /(\$[^$]+\$|\\\([^\\]+\\\))/g;
  const parts = text.split(mathRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const formula = part.slice(1, -1);
      try {
        const html = katex.renderToString(formula, { displayMode: false, throwOnError: false, trust: false, strict: 'error' });
        return (
          <span
            key={`math-${idx}`}
            className="inline-math px-1 py-0.5 mx-0.5 rounded bg-indigo-50/50 text-indigo-950 font-serif"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        return <code key={`math-err-${idx}`}>{part}</code>;
      }
    }

    if (part.startsWith('\\(') && part.endsWith('\\)')) {
      const formula = part.slice(2, -2);
      try {
        const html = katex.renderToString(formula, { displayMode: false, throwOnError: false, trust: false, strict: 'error' });
        return (
          <span
            key={`math-${idx}`}
            className="inline-math px-1 py-0.5 mx-0.5 rounded bg-indigo-50/50 text-indigo-950 font-serif"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        return <code key={`math-err-${idx}`}>{part}</code>;
      }
    }

    return renderInlineMarkdown(part, idx);
  });
}

/**
 * Handles inline bold (**text**), inline code (`code`), and italics (*text*)
 */
function renderInlineMarkdown(text: string, baseKey: number | string = 0): React.ReactNode {
  // Parse `code`
  const codeParts = text.split(/(`[^`]+`)/g);

  return (
    <React.Fragment key={`fmt-${baseKey}`}>
      {codeParts.map((sub, sIdx) => {
        if (sub.startsWith('`') && sub.endsWith('`') && sub.length > 2) {
          return (
            <code
              key={`c-${sIdx}`}
              className="px-1.5 py-0.5 mx-0.5 bg-zinc-100 border border-zinc-200/80 rounded font-mono text-[11.5px] text-indigo-600 font-semibold"
            >
              {sub.slice(1, -1)}
            </code>
          );
        }

        // Parse **bold**
        const boldParts = sub.split(/(\*\*[^*]+\*\*)/g);
        return boldParts.map((bSub, bIdx) => {
          if (bSub.startsWith('**') && bSub.endsWith('**') && bSub.length > 4) {
            return (
              <strong key={`b-${sIdx}-${bIdx}`} className="font-semibold text-zinc-900">
                {bSub.slice(2, -2)}
              </strong>
            );
          }
          return bSub;
        });
      })}
    </React.Fragment>
  );
}
