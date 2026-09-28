BEGIN IMMEDIATE;

-- Better Auth 1.7 records the authenticator model identifier for passkeys.
-- Keep it optional because privacy-preserving authenticators may omit it.
ALTER TABLE passkey ADD COLUMN aaguid TEXT;

INSERT OR IGNORE INTO schema_migration VALUES (18, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
