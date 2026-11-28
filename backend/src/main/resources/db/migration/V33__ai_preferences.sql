-- AI preferences, kept on the server so they follow the user across devices
-- and the Copilot can use them: the mode it answers in by default, and
-- whether Home shows the daily recap.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ai_mode VARCHAR(40),
    ADD COLUMN IF NOT EXISTS daily_insights BOOLEAN NOT NULL DEFAULT TRUE;

-- Money the user put towards a goal by hand ("Add money"): savings they
-- already had, cash, a transfer FinTwin can't see. Counted on top of what
-- the measured monthly savings fund. Encrypted like the other goal amounts.
ALTER TABLE financial_goal
    ADD COLUMN IF NOT EXISTS manual_saved TEXT;
