ALTER TABLE financial_goal
    ADD COLUMN completed    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN completed_at DATE;
