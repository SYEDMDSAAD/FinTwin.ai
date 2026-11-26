-- ─── V31: the weekly report, kept per account per week ──────────────────────
-- The weekly agent writes one report per user per week (Monday-start, IST) on
-- the first visit of the week, so it's waiting in the bell and on Insights
-- instead of needing a "Generate" tap; it used to live only in localStorage.
-- The report JSON is encrypted (it holds income, spending and goals), hence TEXT.

CREATE TABLE IF NOT EXISTS weekly_report (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start  DATE      NOT NULL,
    report      TEXT      NOT NULL,   -- encrypted JSON of WeeklyReportDTO
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    viewed_at   TIMESTAMP,
    UNIQUE (user_id, week_start)
);
