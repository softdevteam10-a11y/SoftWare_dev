# Salone Clean — Customer Subsystem

A standalone, self-contained service for the customer-facing side of the
Salone Clean waste management platform (Freetown, Sierra Leone). It owns its
**own** PostgreSQL database and talks to the Driver Subsystem and Management
Subsystem **only** through the shared API Gateway — never directly.

```
salone-clean-customer-subsystem/
├── backend/                     Node.js / Express REST API
│   ├── schema.sql                Local DB schema (customer_subscriptions, customer_transactions)
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js             Process entrypoint
│       ├── app.js                Express app + route wiring
│       ├── db.js                 Local PostgreSQL pool (this service's DB only)
│       ├── middleware/
│       │   └── validators.js     Input validation for both panels
│       ├── routes/
│       │   ├── customerRoutes.js Panel 1 (register) + Panel 3 (dashboard/history)
│       │   ├── purchaseRoutes.js Panel 2 helper — tier catalogue + live quote
│       │   └── paymentRoutes.js  Panel 2 — payment initialization + gateway webhook
│       └── utils/
│           ├── apiResponse.js    Standardized { success, data|error } envelope
│           ├── pricing.js        Server-side source of truth for tier prices
│           └── gatewayClient.js  The ONLY outbound call to the API Gateway
└── frontend/
    └── index.html                Mobile-responsive UI (Tailwind + vanilla JS), all 3 panels
```

## Why it's decoupled

- **Own database.** `schema.sql` defines two tables that belong only to this
  subsystem: `customer_subscriptions` (the table you specified) and
  `customer_transactions` (a local purchase ledger needed to power Panel 3's
  history table). Neither the Driver nor Management subsystem's schemas are
  referenced, joined, or assumed to exist here.
- **One outbound door.** `src/utils/gatewayClient.js` is the single place
  this service reaches outward, and it only ever calls the shared
  **API Gateway** (`API_GATEWAY_BASE_URL`) — e.g.
  `POST {GATEWAY}/payments/initialize`. The Gateway is responsible for
  actually talking to Orange Money / Africell Money and for notifying the
  Management Subsystem once a payment clears. If the Driver/Management teams
  change their internal databases or services, this subsystem is unaffected
  as long as the Gateway's contract stays the same.
- **Inbound webhook, not a shared table.** When a payment finishes clearing,
  the Gateway calls this service back at `POST /api/v1/payments/webhook`
  (instead of Salone Clean writing directly into a shared "transactions"
  table that other services also touch).

## Login & the auth gate

As of this update, **Log In / Create Account is the first screen** —
Purchase and Dashboard are unreachable until the person authenticates.

- **Registration** now also collects a **4-digit PIN** (plus a confirm
  field). The backend hashes it (Node's built-in `crypto.scryptSync`, salted,
  constant-time comparison on verify — no extra dependency) and stores it in
  the new `pin_hash` column. The raw PIN is never stored or returned.
- **Returning customers** log in with `phone_number` + `pin` via
  `POST /api/v1/customers/login`, instead of registering again.
- A **Log out** button (top-right of the header, once logged in) clears the
  in-memory session and returns to the auth gate.
- Like the rest of this demo, the session lives only in memory — refreshing
  the page logs you out. See the "session state" note below for what a
  production build should do instead.

If you have an **existing database from before this update**, re-run
`schema.sql` — it now includes a migration line
(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS pin_hash ...`) that adds the new
column safely without touching your existing rows. Any customers registered
before this update will have an empty `pin_hash` and won't be able to log
in until they re-register (there's no way to recover a PIN that was never
set).

## Getting started

### 1. Backend

```bash
cd backend
cp .env.example .env      # fill in real DB + gateway credentials
npm install

# create the local database once (adjust connection details as needed)
psql -U customer_service -d salone_clean_customers -f schema.sql

npm run dev                # http://localhost:4001
```

Health check: `GET http://localhost:4001/health`

### 2. Frontend

`frontend/index.html` is a single static file (Tailwind via CDN, no build
step). Open it directly in a browser, or serve it with any static file
server:

```bash
cd frontend
python3 -m http.server 5173
```

If your backend isn't on `http://localhost:4001`, update the
`API_BASE_URL` constant near the top of the `<script>` block in
`index.html`.

> **Note on session state:** to stay compatible with sandboxed preview
> environments, the frontend keeps the logged-in profile in an in-memory
> JS variable rather than `localStorage`. That means a page refresh clears
> it — use the "Load a profile by Subscription ID" box on the Dashboard tab
> to reload it during testing. For a real deployment, replace this with a
> proper session (e.g. a short-lived token issued by an auth endpoint,
> stored in an httpOnly cookie) so state survives a refresh.

## API reference

All responses use one JSON envelope:

```jsonc
// success
{ "success": true, "message": "OK", "data": { /* ... */ } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ /* field errors */ ] } }
```

| Method | Path                                        | Purpose (Panel)                                   |
|--------|----------------------------------------------|----------------------------------------------------|
| GET    | `/api/v1/customers/neighborhoods`             | Dropdown source list (Panel 1)                     |
| POST   | `/api/v1/customers`                           | Register a new customer profile (Panel 1)          |
| POST   | `/api/v1/customers/login`                     | Log in with phone number + PIN (auth gate)         |
| GET    | `/api/v1/customers/:subscriptionId`           | Fetch profile + token balance (Panel 3)            |
| GET    | `/api/v1/customers/:subscriptionId/history`   | Transaction history table (Panel 3)                |
| GET    | `/api/v1/customers/list`                       | Lightweight customer list (Gateway → Management's route builder) |
| POST   | `/api/v1/customers/:subscriptionId/notifications` | Inbound: Gateway calls this when the Driver Subsystem reports a completed pickup |
| GET    | `/api/v1/customers/:subscriptionId/notifications` | The customer's notification feed (Dashboard)      |
| PATCH  | `/api/v1/customers/:subscriptionId/notifications/:notificationId/read` | Mark a notification read |
| GET    | `/api/v1/purchases/tiers`                     | Service tier catalogue (Panel 2)                   |
| GET    | `/api/v1/purchases/quote?tier=&quantity=`     | Server-verified live price preview (Panel 2)       |
| POST   | `/api/v1/payments/initialize`                 | Kick off a mobile money payment via the Gateway (Panel 2) |
| POST   | `/api/v1/payments/webhook`                    | Gateway calls this back when payment clears (credits tokens) |

### Example: register a customer

```bash
curl -X POST http://localhost:4001/api/v1/customers \
  -H "Content-Type: application/json" \
  -d '{
        "full_name": "Fatmata Kamara",
        "phone_number": "+23276000000",
        "email_address": "fatmata@example.com",
        "neighborhood_tag": "Aberdeen",
        "street_address": "12 Cape Road, near St. Mary Church",
        "signature_data": "verified-tap"
      }'
```

### Example: initialize a token purchase

```bash
curl -X POST http://localhost:4001/api/v1/payments/initialize \
  -H "Content-Type: application/json" \
  -d '{
        "subscription_id": "<uuid-from-registration>",
        "service_tier": "medium",
        "quantity": 2,
        "payment_provider": "orange_money",
        "phone_number": "+23276000000"
      }'
```

## Validation & error handling

- **Registration**: full name (min 2 chars), valid phone, optional-but-valid
  email, neighborhood selected, street address (min 5 chars) — all enforced
  in `middleware/validators.js` and mirrored client-side with inline field
  errors.
- **Purchases**: `subscription_id` present, `service_tier` in
  `small|medium|large`, `quantity` a positive integer, `payment_provider` in
  `orange_money|africell_money`, valid phone number.
- **Pricing is never trusted from the client.** `utils/pricing.js` is the
  single source of truth the server uses to recompute tokens/total before
  writing a transaction or calling the Gateway — the frontend's live total
  is a preview only.
- Duplicate phone numbers return `409 PHONE_ALREADY_REGISTERED`; unknown
  customers return `404 CUSTOMER_NOT_FOUND`; a Gateway failure or timeout
  returns `502` and marks the local transaction `failed` (kept for audit,
  not deleted).

## Tech stack

- **Backend:** Node.js, Express, `pg` (connection pool, parameterized
  queries throughout — no string-concatenated SQL).
- **Frontend:** HTML + Tailwind CSS (CDN) + vanilla JS — mobile-first,
  bottom tab navigation, no build tooling required.
- **Database:** PostgreSQL, owned exclusively by this subsystem.
