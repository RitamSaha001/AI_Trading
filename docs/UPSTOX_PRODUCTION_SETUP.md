# Upstox Production Connectivity & VPS Deployment Guide

> [!IMPORTANT]
> **Safety Notice**: Phase 3 establishes production-grade deployment and read-only connectivity. **Phase 3 does not enable autonomous live trading.** Live trading safety gates remain strictly locked (`UPSTOX_LIVE_TRADING_ENABLED=false`) until explicitly authorized and verified in Phase 4.

---

## 1. Upstox Developer App Setup

1. Log in to the [Upstox Developer Console](https://developer.upstox.com).
2. Create a new App (e.g. `Lumen Trading Engine`).
3. Note your **API Key (`Client ID`)** and **API Secret (`Client Secret`)**.
4. Configure App Type: **Interactive API**.

---

## 2. OAuth Redirect Configuration

1. In the Upstox Developer App settings, set the **Redirect URI**:
   - **Production VPS**: `https://your-domain.com/api/exchange/upstox/callback`
   - **Local Development**: `http://localhost:5173/api/exchange/upstox/callback`
2. Lumen enforces strict server-side anti-CSRF state management:
   - Server generates a 64-character random state persisted in `broker_oauth_states` with a 10-minute TTL.
   - Any callback with a replayed or unrecognized state token is atomically rejected before code exchange.

---

## 3. VPS Specifications & System Requirements

- **Provider**: DigitalOcean Droplet (or standard Linux VPS)
- **OS**: Ubuntu 22.04 LTS / Debian 12
- **Hardware**: 1 vCPU, 2GB RAM, 25GB SSD (sufficient for Node.js + PostgreSQL)
- **Dependencies**: Node.js 20+ LTS, npm 10+, PostgreSQL 15+
- **Cost**: Zero additional software licensing or SaaS fees (standard OSS stack).

---

## 4. Static IP Registration

Exchange regulations mandate that automated order traffic must originate from registered static IP addresses.

1. Allocate a **Reserved IP** (Static Public IP) on DigitalOcean and bind it to your Droplet.
2. In Upstox Developer Console under **My Apps** > **Static IP**:
   - Add your droplet's reserved public IP as the **Primary Static IP**.
   - (Optional) Add a secondary static IP if maintaining a hot standby.
3. Alternatively, query or update registered IPs via the Upstox API:
   - `GET /user/ip`: View registered primary & secondary IPs.
   - `PUT /user/ip`: Update registered static IPs (limited to once per calendar week).

---

## 5. Server Environment Variables

Create the production environment file at `/etc/lumen/lumen.env` with permissions `chmod 600 /etc/lumen/lumen.env`:

```bash
# Core Environment
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Security & CORS
SESSION_SECRET=<64_CHAR_CRYPTOGRAPHIC_RANDOM_SECRET>
CREDENTIAL_ENCRYPTION_KEY=<64_HEX_CHAR_ENCRYPTION_KEY>
ALLOWED_ORIGINS=https://your-domain.com

# Authoritative PostgreSQL Database (Mandatory in production)
DATABASE_URL=postgres://lumen_app:<DB_PASSWORD>@127.0.0.1:5432/lumen_production?sslmode=disable

# Upstox Credentials
UPSTOX_CLIENT_ID=<YOUR_UPSTOX_API_KEY>
UPSTOX_CLIENT_SECRET=<YOUR_UPSTOX_API_SECRET>
UPSTOX_REDIRECT_URI=https://your-domain.com/api/exchange/upstox/callback
UPSTOX_API_BASE_URL=https://api.upstox.com/v2
UPSTOX_ENV=production

# Static IP Verification
UPSTOX_STATIC_IP=<YOUR_DROPLET_STATIC_IP>
UPSTOX_SECONDARY_STATIC_IP=

# Safety Gate (MUST REMAIN FALSE IN PHASE 3)
UPSTOX_LIVE_TRADING_ENABLED=false
```

---

## 6. VPS Security Baseline & Network Hardening

### A. Dedicated Least-Privilege User
```bash
sudo adduser --system --group --no-create-home lumen
```

### B. PostgreSQL Local Binding Only
Verify `/etc/postgresql/15/main/postgresql.conf`:
```conf
listen_addresses = 'localhost'
```
Verify PostgreSQL is not exposed to the public internet:
```bash
sudo ss -tlpn | grep 5432
# Should bind to 127.0.0.1:5432 only
```

### C. UFW Firewall Configuration
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Let's Encrypt renewal)
sudo ufw allow 443/tcp   # HTTPS Reverse Proxy
sudo ufw enable
```

### D. Reverse Proxy with SSL (Caddy or Nginx)
Using Caddyfile (`/etc/caddy/Caddyfile`):
```caddy
your-domain.com {
    reverse_proxy localhost:3000
}
```

---

## 7. Process Supervision (systemd)

1. Deploy unit file:
   ```bash
   sudo cp deployment/lumen.service /etc/systemd/system/lumen.service
   sudo systemctl daemon-reload
   ```
2. Enable and start:
   ```bash
   sudo systemctl enable lumen
   sudo systemctl start lumen
   ```
3. Inspect status & logs:
   ```bash
   sudo systemctl status lumen
   sudo journalctl -u lumen -f --output=cat
   ```

---

## 8. Egress IP Verification

Run the egress IP verification diagnostic tool:

```bash
npm run verify:upstox-ip
```

Expected Output:
```text
======================================================
🔍 Upstox Outbound Egress IP Diagnostic
======================================================

Environment:                  production
Upstox Mode:                  production
Live Trading Allowed:         NO (PAPER/SAFE)
Configured Primary IP:        198.51.100.25

Probing outbound public egress IP and Upstox registered IPs...
Detected Outbound IP:         198.51.100.25
Authoritative Source:         UPSTOX_API
Upstox Primary Reg IP:        198.51.100.25
Diagnostic Status:            PASS

✅ [PASS] Host egress IP strictly matches registered Upstox static IP.
```

If the outbound IP fails to match, the script returns exit code `1`.

---

## 9. Read-Only End-to-End Connectivity Verification

Verify all 11 capabilities without placing orders:

```bash
npm run verify:upstox-connectivity
```

Expected Output:
```text
======================================================
📡 Upstox End-to-End Read-Only Connectivity Suite
======================================================

Environment:          production
Upstox Mode:          production
Live Trading Allowed: NO (SAFE READ-ONLY)

----------------------------------------------------------------------
CAPABILITY          STATUS      LATENCY   DETAILS
----------------------------------------------------------------------
AUTH                ✅ PASS      2ms       Access token present and loaded securely.
PROFILE             ✅ PASS      185ms     User ID: UCC12345, Name: Verified Trader, Active: true
FUNDS               ✅ PASS      142ms     Available Margin: INR 25000.00, Used Margin: INR 0.00
POSITIONS           ✅ PASS      110ms     Retrieved 0 open/short-term position(s).
HOLDINGS            ✅ PASS      135ms     Retrieved 2 long-term holding(s).
ORDERS              ✅ PASS      95ms      Retrieved 0 order(s) for the trading day.
TRADES              ✅ PASS      88ms      Retrieved 0 executed trade(s) for the trading day.
MARKET DATA         ✅ PASS      120ms     RELIANCE LTP: INR 2945.50, Volume: 5120440
INSTRUMENT LOOKUP   ✅ PASS      1ms       Resolved RELIANCE and TCS with tick size 0.05 INR.
STATIC IP           ✅ PASS      82ms      Outbound IP matches registered static IP via UPSTOX_API.
TOKEN EXPIRY        ✅ PASS      1ms       Session ACTIVE (14h 22m remaining until 03:30 AM IST).
----------------------------------------------------------------------

OVERALL CONNECTIVITY STATUS: PASS
All read-only Upstox capabilities verified successfully.
```

---

## 10. Daily Token Lifecycle & Cutoff Engine

- **Expiry Boundary**: Upstox access tokens expire daily at **03:30:00 AM IST** (22:00:00 UTC).
- **Health Categorization**:
  - `ACTIVE`: Normal operational session.
  - `EXPIRING_SOON`: Less than 60 minutes remaining.
  - `EXPIRED`: Cutoff boundary crossed.
- **5-Minute Safety Cutoff**: The server automatically blocks any new live order submission if less than 5 minutes remain before 03:30 AM IST (`SESSION_EXPIRING`), avoiding in-flight session terminations.
- **Morning Re-Authentication**: Every trading day before 09:15 AM IST market open, user initiates 1-click re-authentication in the Exchange Onboarding drawer.

---

## 11. Health & Readiness Observability

The server provides distinct health probes:
- `/health/liveness`: Verifies Node.js process is active.
- `/api/ready` or `/health/readiness`: Returns comprehensive readiness status:
  - `HEALTHY`: Process up
  - `READY`: Database connected and migrations aligned
  - `BROKER_READY`: Broker gateways initialized
  - `LIVE_TRADING_READY`: Fully certified for live orders (only when safety gates are explicitly disengaged).

---

## 12. Troubleshooting & Recovery Runbook

| Symptom | Cause | Remediation |
| :--- | :--- | :--- |
| `STATIC_IP_MISMATCH` | Outbound IP differs from registered IP | Verify reserved IP binding on VPS; check `npm run verify:upstox-ip`. |
| `SESSION_EXPIRING` | Within 5m of 03:30 AM IST | Wait for cutoff boundary and re-authenticate via OAuth drawer. |
| `AUTHENTICATION_FAILED` | Expired token or revoked app | Trigger 1-click re-auth in Exchange drawer. |
| `MALFORMED_RESPONSE` | Upstox payload schema mismatch | Client rejects corrupted payload safely without crashing database. |
| `UNKNOWN` Order Status | Network timeout during submission | Order transitioned to `UNKNOWN`; automatic reconciliation queries venue. |

---

## 13. Safe Transition Toward Live Trading (Phase 4 Prerequisite)

Do NOT enable live trading until:
1. `npm run verify:upstox-ip` reports `PASS` in production.
2. `npm run verify:upstox-connectivity` reports `PASS` for all 11 capabilities.
3. Paper trading test executions complete with zero ledger anomalies.
4. User explicitly enables `UPSTOX_LIVE_TRADING_ENABLED=true` in `/etc/lumen/lumen.env`.
