-- Landing-page visitors, for the admin page's Growth tab. A "visitor" is an
-- anonymous id the browser keeps (the same one the demo uses), so these are
-- browsers, not people. No names, emails, IP addresses or cookies.
-- One row per visitor per day: distinct visitors are a row count, and the
-- table stays small however often someone reloads.
CREATE TABLE IF NOT EXISTS site_visits (
    visitor_id     VARCHAR(40)  NOT NULL,
    visit_date     DATE         NOT NULL,
    first_seen_at  TIMESTAMP    NOT NULL,
    visits         INTEGER      NOT NULL DEFAULT 1,
    source         VARCHAR(60),             -- where they came from, e.g. linkedin.com
    device         VARCHAR(10),             -- mobile | desktop
    PRIMARY KEY (visitor_id, visit_date)
);
CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits (visit_date);
