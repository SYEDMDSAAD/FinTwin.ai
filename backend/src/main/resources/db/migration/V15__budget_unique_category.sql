-- One budget per (user, category). BudgetService pre-checks this, but the
-- check-then-insert races under concurrent requests — this index is the real
-- guard; the service translates its violation into the same 409.

-- Remove any duplicates the race already produced, keeping the oldest row
-- (lowest id) so the longest-standing limit survives.
DELETE FROM budget b
USING budget dup
WHERE b.user_id = dup.user_id
  AND lower(b.category) = lower(dup.category)
  AND b.id > dup.id;

-- Matching is case-insensitive everywhere in the service layer, so the
-- constraint must be too.
CREATE UNIQUE INDEX IF NOT EXISTS ux_budget_user_category
    ON budget (user_id, lower(category));
