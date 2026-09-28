import { execFileSync } from 'node:child_process';
import { chown, chmod, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafePath, assertSafeTree } from './storage-safety.mjs';

const GROUP_NAME = 'jaautomation-backup-readers';
const SNAPSHOT = /^\d{4}-\d{2}-\d{2}T\d{9}Z-[0-9a-f-]{36}$/u;

export function validateReaderGroup(gid, byId, byName) {
  if (!Number.isSafeInteger(gid) || gid <= 0 || gid > 2147483647)
    throw new Error('Backup reader GID must be a positive non-root group ID');
  if ((byId && byId.name !== GROUP_NAME) || (byName && byName.gid !== gid))
    throw new Error('Backup reader group name or GID is already assigned differently');
}

/** Only the backup root and timestamped snapshots are modified; no arbitrary siblings. */
export async function configureBackupReaderPermissions(root, gid) {
  validateReaderGroup(gid);
  const checked = await assertSafePath(root, { directory: true, label: 'backup root' });
  const snapshots = (await readdir(root))
    .filter((name) => SNAPSHOT.test(name))
    .map((name) => join(root, name));
  // Validate every target before the first permission mutation.
  for (const snapshot of snapshots) await assertSafeTree(snapshot, { label: 'backup snapshot' });
  async function grant(path) {
    const { stats } = await assertSafePath(path, { label: 'backup reader target' });
    if (!stats.isFile() && !stats.isDirectory()) throw new Error('Unsafe backup reader target');
    await chown(path, stats.uid, gid);
    await chmod(path, stats.isDirectory() ? 0o2750 : 0o640);
    if (stats.isDirectory()) for (const name of await readdir(path)) await grant(join(path, name));
  }
  await chown(root, checked.stats.uid, gid);
  await chmod(root, 0o2750);
  // New root-owned snapshots inherit the dedicated reader group; no world access.
  execFileSync('setfacl', ['-m', 'd:u::rwx,d:g::r-x,d:m::r-x,d:o::---', root], { stdio: 'pipe' });
  for (const snapshot of snapshots) await grant(snapshot);
  return { snapshotsConfigured: snapshots.length, gid };
}

function lookupGroup(value) {
  try {
    const [name, , gid] = execFileSync('getent', ['group', String(value)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split(':');
    return { name, gid: Number(gid) };
  } catch (error) {
    if (error.status === 2) return null;
    throw error;
  }
}

async function main() {
  if (process.getuid?.() !== 0) throw new Error('Run backup-reader setup as root');
  const envPath = resolve(
    process.argv.find((arg) => arg.startsWith('--env-file='))?.slice(11) ??
      '/etc/jaautomation/jaautomation.env',
  );
  await assertSafePath(envPath, { label: 'deployment environment file' });
  const text = await readFile(envPath, 'utf8');
  const settings = new Map(
    text
      .split('\n')
      .filter((line) => /^JA_BACKUP_(?:READER_GID|ROOT)=/.test(line))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
      }),
  );
  const rawGid = settings.get('JA_BACKUP_READER_GID') ?? '10003';
  if (!/^[0-9]+$/.test(rawGid)) throw new Error('Invalid backup reader GID');
  const gid = Number(rawGid);
  validateReaderGroup(gid, lookupGroup(gid), lookupGroup(GROUP_NAME));
  execFileSync('setfacl', ['--version'], { stdio: 'pipe' });
  const root = resolve(settings.get('JA_BACKUP_ROOT') ?? '/var/backups/jaautomation');
  await assertSafePath(root, { directory: true, label: 'backup root' });
  if (!lookupGroup(GROUP_NAME))
    execFileSync('groupadd', ['--gid', String(gid), GROUP_NAME], { stdio: 'pipe' });
  const result = await configureBackupReaderPermissions(root, gid);
  const updated =
    text
      .split('\n')
      .filter((line) => !line.startsWith('JA_BACKUP_READER_GID='))
      .join('\n')
      .replace(/\n*$/, '\n') + `JA_BACKUP_READER_GID=${gid}\n`;
  await writeFile(envPath, updated, { mode: 0o600 });
  console.log(JSON.stringify({ event: 'backup.reader.configured', ...result }));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(() => {
    console.error(
      'Backup reader setup failed; check group collisions, ACL tools, paths and permissions.',
    );
    process.exitCode = 1;
  });
}
