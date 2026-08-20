import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const e2eRoot = resolve(process.cwd());
export const e2eDataRoot = resolve(e2eRoot, 'data');

const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inheritedToken = process.env.JA_E2E_FIXTURE_TOKEN;
const runToken =
  inheritedToken && tokenPattern.test(inheritedToken) ? inheritedToken : randomUUID();

/** The token is set by playwright.config.ts and inherited by global setup/test workers. */
export const e2eFixtureToken = runToken;
export const e2eDatabasePath =
  process.env.JA_E2E_DATABASE_PATH ?? resolve(e2eDataRoot, `e2e-portal-${runToken}.sqlite`);
export const e2eDocumentRoot =
  process.env.JA_E2E_DOCUMENT_ROOT ?? resolve(e2eDataRoot, `e2e-documents-${runToken}`);
// The pointer/lock names are stable; ownership is carried by the random run token and the
// create-only lock. This lets a Playwright worker discover its own fixture without inheriting
// process environment mutations from global setup, while preventing concurrent overwrite.
export const e2eFixturePointerPath = resolve(e2eDataRoot, 'e2e-fixture-current.json');
export const e2eFixtureLockPath = resolve(e2eDataRoot, 'e2e-fixture.lock');

const maximumPointerAgeMs = 2 * 60 * 60 * 1000;

export type E2EFixturePointer = Readonly<{
  version: 1;
  runToken: string;
  ownerPid: number;
  createdAt: string;
  databasePath: string;
  documentRoot: string;
}>;

type PointerOptions = Readonly<{
  expectedToken?: string;
  fixtureRoot?: string;
  now?: number;
}>;

function within(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

export function makeE2EFixturePointer(
  input: Readonly<{
    token?: string;
    fixtureRoot?: string;
    createdAt?: string;
    ownerPid?: number;
  }> = {},
): E2EFixturePointer {
  const token = input.token ?? e2eFixtureToken;
  const fixtureRoot = resolve(input.fixtureRoot ?? e2eDataRoot);
  return {
    version: 1,
    runToken: token,
    ownerPid: input.ownerPid ?? process.pid,
    createdAt: input.createdAt ?? new Date().toISOString(),
    databasePath: resolve(fixtureRoot, `e2e-portal-${token}.sqlite`),
    documentRoot: resolve(fixtureRoot, `e2e-documents-${token}`),
  };
}

/**
 * Validate ownership, freshness, path confinement, and fixture existence before a test consumes
 * a pointer. A different token is treated as a concurrent/foreign invocation, never as a valid
 * fallback. `fixtureRoot`/`now` are injectable only for deterministic harness tests.
 */
export function validateE2EFixturePointer(
  value: unknown,
  options: PointerOptions = {},
): E2EFixturePointer {
  if (!value || typeof value !== 'object') throw new Error('E2E fixture pointer is invalid');
  const pointer = value as Partial<E2EFixturePointer>;
  const expectedToken = options.expectedToken ?? e2eFixtureToken;
  const fixtureRoot = resolve(options.fixtureRoot ?? e2eDataRoot);
  if (pointer.version !== 1) throw new Error('E2E fixture pointer version is unsupported');
  if (pointer.runToken !== expectedToken)
    throw new Error('E2E fixture pointer belongs to another concurrent run');
  if (!tokenPattern.test(pointer.runToken)) throw new Error('E2E fixture pointer token is invalid');
  const ownerPid = pointer.ownerPid;
  if (typeof ownerPid !== 'number' || !Number.isSafeInteger(ownerPid) || ownerPid <= 0)
    throw new Error('E2E fixture pointer owner is invalid');
  if (typeof pointer.createdAt !== 'string')
    throw new Error('E2E fixture pointer timestamp is invalid');
  const createdAt = Date.parse(pointer.createdAt);
  const now = options.now ?? Date.now();
  if (!Number.isFinite(createdAt) || createdAt > now + 60_000)
    throw new Error('E2E fixture pointer timestamp is invalid');
  if (now - createdAt > maximumPointerAgeMs) throw new Error('E2E fixture pointer is stale');
  if (typeof pointer.databasePath !== 'string' || typeof pointer.documentRoot !== 'string')
    throw new Error('E2E fixture pointer paths are invalid');
  const databasePath = resolve(pointer.databasePath);
  const documentRoot = resolve(pointer.documentRoot);
  if (
    !within(fixtureRoot, databasePath) ||
    !within(fixtureRoot, documentRoot) ||
    basename(databasePath) !== `e2e-portal-${expectedToken}.sqlite` ||
    basename(documentRoot) !== `e2e-documents-${expectedToken}`
  )
    throw new Error('E2E fixture pointer paths belong to another run or escape the fixture root');
  if (!existsSync(databasePath)) throw new Error('E2E fixture database does not exist');
  if (!existsSync(documentRoot)) throw new Error('E2E fixture document root does not exist');
  return {
    version: 1,
    runToken: pointer.runToken,
    ownerPid,
    createdAt: pointer.createdAt,
    databasePath,
    documentRoot,
  };
}

export function readE2EFixturePointer(
  pointerPath = e2eFixturePointerPath,
  options: PointerOptions = {},
): E2EFixturePointer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pointerPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `E2E fixture pointer cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const inferredToken =
    options.expectedToken ??
    (parsed &&
    typeof parsed === 'object' &&
    'runToken' in parsed &&
    typeof parsed.runToken === 'string'
      ? parsed.runToken
      : undefined);
  return validateE2EFixturePointer(parsed, {
    ...options,
    ...(inferredToken ? { expectedToken: inferredToken } : {}),
  });
}

/** Create-only pointer write: an existing path is a concurrent-run collision, never overwritten. */
export function writeE2EFixturePointer(
  pointer: E2EFixturePointer,
  pointerPath = e2eFixturePointerPath,
  options: PointerOptions = {},
): void {
  const validated = validateE2EFixturePointer(pointer, options);
  mkdirSync(dirname(resolve(pointerPath)), { recursive: true });
  const descriptor = openSync(resolve(pointerPath), 'wx');
  try {
    writeFileSync(descriptor, JSON.stringify(validated), 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function removeE2EFixturePointer(pointerPath = e2eFixturePointerPath): void {
  if (existsSync(pointerPath)) unlinkSync(pointerPath);
}

/** Acquire a create-only lock; stale interrupted locks are recoverable after the same TTL. */
export function acquireE2EFixtureLock(lockPath = e2eFixtureLockPath): void {
  mkdirSync(dirname(resolve(lockPath)), { recursive: true });
  try {
    const descriptor = openSync(resolve(lockPath), 'wx');
    closeSync(descriptor);
    return;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code !== 'EEXIST') throw error;
    let stale = false;
    try {
      stale = Date.now() - statSync(resolve(lockPath)).mtimeMs > maximumPointerAgeMs;
    } catch {
      stale = true;
    }
    if (!stale) throw new Error('Another Playwright run owns the E2E fixture lock');
    unlinkSync(resolve(lockPath));
    const descriptor = openSync(resolve(lockPath), 'wx');
    closeSync(descriptor);
  }
}

export function releaseE2EFixtureLock(lockPath = e2eFixtureLockPath): void {
  if (existsSync(lockPath)) unlinkSync(lockPath);
}
