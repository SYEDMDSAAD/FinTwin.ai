-- ─── V29: SIPs, US holdings and the fund watchlist move off the device ──────
-- These lived only in the browser's localStorage, so they vanished on a new
-- phone and no server-side job (or AI agent) could see them. Amounts, names
-- and notes are AES-256/GCM encrypted by the entity converters, hence TEXT.
-- Everything cascades with the user row; a goal's deletion just unlinks its SIP.

CREATE TABLE IF NOT EXISTS sip_plan (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id         BIGINT      REFERENCES financial_goal(id) ON DELETE SET NULL,
    fund_name       TEXT        NOT NULL,   -- encrypted
    amount          TEXT        NOT NULL,   -- encrypted BigDecimal, per debit
    frequency       VARCHAR(20) NOT NULL DEFAULT 'Monthly',
    next_debit_date DATE,
    notes           TEXT,                   -- encrypted
    created_at      TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sip_plan_user ON sip_plan (user_id);
-- At most one SIP is linked to a given goal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sip_plan_goal ON sip_plan (goal_id) WHERE goal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS us_holding (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT      NOT NULL,   -- encrypted
    ticker      TEXT,                 -- encrypted
    units       TEXT      NOT NULL,   -- encrypted Double
    buy_price   TEXT      NOT NULL,   -- encrypted BigDecimal, USD per unit
    buy_date    DATE,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_us_holding_user ON us_holding (user_id);

CREATE TABLE IF NOT EXISTS fund_watch (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheme_code VARCHAR(20)  NOT NULL,
    scheme_name VARCHAR(300) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT now(),
    UNIQUE (user_id, scheme_code)
);
