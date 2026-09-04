# Lumen AI Trading — 100% Zero-Cost Production & Staging Setup Guide

This guide details how to run, deploy, and operate the entire **Lumen AI Trading** production-grade platform with **$0 out-of-pocket expenses** across all layers (hosting, database, exchange execution, Web3 RPCs, payment processing, and AI market analysis).

---

## 1. Architecture Overview (Zero-Cost Stack)

```
+-------------------------------------------------------------------------+
|                        Client Layer ($0)                                |
|  React 19 + TypeScript + Vite + TailwindCSS                             |
|  Hosted on: Vercel Free / Netlify Free / Local Mac (Zero Cost)          |
+-------------------------------------------------------------------------+
                                    │
                                    ▼
+-------------------------------------------------------------------------+
|                    Authoritative Backend ($0)                           |
|  Node.js + Fastify 5 + TypeScript + Dual DB Engine                     |
|  Hosted on: Localhost / Docker / Render Free Tier / Fly.io ($0/mo)      |
+-------------------------------------------------------------------------+
       │                             │                          │
       ▼                             ▼                          ▼
+---------------+            +------------------+       +---------------+
| Database ($0) |            | Exchange Gateway |       | Web3 RPC ($0) |
| Built-in      |            | Binance Testnet  |       | Public Polygon|
| SQLite or     |            | & Live API Keys  |       | & Arbitrum    |
| Neon/Supabase |            | (Zero Platform   |       | RPC Endpoints |
| Free Postgres |            |  Maintenance Fee)|       |               |
+---------------+            +------------------+       +---------------+
```

---

## 2. Step-by-Step Setup ($0 Budget)

### Step 1: Clone and Install Dependencies
```bash
git clone https://github.com/RitamSaha001/AI_Trading.git
cd AI_Trading
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

All default variables in `.env.example` are pre-configured to run out of the box using the **built-in SQLite zero-cost engine**.

---

## 3. Zero-Cost Infrastructure Providers

### A. Database (Dual Mode: $0)
* **Local Mode (Default)**: Uses Node's built-in SQLite engine (`SQLITE_PATH=./lumen_trading.db`). Requires zero cloud accounts, zero installation, and has zero cost.
* **Cloud Mode (PostgreSQL)**: If deploying to the cloud, use **Neon.tech** (Serverless Postgres, free 500MB) or **Supabase** (Free 500MB Postgres).
  * Sign up at [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com).
  * Create a free project and copy the connection string.
  * Set `DATABASE_URL=postgresql://user:pass@host/db?sslmode=require` in `.env`.

### B. Free Backend & Webhook Hosting ($0)
* **Local with Cloudflare Tunnels (Recommended for Development)**:
  * Run backend: `npm run server` (runs on `http://localhost:3001`).
  * If testing incoming payment webhooks from Razorpay or Stripe, expose port 3001 for free using Cloudflare:
    ```bash
    # Cloudflare tunnel is 100% free forever with no bandwidth limits:
    brew install cloudflare/cloudflare/cloudflared
    cloudflared tunnel --url http://localhost:3001
    ```
  * Copy the `https://<random>.trycloudflare.com` URL and set it as your webhook endpoint (`/api/webhooks/payments`).
* **Cloud Hosting ($0)**:
  * **Render.com**: Deploy the Fastify app as a free Web Service.
  * **Vercel / Netlify**: Deploy the static frontend `dist/` directory for free.

### C. Free AI Market Analysis ($0)
* Visit [Google AI Studio](https://aistudio.google.com).
* Click **Get API Key** and generate a free API key.
* The Gemini 2.5 Flash free tier provides:
  * **15 Requests per Minute (RPM)**
  * **1 Million Tokens per Minute (TPM)**
  * **1,500 Requests per Day** — 100% Free forever.
* Paste it in `.env`:
  ```bash
  GEMINI_API_KEY=your_gemini_api_key
  VITE_GEMINI_API_KEY=your_gemini_api_key
  ```

### D. Free Exchange Execution (Binance Testnet & Live)
* **Binance Spot Testnet (100% Free Simulation with Real Orderbooks)**:
  * Visit [testnet.binance.vision](https://testnet.binance.vision).
  * Log in with your GitHub account.
  * Generate an API Key and Secret.
  * Receive free test funds (BTC, USDT, BNB, ETH) to test full live matching without spending a cent.
  * Set `BINANCE_ENV=testnet` in `.env`.
* **Binance Live (Zero Maintenance / Zero Platform Fee)**:
  * Binance charges 0 fees to generate and use Spot API keys.
  * Trading fees are standard 0.075% - 0.1% maker/taker, paid only when trading real capital.

### E. Free Web3 & DEX Blockchain RPCs
The app uses real EIP-1559 transaction signing and JSON-RPC broadcasting. Public zero-cost RPC endpoints are configured by default:
* **Polygon PoS**: `https://polygon-rpc.com` ($0)
* **Arbitrum One**: `https://arb1.arbitrum.io/rpc` ($0)
* **Ethereum Sepolia Testnet**: `https://rpc.sepolia.org` ($0)

### F. Free Indian UPI & Card Payments (0% Gateway Fee)
* **NPCI UPI Direct (0% MDR)**: Under Indian regulations, peer-to-peer and small merchant UPI transactions incur **0% MDR (Merchant Discount Rate)**.
  * The built-in dynamic UPI QR generator and Intent links directly invoke Google Pay, PhonePe, Paytm, and BHIM without paying any aggregator cut!
* **Razorpay / Stripe Test Sandbox ($0)**:
  * Create a free developer test account at [razorpay.com](https://razorpay.com) or [stripe.com](https://stripe.com).
  * Sandbox testing and webhooks are 100% free with unlimited test transactions.

---

## 4. Running the Complete System

### Start Both Server and Frontend (One Command)
```bash
npm run dev:all
```
This concurrently boots:
1. **Authoritative Fastify Backend**: `http://localhost:3001`
   - Initialized double-entry database ledger
   - Server risk engine with position caps & cash reserve validation
   - HMAC webhook listener and payment router
   - Binance execution gateway with reconciliation worker
2. **Vite Frontend**: `http://localhost:3000`
   - Auto-proxies `/api` calls directly to the Fastify backend

### Running Tests
Verify all 30 test suites and 292 institutional tests:
```bash
npm test
```

### Production Build
Create the production client bundle:
```bash
npm run build
```

---

## 5. Security & Zero-Cost Best Practices
1. **Never commit `.env`**: Add `.env` to `.gitignore`.
2. **Master Key**: Generate a 256-bit encryption master key using `openssl rand -hex 32` for local credential encryption at rest.
3. **Emergency Freeze**: If any unexpected market volatility occurs, the frontend Emergency Freeze button immediately triggers `/api/auth/emergency-freeze`, cancelling open orders and locking capital allocations server-side.
