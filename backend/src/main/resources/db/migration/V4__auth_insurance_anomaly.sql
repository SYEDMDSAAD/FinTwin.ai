-- ─── V4: email verification, password reset, insurance, anomaly dismiss ──────

-- 1. users: email verification + password reset columns
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified              BOOLEAN      NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_verification_otp      VARCHAR(64),
    ADD COLUMN IF NOT EXISTS email_verification_expiry   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS password_reset_token        VARCHAR(64),
    ADD COLUMN IF NOT EXISTS password_reset_expiry       TIMESTAMP;

-- Index for O(1) token lookup on the forgot-password flow
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
    ON users (password_reset_token)
    WHERE password_reset_token IS NOT NULL;

-- 2. insurance_policy table
CREATE TABLE IF NOT EXISTS insurance_policy (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         VARCHAR(50),
    provider     VARCHAR(512),   -- AES-GCM encrypted
    premium      TEXT,           -- AES-GCM encrypted Double
    frequency    VARCHAR(20),
    sum_assured  TEXT,           -- AES-GCM encrypted Double
    renewal_date DATE,
    notes        VARCHAR(1400),  -- AES-GCM encrypted
    created_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_insurance_user_id
    ON insurance_policy (user_id);

CREATE INDEX IF NOT EXISTS idx_insurance_renewal
    ON insurance_policy (user_id, renewal_date);

-- 3. dismissed_anomaly_pattern table
CREATE TABLE IF NOT EXISTS dismissed_anomaly_pattern (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(50),
    merchant     VARCHAR(400),
    category     VARCHAR(255),
    created_at   TIMESTAMP,
    UNIQUE (user_id, anomaly_type, merchant)
);

CREATE INDEX IF NOT EXISTS idx_dismissed_anomaly_user
    ON dismissed_anomaly_pattern (user_id);
