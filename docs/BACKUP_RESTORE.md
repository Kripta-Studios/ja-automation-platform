# Backup and restore

`deployment/scripts/backup.mjs` uses Node's SQLite online backup API. This is required while WAL may
be active; copying only the live database filename is not a safe backup. The backup contains a
database snapshot, private document tree, SHA-256/byte-length manifest and retention handling.

Restore is staged by `deployment/scripts/restore.mjs`:

1. validate the manifest and reject absolute/parent/traversal paths;
2. verify database hash and byte length;
3. copy the database/files into `.restore-partial` paths;
4. run SQLite integrity and foreign-key checks;
5. verify every private file hash/size against the manifest;
6. rename into empty targets, or require explicit `allowOverwrite` for replacement.

The disposable evidence commands are:

```powershell
pnpm ops:backup:test
pnpm ops:restore-test
```

Production backups still need encrypted off-site replication and an alert destination supplied by
the operator. Test restores must be performed in an isolated target, never over the live database.
