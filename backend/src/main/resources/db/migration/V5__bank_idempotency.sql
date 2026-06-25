-- ─── V5: bank_connection idempotency ─────────────────────────────────────────

-- Stores the last Setu FI session ID that was fully processed for each connection.
-- Used to skip duplicate SESSION_STATUS_UPDATE webhooks that Setu may retry.
ALTER TABLE bank_connection
    ADD COLUMN IF NOT EXISTS last_processed_session_id VARCHAR(255);
