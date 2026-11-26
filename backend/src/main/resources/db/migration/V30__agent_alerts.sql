-- ─── V30: what FinTwin's agents did or noticed, for the bell ────────────────
-- The sorting agent writes one row per run that sorted payees; the watch
-- agent one row per unusual payment it flags (pattern_key dedupes, so the
-- same alert is never raised twice). The message is encrypted (it names
-- payees and amounts), hence TEXT. Rows go with the user.

CREATE TABLE IF NOT EXISTS agent_alert (
    id            BIGSERIAL   PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent         VARCHAR(10) NOT NULL,     -- SORT | WATCH
    pattern_key   VARCHAR(64) NOT NULL,
    severity      VARCHAR(10),
    anomaly_type  VARCHAR(40),
    merchant      TEXT,                     -- encrypted; to hide the alert once its anomaly is dismissed
    message       TEXT        NOT NULL,     -- encrypted
    created_at    TIMESTAMP   NOT NULL DEFAULT now(),
    UNIQUE (user_id, pattern_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_alert_user_created ON agent_alert (user_id, created_at DESC);
