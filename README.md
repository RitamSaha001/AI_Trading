# Lumen AI Trading

A production-oriented React + TypeScript paper-trading cockpit rebuilt from the supplied Lumen HTML prototype.

## Product features
- Live public crypto market data using Binance REST with Coinbase fallback.
- Persistent paper portfolio, positions, watchlist and paper order history.
- Real Dashboard, Markets, Portfolio, Orders, Strategies, Alerts and Settings routes.
- SVG line charts, sparklines, timeframe switching and asset search.
- Paper execution with modeled market impact and a transparent 0.08% fee.
- Allocation-limited momentum automation with configurable cooldowns.
- Browser-local price/change alerts and a live notification panel.
- Gemini settings with live model discovery and selectable generation-capable models.
- Gemini-backed Insight and Copilot with deterministic local fallback.

## Gemini security
This client-only build stores the Gemini API key in localStorage so the user can configure the model directly in the browser. For public production deployment, move Gemini calls behind your own server/API gateway so the key is never exposed to the browser.

## Run locally
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```
