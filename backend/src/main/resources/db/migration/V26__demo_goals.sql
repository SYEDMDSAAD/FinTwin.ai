-- Goals in the shared demo account. A visitor can build goals and regenerate
-- the sample ones, but everyone in the demo is one account, so each visitor's
-- goals carry their demo session and only they see them. Regenerating a
-- sample goal makes the visitor their own copy (demo_replaces = the sample's
-- id), which takes its place for them alone. All of it goes at the nightly
-- rebuild. Both columns stay NULL for real users.
ALTER TABLE financial_goal ADD COLUMN IF NOT EXISTS demo_session VARCHAR(40);
ALTER TABLE financial_goal ADD COLUMN IF NOT EXISTS demo_replaces BIGINT;
