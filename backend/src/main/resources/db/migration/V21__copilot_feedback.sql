-- How each copilot answer was produced (path, tools, checks, timing), and the
-- user's rating of it. chat_history keeps only a user's last 50 exchanges, so
-- a rated exchange is copied into copilot_feedback, which that trim doesn't
-- touch; deleting the exchange (or the account) deletes its feedback.
ALTER TABLE chat_history
    ADD COLUMN IF NOT EXISTS trace         TEXT,
    ADD COLUMN IF NOT EXISTS rating        SMALLINT,          -- 1 helpful, -1 not
    ADD COLUMN IF NOT EXISTS rating_reason VARCHAR(40);

CREATE TABLE IF NOT EXISTS copilot_feedback (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_id   BIGINT       NOT NULL,       -- chat_history.id; no FK: the trim deletes those rows
    question      TEXT,                        -- AES-GCM, like chat_history
    answer        TEXT,                        -- AES-GCM
    mode          VARCHAR(64),
    rating        SMALLINT     NOT NULL,
    reason        VARCHAR(40),
    path          VARCHAR(30),                 -- trace.path, for grouping
    trace         TEXT,
    created_at    TIMESTAMP    NOT NULL,
    UNIQUE (user_id, exchange_id)
);

CREATE INDEX IF NOT EXISTS idx_copilot_feedback_path ON copilot_feedback (path, rating);
