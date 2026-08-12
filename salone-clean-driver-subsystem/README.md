# Salone Clean — Driver Subsystem

The field-facing backend for collection drivers/crew. Owns its own database
and reaches the Customer and Management subsystems **only** through the
shared API Gateway — never their databases directly.

```
salone-clean-driver-subsystem/
└── backend/
    ├── schema.sql                    Local DB schema (drivers, routes, tasks, pings, alerts, queue, dispatch_log)
    ├── package.json
    ├── .env.example
    └── src/
        ├── server.js                  Process entrypoint
        ├── app.js                     COMPOSITION ROOT — builds the Observer pipeline, wires routes
        ├── db.js                      Local PostgreSQL pool (this service's DB only)
        ├── models/                    MODEL layer (MVC) — one class per table, all SQL lives here
        │   ├── Driver.js
        │   ├── DriverRoute.js
        │   ├── DriverTask.js
        │   ├── LocationPing.js
        │   ├── Alert.js
        │   ├── StatusQueueItem.js      offline-queue persistence
        │   └── DispatchLog.js          local audit trail
        ├── controllers/                CONTROLLER layer (MVC) — request handling, no SQL, no HTTP wiring
        │   ├── RouteController.js       assigned routes + inbound route ingestion from Management
        │   ├── TaskController.js        job status updates
        │   ├── LocationController.js    location pings
        │   ├── AlertController.js       bin_full / obstruction alerts
        │   └── SyncController.js        offline batch sync + queue retry
        ├── patterns/observers/         OBSERVER PATTERN — see below
        │   ├── Observer.js               abstract interface (update(event))
        │   ├── DispatchEventPublisher.js the Subject
        │   ├── GatewayDispatchObserver.js delivers events to the platform, queues on failure
        │   └── AlertEscalationObserver.js flags urgent alerts (bin_full/obstruction)
        ├── routes/                     Express URL wiring only — no business logic
        ├── middleware/validators.js
        └── utils/
            ├── apiResponse.js           the VIEW layer (MVC) — one response shape, everywhere
            └── gatewayClient.js         the ONLY outbound call to the API Gateway
```

## MVC mapping (for an API-only backend)

There's no server-rendered HTML here, so "View" means **response shaping**,
not templates:

- **Model** — `models/*.js`. Every table has exactly one model class. All
  SQL lives here; controllers never write a query themselves.
- **Controller** — `controllers/*.js`. Classes that handle a request: call
  a model, optionally publish a domain event, call `sendSuccess`/`sendError`.
  No SQL, no `fetch`, no `res.json()` shape decisions.
- **View** — `utils/apiResponse.js`. The one place the `{ success, data |
  error }` envelope is decided. Every controller returns through it, so the
  response shape is consistent platform-wide without controllers repeating it.

## The Observer Pattern (status dispatches & alert broadcasts)

```
Controller.publisher.notify(event)
         │
         ▼
DispatchEventPublisher (Subject)
         │  Promise.allSettled — one observer failing never blocks another
         ├──▶ GatewayDispatchObserver   → POST to API Gateway; on failure,
         │                                enqueue to status_update_queue;
         │                                always write dispatch_log
         └──▶ AlertEscalationObserver   → only reacts to bin_full/obstruction
                                           alerts; logs an urgent notice
```

- **Single Responsibility** — each observer does exactly one job.
  `GatewayDispatchObserver` owns "get this event delivered, with graceful
  degradation to a local queue." `AlertEscalationObserver` owns "flag
  urgent alerts for extra visibility." Neither knows the other exists.
- **Open/Closed** — adding a third observer (an SMS notifier, say) means
  writing one new class and adding one line to `app.js`. Nothing in
  `DispatchEventPublisher`, the existing observers, or any controller
  changes.
- **Liskov Substitution** — every observer implements the same
  `update(event)` contract from `Observer.js`. The publisher calls all of
  them identically; none can assume anything about which others are
  subscribed or in what order.
- **Interface Segregation** — the `Observer` interface is one method.
  Nothing forces an observer to implement functionality it doesn't need.
- **Dependency Inversion** — controllers depend on the abstract
  `DispatchEventPublisher`, injected via their constructor, not on
  `GatewayDispatchObserver`/`AlertEscalationObserver` directly. `app.js` is
  the single composition root where concrete observers get wired in.

This was verified directly (not just by reading the code): a test run
subscribed two recording observers and one that always throws — the
throwing observer's failure was isolated (`Promise.allSettled`), both
recording observers received the event correctly, and `unsubscribe()`
correctly stopped further notifications.

## Network optimization (lean payloads + offline queuing)

- **Lean payloads.** Location pings are `{driver_id, latitude, longitude}`
  — nothing else. Assigned-route responses return only the fields a driver
  screen needs (no verbose nested objects).
- **Offline queuing, two layers deep:**
  1. **Client-side queuing** — `POST /api/v1/sync` accepts a batch of
     items a field client collected while offline, applying each through
     the same Model + Observer pipeline as the live endpoints.
  2. **Server-side queuing** — if `GatewayDispatchObserver` can't reach the
     Gateway (even for a "live" single-item update), it automatically
     queues the event in `status_update_queue` rather than losing it.
     `GET /api/v1/sync/pending/:driverId` retries anything still queued.

## How this integrates with the other two subsystems

- **Inbound from Management:** when Management's route builder deploys a
  route, the Gateway calls this subsystem's `POST /api/v1/routes/ingest`
  with the route + stops to assign. This subsystem auto-provisions the
  driver record by phone number if it's new (a real deployment would
  instead require pre-registered drivers).
- **Rider accounts:** Management's "Add Rider" feature calls the Gateway,
  which calls this subsystem's `POST /api/v1/drivers` — Management never
  writes into this subsystem's database directly.
- **Outbound to the platform:** every task status change, location ping,
  and alert is published through `GatewayDispatchObserver`, which POSTs to
  the Gateway at `/driver-events/task-status`, `/driver-events/location`,
  and `/driver-events/alert`. The shared `salone-clean-mock-gateway`
  project implements all of these, including forwarding a completed
  pickup to the Customer Subsystem as a notification — see that project's
  README for the full cross-subsystem wiring, and the root
  `SALONE-CLEAN-SETUP-GUIDE.md` for a step-by-step test across all four
  services.
- **Never direct:** this subsystem has no code path that queries the
  Customer or Management subsystems' databases. A task's
  `customer_reference` is a plain string (the Customer Subsystem's
  `subscription_id`) plus a point-in-time `address_snapshot` — not a live
  foreign key into another service's data.

## Getting started

```bash
cd backend
cp .env.example .env      # fill in real DB + gateway credentials
npm install

psql -U postgres -c "CREATE DATABASE salone_clean_driver;"
psql -U postgres -d salone_clean_driver -f schema.sql

npm run dev                # http://localhost:4004
```

Health check: `GET http://localhost:4004/health`

The field app itself is `frontend/index.html` — a mobile-first login +
today's-route screen with the collection check button, issue reporting,
alerts, location sharing, and offline-sync retry. Open it directly in a
browser, same as the other two subsystems' frontends.

## API reference

Same envelope as the other two subsystems:
```jsonc
{ "success": true, "message": "OK", "data": { /* ... */ } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

| Method | Path                                   | Purpose |
|--------|------------------------------------------|---------|
| GET    | `/api/v1/routes/:driverId?date=`          | A driver's assigned routes + tasks for a day |
| GET    | `/api/v1/routes/detail/:routeId`          | Full detail for one route |
| POST   | `/api/v1/routes/ingest`                    | Inbound: Gateway pushes a new route assignment (from Management) |
| POST   | `/api/v1/drivers`                           | Inbound: Gateway pushes "Add Rider" (from Management) |
| GET    | `/api/v1/drivers`                           | List all riders |
| POST   | `/api/v1/drivers/login`                     | Phone-number login for the field app |
| PATCH  | `/api/v1/tasks/:taskId/status`             | Update a pickup stop's status |
| POST   | `/api/v1/locations`                        | Record a lean location ping |
| GET    | `/api/v1/locations/:driverId/latest`       | Last known position |
| POST   | `/api/v1/alerts`                            | Raise a `bin_full` / `obstruction` / `other` alert |
| GET    | `/api/v1/alerts/:driverId`                 | Recent alerts from a driver |
| POST   | `/api/v1/sync`                              | Submit a batch of updates queued while offline |
| GET    | `/api/v1/sync/pending/:driverId`           | Retry anything still queued from a failed Gateway dispatch |

### Example: ingest a route assignment (what the Gateway sends)

```bash
curl -X POST http://localhost:4004/api/v1/routes/ingest \
  -H "Content-Type: application/json" \
  -d '{
        "driver_phone_number": "+23276123456",
        "driver_name": "Ibrahim Sesay",
        "route_name": "Aberdeen Morning Run",
        "neighborhood_tags": ["Aberdeen"],
        "scheduled_date": "2026-08-10",
        "source_dispatch_id": "RT-ABC123",
        "tasks": [
          { "customer_reference": "8f3c...uuid", "sequence_order": 1,
            "address_snapshot": "12 Cape Road, near St. Mary Church", "neighborhood_tag": "Aberdeen" }
        ]
      }'
```

### Example: update a task status

```bash
curl -X PATCH http://localhost:4004/api/v1/tasks/<task_id>/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "bin_cleared", "notes": "Bin was overflowing, cleared fully.", "driver_id": "<driver_id>" }'
```

### Example: raise a bin-full alert

```bash
curl -X POST http://localhost:4004/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{ "driver_id": "<driver_id>", "task_id": "<task_id>", "alert_type": "bin_full", "message": "Bin overflowing, needs extra collection." }'
```

## Everything above is wired up

Route ingestion, rider management, and driver-event notifications
(including the customer notification on task completion) are all
implemented in the shared `salone-clean-mock-gateway` project — see its
README for exactly how, and the root `SALONE-CLEAN-SETUP-GUIDE.md` for a
full step-by-step test across all four services.

## Tech stack

- **Backend:** Node.js, Express, `pg` (parameterized queries throughout).
- **Database:** PostgreSQL, owned exclusively by this subsystem.
- **Architecture:** strict MVC + Observer Pattern, SOLID throughout (see
  above for how each principle shows up concretely).
