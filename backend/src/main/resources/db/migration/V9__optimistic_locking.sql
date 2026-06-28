-- Optimistic locking (@Version) on write-heavy / concurrently-updated entities.
-- Hibernate manages the value; existing rows start at 0 via the column default.
ALTER TABLE users          ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE transaction    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE asset          ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE liability      ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE budget         ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE financial_goal ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE investments    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
