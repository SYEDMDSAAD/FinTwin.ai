-- V1: Baseline schema — FinTwin.ai
--
-- Creates the complete schema to match what Hibernate/JPA would generate.
-- Table and column names follow SpringPhysicalNamingStrategy (camelCase → snake_case)
-- unless overridden by explicit @Table(name=) or @Column(name=) annotations.
--
-- Encrypted columns store AES-256/GCM Base64 ciphertext at the application layer.
-- Column lengths accommodate ciphertext overhead (~40 extra chars per encrypted field).
--
-- FK ON DELETE is intentionally omitted: the application manages cascades in service
-- code, giving us flexibility (e.g. soft-delete users without cascade-deleting history).

-- ─────────────────────────────────────────────────────────────────────────────
-- Core: users (referenced by FK from every other table)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id                   BIGSERIAL    PRIMARY KEY,
    full_name            VARCHAR(512),          -- encrypted
    email                VARCHAR(512),          -- encrypted (search via email_hash)
    password             VARCHAR(255),
    email_hash           VARCHAR(64)  UNIQUE,   -- SHA-256 of email, used for lookups
    created_at           TIMESTAMP,
    onboarding_completed BOOLEAN      DEFAULT false,
    two_factor_secret    VARCHAR(512),          -- encrypted TOTP secret
    two_factor_enabled   BOOLEAN      DEFAULT false,
    role                 VARCHAR(20)  DEFAULT 'USER',
    enabled              BOOLEAN      DEFAULT true,
    last_login_at        TIMESTAMP,
    last_logout_at       TIMESTAMP,
    consent_given_at     TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Financial data tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Note: "transaction" is a non-reserved keyword in PostgreSQL — safe as a table name.
CREATE TABLE transaction (
    id          BIGSERIAL    PRIMARY KEY,
    date        VARCHAR(255),
    merchant    VARCHAR(400),                   -- encrypted
    amount      TEXT,                           -- encrypted Double
    category    VARCHAR(400),                   -- encrypted
    source      VARCHAR(255),
    external_id VARCHAR(255),
    user_id     BIGINT       REFERENCES users(id)
);

CREATE TABLE budget (
    id           BIGSERIAL    PRIMARY KEY,
    category     VARCHAR(255),
    limit_amount TEXT,                          -- encrypted Double
    user_id      BIGINT       REFERENCES users(id)
);

CREATE TABLE financial_goal (
    id                  BIGSERIAL    PRIMARY KEY,
    title               VARCHAR(400),
    target_amount       TEXT,                   -- encrypted Double
    current_saved       TEXT,                   -- encrypted Double
    duration_months     INTEGER,
    monthly_target      TEXT,                   -- encrypted Double
    success_probability TEXT,                   -- encrypted Double
    ai_plan             VARCHAR(7000),          -- encrypted String (7000 accommodates AES-GCM overhead on 5000-char AI responses)
    expected_saved      TEXT,                   -- encrypted Double
    progress_percent    TEXT,                   -- encrypted Double
    available_savings   TEXT,                   -- encrypted Double
    goal_health         VARCHAR(255),
    created_at          DATE,
    user_id             BIGINT       REFERENCES users(id)
);

CREATE TABLE asset (
    id      BIGSERIAL    PRIMARY KEY,
    name    VARCHAR(400),                       -- encrypted
    amount  TEXT,                               -- encrypted Double
    type    VARCHAR(255),
    user_id BIGINT       REFERENCES users(id)
);

CREATE TABLE liability (
    id      BIGSERIAL    PRIMARY KEY,
    name    VARCHAR(400),                       -- encrypted
    amount  TEXT,                               -- encrypted Double
    type    VARCHAR(255),
    user_id BIGINT       REFERENCES users(id)
);

CREATE TABLE investments (
    id              BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(id),
    name            VARCHAR(512),               -- encrypted
    type            VARCHAR(255),
    invested_amount TEXT,                       -- encrypted Double
    current_value   TEXT,                       -- encrypted Double
    purchase_date   DATE,
    ticker_code     VARCHAR(512),               -- encrypted
    units           TEXT,                       -- encrypted Double
    interest_rate   TEXT,                       -- encrypted Double
    notes           VARCHAR(1400)               -- encrypted
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AI chat
-- ─────────────────────────────────────────────────────────────────────────────

-- Note: "timestamp" is a non-reserved keyword in PostgreSQL — safe as a column name.
CREATE TABLE chat_history (
    id        BIGSERIAL    PRIMARY KEY,
    role      VARCHAR(255),
    message   TEXT,                             -- encrypted
    reply     TEXT,                             -- encrypted
    timestamp TIMESTAMP,
    user_id   BIGINT       REFERENCES users(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- External connections
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE bank_connection (
    id                    BIGSERIAL    PRIMARY KEY,
    user_id               BIGINT       REFERENCES users(id),
    consent_handle        VARCHAR(512),
    consent_id            VARCHAR(512),
    consent_status        VARCHAR(255),
    masked_account_number VARCHAR(512),
    bank_name             VARCHAR(512),
    created_at            TIMESTAMP,
    last_synced_at        TIMESTAMP
);

CREATE TABLE crypto_connections (
    id             BIGSERIAL    PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES users(id),
    exchange       VARCHAR(255),
    api_key        VARCHAR(512),
    api_secret     VARCHAR(512),
    created_at     TIMESTAMP,
    last_synced_at TIMESTAMP,
    sync_status    VARCHAR(255)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications, support, and scoring
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE notification (
    id          BIGSERIAL    PRIMARY KEY,
    type        VARCHAR(255),
    message     VARCHAR(4100),                  -- encrypted
    read_status BOOLEAN,
    created_at  TIMESTAMP,
    user_id     BIGINT       REFERENCES users(id)
);

CREATE TABLE support_tickets (
    id          BIGSERIAL    PRIMARY KEY,
    user_email  VARCHAR(512)  NOT NULL,
    user_name   VARCHAR(200),
    category    VARCHAR(50),
    message     VARCHAR(2000) NOT NULL,
    status      VARCHAR(20)   DEFAULT 'OPEN',
    admin_note  VARCHAR(2000),
    created_at  TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE TABLE financial_score_history (
    id      BIGSERIAL    PRIMARY KEY,
    score   INTEGER,
    month   VARCHAR(255),
    user_id BIGINT       REFERENCES users(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Security / admin
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE blocked_ips (
    id         BIGSERIAL    PRIMARY KEY,
    ip_address VARCHAR(45)  NOT NULL UNIQUE,
    reason     VARCHAR(500),
    blocked_by VARCHAR(200),
    blocked_at TIMESTAMP,
    expires_at TIMESTAMP
);

-- PCI-DSS Req 10: Immutable audit log.
-- Normal (unpartitioned) in this baseline.
-- V3 converts this to a monthly range-partitioned table for long-term scale.
CREATE TABLE audit_log (
    id             BIGSERIAL    PRIMARY KEY,
    user_id        BIGINT,                      -- nullable: pre-auth events have no user yet
    action         VARCHAR(50)  NOT NULL,
    resource       VARCHAR(100) NOT NULL,
    description    VARCHAR(500),
    ip_address     VARCHAR(45),
    user_agent     VARCHAR(512),
    http_method    VARCHAR(10),
    request_uri    VARCHAR(500),
    timestamp      TIMESTAMP    NOT NULL,
    success        BOOLEAN      NOT NULL,
    failure_reason VARCHAR(1000)
);
