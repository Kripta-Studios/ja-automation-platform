import { createHash } from 'node:crypto';

export type CanonicalJsonErrorFactory = (message: string) => never;

const defaultError: CanonicalJsonErrorFactory = (message) => {
  throw new Error(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Encode the repository's deterministic JSON representation.  Bigints are
 * represented as decimal strings, object keys are ordered by code unit, and
 * undefined object properties are omitted.  Callers that need a domain error
 * can supply their error factory without changing the encoded bytes.
 */
export function canonicalJson(
  value: unknown,
  fail: CanonicalJsonErrorFactory = defaultError,
): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fail('Value is not JSON serializable');
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry, fail)).join(',')}]`;
  if (isRecord(value))
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left === right ? 0 : left < right ? -1 : 1))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry, fail)}`)
      .join(',')}}`;
  return fail('Value is not JSON serializable');
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
