-- The shared demo account ("Try the demo", no sign-up). Everyone who tries it
-- uses the same read-only account, filled with generated sample data and
-- rebuilt nightly by DemoAccountService.
--
-- Visitors are told apart by a session id carried in their demo token. These
-- tables say how the demo is used, for the admin page, and are kept apart
-- from real users' data. No names, emails or IP addresses: a "visitor" is an
-- anonymous id the browser keeps.

-- Each visitor's copilot chat, within the one account: follow-up questions
-- need it, and no visitor should see another's
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS demo_session VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_chat_history_demo_session
    ON chat_history (demo_session) WHERE demo_session IS NOT NULL;

-- One row per click on "Try the demo"
CREATE TABLE IF NOT EXISTS demo_sessions (
    id            VARCHAR(40) PRIMARY KEY,
    visitor_id    VARCHAR(40),             -- the browser's anonymous id, to count distinct visitors
    started_at    TIMESTAMP   NOT NULL,
    last_seen_at  TIMESTAMP   NOT NULL,
    device        VARCHAR(10),             -- mobile | desktop
    source        VARCHAR(60)              -- where they came from, e.g. linkedin.com
);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_started ON demo_sessions (started_at);

-- What a session did: pages opened, copilot questions (about the sample data,
-- so nothing personal), actions the read-only demo turned away, sign-up clicks
CREATE TABLE IF NOT EXISTS demo_events (
    id          BIGSERIAL    PRIMARY KEY,
    session_id  VARCHAR(40)  NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE,
    at          TIMESTAMP    NOT NULL,
    kind        VARCHAR(16)  NOT NULL,     -- page | question | blocked | signup_click
    detail      VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS idx_demo_events_session ON demo_events (session_id);
CREATE INDEX IF NOT EXISTS idx_demo_events_at ON demo_events (at);
