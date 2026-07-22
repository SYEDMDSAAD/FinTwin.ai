-- Per-user learned categorization rules: when a user manually recategorizes
-- a transaction, the merchant→category mapping is remembered here and applied
-- to all future transactions from the same payee (checked BEFORE global rules).
CREATE TABLE IF NOT EXISTS user_merchant_category (
    id               BIGSERIAL    PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_pattern VARCHAR(400) NOT NULL,   -- normalized (lowercase, trimmed)
    category         VARCHAR(100) NOT NULL,
    created_at       TIMESTAMP,
    updated_at       TIMESTAMP,
    UNIQUE (user_id, merchant_pattern)
);

CREATE INDEX IF NOT EXISTS idx_umc_user
    ON user_merchant_category (user_id);
