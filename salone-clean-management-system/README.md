# Salone Clean — Management Subsystem

The municipal admin console for Salone Clean (Freetown). Owns its own
compliance/audit database and reaches the Customer and Driver subsystems
**only** through the shared API Gateway — never their databases directly.

```
salone-clean-management-system/
├── backend/                        Node.js / Express REST API
│   ├── schema.sql                   Local DB schema (system_compliance_logs, seeded)
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js                 Process entrypoint
│       ├── app.js                    Express app + route wiring
│       ├── db.js                     Local PostgreSQL pool (this service's DB only)
│       ├── middleware/validators.js  Input validation for deploy + report requests
│       ├── routes/
│       │   ├── analyticsRoutes.js    Panel 1 — KPI cards + weekly volume chart data
│       │   ├── complianceRoutes.js   Panel 2 — log table, log detail, deploy dispatch
│       │   └── auditRoutes.js        Panel 3 — filtered report generation + self-audit
│       └── utils/
│           ├── apiResponse.js        Standardized { success, data|error } envelope
│           └── gatewayClient.js      The ONLY outbound call to the API Gateway
└── frontend/
    └── index.html                    Admin dashboard UI (Tailwind + vanilla JS), all 3 panels
```

## Why it's decoupled

- **One local table.** `schema.sql` defines only `system_compliance_logs`,
  exactly as specified. This subsystem never queries the Customer
  Subsystem's `customer_subscriptions` table or the Driver Subsystem's
  fleet tables directly.
- **Simulated KPIs, honestly labeled.** Panel 1's "Total Tokens Redeemed"
  and "Active Trucks En-Route" numbers don't live in this database — in a
  real deployment they'd come from a Gateway aggregate endpoint that fans
  out to the other two subsystems. `analyticsRoutes.js` generates
  deterministic placeholder values and marks each one `simulated: true`
  in the API response so the frontend (and anyone reading the JSON) can
  tell real data from placeholder data at a glance. The one number that
  *is* real — `compliance_log_entries` — is computed from this
  subsystem's own table.
- **Dispatch, not direct write.** "Deploy Global Route Update"
  (`POST /api/v1/compliance/deploy`) never touches the Driver Subsystem's
  database. It (1) writes a local audit row first so the attempt is on
  record even if the network call fails, (2) POSTs the config to the API
  Gateway's `/routes/broadcast` endpoint, then (3) updates the same audit
  row with the outcome. If the Gateway is unreachable, the deployment
  fails loudly (`502`) and the log is marked `CRITICAL` — nothing is
  silently dropped.
- **Self-auditing.** Generating an audit report is itself logged as a
  `GENERATE_AUDIT_REPORT` compliance event — who ran it, with what
  filters, how many rows matched.

## Getting started

### 1. Backend

```bash
cd backend
cp .env.example .env      # fill in real DB + gateway credentials
npm install

# create the local database once
psql -U postgres -c "CREATE DATABASE salone_clean_management;"
psql -U postgres -d salone_clean_management -f schema.sql

npm run dev                # http://localhost:4002
```

Health check: `GET http://localhost:4002/health`

> **Windows / PowerShell note:** if `npm install` fails with a
> "running scripts is disabled" error, either run the command from
> Command Prompt instead of PowerShell, or run
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in your
> PowerShell session first (see the Customer Subsystem thread for more
> detail — same fix applies here).

### 2. Frontend

`frontend/index.html` is a single static file (Tailwind via CDN, no build
step). Open it directly in a browser, or serve it:

```bash
cd frontend
python3 -m http.server 5174
```

If your backend isn't on `http://localhost:4002`, update the
`API_BASE_URL` constant near the top of the `<script>` block.

> **Session state note:** like the Customer Subsystem frontend, this
> dashboard keeps everything in memory (no `localStorage`) to stay
> compatible with sandboxed preview environments. A refresh clears the
> current view's loaded data — reload/refresh re-fetches it. For
> production, add a real admin login/session instead of the free-text
> Admin User ID field.

## API reference

Same envelope as the other subsystems:
```jsonc
{ "success": true, "message": "OK", "data": { /* ... */ } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

| Method | Path                              | Purpose (Panel)                                          |
|--------|-------------------------------------|-----------------------------------------------------------|
| GET    | `/api/v1/analytics/overview`         | KPI cards + weekly volume chart (Panel 1)                  |
| GET    | `/api/v1/compliance/logs`            | List compliance logs, filter by `subsystem`/`severity` (Panel 2) |
| GET    | `/api/v1/compliance/logs/:logId`     | Single log detail incl. `payload_snapshot` (Panel 2 modal) |
| POST   | `/api/v1/compliance/deploy`          | Deploy a route (or generic config) via the Gateway (Panel 2)     |
| GET    | `/api/v1/fleet/riders`               | List riders, via the Gateway → Driver Subsystem (Panel 2)   |
| POST   | `/api/v1/fleet/riders`               | "Add Rider", via the Gateway → Driver Subsystem (Panel 2)   |
| GET    | `/api/v1/fleet/customers`            | List real customers, via the Gateway → Customer Subsystem, for the route builder (Panel 2) |
| POST   | `/api/v1/audit/reports`              | Generate a filtered audit report + self-log the action (Panel 3) |

### Example: deploy a global route update

```bash
curl -X POST http://localhost:4002/api/v1/compliance/deploy \
  -H "Content-Type: application/json" \
  -d '{
        "admin_user_id": "b3f1c2a0-1111-4a2b-9c3d-000000000000",
        "target_subsystem": "DRIVER",
        "config_payload": { "route_batch": "weekly-central", "effective_date": "2026-08-01" }
      }'
```

### Example: generate an audit report

```bash
curl -X POST http://localhost:4002/api/v1/audit/reports \
  -H "Content-Type: application/json" \
  -d '{
        "admin_user_id": "b3f1c2a0-1111-4a2b-9c3d-000000000000",
        "target_subsystem": "ALL",
        "start_date": "2026-06-01",
        "end_date": "2026-07-24",
        "export_format": "JSON"
      }'
```

## Validation & error handling

- **Deploy Global Route Update**: `admin_user_id`, a valid `target_subsystem`
  (`CUSTOMER|DRIVER|ALL`), and an object `config_payload` are required.
  Client-side, the config textarea is parsed as JSON before sending —
  invalid JSON is caught before any request goes out.
- **Audit report generation**: `admin_user_id`, valid `target_subsystem`,
  parseable `start_date`/`end_date` with `start_date <= end_date`, and a
  valid `export_format` (`JSON|MOCK_PDF`).
- A Gateway failure during deployment returns `502` and marks the audit
  row `CRITICAL` rather than silently succeeding.
- "Mock PDF" is intentionally simulated — a formatted plain-text file with
  a `.pdf` extension, not a real PDF binary — matching the spec's
  "download simulation" requirement without pulling in a PDF-generation
  dependency.

## Tech stack

- **Backend:** Node.js, Express, `pg` (parameterized queries throughout).
- **Frontend:** HTML + Tailwind CSS (CDN) + vanilla JS — sidebar-nav admin
  console layout, no build tooling required.
- **Database:** PostgreSQL, owned exclusively by this subsystem.
