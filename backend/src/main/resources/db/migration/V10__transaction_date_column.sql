-- Transaction.date was a free-text varchar populated by multiple ingest paths
-- (CSV import stored raw strings with no validation). The 3-month window query
-- compares dates, which only works for ISO values — rows in DD/MM/YYYY or
-- DD-MM-YYYY silently fell out of every financial calculation. Convert the
-- column to a proper DATE, normalizing the formats known to exist.

ALTER TABLE transaction
    ALTER COLUMN date TYPE date
    USING (
        CASE
            -- ISO date, optionally with a time suffix ("2026-07-05T10:15:30")
            WHEN date ~ '^\d{4}-\d{2}-\d{2}' THEN substring(date from 1 for 10)::date
            WHEN date ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(date, 'DD/MM/YYYY')
            WHEN date ~ '^\d{2}-\d{2}-\d{4}$' THEN to_date(date, 'DD-MM-YYYY')
            WHEN date ~ '^\d{4}/\d{2}/\d{2}$' THEN to_date(date, 'YYYY/MM/DD')
            ELSE NULL
        END
    );
