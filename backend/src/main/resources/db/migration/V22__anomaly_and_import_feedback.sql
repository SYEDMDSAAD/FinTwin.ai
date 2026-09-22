-- Labels for measuring anomaly alerts and statement-import mapping, collected in beta.

-- The user's verdict on an alert, with what made it look unusual. One row per
-- alert (pattern_key = hash of user, type, merchant, amount), latest verdict wins.
CREATE TABLE IF NOT EXISTS anomaly_feedback (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_key  VARCHAR(64)  NOT NULL,
    verdict      VARCHAR(12)  NOT NULL,       -- CONFIRMED / NOT_ANOMALY
    anomaly_type VARCHAR(40),
    merchant     TEXT,                        -- AES-GCM
    category     VARCHAR(100),
    amount       TEXT,                        -- AES-GCM
    avg_amount   TEXT,                        -- AES-GCM
    multiplier   DOUBLE PRECISION,
    severity     VARCHAR(10),
    created_at   TIMESTAMP    NOT NULL,
    UNIQUE (user_id, pattern_key)
);
CREATE INDEX IF NOT EXISTS idx_anomaly_feedback_type ON anomaly_feedback (anomaly_type, verdict);

-- What the import page guessed for a statement's columns, and what the user
-- imported with. Column headers identify the bank's format; no row data.
CREATE TABLE IF NOT EXISTS import_mapping_event (
    id               BIGSERIAL    PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format_key       VARCHAR(64)  NOT NULL,   -- hash of the normalised header row
    headers          TEXT,                    -- the header row, JSON
    file_type        VARCHAR(10),
    detected_format  VARCHAR(40),             -- the extractor's own label, if any
    detected_mapping TEXT,                    -- JSON field → column index
    final_mapping    TEXT,
    changed          BOOLEAN      NOT NULL,
    rows_imported    INTEGER,
    created_at       TIMESTAMP    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_import_mapping_format ON import_mapping_event (format_key);
