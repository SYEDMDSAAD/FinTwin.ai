-- Model tokens used per user, per AI feature, per day, for the admin page.
-- The AI service returns each request's counts in the X-LLM-Usage header and
-- AiTokenUsageService adds them here. One row per user per feature per day
-- keeps the table small however many calls a day brings. Counts only: no
-- prompt or answer text. Deleting the account deletes its usage.
CREATE TABLE IF NOT EXISTS ai_token_usage (
    user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date     DATE         NOT NULL,
    feature        VARCHAR(32)  NOT NULL,
    input_tokens   BIGINT       NOT NULL DEFAULT 0,
    output_tokens  BIGINT       NOT NULL DEFAULT 0,
    calls          INTEGER      NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, usage_date, feature)
);

-- The admin view reads a date range across all users
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_date ON ai_token_usage (usage_date);
