import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LatexRenderer, renderInlineLatexAndFormatting, renderInlineMarkdown } from './LatexRenderer';

describe('LatexRenderer Markdown & Table Parser Suite', () => {
  it('renders standard markdown tables with correct headers, alignments, and cell rows', () => {
    const tableMarkdown = `
### Portfolio Factor Analysis
| Asset | Spot Price | 24h Volatility | Regime |
| :--- | :---: | ---: | :--- |
| RELIANCE | ₹2,940.50 | 18.2% | Trending Bull |
| TCS | ₹4,210.00 | 14.5% | Consolidation |
| INFY | ₹1,880.20 | 19.8% | Mean Reversion |
    `.trim();

    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: tableMarkdown }));

    // Must render semantic HTML table elements
    expect(html).toContain('<table');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody');
    expect(html).toContain('<th');
    expect(html).toContain('<td');

    // Headers
    expect(html).toContain('Asset');
    expect(html).toContain('Spot Price');
    expect(html).toContain('24h Volatility');
    expect(html).toContain('Regime');

    // Alignments
    expect(html).toContain('text-left');
    expect(html).toContain('text-center');
    expect(html).toContain('text-right');

    // Rows
    expect(html).toContain('RELIANCE');
    expect(html).toContain('₹2,940.50');
    expect(html).toContain('TCS');
    expect(html).toContain('INFY');
  });

  it('renders tables with inline LaTeX math, bolding, and code tags inside cells', () => {
    const mathTable = `
| Parameter | Value | Formula |
| :--- | :--- | :--- |
| **Alpha** | 0.85 | $\\alpha = R_i - \\beta R_m$ |
| **Beta** | 1.12 | \`BETA_MARKET\` |
    `.trim();

    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: mathTable }));

    expect(html).toContain('<table');
    expect(html).toContain('>Alpha</strong>');
    expect(html).toContain('>Beta</strong>');
    expect(html).toContain('<code');
    expect(html).toContain('BETA_MARKET');
    expect(html).toContain('inline-math'); // KaTeX inline math span
  });

  it('correctly handles tables without leading or trailing outer pipes', () => {
    const tableNoOuterPipes = `
Symbol | Price | Signal
--- | :---: | ---:
HDFCBANK | ₹1,650.00 | BUY
ICICIBANK | ₹1,220.00 | HOLD
    `.trim();

    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: tableNoOuterPipes }));

    expect(html).toContain('<table');
    expect(html).toContain('HDFCBANK');
    expect(html).toContain('ICICIBANK');
    expect(html).toContain('BUY');
  });

  it('renders GitHub-style callouts for [!NOTE], [!WARNING], [!TIP], and [!IMPORTANT]', () => {
    const noteMarkdown = `
> [!NOTE]
> RELIANCE is currently testing support at the 20-day EMA.
    `.trim();

    const warningMarkdown = `
> [!WARNING]
> High event risk due to upcoming RBI interest rate decision.
    `.trim();

    const tipMarkdown = `
> [!TIP]
> Use fractional Kelly sizing when volatility exceeds 25%.
    `.trim();

    const importantMarkdown = `
> [!IMPORTANT]
> Capital preservation reserve is active. Minimum cash floor cannot be breached.
    `.trim();

    const htmlNote = renderToStaticMarkup(React.createElement(LatexRenderer, { content: noteMarkdown }));
    expect(htmlNote).toContain('Note');
    expect(htmlNote).toContain('RELIANCE is currently testing support');

    const htmlWarn = renderToStaticMarkup(React.createElement(LatexRenderer, { content: warningMarkdown }));
    expect(htmlWarn).toContain('Warning');
    expect(htmlWarn).toContain('High event risk');

    const htmlTip = renderToStaticMarkup(React.createElement(LatexRenderer, { content: tipMarkdown }));
    expect(htmlTip).toContain('Pro Tip');
    expect(htmlTip).toContain('fractional Kelly sizing');

    const htmlImp = renderToStaticMarkup(React.createElement(LatexRenderer, { content: importantMarkdown }));
    expect(htmlImp).toContain('Important');
    expect(htmlImp).toContain('Capital preservation reserve');
  });

  it('renders standard blockquotes with italicized text styling', () => {
    const quoteMarkdown = `
> Invalidation level is ₹2,890. If breached on a 15-minute close, close 50% of the long position.
    `.trim();

    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: quoteMarkdown }));
    expect(html).toContain('Invalidation level is ₹2,890');
    expect(html).toContain('border-l-2');
  });

  it('renders hierarchical headings (# through #####) with proper typography', () => {
    const headingsMarkdown = `
# Level 1 Heading
## Level 2 Heading
### Level 3 Heading
#### Level 4 Heading
##### Level 5 Heading
    `.trim();

    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: headingsMarkdown }));
    expect(html).toContain('<h2');
    expect(html).toContain('Level 1 Heading');
    expect(html).toContain('<h3');
    expect(html).toContain('Level 2 Heading');
    expect(html).toContain('<h4');
    expect(html).toContain('Level 3 Heading');
    expect(html).toContain('<h5');
    expect(html).toContain('Level 4 Heading');
    expect(html).toContain('<h6');
    expect(html).toContain('Level 5 Heading');
  });

  it('renders horizontal dividers (---)', () => {
    const hrMarkdown = `
Some text before divider
---
Some text after divider
    `.trim();

    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: hrMarkdown }));
    expect(html).toContain('<hr');
    expect(html).toContain('Some text before divider');
    expect(html).toContain('Some text after divider');
  });

  it('renders KaTeX display formulas (both single-line and multi-line)', () => {
    const singleLineMath = '$$\\text{Sharpe} = \\frac{R_p - R_f}{\\sigma_p}$$';
    const multiLineMath = `
$$
w_i^* = \\frac{\\sigma_i^{-1}}{\\sum_{j=1}^N \\sigma_j^{-1}}
$$
    `.trim();

    const htmlSingle = renderToStaticMarkup(React.createElement(LatexRenderer, { content: singleLineMath }));
    expect(htmlSingle).toContain('katex-display');

    const htmlMulti = renderToStaticMarkup(React.createElement(LatexRenderer, { content: multiLineMath }));
    expect(htmlMulti).toContain('katex-display');
  });

  it('renders markdown links and code blocks properly', () => {
    const linkAndCode = `
Check out the [Upstox Developer Docs](https://upstox.com/developer/api-documentation) for websocket feeds.

\`\`\`python
def kelly_criterion(win_rate, reward_risk):
    return win_rate - (1 - win_rate) / reward_risk
\`\`\`
    `.trim();

    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: linkAndCode }));
    expect(html).toContain('<a');
    expect(html).toContain('href="https://upstox.com/developer/api-documentation"');
    expect(html).toContain('Upstox Developer Docs');
    expect(html).toContain('<pre');
    expect(html).toContain('kelly_criterion');
  });

  it('gracefully handles currency with dollar signs without breaking into invalid KaTeX error text', () => {
    const textWithDollars = 'Expected profit is between $100 and $200 with 95% confidence.';
    const html = renderToStaticMarkup(React.createElement(LatexRenderer, { content: textWithDollars }));
    expect(html).toContain('Expected profit is between');
    expect(html).toContain('$100');
    expect(html).toContain('$200');
    expect(html).not.toContain('katex-error');
  });
});
