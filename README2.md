# Salone Clean — Mock API Gateway (local testing only)

This is a **stand-in for the real Salone Clean API Gateway**, built so you
can test the Customer Subsystem and Management Subsystem end-to-end on your
own machine without a real Gateway, a real Driver Subsystem, or real Orange
Money / Africell Money accounts.

**Do not deploy this to production.** It exists purely so `npm run dev`
across all three local services produces a fully working demo.

## What it simulates

| Route | Stands in for | Behavior |
|---|---|---|
| `POST /api/v1/payments/initialize` | Orange Money / Africell Money settlement | Immediately accepts the payment and returns a fake reference (like a real gateway would after handing off to the mobile money rail). A few seconds later, it calls the Customer Subsystem's webhook to mark the payment `completed` and credit tokens — simulating the customer approving the prompt on their phone. |
| `POST /api/v1/routes/broadcast` | Driver Subsystem route dispatch | Accepts and logs the config, returns an acknowledgment — used by the Management Subsystem's "Deploy Global Route Update". |
| `GET /api/v1/analytics/aggregate` | Gateway's cross-subsystem analytics fan-out | Calls the Customer Subsystem's real `tokens-redeemed` aggregate and returns it, so the Management dashboard's "Total Tokens Redeemed" KPI is a **real number**, not a placeholder. |

## Testing a failed payment on purpose

Use a mobile money number that **ends in `0000`** (e.g. `+23276000000`) when
testing a purchase in the Customer Subsystem. The mock gateway will settle
that transaction as `failed` instead of `completed`, so you can see that
path in the UI (the transaction stays `failed` in history, no tokens
credited) without needing a real declined payment.

## Running all three services together

Open **three** terminal windows.

**Terminal 1 — Mock Gateway:**
```bash
cd salone-clean-mock-gateway
cp .env.example .env
npm install
npm run dev
```
→ `[mock-gateway] listening on port 4003`

**Terminal 2 — Customer Subsystem:**
```bash
cd salone-clean-customer-subsystem/backend
# .env should already have API_GATEWAY_BASE_URL=http://localhost:4003/api/v1
npm run dev
```
→ `[customer-subsystem] listening on port 4001`

**Terminal 3 — Management Subsystem:**
```bash
cd salone-clean-management-system/backend
# .env should already have API_GATEWAY_BASE_URL=http://localhost:4003/api/v1
npm run dev
```
→ `[management-subsystem] listening on port 4002`

Then open both frontends (`frontend/index.html` in each project). Register
a customer, buy tokens with Orange Money, wait a few seconds for the toast
confirming settlement, then check the Dashboard tab — the token balance
should be credited. On the Management side, the "Total Tokens Redeemed" KPI
card should now say **"● live · via Gateway → Customer Subsystem"** instead
of simulated, and "Deploy Global Route Update" should succeed instead of
failing with a 502.

> If you already had `.env` files from before this update, add/update the
> `API_GATEWAY_BASE_URL` line in each to `http://localhost:4003/api/v1` and
> restart those servers — `.env` is only read on startup.

## What's still simulated, and why

"Active Trucks En-Route" and "Pending Service Exceptions" on the Management
dashboard stay simulated even with this mock gateway running, because there
is no Driver Subsystem in this local setup for it to ask — same as a real
Gateway would behave if that subsystem were temporarily down. The dashboard
is built to label each KPI independently for exactly this reason, rather
than treating the whole analytics payload as equally trustworthy.
