-- ============================================================================
-- Salone Clean — CUSTOMER SUBSYSTEM — Local Database Schema
-- ============================================================================
-- IMPORTANT (Decoupling): This schema belongs ONLY to the Customer Subsystem.
-- The Driver Subsystem and Management Subsystem have their own separate
-- databases. This service never joins across services at the DB layer —
-- any cross-subsystem data (e.g. "assign a driver", "notify management")
-- goes out through the API Gateway as an HTTP call, never a SQL query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- needed for gen_random_uuid()

-- Panel 1 & 3: core customer profile + running token balance
CREATE TABLE IF NOT EXISTS customer_subscriptions (
    subscription_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name         VARCHAR(120) NOT NULL,
    phone_number      VARCHAR(20)  UNIQUE NOT NULL,
    email_address     VARCHAR(100),
    neighborhood_tag  VARCHAR(100) NOT NULL,
    street_address    TEXT NOT NULL,
    token_balance     INT NOT NULL DEFAULT 0,
    signature_data    TEXT,
    pin_hash          VARCHAR(255) NOT NULL DEFAULT '', -- salted hash of a 4-digit login PIN, see utils/pin.js
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MIGRATION: if you already had this database from before PIN login was
-- added, running this whole file again is safe — CREATE TABLE IF NOT EXISTS
-- above won't touch an existing table, so this line adds the missing
-- column for you (existing rows get pin_hash = '' and will need to reset
-- their PIN, since there's no way to recover a PIN that was never set).
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255) NOT NULL DEFAULT '';

-- Panel 2 & 3: local ledger of every token purchase / payment attempt.
-- This is intentionally a CUSTOMER-SUBSYSTEM-OWNED table. It records what
-- WE asked the Gateway to do and what it told us back — it is not a mirror
-- of the payment provider's or the management system's own records.
CREATE TABLE IF NOT EXISTS customer_transactions (
    transaction_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id    UUID NOT NULL REFERENCES customer_subscriptions(subscription_id) ON DELETE CASCADE,
    service_tier       VARCHAR(10)  NOT NULL CHECK (service_tier IN ('small', 'medium', 'large')),
    quantity           INT NOT NULL CHECK (quantity > 0),
    tokens_purchased   INT NOT NULL CHECK (tokens_purchased > 0),
    unit_price_sle     NUMERIC(10,2) NOT NULL,
    total_price_sle    NUMERIC(10,2) NOT NULL,
    payment_provider   VARCHAR(20)  NOT NULL CHECK (payment_provider IN ('orange_money', 'africell_money')),
    gateway_reference   VARCHAR(120),                 -- reference id returned by API Gateway / payment rail
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_subscription
    ON customer_transactions (subscription_id, created_at DESC);

-- Notifications sent to a customer — e.g. "your bin was collected". Written
-- either by this subsystem itself, or inbound via the API Gateway when the
-- Driver Subsystem reports a completed pickup for one of our customers.
CREATE TABLE IF NOT EXISTS customer_notifications (
    notification_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id    UUID NOT NULL REFERENCES customer_subscriptions(subscription_id) ON DELETE CASCADE,
    title               VARCHAR(120) NOT NULL,
    message             TEXT NOT NULL,
    source_subsystem    VARCHAR(20) NOT NULL DEFAULT 'customer-subsystem'
                         CHECK (source_subsystem IN ('customer-subsystem', 'driver-subsystem', 'management-subsystem')),
    is_read             BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_subscription
    ON customer_notifications (subscription_id, created_at DESC);

-- Keep updated_at fresh automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_subscriptions_updated_at ON customer_subscriptions;
CREATE TRIGGER trg_customer_subscriptions_updated_at
BEFORE UPDATE ON customer_subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customer_transactions_updated_at ON customer_transactions;
CREATE TRIGGER trg_customer_transactions_updated_at
BEFORE UPDATE ON customer_transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
