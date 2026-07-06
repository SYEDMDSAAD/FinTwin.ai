-- Bring insurance_policy and support_tickets into the AES-256/GCM field-encryption
-- scheme that every other financial entity already uses. The entity @Convert
-- annotations do the encrypt/decrypt; this migration only widens the columns so
-- the (larger) ciphertext fits. Existing plaintext rows are read back transparently
-- by the converter's legacy-fallback path and re-encrypted on the next save
-- (or immediately via POST /admin/migrate-encryption).

-- insurance_policy: premium and sum_assured are already TEXT; widen the two
-- bounded VARCHAR columns that now hold ciphertext.
ALTER TABLE insurance_policy ALTER COLUMN provider TYPE TEXT;
ALTER TABLE insurance_policy ALTER COLUMN notes    TYPE TEXT;

-- support_tickets: the free-text message may contain user-supplied PII.
ALTER TABLE support_tickets ALTER COLUMN message TYPE TEXT;
