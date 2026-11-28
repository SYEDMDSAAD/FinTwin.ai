-- Spend Guard, connected to the rest of FinTwin.
--
-- spend_guard_state: Spend Guard's own records (the pretend wallet, decisions,
-- wishlist, salary plans) as one encrypted JSON document per user, instead of
-- the guard service's memory, so they survive a restart. summary is a small
-- encrypted JSON of this month's figures (no names, no UPI IDs) that the
-- Copilot reads to answer "how much did pausing save me?".
CREATE TABLE IF NOT EXISTS spend_guard_state (
    user_id     BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state       TEXT        NOT NULL,
    summary     TEXT,
    updated_at  TIMESTAMP   NOT NULL DEFAULT now()
);

-- goal_earmark: money an approved salary plan sets aside for a goal in a month.
-- Goal progress gives that month's real savings to earmarked goals first (up to
-- the earmark), then splits the rest as before, so a rupee still lands on one
-- goal and nothing counts unless it was actually saved. amount is encrypted.
CREATE TABLE IF NOT EXISTS goal_earmark (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id     BIGINT      NOT NULL REFERENCES financial_goal(id) ON DELETE CASCADE,
    month       VARCHAR(7)  NOT NULL,
    amount      TEXT        NOT NULL,
    source      VARCHAR(20) NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT now(),
    CONSTRAINT uq_goal_earmark UNIQUE (goal_id, month, source)
);
CREATE INDEX IF NOT EXISTS idx_goal_earmark_user ON goal_earmark (user_id);
