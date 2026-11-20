USE hiresphere;

-- Run this once only if you created the HireSphere database before the security update.
-- Skip this script if privacy_consent_at already exists in the users table.
ALTER TABLE users ADD COLUMN privacy_consent_at TIMESTAMP NULL AFTER is_active;
