-- A budget approved late in the month (from the drafted plan) starts on the
-- 1st of next month, so spending from before it existed doesn't show as
-- "over budget". NULL means it counts from the start (every budget so far).
ALTER TABLE budget ADD COLUMN IF NOT EXISTS starts_on DATE;
