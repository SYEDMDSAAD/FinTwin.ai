-- ─── V32: holdings imported from a CAS, with their transactions ─────────────
-- A Consolidated Account Statement (CAMS/KFintech for funds, NSDL/CDSL for
-- demat) brings in every holding at once, with each purchase, SIP instalment,
-- redemption and dividend. The transactions are what returns (XIRR) and tax
-- harvesting are worked out from. ISIN and folio tail are encrypted like the
-- holding's name: together they say what a person owns.

ALTER TABLE investments ADD COLUMN IF NOT EXISTS isin       VARCHAR(512);  -- encrypted
ALTER TABLE investments ADD COLUMN IF NOT EXISTS folio_tail VARCHAR(512);  -- encrypted, last 4 digits only
ALTER TABLE investments ADD COLUMN IF NOT EXISTS source     VARCHAR(20);   -- CAMS | KFINTECH | NSDL | CDSL; null = added by hand
ALTER TABLE investments ADD COLUMN IF NOT EXISTS units_as_of DATE;         -- the statement date the units are from
ALTER TABLE investments ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20);  -- EQUITY | DEBT | HYBRID | … from the CAS (taxed differently)

CREATE TABLE IF NOT EXISTS holding_transaction (
    id            BIGSERIAL   PRIMARY KEY,
    investment_id BIGINT      NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    txn_date      DATE        NOT NULL,
    kind          VARCHAR(30) NOT NULL,   -- PURCHASE, PURCHASE_SIP, REDEMPTION, DIVIDEND_PAYOUT, …
    amount        TEXT,                   -- encrypted; + into the fund, − out of it
    units         TEXT,                   -- encrypted
    nav           TEXT                    -- encrypted
);
CREATE INDEX IF NOT EXISTS idx_holding_transaction_investment ON holding_transaction (investment_id, txn_date);
