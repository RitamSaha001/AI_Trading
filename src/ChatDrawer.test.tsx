import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LatexRenderer } from './components/LatexRenderer';

describe('LatexRenderer Character-by-Character Typewriter Simulation', () => {
  it('does not throw at ANY sliced length of the welcome message', () => {
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
});
