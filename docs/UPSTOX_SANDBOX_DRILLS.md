# Upstox Sandbox Execution Drills

This drill validates the real broker integration without using money. It can only use the Upstox sandbox v2 host, and refuses to start if either live-trading flag is enabled.

## Local setup

Fill these values in the ignored `.env.sandbox` file. The runner loads this profile itself. Use credentials and an instrument token created in the Upstox sandbox; do not paste production credentials into this file.

```dotenv
UPSTOX_ENV=sandbox
UPSTOX_LIVE_TRADING_ENABLED=false
UPSTOX_AUTONOMOUS_LIVE_ENABLED=false
UPSTOX_API_BASE_URL=https://sandbox.upstox.com/v2
UPSTOX_SANDBOX_ACCESS_TOKEN=
UPSTOX_SANDBOX_INSTRUMENT_TOKEN=
UPSTOX_SANDBOX_LIMIT_PRICE=
UPSTOX_SANDBOX_MODIFIED_LIMIT_PRICE=
```

The two prices must be positive and different. The drill uses quantity `1` unless `UPSTOX_SANDBOX_QUANTITY` is set.

## Run

Run the command only after reviewing the values above:

```bash
UPSTOX_SANDBOX_CONFIRM=RUN_SANDBOX_DRILL npm run drill:upstox-sandbox
```

The runner places one sandbox limit order, modifies it, and then always attempts cancellation. It writes a non-secret evidence report under `artifacts/upstox-sandbox-drills/`, which is ignored by Git.

## Interpretation

A passing drill proves only that the broker routes and basic order lifecycle work in Upstox sandbox with the supplied account. It does not validate production access, fills, slippage, data latency, profitability, or safe unattended trading. Keep production execution disabled until the read-only connectivity checks, sandbox drills, reconciliation drills, and operator review are all complete.
