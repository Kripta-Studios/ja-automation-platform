import { DatabaseSync } from 'node:sqlite';
import { isIP } from 'node:net';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';

/**
 * Environment and URL guards shared by the disposable browser/audit scripts.
 *
 * These scripts are intentionally usable only with an isolated local server
 * and reserved synthetic identities. Keeping the checks here (rather than
 * copying subtly different regular expressions into each script) makes the
 * safety boundary testable without starting a browser or reading a secret.
 */

const EMAIL_LOCAL_PART = /^[^\s@]+$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;
const OPAQUE_SENTINEL = /^[A-Za-z0-9][A-Za-z0-9._-]{23,127}$/u;
const UUID_SENTINEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SYNTHETIC_DEPLOYMENT_ID = /^(?:e2e|test|fixture|local|demo|offline)[a-z0-9_-]{2,63}$/u;
const DATABASE_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'] as const;

export const FIXTURE_SENTINEL_ENV = 'JA_FIXTURE_SENTINEL';
export const ALLOWED_PREVIEW_PORTS = Object.freeze([4174, 5174] as const);

export const SYNTHETIC_EMAIL_PATTERN =
  /@(?:example\.com|(?:[a-z0-9-]+\.)+example\.com|(?:[a-z0-9-]+\.)+(?:test|invalid)|localhost)$/iu;

function validDnsDomain(domain: string): boolean {
  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every((label) => label.length > 0 && label.length <= 63 && DNS_LABEL.test(label))
  );
}

/** Returns true only for reserved domains suitable for disposable fixtures. */
export function isSyntheticEmail(value: string): boolean {
  if (!/^[^\s@]+@[^\s@]+$/u.test(value)) return false;
  if (!SYNTHETIC_EMAIL_PATTERN.test(value)) return false;

  const at = value.lastIndexOf('@');
  const localPart = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (!EMAIL_LOCAL_PART.test(localPart)) return false;

  // localhost is intentionally exact. Arbitrary *.localhost and *.local
  // names can be mDNS/LAN identities and are not accepted as fixture mail.
  if (domain === 'localhost') return true;
  if (!validDnsDomain(domain)) return false;
  if (domain === 'example.com' || domain.endsWith('.example.com')) return true;
  return domain.endsWith('.test') || domain.endsWith('.invalid');
}

export function isSyntheticDeploymentIdentifier(value: string): boolean {
  return SYNTHETIC_DEPLOYMENT_ID.test(value);
}

export function isOpaqueFixtureSentinel(value: string): boolean {
  if (!OPAQUE_SENTINEL.test(value)) return false;
  if (UUID_SENTINEL.test(value)) return true;
  if (!/[A-Za-z]/u.test(value) || !/[0-9]/u.test(value)) return false;
  if (new Set(value).size < 10) return false;
  return !/^(?:test|fixture|demo|development|default|secret|password)[._-]/iu.test(value);
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required and must contain a synthetic test value.`);
  return value;
}

export function requiredFixtureSentinel(name = FIXTURE_SENTINEL_ENV): string {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Fixture browser scripts cannot run with NODE_ENV=production.');
  const value = requiredEnvironment(name);
  if (!isOpaqueFixtureSentinel(value))
    throw new Error(`${name} must be an opaque, high-entropy fixture sentinel.`);
  return value;
}

export function assertSyntheticDeploymentConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): { tenantId: string; deploymentId: string } {
  const tenantId = environment.JA_TENANT_ID?.trim() ?? '';
  const deploymentId = environment.JA_DEPLOYMENT_ID?.trim() ?? '';
  if (!isSyntheticDeploymentIdentifier(tenantId) || !isSyntheticDeploymentIdentifier(deploymentId))
    throw new Error('Fixture deployment identity must use a synthetic non-production identifier.');
  return { tenantId, deploymentId };
}

export function syntheticEmail(name: string): string {
  const value = requiredEnvironment(name);
  const normalized = value.toLowerCase();
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
  if (
    !isSyntheticEmail(value) ||
    domain === 'j-aautomation.com' ||
    domain.endsWith('.j-aautomation.com')
  ) {
    throw new Error(`${name} must use a reserved synthetic email domain such as example.test.`);
  }
  return value;
}

export function syntheticCredentials(emailName: string, passwordName: string) {
  const email = syntheticEmail(emailName);
  const password = requiredEnvironment(passwordName);
  const localPart = email.slice(0, email.indexOf('@')).toLowerCase();
  if (
    password.toLowerCase() === localPart ||
    /^(?:admin|changeme|password|secret|worker)$/iu.test(password)
  ) {
    throw new Error(`${passwordName} must be a non-default synthetic secret.`);
  }
  return { email, password };
}

export function isSyntheticSecret(value: string, email?: string): boolean {
  if (value.length < 24 || value.length > 128 || /\s/u.test(value)) return false;
  if (email) {
    const localPart = email.slice(0, email.indexOf('@')).toLowerCase();
    if (localPart && value.toLowerCase() === localPart) return false;
  }
  if (/^(?:admin|changeme|password|secret|worker|finance|manager|auditor|pm)$/iu.test(value))
    return false;
  const classes = [/[a-z]/u, /[A-Z]/u, /[0-9]/u, /[^A-Za-z0-9]/u].filter((pattern) =>
    pattern.test(value),
  ).length;
  return classes >= 2 && new Set(value).size >= 10;
}

function isLoopbackHost(hostname: string): boolean {
  const unbracketed =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (unbracketed.toLowerCase() === 'localhost') return true;

  const family = isIP(unbracketed);
  if (family === 4) {
    const octets = unbracketed.split('.').map(Number);
    return octets.length === 4 && octets[0] === 127;
  }
  return family === 6 && unbracketed.toLowerCase() === '::1';
}

/**
 * Accept only HTTP(S) URLs whose host is an actual loopback address or the
 * exact localhost name. In particular, do not treat *.local or *.test as a
 * trusted host: those suffixes may resolve to a LAN/mDNS service.
 */
export function isLocalTestUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const port = parsed.port ? Number(parsed.port) : NaN;
  return (
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    ALLOWED_PREVIEW_PORTS.includes(port as (typeof ALLOWED_PREVIEW_PORTS)[number]) &&
    !parsed.username &&
    !parsed.password &&
    isLoopbackHost(parsed.hostname)
  );
}

export function localBaseUrl(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!isLocalTestUrl(value)) {
    throw new Error(`${name} must point to an isolated local test server.`);
  }
  return value.replace(/\/$/u, '');
}

export function redactedUrlPath(value: string, base?: string): string {
  try {
    const parsed = new URL(value, base);
    return parsed.pathname || '/';
  } catch {
    return '[invalid-url]';
  }
}

export function fixtureDatabaseRoots(repoRoot = process.cwd()): readonly string[] {
  return [resolve(tmpdir()), resolve(repoRoot, 'tests/e2e/data')];
}

type FixturePathOptions = Readonly<{
  roots?: readonly string[];
  requireExisting?: boolean;
  token?: string;
  requireToken?: boolean;
  extensions?: readonly string[];
}>;

function pathWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return Boolean(path) && !path.startsWith(`..${sep}`) && path !== '..' && !path.startsWith(sep);
}

function rejectSymlinkComponents(candidate: string, root: string): void {
  let current = candidate;
  while (current !== root && pathWithin(root, current)) {
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error('Fixture paths must not contain symbolic links.');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Fixture paths must not contain symbolic links.'
      )
        throw error;
      // A missing leaf is allowed for the seed command; existing ancestors are
      // still inspected as the loop walks toward the fixture root.
    }
    current = dirname(current);
  }
}

export function canonicalFixturePath(value: string, options: FixturePathOptions = {}): string {
  const candidate = resolve(value.trim());
  if (!value.trim() || candidate === sep) throw new Error('Fixture path is invalid.');

  const roots = (options.roots ?? fixtureDatabaseRoots())
    .map((root) => resolve(root))
    .filter((root) => existsSync(root));
  const root = roots
    .map((entry) => {
      try {
        return realpathSync(entry);
      } catch {
        return null;
      }
    })
    .find((entry): entry is string => entry !== null && pathWithin(entry, candidate));
  if (!root) throw new Error('Fixture path must remain under an isolated fixture root.');

  rejectSymlinkComponents(candidate, root);
  if (options.requireToken) {
    const token = options.token;
    if (!token || !isOpaqueFixtureSentinel(token))
      throw new Error('Fixture database validation requires an opaque fixture sentinel.');
    const linkedSegment = candidate.split(sep).some((segment) => segment.includes(token));
    if (!linkedSegment)
      throw new Error('Fixture database path is not linked to the fixture sentinel.');
  }

  const exists = existsSync(candidate);
  if (options.requireExisting !== false && !exists)
    throw new Error('Fixture database does not exist.');
  if (exists) {
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('Fixture database must be a regular non-symlink file.');
    if (realpathSync(candidate) !== candidate)
      throw new Error('Fixture database path must be canonical and must not be a symlink.');
  }

  const extensions = options.extensions ?? DATABASE_EXTENSIONS;
  if (!extensions.some((extension) => candidate.toLowerCase().endsWith(extension)))
    throw new Error('Fixture database must use a SQLite file extension.');
  return candidate;
}

export function canonicalFixtureDatabasePath(
  value: string,
  sentinel: string,
  options: Omit<FixturePathOptions, 'token' | 'requireToken' | 'extensions'> = {},
): string {
  return canonicalFixturePath(value, {
    ...options,
    token: sentinel,
    requireToken: true,
    extensions: DATABASE_EXTENSIONS,
  });
}

/**
 * Confine a disposable directory to an explicit fixture root. Unlike the
 * database helper this permits a missing leaf, but every existing component
 * must be canonical and non-symlinked. Destructive callers should require the
 * run token so one invocation cannot erase another invocation's directory.
 */
export function canonicalFixtureDirectoryPath(
  value: string,
  options: Omit<FixturePathOptions, 'extensions'> = {},
): string {
  const candidate = resolve(value.trim());
  if (!value.trim() || candidate === sep) throw new Error('Fixture directory path is invalid.');

  const roots = (options.roots ?? fixtureDatabaseRoots())
    .map((root) => resolve(root))
    .filter((root) => existsSync(root));
  const root = roots
    .map((entry) => {
      try {
        return realpathSync(entry);
      } catch {
        return null;
      }
    })
    .find((entry): entry is string => entry !== null && pathWithin(entry, candidate));
  if (!root) throw new Error('Fixture directory must remain under an isolated fixture root.');

  rejectSymlinkComponents(candidate, root);
  if (options.requireToken) {
    const token = options.token;
    if (!token || !isOpaqueFixtureSentinel(token))
      throw new Error('Fixture directory validation requires an opaque fixture sentinel.');
    if (!candidate.split(sep).some((segment) => segment.includes(token)))
      throw new Error('Fixture directory path is not linked to the fixture sentinel.');
  }

  if (existsSync(candidate)) {
    const stat = lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Fixture directory must be a regular non-symlink directory.');
    if (realpathSync(candidate) !== candidate)
      throw new Error('Fixture directory path must be canonical and must not be a symlink.');
  }
  return candidate;
}

/** Resolve a link only when it remains on the already-validated local origin. */
export function localSameOriginUrl(value: string, base: string): string {
  if (!isLocalTestUrl(base)) throw new Error('Base URL must be an isolated local test server.');
  let resolved: URL;
  try {
    resolved = new URL(value, base);
  } catch {
    throw new Error('Local resource URL is invalid.');
  }
  const expected = new URL(base);
  if (!isLocalTestUrl(resolved.toString()) || resolved.origin !== expected.origin)
    throw new Error('Local resource URL must remain on the isolated test origin.');
  return resolved.toString();
}

export function assertSyntheticDeploymentIdentity(
  sqlite: DatabaseSync,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const table = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deployment_identity'")
    .get() as { name: string } | undefined;
  const row = sqlite
    .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
    .get() as { tenant_id: string; deployment_id: string } | undefined;
  if (
    !table ||
    !row ||
    !isSyntheticDeploymentIdentifier(row.tenant_id) ||
    !isSyntheticDeploymentIdentifier(row.deployment_id)
  )
    throw new Error('Fixture database deployment identity is missing or non-synthetic.');
  const configuredTenant = environment.JA_TENANT_ID?.trim();
  const configuredDeployment = environment.JA_DEPLOYMENT_ID?.trim();
  if (configuredTenant || configuredDeployment) {
    const expected = assertSyntheticDeploymentConfiguration(environment);
    if (row.tenant_id !== expected.tenantId || row.deployment_id !== expected.deploymentId)
      throw new Error('Fixture database deployment identity does not match the fixture process.');
  }
}

export function verifyFixtureDatabase(
  value: string,
  sentinel: string,
  options: Omit<FixturePathOptions, 'token' | 'requireToken' | 'extensions'> = {},
): string {
  const databasePath = canonicalFixtureDatabasePath(value, sentinel, {
    ...options,
    requireExisting: true,
  });
  let sqlite: DatabaseSync | undefined;
  try {
    sqlite = new DatabaseSync(databasePath, { readOnly: true });
    assertSyntheticDeploymentIdentity(sqlite);
    return databasePath;
  } finally {
    sqlite?.close();
  }
}
