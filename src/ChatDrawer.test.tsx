import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LatexRenderer } from './components/LatexRenderer';
import { ChatDrawer } from './ChatDrawer';
import { Provider } from './store';

describe('Nexus ChatDrawer Hook Invariants & Resilience Suite', () => {
  it('does not throw at ANY sliced length of the welcome message in LatexRenderer', () => {
    const text = "Welcome to **Lumen Nexus**—your institutional quantitative trading intelligence. I analyze quantitative indicators (SMA/EMA ribbons, RSI, Bollinger Bands, ATR, VWAP), stress-test portfolios, synthesize algorithmic strategy bots, and execute mathematical capital allocation. Click the **`+`** icon below to launch any capability, or ask me directly.";
    
    for (let len = 0; len <= text.length; len++) {
      const slice = text.slice(0, len);
      try {
        renderToStaticMarkup(<LatexRenderer content={slice} />);
      } catch (err) {
        throw new Error(`CRASH at length ${len} ("${slice}"): ${err}`);
      }
    }
  });

  it('renders cleanly when open is false (returns null without hook order violation)', () => {
    const html = renderToStaticMarkup(
      <Provider>
        <ChatDrawer open={false} onClose={() => {}} />
      </Provider>
    );
    expect(html).toBe('');
  });

  it('renders cleanly when open is true with full quant tools and header', () => {
    const html = renderToStaticMarkup(
      <Provider>
        <ChatDrawer open={true} onClose={() => {}} />
      </Provider>
    );
    expect(html).toContain('Nexus Intelligence');
    expect(html).toContain('Risk Audit');
    expect(html).toContain('Alpha Radar');
    expect(html).toContain('Strategy Bot');
    expect(html).toContain('Smart DCA');
    expect(html).toContain('Rebalance');
    expect(html).toContain('Stress Test');
  });
});

