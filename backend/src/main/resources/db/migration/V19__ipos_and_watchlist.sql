-- IPOs and a stock/fund watchlist for the Discover page.

-- Catalog of IPOs, maintained by admins (no scraping: NSE's site data is
-- unofficial and its terms restrict automated collection). Users see open,
-- upcoming and recently listed issues and can track their application.
CREATE TABLE IF NOT EXISTS ipo_listing (
    id               BIGSERIAL     PRIMARY KEY,
    name             VARCHAR(200)  NOT NULL,
    symbol           VARCHAR(40),              -- NSE symbol once known, e.g. NEWCO
    category         VARCHAR(20)   NOT NULL DEFAULT 'Mainboard',   -- Mainboard | SME
    price_band_low   NUMERIC(12,2),
    price_band_high  NUMERIC(12,2),
    issue_price      NUMERIC(12,2),            -- final price, after the book is built
    lot_size         INTEGER,
    open_date        DATE,
    close_date       DATE,
    allotment_date   DATE,
    listing_date     DATE,
    notes            VARCHAR(1000),
    created_at       TIMESTAMP     NOT NULL DEFAULT now(),
    updated_at       TIMESTAMP     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ipo_listing_dates ON ipo_listing (open_date, listing_date);

-- A holding of type IPO moves APPLIED → ALLOTTED | NOT_ALLOTTED → LISTED.
ALTER TABLE investments
    ADD COLUMN IF NOT EXISTS ipo_status     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ipo_listing_id BIGINT REFERENCES ipo_listing(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS watchlist_item (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        VARCHAR(10)  NOT NULL,         -- STOCK | FUND
    symbol      VARCHAR(40)  NOT NULL,         -- NSE/BSE symbol, or AMFI scheme code
    name        VARCHAR(200) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT ux_watchlist_user_item UNIQUE (user_id, kind, symbol)
);
