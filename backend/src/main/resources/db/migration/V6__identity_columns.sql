-- ─── V6: identity-service columns ────────────────────────────────────────────
-- Added by identity-service V1 migration. Duplicated here so the main backend's
-- Hibernate schema validation passes after the identity service adds these columns.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMP;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,
    issued_at   TIMESTAMP    NOT NULL,
    expires_at  TIMESTAMP    NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT false,
    revoked_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
