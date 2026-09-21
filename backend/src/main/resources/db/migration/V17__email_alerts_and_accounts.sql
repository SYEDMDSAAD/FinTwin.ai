-- Bank alert emails + per-account data coverage.

-- Which account a transaction belongs to, as the user sees it: "HDFC ··1234".
-- Statements and alert emails carry it; coverage ("statement missing for
-- August") is reported per account. Masked, so safe to keep unencrypted.
ALTER TABLE transaction
    ADD COLUMN IF NOT EXISTS account_ref VARCHAR(64);

-- The secret part of the user's forwarding address, u-<token>@<domain>.
-- Knowing it is what lets mail reach the account, so it is random, unique,
-- and rotatable.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ingest_token VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_ingest_token
    ON users (ingest_token) WHERE ingest_token IS NOT NULL;

-- Gmail will not forward to an address until the owner types in the code it
-- mails there. That mail lands with us, so the code is kept to show the user.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS forwarding_code    VARCHAR(32),
    ADD COLUMN IF NOT EXISTS forwarding_code_at TIMESTAMP;

-- One row per email received for a user: what happened to it. No subject or
-- body is stored — only enough to show "HDFC alert, imported, 21 Sep" and to
-- notice when a bank changes its wording and alerts stop matching.
CREATE TABLE IF NOT EXISTS email_ingest_event (
    id             BIGSERIAL    PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    received_at    TIMESTAMP    NOT NULL,
    sender_domain  VARCHAR(255),
    bank           VARCHAR(64),
    status         VARCHAR(20)  NOT NULL,
    detail         VARCHAR(255),
    account_ref    VARCHAR(64),
    transaction_id BIGINT
);
CREATE INDEX IF NOT EXISTS ix_email_ingest_event_user_time
    ON email_ingest_event (user_id, received_at DESC);
