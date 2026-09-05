-- The daily recap answers "what has happened since you last looked", so it
-- needs to know when that was. Distinct from last_login_at: a session can span
-- days, and opening the app is not the same as having read the recap.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_recap_seen_at TIMESTAMP;

-- Left NULL for existing users on purpose. A NULL reads as "never seen", which
-- the service answers with a first-visit recap over a fixed recent window
-- rather than the user's entire history.
