-- ============================================================================
-- Salone Clean — DRIVER SUBSYSTEM — Local Database Schema
-- ============================================================================
-- Decoupling note: this schema belongs ONLY to the Driver Subsystem. It
-- never joins against the Customer Subsystem's `customer_subscriptions`
-- table or the Management Subsystem's `system_compliance_logs`. Where a
-- task needs to reference a customer, it stores the Customer Subsystem's
-- subscription_id as an opaque external reference plus a point-in-time
-- address snapshot — not a live foreign key into another service's DB.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- needed for gen_random_uuid()

-- Field crew identities for this subsystem's own login/session purposes.
-- (A separate driver-management HR system, if one existed, would be its own
-- subsystem — this table is scoped to what the field app itself needs.)
CREATE TABLE IF NOT EXISTS drivers (
    driver_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(120) NOT NULL,
    phone_number    VARCHAR(20)  UNIQUE NOT NULL,
    vehicle_label   VARCHAR(60),                 -- e.g. "Truck 07"
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A collection route assigned to a driver for a given day. `source_dispatch_id`
-- correlates back to the Management Subsystem's compliance log entry for the
-- "Deploy Global Route Update" that created this route, purely for traceability
-- — it is a plain string, not a cross-service foreign key.
CREATE TABLE IF NOT EXISTS driver_routes (
    route_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
    route_name          VARCHAR(120) NOT NULL,
    neighborhood_tags   TEXT[] NOT NULL DEFAULT '{}',
    scheduled_date       DATE NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'assigned'
                          CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
    source_dispatch_id   VARCHAR(120), -- traceability back to a Management route-update dispatch
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_routes_driver_date
    ON driver_routes (driver_id, scheduled_date DESC);

-- Individual pickup stops within a route. `customer_reference` is the
-- Customer Subsystem's subscription_id, stored as an opaque string — this
-- subsystem never reads the Customer Subsystem's database directly.
CREATE TABLE IF NOT EXISTS driver_tasks (
    task_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id             UUID NOT NULL REFERENCES driver_routes(route_id) ON DELETE CASCADE,
    customer_reference   VARCHAR(64),             -- external Customer Subsystem subscription_id
    sequence_order       INT NOT NULL DEFAULT 0,
    address_snapshot     TEXT NOT NULL,           -- address at time of assignment (this subsystem owns no live copy)
    neighborhood_tag     VARCHAR(100) NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'bin_cleared', 'completed', 'delayed', 'inaccessible')),
    status_notes         TEXT,
    completed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_tasks_route
    ON driver_tasks (route_id, sequence_order);

-- Lean location pings. Deliberately narrow (id, driver, coords, time) to
-- keep payloads small over field mobile connections.
CREATE TABLE IF NOT EXISTS driver_location_pings (
    ping_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
    route_id       UUID REFERENCES driver_routes(route_id) ON DELETE SET NULL,
    latitude       NUMERIC(9,6) NOT NULL,
    longitude      NUMERIC(9,6) NOT NULL,
    recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_pings_driver_time
    ON driver_location_pings (driver_id, recorded_at DESC);

-- Field-raised alerts (e.g. "bin full", "obstruction") that get dispatched
-- outward via the Observer pipeline (see patterns/observers).
CREATE TABLE IF NOT EXISTS driver_alerts (
    alert_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
    task_id        UUID REFERENCES driver_tasks(task_id) ON DELETE SET NULL,
    route_id       UUID REFERENCES driver_routes(route_id) ON DELETE SET NULL,
    alert_type     VARCHAR(30) NOT NULL CHECK (alert_type IN ('bin_full', 'obstruction', 'other')),
    message        TEXT,
    dispatched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged   BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_alerts_driver_time ON driver_alerts (driver_id, dispatched_at DESC);

-- Offline-first support: the field client can queue task-status updates,
-- location pings, and alerts locally when signal drops, then POST them here
-- as a batch via /api/v1/sync when connectivity returns. `payload_json`
-- keeps this table generic across the three event kinds it can hold.
CREATE TABLE IF NOT EXISTS status_update_queue (
    queue_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      UUID NOT NULL REFERENCES drivers(driver_id) ON DELETE CASCADE,
    payload_type   VARCHAR(20) NOT NULL CHECK (payload_type IN ('task_status', 'location_ping', 'alert')),
    payload_json   TEXT NOT NULL,
    sync_status    VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (sync_status IN ('pending', 'synced', 'failed')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    synced_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_status_queue_pending
    ON status_update_queue (driver_id, sync_status) WHERE sync_status = 'pending';

-- Local audit trail of everything the Observer pipeline dispatched outward
-- (or attempted to). Written by patterns/observers/LocalAuditObserver.js —
-- this is this subsystem's own record, independent of whatever the Gateway
-- or Management Subsystem does with the same event.
CREATE TABLE IF NOT EXISTS dispatch_log (
    log_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type         VARCHAR(30) NOT NULL, -- 'task_status' | 'location_ping' | 'alert'
    payload_snapshot   TEXT NOT NULL,
    dispatch_status    VARCHAR(20) NOT NULL CHECK (dispatch_status IN ('success', 'failed', 'queued')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_log_time ON dispatch_log (created_at DESC);

-- Keep updated_at fresh automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_driver_routes_updated_at ON driver_routes;
CREATE TRIGGER trg_driver_routes_updated_at
BEFORE UPDATE ON driver_routes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_driver_tasks_updated_at ON driver_tasks;
CREATE TRIGGER trg_driver_tasks_updated_at
BEFORE UPDATE ON driver_tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
