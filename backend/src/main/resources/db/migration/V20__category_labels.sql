-- How each transaction's category was arrived at, and what the user did with it.
-- Collected during beta so categorisation accuracy can be measured per method
-- and, with consent, used as training data later.
ALTER TABLE transaction
    ADD COLUMN IF NOT EXISTS predicted_category   VARCHAR(400),   -- AES-GCM, like category
    ADD COLUMN IF NOT EXISTS category_source      VARCHAR(20),
    ADD COLUMN IF NOT EXISTS category_review      VARCHAR(12),
    ADD COLUMN IF NOT EXISTS category_reviewed_at TIMESTAMP;

-- Stats group by these; both are plain, low-cardinality codes.
CREATE INDEX IF NOT EXISTS idx_txn_category_source ON transaction (category_source, category_review);

-- Opt-in to using anonymised transaction text for improving categorisation.
-- Separate from consent_given_at (sign-up terms); null = not given.
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_consent_at TIMESTAMP;
