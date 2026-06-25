-- ─── Identity Service V1: refresh tokens + account lockout ──────────────────
-- These columns and tables extend the existing users table managed by the
-- main backend. Flyway uses a separate history table (identity_flyway_history)
-- so this runs independently without conflicting with the main backend migrations.

-- Account lockout fields (added to existing users table)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMP;

-- Refresh token storage
-- token_hash stores SHA-256(rawToken) — the raw token is only sent to the client once.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,
    issued_at   TIMESTAMP    NOT NULL,
    expires_at  TIMESTAMP    NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT false,
    revoked_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
    ON refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
    ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
    ON refresh_tokens (expires_at)
    WHERE revoked = false;
