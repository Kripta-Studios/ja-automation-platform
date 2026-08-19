BEGIN IMMEDIATE;

-- Better Auth's TOTP provider needs a verification flag and bounded failure
-- counters. Keep these separate from the product's mfa_enrolled projection so
-- setup cannot satisfy the MFA gate before a code has been verified.
ALTER TABLE user ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0 CHECK(two_factor_enabled IN (0,1));
ALTER TABLE two_factor ADD COLUMN verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1));
ALTER TABLE two_factor ADD COLUMN failed_verification_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_verification_count >= 0);
ALTER TABLE two_factor ADD COLUMN locked_until TEXT;
CREATE INDEX IF NOT EXISTS two_factor_user_idx ON two_factor(user_id);

INSERT OR IGNORE INTO schema_migration VALUES (16, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
