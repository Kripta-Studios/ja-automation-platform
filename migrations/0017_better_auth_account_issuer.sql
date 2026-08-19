BEGIN IMMEDIATE;

-- Better Auth 1.7 identifies accounts by issuer + account_id. The original
-- V3 account table predates that namespace and only stored provider_id. Add
-- the compatibility columns without rewriting existing credential accounts.
ALTER TABLE account ADD COLUMN issuer TEXT NOT NULL DEFAULT 'local:credential';
ALTER TABLE account ADD COLUMN id_token TEXT;
ALTER TABLE account ADD COLUMN access_token_expires_at TEXT;
ALTER TABLE account ADD COLUMN refresh_token_expires_at TEXT;
ALTER TABLE account ADD COLUMN scope TEXT;
UPDATE account
SET issuer = CASE
  WHEN provider_id = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || provider_id
END;
CREATE UNIQUE INDEX IF NOT EXISTS account_issuer_account_idx ON account(issuer, account_id);

INSERT OR IGNORE INTO schema_migration VALUES (17, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
