-- V2: Performance indexes
--
-- All indexes use IF NOT EXISTS for idempotency.
-- Naming convention: idx_{table}_{columns}
--
-- Priority tiers:
--   TIER 1 — Correctness: these queries would do full-table scans without the index
--   TIER 2 — Scale: queries work at 100 rows but become O(n) at 100K+
--   TIER 3 — Covering: INCLUDE() eliminates heap reads for high-frequency queries
--
-- Note: @Table(indexes = {...}) annotations on Transaction and AuditLog entities
--       are now documentation-only. Flyway owns all DDL; Hibernate ddl-auto=validate
--       no longer creates or modifies indexes.

-- ── users ─────────────────────────────────────────────────────────────────────
-- email_hash UNIQUE constraint (created in V1) already creates a B-tree index.

-- TIER 1: Admin stats — countByRole('ADMIN'), countByEnabledTrue(),
--         countByTwoFactorEnabledTrue(), countByOnboardingCompletedTrue()
CREATE INDEX IF NOT EXISTS idx_users_role        ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_enabled     ON users (enabled);
CREATE INDEX IF NOT EXISTS idx_users_tfa         ON users (two_factor_enabled);
CREATE INDEX IF NOT EXISTS idx_users_onboarding  ON users (onboarding_completed);

-- TIER 2: Admin trend queries — countByCreatedAtAfter, findByCreatedAtAfter
CREATE INDEX IF NOT EXISTS idx_users_created_at  ON users (created_at);

-- ── transaction ───────────────────────────────────────────────────────────────

-- TIER 1: Main financial data query — findByUserAndDateAfter(user, threeMonthsAgo)
--         Also covers findByUser and any user+date range query.
CREATE INDEX IF NOT EXISTS idx_txn_user_date     ON transaction (user_id, date);

-- TIER 1: Idempotency check — findByUserAndExternalId prevents duplicate imports
CREATE INDEX IF NOT EXISTS idx_txn_user_ext_id   ON transaction (user_id, external_id);

-- TIER 2: Filtering by source (bank vs manual vs CSV import)
CREATE INDEX IF NOT EXISTS idx_txn_user_source   ON transaction (user_id, source);

-- TIER 3: Category analytics — INCLUDE avoids heap fetch for category+amount aggregations
CREATE INDEX IF NOT EXISTS idx_txn_user_date_cat
    ON transaction (user_id, date DESC)
    INCLUDE (amount, category);

-- ── budget ────────────────────────────────────────────────────────────────────

-- TIER 1: findByUser — without this it's a full-table scan
CREATE INDEX IF NOT EXISTS idx_budget_user_id    ON budget (user_id);

-- ── financial_goal ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_goal_user_id      ON financial_goal (user_id);

-- ── asset / liability ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_asset_user_id     ON asset (user_id);
CREATE INDEX IF NOT EXISTS idx_liability_user_id ON liability (user_id);

-- ── investments ───────────────────────────────────────────────────────────────

-- TIER 1: findByUser
CREATE INDEX IF NOT EXISTS idx_inv_user_id       ON investments (user_id);
-- TIER 2: type filtering for investment breakdown charts
CREATE INDEX IF NOT EXISTS idx_inv_user_type     ON investments (user_id, type);

-- ── chat_history ──────────────────────────────────────────────────────────────

-- TIER 1: findAllByUserOrderByTimestampAsc — the primary chat-load query
CREATE INDEX IF NOT EXISTS idx_chat_user_ts      ON chat_history (user_id, timestamp ASC);

-- ── bank_connection ───────────────────────────────────────────────────────────

-- TIER 1: findByUser
CREATE INDEX IF NOT EXISTS idx_bank_user_id      ON bank_connection (user_id);
-- TIER 1: Setu webhook handler looks up connection by consent_handle and consent_id
CREATE INDEX IF NOT EXISTS idx_bank_consent_handle ON bank_connection (consent_handle);
CREATE INDEX IF NOT EXISTS idx_bank_consent_id     ON bank_connection (consent_id);

-- ── crypto_connections ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_crypto_user_id    ON crypto_connections (user_id);

-- ── notification ──────────────────────────────────────────────────────────────

-- TIER 1: Unread notification count/list — most frequent notification query
CREATE INDEX IF NOT EXISTS idx_notif_user_read    ON notification (user_id, read_status);
-- TIER 2: Ordered notification list (newest first)
CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notification (user_id, created_at DESC);

-- ── support_tickets ───────────────────────────────────────────────────────────

-- TIER 2: Admin dashboard — list tickets by status and creation date
CREATE INDEX IF NOT EXISTS idx_ticket_status_created ON support_tickets (status, created_at DESC);

-- ── blocked_ips ───────────────────────────────────────────────────────────────
-- ip_address UNIQUE constraint (V1) already creates an index for findByIpAddress.

-- TIER 1: isActivelyBlocked queries: WHERE ip_address = ? AND (expires_at IS NULL OR expires_at > ?)
CREATE INDEX IF NOT EXISTS idx_blocked_expires   ON blocked_ips (expires_at)
    WHERE expires_at IS NOT NULL;

-- ── financial_score_history ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_score_user_month  ON financial_score_history (user_id, month);

-- ── audit_log ─────────────────────────────────────────────────────────────────
-- PCI-DSS Req 10: All audit queries need fast index access.
-- The @Table(indexes = {...}) on AuditLog entity defines the same indexes —
-- they are duplicated here because Flyway is the sole DDL authority.

-- TIER 1: PCI-DSS 10.2.1 — per-user accountability
CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log (user_id);
-- TIER 1: PCI-DSS 10.7 — time-based retention and compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp  ON audit_log (timestamp);
-- TIER 1: Filter by action type (LOGIN, READ, WRITE, DELETE, EXPORT)
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log (action);
-- TIER 1: Most common PCI compliance query — user activity in a time range
CREATE INDEX IF NOT EXISTS idx_audit_user_time  ON audit_log (user_id, timestamp);
-- TIER 2: Security queries — all events from a specific IP (incident response)
CREATE INDEX IF NOT EXISTS idx_audit_ip         ON audit_log (ip_address);
-- TIER 3: Partial index — only covers failed logins; tiny footprint, very fast for
--         brute-force detection which is the hottest security dashboard query
CREATE INDEX IF NOT EXISTS idx_audit_failed_login
    ON audit_log (ip_address, timestamp)
    WHERE action = 'LOGIN' AND success = false;
