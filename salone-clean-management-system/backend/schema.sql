-- ============================================================================
-- Salone Clean — MANAGEMENT SUBSYSTEM — Local Database Schema
-- ============================================================================
-- Decoupling note: this is the ONLY table this subsystem reads/writes.
-- It never joins against the Customer Subsystem's `customer_subscriptions`
-- table or the Driver Subsystem's fleet tables. Anything this subsystem
-- needs from them arrives over HTTP through the API Gateway; anything it
-- wants to change on them (e.g. "deploy a route update") is DISPATCHED to
-- the Gateway, not written directly — and the dispatch itself is what gets
-- audited here.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- needed for gen_random_uuid()

CREATE TABLE IF NOT EXISTS system_compliance_logs (
    log_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id     UUID NOT NULL,
    action_performed  VARCHAR(255) NOT NULL,
    target_subsystem  VARCHAR(50) NOT NULL CHECK (target_subsystem IN ('CUSTOMER', 'DRIVER', 'ALL')),
    payload_snapshot  TEXT,                          -- JSON string of the audited change
    severity_level    VARCHAR(20) NOT NULL DEFAULT 'INFO'
                       CHECK (severity_level IN ('INFO', 'WARNING', 'CRITICAL')),
    timestamp         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_timestamp ON system_compliance_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_subsystem ON system_compliance_logs (target_subsystem);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_severity  ON system_compliance_logs (severity_level);

-- Seed a couple of rows so Panel 2's table and Panel 3's report generator
-- have something to show immediately after a fresh install.
INSERT INTO system_compliance_logs (admin_user_id, action_performed, target_subsystem, payload_snapshot, severity_level)
VALUES
  (gen_random_uuid(), 'SYSTEM_INITIALIZED', 'ALL', '{"note":"Management subsystem provisioned"}', 'INFO'),
  (gen_random_uuid(), 'ROUTE_TEMPLATE_SEEDED', 'DRIVER', '{"routes_seeded":6,"neighborhoods":["Aberdeen","Lumley","Congo Cross"]}', 'INFO')
ON CONFLICT DO NOTHING;
