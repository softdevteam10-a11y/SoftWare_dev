# Salone Clean — Full Local Setup Guide

This guide covers running **all four** pieces of the Salone Clean platform
together on your own machine:

1. **Mock API Gateway** (`salone-clean-mock-gateway`) — stands in for the
   real Gateway. Makes payments, route deploys, rider management, and
   customer notifications actually work end-to-end between the other three.
2. **Customer Subsystem** (`salone-clean-customer-subsystem`) — registration,
   token purchases, notifications, customer dashboard.
3. **Management Subsystem** (`salone-clean-management-system`) — admin
   analytics, riders, route builder, compliance control, audit reports.
4. **Driver Subsystem** (`salone-clean-driver-subsystem`) — the field app:
   assigned routes, the collection check button, alerts, offline sync.

Each has its own README with deeper detail — this is the one-stop
"start everything from zero" guide.

```
                         ┌───────────────────────────┐
                         │      Mock API Gateway       │   port 4003
                         │ payments · routes · riders  │
                         │ analytics · driver-events    │
                         └───┬──────────┬──────────┬───┘
                    ▲        │          │          │        ▲
                    │        ▼          ▼          ▼        │
        ┌───────────┴───┐        ┌─────┴──────┐        ┌────┴──────────┐
        │ Customer       │        │ Management  │        │ Driver         │
        │ Subsystem      │        │ Subsystem   │        │ Subsystem      │
        │ port 4001      │        │ port 4002   │        │ port 4004      │
        │ own Postgres   │        │ own Postgres│        │ own Postgres   │
        └────────────────┘        └─────────────┘        └────────────────┘
             ▲                                                    ▲
             │ browser                                            │ browser
        frontend/index.html                                  frontend/index.html
```

Each subsystem owns its own database and never talks to another
subsystem's database directly — everything crosses between them through
the Gateway. Concretely, the Gateway now wires up:
- **Payments** — Customer ↔ Gateway (Orange Money / Africell Money mock settlement)
- **Route deploys** — Management → Gateway → Driver (a route built in Management shows up on a driver's phone)
- **Rider management** — Management → Gateway → Driver ("Add Rider")
- **Customer picker** — Management → Gateway → Customer (real customers to build a route from)
- **Pickup notifications** — Driver → Gateway → Customer (driver checks a task complete → customer gets notified)
- **Analytics** — Management → Gateway → Customer (real KPI numbers)

---

## 0. Prerequisites (install once)

- **Node.js** (v18+) — https://nodejs.org
- **PostgreSQL** + **pgAdmin 4** (installed together by the standard
  Windows installer) — https://www.postgresql.org/download/windows/
  - During install, you'll set a password for the `postgres` superuser.
    **Write it down** — you'll need it in every `.env` file below.
- A terminal. On Windows, **Command Prompt (`cmd.exe`)** is the path of
  least resistance — PowerShell blocks npm's scripts by default (see
  Troubleshooting below if you'd rather fix PowerShell instead).

---

## 1. Create the three databases

Each subsystem needs its own database (the Gateway has none). Do this once,
using **either** method below.

### Option A — pgAdmin (GUI)
Open pgAdmin 4, expand **Servers → PostgreSQL**, enter your postgres
password. Right-click **Databases** → Create → Database, and create all
three:
- `salone_clean_customers`
- `salone_clean_management`
- `salone_clean_driver`

### Option B — Command Prompt
```bat
psql -U postgres -c "CREATE DATABASE salone_clean_customers;"
psql -U postgres -c "CREATE DATABASE salone_clean_management;"
psql -U postgres -c "CREATE DATABASE salone_clean_driver;"
```

---

## 2. Load each schema

Each project's `backend/schema.sql` creates that subsystem's tables. It's
safe to run against an existing database too — it uses `CREATE TABLE IF NOT
EXISTS` and `ADD COLUMN IF NOT EXISTS`, so re-running it after pulling an
update just adds what's missing.

### Option A — pgAdmin (GUI)
For each of the three databases: click into it in the left tree → toolbar
**Query Tool** → paste that project's `backend/schema.sql` contents → Run.

### Option B — Command Prompt
```bat
cd salone-clean-customer-subsystem\backend
psql -U postgres -d salone_clean_customers -f schema.sql

cd ..\..\salone-clean-management-system\backend
psql -U postgres -d salone_clean_management -f schema.sql

cd ..\..\salone-clean-driver-subsystem\backend
psql -U postgres -d salone_clean_driver -f schema.sql
```

---

## 3. Configure each `.env` file

Copy each `.env.example` to `.env` in the same folder:

```bat
cd salone-clean-mock-gateway
copy .env.example .env

cd ..\salone-clean-customer-subsystem\backend
copy .env.example .env

cd ..\..\salone-clean-management-system\backend
copy .env.example .env

cd ..\..\salone-clean-driver-subsystem\backend
copy .env.example .env
```

Then open each `.env` and check/edit these values:

**`salone-clean-mock-gateway/.env`** — fine as-is (points at the other
three on their default ports).

**`salone-clean-customer-subsystem/backend/.env`**:
```
PORT=4001
PGUSER=postgres
PGPASSWORD=<your real postgres password>
PGDATABASE=salone_clean_customers
API_GATEWAY_BASE_URL=http://localhost:4003/api/v1
CORS_ORIGIN=*
```

**`salone-clean-management-system/backend/.env`**:
```
PORT=4002
PGUSER=postgres
PGPASSWORD=<your real postgres password>
PGDATABASE=salone_clean_management
API_GATEWAY_BASE_URL=http://localhost:4003/api/v1
CORS_ORIGIN=*
```

**`salone-clean-driver-subsystem/backend/.env`**:
```
PORT=4004
PGUSER=postgres
PGPASSWORD=<your real postgres password>
PGDATABASE=salone_clean_driver
API_GATEWAY_BASE_URL=http://localhost:4003/api/v1
CORS_ORIGIN=*
```

> `.env.example` templates ship with placeholder credentials — these
> **must** be replaced with your real postgres username/password, or the
> servers won't start correctly.

---

## 4. Install dependencies (once per project)

```bat
cd salone-clean-mock-gateway
npm install

cd ..\salone-clean-customer-subsystem\backend
npm install

cd ..\..\salone-clean-management-system\backend
npm install

cd ..\..\salone-clean-driver-subsystem\backend
npm install
```

---

## 5. Run all four servers — four separate terminal windows

Open four Command Prompt windows and leave all four running.

**Terminal 1 — Gateway:**
```bat
cd salone-clean-mock-gateway
npm run dev
```
Expect: `[mock-gateway] listening on port 4003`

**Terminal 2 — Customer Subsystem:**
```bat
cd salone-clean-customer-subsystem\backend
npm run dev
```
Expect: `[customer-subsystem] listening on port 4001`

**Terminal 3 — Management Subsystem:**
```bat
cd salone-clean-management-system\backend
npm run dev
```
Expect: `[management-subsystem] listening on port 4002`

**Terminal 4 — Driver Subsystem:**
```bat
cd salone-clean-driver-subsystem\backend
npm run dev
```
Expect: `[driver-subsystem] listening on port 4004`

If any of them prints a Postgres error instead, jump to Troubleshooting.

---

## 6. Open all three frontends

Static files — open each in your browser (double-click, or drag into a
browser window):

- `salone-clean-customer-subsystem/frontend/index.html`
- `salone-clean-management-system/frontend/index.html`
- `salone-clean-driver-subsystem/frontend/index.html`

Each is already pointed at its own backend's port.

---

## 7. Test the full loop — sign-up to notification

This walks through everything wired together, in the order you'd naturally
do it.

1. **Customer app** → Create Account → fill the form (with a 4-digit PIN)
   → Save & Register Profile. You land on the Purchase tab, logged in.
   Note your name/neighborhood — you'll pick yourself as a stop shortly.

2. **Management app** → Compliance Control tab:
   - **Riders card** → Add Rider (any name/phone, e.g. `+23276333333`) → appears in the list.
   - **Route builder card** → select that rider, pick today's date, name
     the route, **check the box next to the customer you just registered**,
     → Deploy Route to Driver Subsystem. You should see a success message
     ("Deployed — 1 stop(s) assigned to ...").

3. **Driver app** → Rider log in → use the **same phone number** you just
   added as a rider → Log In. The Route tab should show the route you just
   deployed, with your customer's address as a stop.

4. **Driver app** → tap the check button on that stop. Toast confirms
   "Marked collected — customer notified."

5. **Customer app** → Dashboard tab → the Notifications section should now
   show "Your bin was collected" — this traveled Driver → Gateway →
   Customer without either subsystem touching the other's database.

6. **Management app** → Dashboard view → KPI cards reflect real registered
   customers / tokens redeemed, computed the same way as before.

If all six steps work, the whole platform is wired up correctly.

**Bonus checks in the Driver app's Activity tab:** "Share my location"
(uses browser geolocation), "Report" on a task (bin_full/obstruction — try
it against a Delayed or Inaccessible stop), and "Retry pending sync"
(retries anything that got queued if the Gateway was briefly unreachable —
you likely won't have anything queued in a normal run, and that's correct).

---

## Troubleshooting — errors we've already solved once

| Symptom | Cause | Fix |
|---|---|---|
| `running scripts is disabled on this system` | PowerShell blocks npm's `.ps1` script by default | Use **Command Prompt** instead of PowerShell, or run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in PowerShell first |
| `ECONNREFUSED ::1:5432` / `127.0.0.1:5432` | PostgreSQL isn't installed or isn't running | Install PostgreSQL, confirm the Windows service is "Running" (search "Services" in the Start menu) |
| `password authentication failed for user "..."` | `.env`'s `PGUSER` doesn't match a real Postgres user | Set `PGUSER=postgres` and `PGPASSWORD=<your real password>` |
| `client password must be a string` | `.env` file doesn't exist (or was saved as `.env.txt`) | In File Explorer, enable "File name extensions" (View menu), confirm the file is exactly named `.env` |
| `relation "..." does not exist` | Database created, but `schema.sql` was never run against it | Run `schema.sql` via pgAdmin's Query Tool or `psql -f schema.sql` against that specific database |
| `Could not load ...` in the browser, but `/health` loads fine | CORS blocking the page's `file://` origin | Set `CORS_ORIGIN=*` in that backend's `.env` and restart |
| Payment never completes | Mock gateway isn't running, or `API_GATEWAY_BASE_URL` isn't `http://localhost:4003/api/v1` | Start Terminal 1 first; check the Customer Subsystem's `.env` |
| Route doesn't show up in the Driver app | Driver Subsystem isn't running, or the rider's phone number in Management doesn't exactly match the one used to log in on the Driver app | Confirm Terminal 4 is running; phone numbers must match exactly (same `+` prefix, same digits) |
| Customer never sees the notification | Gateway can't reach the Customer Subsystem, or the task had no `customer_reference` (only tasks built from the Management route-builder's customer picker carry one) | Check Terminal 1's log for "Notified customer ..."; rebuild the route using the customer picker, not a manually-typed stop |
| Any `.env` edit doesn't take effect | `.env` is only read once, at startup | Stop the server (`Ctrl+C`) and run `npm run dev` again |

**General debugging tip:** the terminal running `npm run dev` always logs
the real underlying error above the generic "Could not..." message shown
in the browser — and with four services now, **check the Gateway's
terminal (Terminal 1) first** for cross-subsystem issues, since it's the
one relaying every request between the other three.

---

## Quick reference

| Service | Port | Health check | Database |
|---|---|---|---|
| Mock API Gateway | 4003 | http://localhost:4003/health | none |
| Customer Subsystem | 4001 | http://localhost:4001/health | `salone_clean_customers` |
| Management Subsystem | 4002 | http://localhost:4002/health | `salone_clean_management` |
| Driver Subsystem | 4004 | http://localhost:4004/health | `salone_clean_driver` |
