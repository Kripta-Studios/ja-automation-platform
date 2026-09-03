import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import {
  canonicalJson,
  sha256,
  type CanonicalJsonErrorFactory,
} from '../../core/canonical-json.ts';

export type FinanceCommandWriterDeployment = Readonly<{
  tenantId: string;
  deploymentId: string;
}>;

export type FinanceCommand = Readonly<{
  commandId: string;
  requestHash: string;
  commandHash: string;
}>;

export type FinanceEvidence = Readonly<{
  evidenceId: string;
  evidenceHash: string;
}>;

type DbRow = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  field: string,
  fail: CanonicalJsonErrorFactory,
): void {
  if (actual !== expected) return fail(`${field} is not idempotent`);
}

function rowValue<T>(row: DbRow | undefined, key: string): T | undefined {
  return row?.[key] as T | undefined;
}

/**
 * Persist immutable finance evidence, rejecting identity, byte and hash
 * collisions.  The error factory keeps the caller's public domain error
 * class stable while this writer remains reusable by other finance domains.
 */
export function ensureEvidenceRecord(
  sqlite: DatabaseSync,
  evidenceId: string,
  evidenceType: string,
  contractVersion: string,
  semanticId: string,
  blob: Buffer,
  createdAt: string,
  fail: CanonicalJsonErrorFactory,
): FinanceEvidence {
  const hash = sha256(blob);
  const existing = sqlite
    .prepare(
      'SELECT evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash FROM finance_hash_evidence WHERE evidence_id=?',
    )
    .get(evidenceId) as
    | {
        evidence_type: string;
        contract_version: string;
        semantic_id: string;
        canonical_blob: Uint8Array;
        evidence_hash: string;
      }
    | undefined;
  if (existing) {
    assertEqual(existing.evidence_type, evidenceType, 'Evidence type', fail);
    assertEqual(existing.contract_version, contractVersion, 'Evidence contract', fail);
    assertEqual(existing.semantic_id, semanticId, 'Evidence semantic id', fail);
    assertEqual(existing.evidence_hash, hash, 'Evidence hash', fail);
    if (!Buffer.from(existing.canonical_blob).equals(blob))
      return fail('Evidence bytes are not idempotent');
    return { evidenceId, evidenceHash: hash };
  }
  const semanticOwner = sqlite
    .prepare(
      `SELECT evidence_id,canonical_blob,evidence_hash
       FROM finance_hash_evidence
       WHERE evidence_type=? AND contract_version=? AND semantic_id=?`,
    )
    .get(evidenceType, contractVersion, semanticId) as
    | { evidence_id: string; canonical_blob: Uint8Array; evidence_hash: string }
    | undefined;
  if (semanticOwner) {
    assertEqual(semanticOwner.evidence_hash, hash, 'Evidence semantic hash', fail);
    if (!Buffer.from(semanticOwner.canonical_blob).equals(blob))
      return fail('Evidence semantic bytes are not idempotent');
    return { evidenceId: semanticOwner.evidence_id, evidenceHash: hash };
  }
  const hashOwner = sqlite
    .prepare('SELECT evidence_id FROM finance_hash_evidence WHERE evidence_hash=?')
    .get(hash) as { evidence_id: string } | undefined;
  if (hashOwner && hashOwner.evidence_id !== evidenceId)
    return fail('Evidence hash is already bound to another identity');
  try {
    sqlite
      .prepare(
        `INSERT INTO finance_hash_evidence(
           evidence_id,evidence_type,contract_version,semantic_id,canonical_blob,evidence_hash,created_at
         ) VALUES(?,?,?,?,?,?,?)`,
      )
      .run(evidenceId, evidenceType, contractVersion, semanticId, blob, hash, createdAt);
    return { evidenceId, evidenceHash: hash };
  } catch (error) {
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : '';
    const message = error instanceof Error ? error.message : '';
    if (!code.startsWith('SQLITE_CONSTRAINT') && !message.includes('UNIQUE constraint failed:'))
      throw error;
    // A second writer may win after the checks above. Re-read the immutable
    // owner and apply the same byte-for-byte idempotency contract instead of
    // leaking a storage-engine UNIQUE error through the finance boundary.
    const racedOwner = sqlite
      .prepare(
        `SELECT evidence_id,canonical_blob,evidence_hash
           FROM finance_hash_evidence
          WHERE evidence_type=? AND contract_version=? AND semantic_id=?`,
      )
      .get(evidenceType, contractVersion, semanticId) as
      | { evidence_id: string; canonical_blob: Uint8Array; evidence_hash: string }
      | undefined;
    if (racedOwner) {
      assertEqual(racedOwner.evidence_hash, hash, 'Evidence semantic hash', fail);
      if (!Buffer.from(racedOwner.canonical_blob).equals(blob))
        return fail('Evidence semantic bytes are not idempotent');
      return { evidenceId: racedOwner.evidence_id, evidenceHash: hash };
    }
    return fail('Evidence immutable identity conflict');
  }
}

export function ensureEvidence(
  sqlite: DatabaseSync,
  evidenceId: string,
  evidenceType: string,
  contractVersion: string,
  semanticId: string,
  blob: Buffer,
  createdAt: string,
  fail: CanonicalJsonErrorFactory,
): string {
  const evidence = ensureEvidenceRecord(
    sqlite,
    evidenceId,
    evidenceType,
    contractVersion,
    semanticId,
    blob,
    createdAt,
    fail,
  );
  if (evidence.evidenceId !== evidenceId)
    return fail('Evidence semantic identity is already bound to another identity');
  return evidence.evidenceHash;
}

export type FinanceCommandInput = Readonly<{
  operation: string;
  targetKind: string;
  targetSemanticId: string;
  targetContractVersion: string;
  idempotencyKey: string;
  effectiveAt: string;
  currency?: string | null;
  amountMinor?: bigint | null;
  payload: unknown;
  createdAt: string;
  /**
   * Optional command contract namespace.  Accounting Pack keeps its historic
   * defaults; new finance domains can use a distinct contract without
   * changing the persisted bytes of the existing writer.
   */
  contractVersion?: string;
  evidenceNamespace?: string;
  evidenceIdPrefix?: string;
  commandIdPrefix?: string;
  stepUpVerifiedAt?: string | null;
  stepUpExpiresAt?: string | null;
}>;

/**
 * Write the immutable finance request/command evidence and idempotent command
 * rows used by canonical finance projections.
 */
export function ensureCommand(
  sqlite: DatabaseSync,
  deployment: FinanceCommandWriterDeployment,
  principal: Principal,
  descriptor: FinanceCommandInput,
  fail: CanonicalJsonErrorFactory,
): FinanceCommand {
  const contractVersion = descriptor.contractVersion ?? 'accounting-pack-command-v1';
  const evidenceNamespace = descriptor.evidenceNamespace ?? 'accounting-pack';
  const evidenceIdPrefix = descriptor.evidenceIdPrefix ?? 'fp';
  const commandIdPrefix = descriptor.commandIdPrefix ?? 'fp-cmd';
  const stepUpVerifiedAt = descriptor.stepUpVerifiedAt ?? null;
  const stepUpExpiresAt = descriptor.stepUpExpiresAt ?? null;
  const payloadHash = sha256(canonicalJson(descriptor.payload, fail));
  const sessionHash = sha256(principal.sessionId ?? `accounting-pack:${principal.userId}`);
  const requestBytes = Buffer.from(
    canonicalJson(
      {
        schema_version: contractVersion,
        tenant_id: deployment.tenantId,
        deployment_id: deployment.deploymentId,
        operation: descriptor.operation,
        idempotency_key: descriptor.idempotencyKey,
        principal_id: principal.userId,
        effective_at: descriptor.effectiveAt,
        target_kind: descriptor.targetKind,
        target_semantic_id: descriptor.targetSemanticId,
        amount_minor: descriptor.amountMinor ?? null,
        currency: descriptor.currency ?? null,
        payload_hash: payloadHash,
        session_id_hash: sessionHash,
      },
      fail,
    ),
  );
  const requestHash = ensureEvidence(
    sqlite,
    `${evidenceIdPrefix}-request-${sha256(requestBytes).slice(0, 48)}`,
    'finance_request',
    contractVersion,
    `${evidenceNamespace}-request:${sha256(requestBytes)}`,
    requestBytes,
    descriptor.createdAt,
    fail,
  );
  const commandBytes = Buffer.from(
    canonicalJson(
      {
        schema_version: contractVersion,
        request_hash: requestHash,
        operation: descriptor.operation,
        target_kind: descriptor.targetKind,
        target_semantic_id: descriptor.targetSemanticId,
        target_contract_version: descriptor.targetContractVersion,
        payload_hash: payloadHash,
      },
      fail,
    ),
  );
  const commandHash = ensureEvidence(
    sqlite,
    `${evidenceIdPrefix}-command-${sha256(commandBytes).slice(0, 48)}`,
    'finance_command',
    contractVersion,
    `${evidenceNamespace}-command:${sha256(commandBytes)}`,
    commandBytes,
    descriptor.createdAt,
    fail,
  );
  const commandId = `${commandIdPrefix}-${commandHash.slice(0, 48)}`;
  const existing = sqlite
    .prepare(
      `SELECT command_id,request_hash,command_hash,tenant_id,deployment_id,operation,
              idempotency_key,principal_id,effective_at,target_kind,target_semantic_id,
              CAST(amount_minor AS TEXT) amount_minor_text,currency,payload_hash,session_id_hash,
              step_up_verified_at,step_up_expires_at,state,completed_at
       FROM finance_command
       WHERE tenant_id=? AND deployment_id=? AND operation=? AND idempotency_key=?`,
    )
    .get(
      deployment.tenantId,
      deployment.deploymentId,
      descriptor.operation,
      descriptor.idempotencyKey,
    ) as DbRow | undefined;
  if (existing) {
    for (const [key, value] of [
      ['request_hash', requestHash],
      ['command_hash', commandHash],
      ['principal_id', principal.userId],
      ['effective_at', descriptor.effectiveAt],
      ['target_kind', descriptor.targetKind],
      ['target_semantic_id', descriptor.targetSemanticId],
      ['payload_hash', payloadHash],
      ['session_id_hash', sessionHash],
      ['state', 'completed'],
    ] as const)
      assertEqual(existing[key], value, `Finance command ${key}`, fail);
    if (
      rowValue<string | null>(existing, 'amount_minor_text') !==
      (descriptor.amountMinor === undefined || descriptor.amountMinor === null
        ? null
        : descriptor.amountMinor.toString())
    )
      return fail('Finance command amount is not idempotent');
    if (rowValue<string | null>(existing, 'currency') !== (descriptor.currency ?? null))
      return fail('Finance command currency is not idempotent');
    if (
      (stepUpVerifiedAt !== null || stepUpExpiresAt !== null) &&
      (!rowValue<string | null>(existing, 'step_up_verified_at') ||
        !rowValue<string | null>(existing, 'step_up_expires_at'))
    )
      return fail('Finance command step-up proof is not idempotent');
    return {
      commandId: String(existing.command_id),
      requestHash,
      commandHash,
    };
  }
  sqlite
    .prepare(
      `INSERT INTO finance_command(
         command_id,request_hash,command_hash,tenant_id,deployment_id,operation,idempotency_key,
         principal_id,effective_at,target_kind,target_semantic_id,amount_minor,currency,payload_hash,
         session_id_hash,step_up_verified_at,step_up_expires_at,policy_revision_id,policy_hash,
         state,completed_at,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      commandId,
      requestHash,
      commandHash,
      deployment.tenantId,
      deployment.deploymentId,
      descriptor.operation,
      descriptor.idempotencyKey,
      principal.userId,
      descriptor.effectiveAt,
      descriptor.targetKind,
      descriptor.targetSemanticId,
      descriptor.amountMinor ?? null,
      descriptor.currency ?? null,
      payloadHash,
      sessionHash,
      stepUpVerifiedAt,
      stepUpExpiresAt,
      null,
      null,
      'completed',
      descriptor.effectiveAt,
      descriptor.createdAt,
    );
  sqlite
    .prepare(
      `INSERT INTO finance_command_target(
         command_id,target_kind,target_semantic_id,target_contract_version
       ) VALUES(?,?,?,?)`,
    )
    .run(
      commandId,
      descriptor.targetKind,
      descriptor.targetSemanticId,
      descriptor.targetContractVersion,
    );
  return { commandId, requestHash, commandHash };
}
