-- Phone number for SMS notifications (optional — field is nullable)
-- Stored encrypted (AES-256-GCM via EncryptionConverter), same as email.
-- phone_verified: set to true only after OTP confirmation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone          VARCHAR(512);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
