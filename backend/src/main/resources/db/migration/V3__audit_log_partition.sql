-- V3: audit_log monthly range partitioning
--
-- WHY: audit_log is the fastest-growing table.
--   100K users × 20 actions/day = 2M rows/day = ~60M rows/month.
--   Without partitioning, PCI-DSS compliance queries (time-range scans),
--   brute-force detection, and the nightly retention DELETE all scan the full table.
--
-- HOW: PostgreSQL declarative range partitioning by timestamp, one partition per month.
--   - New rows automatically route to the correct month partition
--   - Time-range queries hit only the relevant partition(s) — massive speedup
--   - Retention deletes (AuditRetentionService) can DROP old partitions instead of
--     row-by-row DELETE — O(1) instead of O(n)
--   - Each partition is a separate physical file; VACUUM works per-partition
--
-- ENTITY CHANGE: AuditLog.java @GeneratedValue must use SEQUENCE (not IDENTITY).
--   IDENTITY uses DB-generated sequences per-table; the partitioned parent cannot use IDENTITY.
--   The AuditLog entity is updated alongside this migration (same commit).
--
-- ASSUMPTION: Running against a fresh Supabase project with no existing audit_log rows.
--   If audit_log has data, use the data migration approach at the bottom of this file.

-- ── Step 1: Drop the existing regular table first ────────────────────────────
-- IMPORTANT: The V1 BIGSERIAL column auto-creates a sequence named audit_log_id_seq
-- and marks it OWNED BY audit_log.id.  PostgreSQL drops owned sequences when the
-- owning table is dropped.  We must drop the table BEFORE creating the new sequence
-- so there's no name conflict and the new sequence has the correct INCREMENT.
DROP TABLE IF EXISTS audit_log;

-- ── Step 2: Dedicated sequence for audit_log IDs ─────────────────────────────
-- BIGSERIAL can't be used on a partitioned table parent.
-- allocationSize=50 in the entity matches INCREMENT 50 here.
-- If V3 is applied to a DB that never ran V1, the DROP above was a no-op and
-- the sequence didn't exist yet — CREATE SEQUENCE proceeds normally in both cases.
CREATE SEQUENCE IF NOT EXISTS audit_log_id_seq
    AS BIGINT
    START 1
    INCREMENT 50
    CACHE 50;

-- ── Step 3: Create the partitioned parent table ───────────────────────────────
CREATE TABLE audit_log (
    id             BIGINT       NOT NULL DEFAULT nextval('audit_log_id_seq'),
    user_id        BIGINT,
    action         VARCHAR(50)  NOT NULL,
    resource       VARCHAR(100) NOT NULL,
    description    VARCHAR(500),
    ip_address     VARCHAR(45),
    user_agent     VARCHAR(512),
    http_method    VARCHAR(10),
    request_uri    VARCHAR(500),
    timestamp      TIMESTAMP    NOT NULL,
    success        BOOLEAN      NOT NULL,
    failure_reason VARCHAR(1000),
    -- PG partitioned table PKs must include the partition key.
    -- Hibernate @Id on (id) still works: id is globally unique via sequence,
    -- and Hibernate validate does not check composite PK composition.
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- ── Step 3: Create initial partitions — current month + 12 months forward ────
-- A DO block runs at migration time to create the correct month boundaries.
DO $$
DECLARE
    start_date  DATE;
    end_date    DATE;
    part_name   TEXT;
    i           INTEGER;
BEGIN
    FOR i IN 0..12 LOOP
        start_date := DATE_TRUNC('month', NOW() + (i || ' months')::INTERVAL)::DATE;
        end_date   := (start_date + INTERVAL '1 month')::DATE;
        part_name  := 'audit_log_' || TO_CHAR(start_date, 'YYYY_MM');

        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
                part_name, start_date, end_date
            );
        END IF;
    END LOOP;
END;
$$;

-- Default partition: catches rows with timestamps outside any explicit partition.
-- In practice this should never receive rows; it's a safety net.
CREATE TABLE IF NOT EXISTS audit_log_default PARTITION OF audit_log DEFAULT;

-- ── Step 4: Re-create indexes on the parent ───────────────────────────────────
-- PostgreSQL automatically propagates parent indexes to new partitions.
-- Existing partitions created above also inherit these.

CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp  ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_user_time  ON audit_log (user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_ip         ON audit_log (ip_address);

-- Partial index for brute-force detection — only failed login rows
CREATE INDEX IF NOT EXISTS idx_audit_failed_login
    ON audit_log (ip_address, timestamp)
    WHERE action = 'LOGIN' AND success = false;

-- ── Step 5: Auto-create-next-month function ───────────────────────────────────
-- Called by pg_cron on the 1st of each month to pre-create the upcoming partition.
-- Pre-creating avoids any INSERT latency when a new month begins.
CREATE OR REPLACE FUNCTION audit_log_create_next_partition()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month')::DATE;
    end_month  DATE := (next_month + INTERVAL '1 month')::DATE;
    part_name  TEXT := 'audit_log_' || TO_CHAR(next_month, 'YYYY_MM');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
            part_name, next_month, end_month
        );
        RAISE NOTICE 'Created audit_log partition: %', part_name;
    ELSE
        RAISE NOTICE 'Partition already exists: %', part_name;
    END IF;
END;
$$;

-- ── Step 6: Schedule partition creation via pg_cron ──────────────────────────
-- Supabase enables pg_cron by default in the Dashboard → Database → Extensions.
-- Runs at 00:05 UTC on the 1st of each month.
-- If pg_cron is not enabled, this block is silently skipped.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove old schedule if it exists, then re-register
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-log-create-partition') THEN
            PERFORM cron.unschedule('audit-log-create-partition');
        END IF;
        PERFORM cron.schedule(
            'audit-log-create-partition',
            '5 0 1 * *',
            'SELECT audit_log_create_next_partition()'
        );
        RAISE NOTICE 'pg_cron job scheduled: audit-log-create-partition';
    ELSE
        RAISE NOTICE 'pg_cron not available — schedule audit_log_create_next_partition() manually';
    END IF;
END;
$$;

-- ── Retention optimization hint ───────────────────────────────────────────────
-- Once partitioned, AuditRetentionService can DROP old partitions instead of
-- running DELETE WHERE timestamp < cutoff. Example for dropping a specific month:
--
--   DROP TABLE IF EXISTS audit_log_2025_01;
--
-- This is O(1) vs O(n) row delete and does not bloat the WAL or require VACUUM.
-- Update AuditRetentionService to use this when implementing retention at scale.

-- ── Data migration (for existing data) ───────────────────────────────────────
-- If audit_log already has rows when this migration runs:
--
--   1. Replace "DROP TABLE IF EXISTS audit_log" above with:
--        ALTER TABLE audit_log RENAME TO audit_log_old;
--
--   2. After creating the partitioned table, copy data in batches:
--        INSERT INTO audit_log SELECT * FROM audit_log_old
--          WHERE timestamp >= 'YYYY-MM-01' AND timestamp < 'YYYY-MM-01'::DATE + INTERVAL '1 month';
--        -- Repeat for each month present in audit_log_old
--
--   3. Drop the backup:
--        DROP TABLE audit_log_old;
