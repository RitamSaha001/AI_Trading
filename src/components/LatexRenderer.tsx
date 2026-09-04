import React, { useMemo } from 'react';
import katex from 'katex';
import { Copy, Check } from 'lucide-react';

interface LatexRendererProps {
  content: string;
  className?: string;
}

/**
 * Tokenizes and renders text containing inline ($...$) and block ($$...$$ or \[...\]) LaTeX formulas
 * alongside standard markdown features (bold, bullets, code blocks, tables).
 */
export const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = '' }) => {
  const renderedElements = useMemo(() => {
    if (!content) return null;

    // Split text into lines/blocks
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
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
          const html = katex.renderToString(formula, { displayMode: true, throwOnError: false, trust: false });
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
        const html = katex.renderToString(formula, { displayMode: false, throwOnError: false, trust: false });
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
        const html = katex.renderToString(formula, { displayMode: false, throwOnError: false, trust: false });
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
