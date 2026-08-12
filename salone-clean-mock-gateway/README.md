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
| `POST /api/v1/payments/initialize` | Orange Money / Africell Money settlement | Settles **immediately** — it decides the outcome, calls the Customer Subsystem's webhook right away (before responding), and only then replies. By the time the Customer Subsystem's initial response reaches the frontend, the transaction is already `completed` (tokens credited) or `failed` — no "processing" wait, since there's no real mobile money network here to actually wait on. |
| `POST /api/v1/routes/broadcast` | Driver Subsystem route dispatch | If the payload looks like a real route assignment (has `driver_phone_number`, `route_name`, `tasks`) and targets `DRIVER`/`ALL`, this **forwards it for real** to the Driver Subsystem's `POST /routes/ingest` — a route built in Management's route builder actually shows up on a driver's phone. Otherwise it just acknowledges (for generic config pushes). |
| `POST /api/v1/driver-events/task-status` | Platform hearing about a driver's status update | Logs it. If the status is `completed`/`bin_cleared` **and** the task carries a `customer_reference`, forwards a notification to the Customer Subsystem — this is the "customer gets notified after the rider checks the trash" link. |
| `POST /api/v1/driver-events/location` / `/alert` | Platform hearing about a location ping / field alert | Logs it (reference implementation — wire in real alerting/tracking as needed). |
| `GET /api/v1/customers/list` | Gateway proxy to the Customer Subsystem | Used by Management's route builder to pick real customers as pickup stops. |
| `GET`/`POST /api/v1/drivers` | Gateway proxy to the Driver Subsystem | Used by Management's Riders panel to list riders and "Add Rider". |
| `GET /api/v1/analytics/aggregate` | Gateway's cross-subsystem analytics fan-out | Calls the Customer Subsystem's real aggregate-summary endpoint and returns it as-is: total registered customers, total tokens redeemed, pending/failed transaction count, and tokens purchased per neighborhood. **Nothing on the Management dashboard is simulated.** If this call fails, the dashboard shows an honest "unavailable" banner instead of a fake number. |

## Testing a failed payment on purpose

Use a mobile money number that **ends in `0000`** (e.g. `+23276000000`) when
testing a purchase in the Customer Subsystem. The mock gateway will settle
that transaction as `failed` instead of `completed` — instantly, same as a
success — so you can see that path in the UI without needing a real
declined payment.

## Running all four services together

See the root `SALONE-CLEAN-SETUP-GUIDE.md` for the complete step-by-step
(databases, `.env` files, four terminal windows, and a full sign-up →
route deploy → collection → notification test across every service). The
short version:

```bash
# Terminal 1
cd salone-clean-mock-gateway && cp .env.example .env && npm install && npm run dev

# Terminal 2
cd salone-clean-customer-subsystem/backend && npm run dev

# Terminal 3
cd salone-clean-management-system/backend && npm run dev

# Terminal 4
cd salone-clean-driver-subsystem/backend && npm run dev
```

Then open all three `frontend/index.html` files (Customer, Management,
Driver). Each backend's `.env.example` already points its
`API_GATEWAY_BASE_URL` at `http://localhost:4003/api/v1`.

> If you already had `.env` files from before this update, add/update the
> `API_GATEWAY_BASE_URL` line in each to `http://localhost:4003/api/v1` and
> restart those servers — `.env` is only read on startup.

## What's no longer simulated

As of this update, the Management dashboard runs entirely on real data —
total registered customers, tokens redeemed, pending/failed transactions,
and the neighborhood chart are all computed from what customers actually
entered in the Customer Subsystem. There is no Driver Subsystem in this
local setup, so fleet-specific metrics (trucks, live locations) simply
aren't shown at all, rather than being faked. If the Gateway or Customer
Subsystem is unreachable, the dashboard shows a clear "live data
unavailable" banner instead of guessing.
