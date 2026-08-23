# Backup and restore

`deployment/scripts/backup.mjs` uses Node's SQLite online backup API. This is required while WAL may
be active; copying only the live database filename is not a safe backup. The backup contains a
database snapshot, private document tree, SHA-256/byte-length manifest and retention handling.
Backup roots, every path component and every tree entry are checked with non-following metadata;
symlinks and non-regular entries fail closed.

Localized PDFs are ordinary private artifacts in that document tree. Their database manifests retain
the locale (`en-US`, `es-ES` or `pt-BR`), source revision, attempt/fence and content hash, so the
database backup and document tree must be restored together. A restored ready artifact is still
verified before download; a missing or changed file is reported as unavailable/integrity-failed and is
not silently treated as ready.

Restore is staged by `deployment/scripts/restore.mjs`:

1. validate the manifest and reject absolute/parent/traversal paths and symlinks;
2. verify database hash and byte length;
3. copy the database/files into `.restore-partial` paths;
4. run SQLite integrity and foreign-key checks;
5. verify every private file hash/size against the manifest;
6. atomically swap into empty targets, or require explicit `allowOverwrite` for replacement; a
   failed replacement rolls the database and document roots back to their original paths.

The document manifest is hashed from the copied backup snapshot, never by rereading the live source
tree after the copy. This keeps a source mutation from producing a manifest for different bytes.

The disposable evidence commands are:

```powershell
pnpm ops:backup:test
pnpm ops:restore-test
node --experimental-strip-types deployment/tests/client-essential-backup-restore.mjs
```

The Client Essential drill uses a migrated SQLite database populated with an issued invoice
snapshot, a private receipt, and a private PLC backup. It verifies the manifest hashes and byte
lengths, restores into isolated disposable paths, checks SQLite integrity and foreign keys, checks
the invoice snapshot and artifact metadata/bytes, rejects a traversal manifest, and removes its
temporary directory on completion.

Production backups still need encrypted off-site replication and an alert destination supplied by
the operator. Test restores must be performed in an isolated target, never over the live database.

Migration `0024_accounting_pack_snapshot_bridge.sql` is additive and does not globally backfill
historical Accounting Pack runs. Restore preserves those legacy rows as-is; an explicit scoped bridge
must be created only after the corresponding canonical snapshot, legal-entity revision, finance
command and audit evidence exist.
