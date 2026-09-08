---
name: autopilot-hourly-audit
description: >-
  Audits and reports on the hourly performance, trades, portfolio valuation,
  and risk telemetry of the Autonomous Quant Pilot. Use whenever the user asks
  to analyze the autopilot's hourly work, audit trades, inspect prices and P&L
  percentages, or generate a live portfolio audit report.
---

# Autonomous Quant Pilot: Hourly Performance & Trade Audit Runbook

## Objective
Provide an institutional-grade, multi-dimensional audit of the Autonomous Quant Pilot during live trading sessions. Inspect every trade, reconcile account equity, evaluate fleet regimes, and present a structured report.

---

## Step-by-Step Audit Procedure

### 1. Data Collection & Telemetry Extraction
Execute the extraction script to pull authoritative metrics from the cloud database and Upstox broker adapter:

```bash
# On GigaNode server or via remote SSH:
SSH_ASKPASS_REQUIRE=force SSH_ASKPASS=/Users/ritamsaha/.gemini/antigravity/brain/5ecf7946-63df-4c68-a9fa-db5434a0fd88/scratch/askpass.sh \
ssh -o StrictHostKeyChecking=no lumen@87.76.191.49 \
"cd /opt/lumen && echo 162008 | sudo -S node --env-file=/etc/lumen/lumen.env ./node_modules/.bin/tsx .agents/skills/autopilot-hourly-audit/scripts/extract_hourly_audit.ts" </dev/null
```

Or query the live endpoint directly:
```bash
curl -s "https://87.76.191.49.nip.io/api/pilot/state"
```

The audit pulls:
- **Upstox RMS Ledger**: Available cash, used margin, total equity.
- **Open Positions**: Net quantity, average buy price, current LTP, and unrealized P&L.
- **Trade & Order Log**: Orders filled, entry prices, exit prices, timestamps, and execution sources.
- **Fleet Telemetry**: Current prices, Hurst exponent ($H$), volume surge, and active model for all 10 bluechips.
- **Circuit Breaker Status**: Peak portfolio value, current drawdown %, and active safety tier.

---

### 2. Metrics Computation
For every trade and open position, compute:
- **Price Return (%)**:
  $$\text{Return (\%)} = \frac{\text{LTP} - \text{Entry Price}}{\text{Entry Price}} \times 100$$
- **Realized Trade P&L (₹)**:
  $$\text{P\&L (₹)} = (\text{Exit Price} - \text{Entry Price}) \times \text{Quantity}$$
- **Capital Reserve Compliance**: Confirm liquid cash $\ge 45\%$ of portfolio (Balanced) and ₹2,000 emergency cash floor is intact.
- **Trailing Stop Distance**: Compute distance between current LTP and dynamic trailing stop-loss:
  $$\text{Stop Distance (\%)} = \frac{\text{LTP} - \text{Trailing Stop}}{\text{LTP}} \times 100$$

---

### 3. Generate the Institutional Audit Report
Present the findings using this standard format:

#### Section 1: Executive KPI Summary
- **Total Portfolio Valuation**: Current equity and net day change (₹ and %).
- **Liquid Cash Reserve**: Active cash vs reserved safety floor (e.g. ₹13,500 buffer).
- **Session Win Rate & Expectancy**: Total trades, winning trades, losing trades, win rate %.
- **Circuit Breaker State**: Current drawdown from peak, tier (`NORMAL`, `CAUTION`, `BUY_HALTED`, `KILL_SWITCH`), and safety margin remaining.

#### Section 2: Active Positions & Dynamic Guardian Table
| Asset | Shares | Avg Buy (₹) | Current LTP (₹) | Unrealized P&L (₹) | Return (%) | Trailing Stop (₹) | Ratchet State |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |

#### Section 3: Hourly Trades Executed & Fill Log
| Time | Asset | Action | Shares | Entry Price (₹) | Exit Price (₹) | Realized P&L (₹) | Net % | Strategy & Exit Reason |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |

#### Section 4: 10-Bluechip Fleet Regime Matrix
| Asset | Sector | LTP (₹) | Hurst ($H$) | Regime Label | Assigned Model | Lifecycle State |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |

#### Section 5: Risk Officer Assessment & Next-Hour Guidance
- Assessment of market conditions (trending vs choppy).
- Warnings for upcoming cutoffs (e.g. 15:00 entry freeze, 15:15 intraday square-off).
- Recommended action (e.g. continue standard execution, switch to Conservative, or let runners trail).
