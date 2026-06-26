-- Phone OTP verification columns (complement V7 which added phone + phone_verified)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_otp    VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_expiry TIMESTAMP;
