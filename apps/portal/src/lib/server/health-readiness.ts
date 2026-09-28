import { lstatSync, statfsSync } from 'node:fs';
import { parse, relative, resolve } from 'node:path';
import {
  openDatabase,
  readinessCheck,
  validateReviewedMigrationContract,
  type DatabaseReadiness,
} from '@ja/database';

/**
 * Keep a meaningful production guard without making a freshly-created local
 * checkout unusable. Operators can lower this explicitly for a disposable
 * development volume; production should retain the documented 1 GiB default.
 */
export const DEFAULT_MIN_FREE_BYTES = 1_073_741_824;

const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/u;

export type MinimumFreeBytes = Readonly<{
  valid: boolean;
  value: number;
}>;

export function parseMinimumFreeBytes(raw = process.env.JA_MIN_FREE_BYTES): MinimumFreeBytes {
  const configured = raw ?? String(DEFAULT_MIN_FREE_BYTES);
  if (!INTEGER_PATTERN.test(configured)) return { valid: false, value: DEFAULT_MIN_FREE_BYTES };
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 0) {
    return { valid: false, value: DEFAULT_MIN_FREE_BYTES };
  }
  return { valid: true, value };
}

export type StatFsLike = Readonly<{
  bavail: number | bigint;
  bsize: number | bigint;
}>;

export type StatFsProbe = (path: string) => StatFsLike;

export type DiskReadiness = Readonly<{
  available: boolean;
  freeBytes: number | null;
  ready: boolean;
}>;

export function probeDiskReadiness(
  documentRoot: string,
  minimumFreeBytes: number,
  stat: StatFsProbe = (path) => statfsSync(path) as unknown as StatFsLike,
): DiskReadiness {
  try {
    const stats = stat(documentRoot);
    const free = BigInt(stats.bavail) * BigInt(stats.bsize);
    const safeMaximum = BigInt(Number.MAX_SAFE_INTEGER);
    return {
      available: true,
      freeBytes: Number(free > safeMaximum ? safeMaximum : free),
      ready: free >= BigInt(minimumFreeBytes),
    };
  } catch {
    // A missing/unreadable private volume is a readiness failure. Returning a
    // null free-space value keeps the HTTP body useful without exposing paths.
    return { available: false, freeBytes: null, ready: false };
  }
}

/** A readiness volume must be a real directory at every existing path component. */
export function isRealDirectoryPath(path: string): boolean {
  const target = resolve(path);
  const anchor = parse(target).root;
  const components = relative(anchor, target).split(/[\\/]/u).filter(Boolean);
  let cursor = anchor;
  try {
    for (const component of components) {
      cursor = resolve(cursor, component);
      const stats = lstatSync(cursor);
      if (stats.isSymbolicLink() || !stats.isDirectory()) return false;
    }
    const stats = lstatSync(target);
    return !stats.isSymbolicLink() && stats.isDirectory();
  } catch {
    return false;
  }
}

export type OperationalReadiness = DatabaseReadiness &
  Readonly<{
    configurationValid: boolean;
    migrationDirectoryReady: boolean;
    diskAvailable: boolean;
  }>;

/**
 * Performs the expensive checks only for a readiness/detail request. The
 * liveness route intentionally does not call this function.
 */
export function operationalReadiness(
  sqlite: Parameters<typeof readinessCheck>[0],
  documentRoot = process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
): OperationalReadiness {
  const migrationContract = validateReviewedMigrationContract();
  const base = readinessCheck(sqlite, documentRoot);
  const minimum = parseMinimumFreeBytes();
  const resolvedDocumentRoot = resolve(documentRoot);
  const storagePathReady = isRealDirectoryPath(resolvedDocumentRoot);
  const disk = probeDiskReadiness(resolvedDocumentRoot, minimum.value);
  const expected = migrationContract.expectedMigrationVersion;
  const migrationDirectoryReady = migrationContract.reviewedMigrationFiles.length > 0;
  const migrationReady =
    migrationDirectoryReady &&
    base.migrationVersion === expected &&
    base.expectedMigrationVersion === expected;

  return {
    ...base,
    ok:
      base.ok &&
      minimum.valid &&
      migrationReady &&
      storagePathReady &&
      disk.available &&
      disk.ready,
    expectedMigrationVersion: expected,
    diskFreeBytes: disk.freeBytes,
    diskFreeThresholdBytes: minimum.value,
    configurationValid: minimum.valid,
    migrationDirectoryReady,
    diskAvailable: disk.available,
  };
}

export function unavailableReadiness(
  documentRoot = process.env.JA_DOCUMENT_ROOT ?? process.env.JA_FILES_ROOT ?? 'data/documents',
): OperationalReadiness {
  const minimum = parseMinimumFreeBytes();
  const disk = probeDiskReadiness(resolve(documentRoot), minimum.value);
  return {
    ok: false,
    integrity: 'unavailable',
    migrationVersion: 0,
    expectedMigrationVersion: 0,
    writableDirectories: false,
    writeReady: false,
    diskFreeBytes: disk.freeBytes,
    diskFreeThresholdBytes: minimum.value,
    configurationValid: minimum.valid,
    migrationDirectoryReady: false,
    diskAvailable: disk.available,
  };
}

export const READINESS_CACHE_TTL_MS = 5_000;

export type ReadinessGate<T> = Readonly<{
  get: (probe: () => T | Promise<T>) => Promise<T>;
  clear: () => void;
}>;

/**
 * A short-lived, single-flight gate keeps an unauthenticated readiness probe
 * from repeatedly running integrity_check and BEGIN IMMEDIATE. All callers
 * during one probe share the same promise; failures are not cached beyond the
 * in-flight request.
 */
export function createReadinessGate<T>(ttlMs = READINESS_CACHE_TTL_MS): ReadinessGate<T> {
  let cached: { value: T; expiresAt: number } | undefined;
  let inFlight: Promise<T> | undefined;
  return {
    get(probe) {
      const now = Date.now();
      if (cached && cached.expiresAt > now) return Promise.resolve(cached.value);
      if (inFlight) return inFlight;
      const running = Promise.resolve().then(probe);
      inFlight = running
        .then((value) => {
          cached = { value, expiresAt: Date.now() + ttlMs };
          return value;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
    clear() {
      cached = undefined;
    },
  };
}

export const readinessGate = createReadinessGate<OperationalReadiness>();

export function cachedOperationalReadiness(): Promise<OperationalReadiness> {
  return readinessGate.get(() => {
    let db: ReturnType<typeof openDatabase> | undefined;
    try {
      db = openDatabase();
      return operationalReadiness(db);
    } catch {
      return unavailableReadiness();
    } finally {
      db?.close();
    }
  });
}
