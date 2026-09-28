import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { PortalRepository, createDatabase } from '@ja/database';
import { populateOwnerTraining, trainingPlan } from './populate-owner-training.ts';

const args = process.argv.slice(2);
const argument = (name: string) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (
  args.some(
    (value) =>
      !['--apply', '--financial-history'].includes(value) &&
      !['database', 'sessions', 'result'].some((name) => value.startsWith(`--${name}=`)),
  )
)
  throw new Error('Unknown training command argument');
const path = argument('database');
if (!path || !isAbsolute(path) || !existsSync(path) || realpathSync(path) !== path)
  throw new Error('An existing canonical absolute database path is required');
const apply = args.includes('--apply');
let db = new DatabaseSync(path, { readOnly: true });
try {
  db.exec('PRAGMA foreign_keys=ON');
  if (!apply) {
    console.log(JSON.stringify(trainingPlan(db), null, 2));
  } else {
    const sessionFile = argument('sessions'),
      resultFile = argument('result');
    if (
      !sessionFile ||
      !resultFile ||
      !isAbsolute(sessionFile) ||
      !isAbsolute(resultFile) ||
      existsSync(resultFile)
    )
      throw new Error('Private sessions file and a new absolute result path are required');
    const sessions = JSON.parse(readFileSync(sessionFile, 'utf8')) as Record<
      string,
      { userId: string; sessionId: string }
    >;
    if (!sessions.owner?.userId || !sessions.owner.sessionId)
      throw new Error('Authenticated Owner session required');
    const identity = db
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string };
    if (
      (process.env.JA_TENANT_ID && process.env.JA_TENANT_ID !== identity.tenant_id) ||
      (process.env.JA_DEPLOYMENT_ID && process.env.JA_DEPLOYMENT_ID !== identity.deployment_id)
    )
      throw new Error('Deployment identity mismatch');
    process.env.JA_TENANT_ID = identity.tenant_id;
    process.env.JA_DEPLOYMENT_ID = identity.deployment_id;
    const initialized = createDatabase(path).sqlite;
    db.close();
    db = initialized;
    const owner = new PortalRepository(db).principalFor(
      sessions.owner.userId,
      sessions.owner.sessionId,
    );
    const result = populateOwnerTraining(db, owner, {
      financialHistory: args.includes('--financial-history'),
      subjectSessions: Object.fromEntries(
        Object.values(sessions).map((session) => [session.userId, session.sessionId]),
      ),
    });
    writeFileSync(resultFile, JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(
      JSON.stringify({
        batch: result.batch,
        alreadyApplied: result.alreadyApplied,
        counts: 'counts' in result ? result.counts : undefined,
      }),
    );
  }
} finally {
  db.close();
}
