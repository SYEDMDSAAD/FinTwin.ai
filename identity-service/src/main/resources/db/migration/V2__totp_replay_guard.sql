-- RFC 6238 recommends rejecting reuse of an accepted TOTP code: a sniffed
-- code otherwise stays valid for up to 90 seconds (±1 time-step window).
-- Stores the last accepted 30-second time-step per user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_last_used_step BIGINT;
