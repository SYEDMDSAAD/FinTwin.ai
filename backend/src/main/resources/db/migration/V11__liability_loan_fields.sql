-- Liabilities previously tracked only a name, type, and outstanding balance,
-- which made real payment-based debt-to-income impossible to compute (the
-- credit score fell back to balance vs annual income — a leverage ratio with
-- payment-style thresholds that punished any normal car loan or mortgage).
-- interest_rate and emi are encrypted like other money fields, hence TEXT.

ALTER TABLE liability ADD COLUMN interest_rate TEXT;
ALTER TABLE liability ADD COLUMN emi TEXT;
ALTER TABLE liability ADD COLUMN term_months integer;
