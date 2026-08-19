PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- The original user CHECK omitted Archived even though the product lifecycle
-- includes it. Rebuild the small identity table without changing its public
-- columns or any referenced identifiers.
CREATE TABLE user_v3 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1)),
  image TEXT,
  role TEXT NOT NULL DEFAULT 'worker' CHECK(role IN ('owner_admin','finance_admin','project_manager','worker','auditor_read_only')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','active','suspended','offboarded','archived')),
  mfa_enrolled INTEGER NOT NULL DEFAULT 0 CHECK(mfa_enrolled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  mfa_required INTEGER NOT NULL DEFAULT 0 CHECK(mfa_required IN (0,1)),
  offboarded_at TEXT,
  last_step_up_at TEXT
) STRICT;

INSERT INTO user_v3(
  id,name,email,email_verified,image,role,status,mfa_enrolled,
  created_at,updated_at,version,mfa_required,offboarded_at,last_step_up_at
)
SELECT
  id,name,email,email_verified,image,role,status,mfa_enrolled,
  created_at,updated_at,version,
  CASE WHEN status='active' AND role IN ('owner_admin','finance_admin','project_manager','worker') THEN 1 ELSE COALESCE(mfa_required,0) END,
  offboarded_at,last_step_up_at
FROM user;

DROP TABLE user;
ALTER TABLE user_v3 RENAME TO user;

INSERT OR IGNORE INTO schema_migration VALUES (15, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
PRAGMA foreign_keys=ON;
