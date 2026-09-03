import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, type Principal } from '@ja/domain';
import { recordAuditEvent } from '../../core/audit.ts';
import { readLiveSessionStepUp } from '../../core/authorization.ts';
import { canonicalJson, sha256 } from '../../core/canonical-json.ts';
import {
  ensureCommand,
  ensureEvidence,
  type FinanceCommandInput,
} from './finance-command-writer.ts';

type ErrorFactory = (message: string) => never;

export type CanonicalLegalEntityInput = Readonly<{
  legacyLegalEntityId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  legalName: string;
  taxIdentifier: string;
  registrationIdentifier?: string;
  addressLine1: string;
  addressLine2?: string;
  locality: string;
  region?: string;
  postalCode: string;
  countryCode: string;
  baseCurrency: string;
  timezone: string;
  reason: string;
  idempotencyKey: string;
}>;

export type ProjectLegalEntityAssignmentInput = Readonly<{
  projectId: string;
  legalEntityRevisionId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  idempotencyKey: string;
}>;

export type CanonicalProjectLegalEntityRepositoryDependencies = Readonly<{
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  now: () => string;
  errors: Readonly<{
    accessDenied: ErrorFactory;
    conflict: ErrorFactory;
    validation: ErrorFactory;
  }>;
}>;

export type CanonicalLegalEntityRevisionResult = Readonly<{
  revisionId: string;
  seriesId: string;
  revisionNumber: number;
  predecessorRevisionId: string | null;
  revisionHash: string;
  commandId: string;
  idempotent: boolean;
}>;

export type ProjectLegalEntityAssignmentResult = Readonly<{
  assignmentId: string;
  projectId: string;
  legalEntityRevisionId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  commandId: string;
  idempotent: boolean;
}>;

export type CanonicalLegalEntityRevisionOption = Readonly<{
  revisionId: string;
  legalEntityId: string;
  legalEntityCode: string;
  legalName: string;
  baseCurrency: string;
  timezone: string;
  revisionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}>;

export type ProjectLegalEntityAssignmentView = Readonly<{
  assignmentId: string;
  projectId: string;
  revisionId: string;
  legalEntityId: string;
  legalEntityCode: string;
  legalName: string;
  baseCurrency: string;
  revisionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}>;

export type ResolvedCanonicalProjectLegalEntity = Readonly<{
  assignmentId: string;
  projectId: string;
  revisionId: string;
  seriesId: string;
  revisionNumber: number;
  predecessorRevisionId: string | null;
  legalName: string;
  taxIdentifier: string;
  registrationIdentifier: string | null;
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  region: string | null;
  postalCode: string;
  countryCode: string;
  baseCurrency: string;
  timezone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignmentEffectiveFrom: string;
  assignmentEffectiveTo: string | null;
}>;

type Deployment = Readonly<{ tenantId: string; deploymentId: string }>;
type DbRow = Record<string, unknown>;

const COMMAND_CONTRACT = 'client-essential-finance-command-v1';
const REVISION_CONTRACT = 'client-essential-legal-entity-revision-v1';
const ASSIGNMENT_CONTRACT = 'client-essential-project-legal-entity-assignment-v1';
const BRIDGE_CONTRACT = 'legal-entity-revision-bridge-v1';

function rowValue<T>(row: DbRow | undefined, key: string): T | undefined {
  return row?.[key] as T | undefined;
}

function isSqliteConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /constraint|immutable|overlap|predecessor|assignment|unique|foreign key/iu.test(error.message)
  );
}

export class CanonicalProjectLegalEntityRepository {
  private readonly deps: CanonicalProjectLegalEntityRepositoryDependencies;

  constructor(deps: CanonicalProjectLegalEntityRepositoryDependencies) {
    this.deps = deps;
  }

  private failValidation(message: string): never {
    return this.deps.errors.validation(message);
  }

  private failConflict(message: string): never {
    return this.deps.errors.conflict(message);
  }

  private assertActiveFinancePrincipal(principal: Principal, requireStepUp: boolean): void {
    const user = this.deps.sqlite
      .prepare('SELECT status,role FROM user WHERE id=?')
      .get(principal.userId) as { status: string; role: string } | undefined;
    if (!user || user.status !== 'active')
      return this.deps.errors.accessDenied('Active finance principal required');
    if (
      !canManageBilling(principal) ||
      (user.role !== 'owner_admin' && user.role !== 'finance_admin')
    )
      return this.deps.errors.accessDenied('Finance role required');
    if (!requireStepUp) return;
    const nowMs = Date.parse(this.deps.now());
    if (
      !readLiveSessionStepUp(
        this.deps.sqlite,
        principal,
        Number.isFinite(nowMs) ? nowMs : Date.now(),
      )
    )
      return this.deps.errors.accessDenied('Recent step-up authentication is required');
  }

  private deployment(): Deployment {
    const row = this.deps.sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get() as { tenant_id: string; deployment_id: string } | undefined;
    if (!row) return this.failValidation('Deployment identity is not configured');
    return { tenantId: row.tenant_id, deploymentId: row.deployment_id };
  }

  private assertText(value: unknown, field: string, max = 500): string {
    if (typeof value !== 'string') return this.failValidation(`${field} is required`);
    const clean = value.trim();
    if (!clean) return this.failValidation(`${field} is required`);
    if (clean.length > max) return this.failValidation(`${field} is too long`);
    return clean;
  }

  private optionalText(value: unknown, field: string, max = 500): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.assertText(value, field, max);
  }

  private assertIsoDate(value: unknown, field: string): string {
    const clean = this.assertText(value, field, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean))
      return this.failValidation(`${field} must be an ISO date`);
    const parsed = new Date(`${clean}T00:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== clean)
      return this.failValidation(`${field} must be an ISO date`);
    return clean;
  }

  private assertCurrency(value: unknown): string {
    const clean = this.assertText(value, 'Base currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/u.test(clean)) return this.failValidation('Base currency is invalid');
    return clean;
  }

  private assertCountry(value: unknown): string {
    const clean = this.assertText(value, 'Country code', 2).toUpperCase();
    if (!/^[A-Z]{2}$/u.test(clean)) return this.failValidation('Country code is invalid');
    return clean;
  }

  private assertTimezone(value: unknown): string {
    const clean = this.assertText(value, 'Timezone', 120);
    if (/[^A-Za-z0-9_+./:-]/u.test(clean)) return this.failValidation('Timezone is invalid');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: clean }).format();
    } catch {
      return this.failValidation('Timezone is invalid');
    }
    return clean;
  }

  private normalizeRevisionInput(input: CanonicalLegalEntityInput): CanonicalLegalEntityInput {
    const effectiveFrom = this.assertIsoDate(input.effectiveFrom, 'Effective from');
    const effectiveTo =
      input.effectiveTo === undefined
        ? undefined
        : this.assertIsoDate(input.effectiveTo, 'Effective to');
    if (effectiveTo !== undefined && effectiveTo <= effectiveFrom)
      return this.failValidation('Effective to must follow effective from');
    return {
      legacyLegalEntityId: this.assertText(
        input.legacyLegalEntityId,
        'Legacy legal entity id',
        200,
      ),
      effectiveFrom,
      effectiveTo,
      legalName: this.assertText(input.legalName, 'Legal name'),
      taxIdentifier: this.assertText(input.taxIdentifier, 'Tax identifier'),
      registrationIdentifier:
        this.optionalText(input.registrationIdentifier, 'Registration identifier') ?? undefined,
      addressLine1: this.assertText(input.addressLine1, 'Address line 1'),
      addressLine2: this.optionalText(input.addressLine2, 'Address line 2') ?? undefined,
      locality: this.assertText(input.locality, 'Locality'),
      region: this.optionalText(input.region, 'Region') ?? undefined,
      postalCode: this.assertText(input.postalCode, 'Postal code', 80),
      countryCode: this.assertCountry(input.countryCode),
      baseCurrency: this.assertCurrency(input.baseCurrency),
      timezone: this.assertTimezone(input.timezone),
      reason: this.assertText(input.reason, 'Reason', 2000),
      idempotencyKey: this.assertText(input.idempotencyKey, 'Idempotency key', 240),
    };
  }

  private normalizeAssignmentInput(
    input: ProjectLegalEntityAssignmentInput,
  ): ProjectLegalEntityAssignmentInput {
    const effectiveFrom = this.assertIsoDate(input.effectiveFrom, 'Effective from');
    const effectiveTo =
      input.effectiveTo === undefined
        ? undefined
        : this.assertIsoDate(input.effectiveTo, 'Effective to');
    if (effectiveTo !== undefined && effectiveTo <= effectiveFrom)
      return this.failValidation('Effective to must follow effective from');
    return {
      projectId: this.assertText(input.projectId, 'Project id', 200),
      legalEntityRevisionId: this.assertText(
        input.legalEntityRevisionId,
        'Legal entity revision id',
        200,
      ),
      effectiveFrom,
      effectiveTo,
      reason: this.assertText(input.reason, 'Reason', 2000),
      idempotencyKey: this.assertText(input.idempotencyKey, 'Idempotency key', 240),
    };
  }

  private stepUpProof(principal: Principal): {
    stepUpVerifiedAt: string;
    stepUpExpiresAt: string;
  } {
    const nowMs = Date.parse(this.deps.now());
    const proof = readLiveSessionStepUp(
      this.deps.sqlite,
      principal,
      Number.isFinite(nowMs) ? nowMs : Date.now(),
    );
    if (!proof) return this.failConflict('Recent step-up authentication is required');
    return { stepUpVerifiedAt: proof.verifiedAt, stepUpExpiresAt: proof.expiresAt };
  }

  private commandDescriptor(
    input: Readonly<Record<string, unknown>>,
    operation: string,
    targetKind: string,
    targetSemanticId: string,
    targetContractVersion: string,
    proof: Readonly<{ stepUpVerifiedAt: string; stepUpExpiresAt: string }>,
    effectiveAt: string,
    createdAt: string,
    idempotencyKey: string,
  ): FinanceCommandInput {
    return {
      operation,
      targetKind,
      targetSemanticId,
      targetContractVersion,
      idempotencyKey,
      effectiveAt,
      payload: input,
      createdAt,
      contractVersion: COMMAND_CONTRACT,
      evidenceNamespace: 'client-essential',
      evidenceIdPrefix: 'ce',
      commandIdPrefix: 'ce-cmd',
      stepUpVerifiedAt: proof.stepUpVerifiedAt,
      stepUpExpiresAt: proof.stepUpExpiresAt,
      currency: null,
      amountMinor: null,
    };
  }

  private commandError(message: string): never {
    return this.failConflict(message);
  }

  private writeRevisionEvidence(
    deployment: Deployment,
    normalized: CanonicalLegalEntityInput,
    revisionId: string,
    seriesId: string,
    revisionNumber: number,
    predecessorRevisionId: string | null,
    createdAt: string,
  ): { hash: string; bytes: Buffer; evidenceId: string } {
    const bytes = Buffer.from(
      canonicalJson({
        schema_version: REVISION_CONTRACT,
        revision_id: revisionId,
        series_id: seriesId,
        revision_number: revisionNumber,
        predecessor_revision_id: predecessorRevisionId,
        tenant_id: deployment.tenantId,
        deployment_id: deployment.deploymentId,
        legacy_legal_entity_id: normalized.legacyLegalEntityId,
        legal_name: normalized.legalName,
        tax_identifier: normalized.taxIdentifier,
        registration_identifier: normalized.registrationIdentifier ?? null,
        address_line1: normalized.addressLine1,
        address_line2: normalized.addressLine2 ?? null,
        locality: normalized.locality,
        region: normalized.region ?? null,
        postal_code: normalized.postalCode,
        country_code: normalized.countryCode,
        base_currency: normalized.baseCurrency,
        timezone: normalized.timezone,
        effective_from: normalized.effectiveFrom,
        effective_to: normalized.effectiveTo ?? null,
        reason: normalized.reason,
      }),
    );
    const hash = sha256(bytes);
    const evidenceId = `ce-legal-entity-revision-evidence-${revisionId}`;
    ensureEvidence(
      this.deps.sqlite,
      evidenceId,
      'legal_entity_revision',
      REVISION_CONTRACT,
      `legal-entity-revision:${revisionId}`,
      bytes,
      createdAt,
      this.failConflict.bind(this),
    );
    return { hash, bytes, evidenceId };
  }

  private appendChange(
    deployment: Deployment,
    entityKind: string,
    entityId: string,
    changeKind: string,
    effectiveAt: string,
    evidenceType: string,
    evidenceId: string,
    evidenceHash: string,
    commandId: string,
    createdAt: string,
  ): void {
    const changeId = `ce-finance-change-${sha256(
      `${deployment.tenantId}:${deployment.deploymentId}:${entityKind}:${entityId}:${evidenceId}`,
    ).slice(0, 48)}`;
    const existing = this.deps.sqlite
      .prepare(
        `SELECT change_id,tenant_id,deployment_id,entity_kind,entity_id,change_kind,
                effective_at,evidence_type,evidence_id,evidence_hash,command_id,created_at
           FROM finance_change_event WHERE evidence_type=? AND evidence_id=?`,
      )
      .get(evidenceType, evidenceId) as DbRow | undefined;
    if (existing) {
      for (const [key, value] of Object.entries({
        change_id: changeId,
        tenant_id: deployment.tenantId,
        deployment_id: deployment.deploymentId,
        entity_kind: entityKind,
        entity_id: entityId,
        change_kind: changeKind,
        effective_at: effectiveAt,
        evidence_hash: evidenceHash,
        command_id: commandId,
        created_at: createdAt,
      })) {
        if (rowValue(existing, key) !== value)
          return this.commandError('Finance change evidence is not idempotent');
      }
      return;
    }
    try {
      this.deps.sqlite
        .prepare(
          `INSERT INTO finance_change_event(
             change_id,tenant_id,deployment_id,entity_kind,entity_id,change_kind,
             effective_at,evidence_type,evidence_id,evidence_hash,command_id,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          changeId,
          deployment.tenantId,
          deployment.deploymentId,
          entityKind,
          entityId,
          changeKind,
          effectiveAt,
          evidenceType,
          evidenceId,
          evidenceHash,
          commandId,
          createdAt,
        );
    } catch (error) {
      if (isSqliteConflict(error)) return this.commandError('Finance change evidence conflicted');
      throw error;
    }
  }

  createCanonicalLegalEntityRevision(
    principal: Principal,
    input: CanonicalLegalEntityInput,
  ): CanonicalLegalEntityRevisionResult {
    this.assertActiveFinancePrincipal(principal, true);
    const normalized = this.normalizeRevisionInput(input);
    const proof = this.stepUpProof(principal);
    return this.deps.transaction(() => {
      const deployment = this.deployment();
      const legacy = this.deps.sqlite
        .prepare('SELECT id,code,legal_name,currency,version,status FROM legal_entity WHERE id=?')
        .get(normalized.legacyLegalEntityId) as
        | {
            id: string;
            code: string;
            legal_name: string;
            currency: string;
            version: number;
            status?: string;
          }
        | undefined;
      if (!legacy) return this.failValidation('Legacy legal entity not found');
      if (legacy.currency.toUpperCase() !== normalized.baseCurrency)
        return this.failValidation('Base currency must match the legacy legal entity');
      if (!Number.isSafeInteger(legacy.version) || legacy.version < 1)
        return this.failConflict('Legacy legal entity version is invalid');

      const bridged = this.deps.sqlite
        .prepare(
          `SELECT b.bridge_id,b.canonical_revision_id,r.series_id
             FROM legal_entity_revision_bridge b
             JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
            WHERE b.tenant_id=? AND b.deployment_id=? AND b.legacy_legal_entity_id=?`,
        )
        .get(deployment.tenantId, deployment.deploymentId, legacy.id) as
        | { bridge_id: string; canonical_revision_id: string; series_id: string }
        | undefined;
      const seriesId =
        bridged?.series_id ??
        `ce-legal-entity-series-${sha256(
          `${deployment.tenantId}:${deployment.deploymentId}:${legacy.id}`,
        ).slice(0, 40)}`;
      const revisionId = `ce-legal-entity-revision-${sha256(
        `${deployment.tenantId}:${deployment.deploymentId}:${legacy.id}:${normalized.idempotencyKey}`,
      ).slice(0, 40)}`;
      const createdAt = this.deps.now();
      const commandPayload = {
        schema_version: REVISION_CONTRACT,
        revision_id: revisionId,
        series_id: seriesId,
        legacy_legal_entity_id: normalized.legacyLegalEntityId,
        ...normalized,
      };
      const command = ensureCommand(
        this.deps.sqlite,
        deployment,
        principal,
        this.commandDescriptor(
          commandPayload,
          'legal_entity_revision.create',
          'legal_entity_revision',
          revisionId,
          'legal-entity-revision-v1',
          proof,
          normalized.effectiveFrom,
          createdAt,
          normalized.idempotencyKey,
        ),
        this.failConflict.bind(this),
      );
      const existing = this.deps.sqlite
        .prepare(
          `SELECT revision_id,series_id,revision_number,predecessor_revision_id,revision_hash,command_id
             FROM legal_entity_revision WHERE revision_id=?`,
        )
        .get(revisionId) as DbRow | undefined;
      if (existing) {
        if (
          rowValue(existing, 'series_id') !== seriesId ||
          rowValue(existing, 'command_id') !== command.commandId
        )
          return this.commandError('Canonical legal-entity revision is not idempotent');
        return {
          revisionId,
          seriesId,
          revisionNumber: Number(rowValue(existing, 'revision_number')),
          predecessorRevisionId:
            rowValue<string | null>(existing, 'predecessor_revision_id') ?? null,
          revisionHash: String(rowValue(existing, 'revision_hash')),
          commandId: command.commandId,
          idempotent: true,
        };
      }

      const tail = this.deps.sqlite
        .prepare(
          `SELECT revision_id,revision_number,effective_from,effective_to
             FROM legal_entity_revision
            WHERE series_id=?
            ORDER BY revision_number DESC
            LIMIT 1`,
        )
        .get(seriesId) as
        | {
            revision_id: string;
            revision_number: number;
            effective_from: string;
            effective_to: string | null;
          }
        | undefined;
      if (
        tail &&
        (normalized.effectiveFrom <= tail.effective_from ||
          (tail.effective_to !== null && tail.effective_to >= normalized.effectiveFrom))
      )
        return this.failConflict(
          'Legal-entity revision effective date must follow the current tail',
        );
      const revisionNumber = (tail?.revision_number ?? 0) + 1;
      const predecessorRevisionId = tail?.revision_id ?? null;
      const evidence = this.writeRevisionEvidence(
        deployment,
        normalized,
        revisionId,
        seriesId,
        revisionNumber,
        predecessorRevisionId,
        createdAt,
      );
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO legal_entity_revision(
               revision_id,series_id,revision_number,predecessor_revision_id,
               tenant_id,deployment_id,legal_name,tax_identifier,registration_identifier,
               address_line1,address_line2,locality,region,postal_code,country_code,
               base_currency,timezone,effective_from,effective_to,revision_hash,
               created_at,created_by,command_id
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            revisionId,
            seriesId,
            revisionNumber,
            predecessorRevisionId,
            deployment.tenantId,
            deployment.deploymentId,
            normalized.legalName,
            normalized.taxIdentifier,
            normalized.registrationIdentifier ?? null,
            normalized.addressLine1,
            normalized.addressLine2 ?? null,
            normalized.locality,
            normalized.region ?? null,
            normalized.postalCode,
            normalized.countryCode,
            normalized.baseCurrency,
            normalized.timezone,
            normalized.effectiveFrom,
            normalized.effectiveTo ?? null,
            evidence.hash,
            createdAt,
            principal.userId,
            command.commandId,
          );
      } catch (error) {
        if (isSqliteConflict(error))
          return this.commandError('Canonical legal-entity revision conflicted');
        throw error;
      }
      this.appendChange(
        deployment,
        'legal_entity_revision',
        revisionId,
        'configure',
        normalized.effectiveFrom,
        'legal_entity_revision',
        evidence.evidenceId,
        evidence.hash,
        command.commandId,
        createdAt,
      );
      recordAuditEvent(
        this.deps.sqlite,
        { ...principal, correlationId: command.commandId },
        'canonical_legal_entity.configure',
        'legal_entity_revision',
        revisionId,
        {
          before: null,
          after: {
            revisionId,
            seriesId,
            revisionNumber,
            predecessorRevisionId,
            legalName: normalized.legalName,
            taxIdentifier: normalized.taxIdentifier,
            baseCurrency: normalized.baseCurrency,
            timezone: normalized.timezone,
            effectiveFrom: normalized.effectiveFrom,
            effectiveTo: normalized.effectiveTo ?? null,
          },
          reason: normalized.reason,
          commandId: command.commandId,
          commandHash: command.commandHash,
        },
      );

      if (!predecessorRevisionId && !bridged) {
        const bridgeId = `ce-legal-entity-bridge-${sha256(
          `${deployment.tenantId}:${deployment.deploymentId}:${legacy.id}:${revisionId}`,
        ).slice(0, 40)}`;
        const manifest = {
          schema_version: 'legal-entity-identity-manifest-v1',
          tenant_id: deployment.tenantId,
          deployment_id: deployment.deploymentId,
          legacy_legal_entity_id: legacy.id,
          legacy_legal_entity_code: legacy.code,
          legacy_legal_entity_name: legacy.legal_name,
          legacy_legal_entity_version: legacy.version,
          legacy_currency: legacy.currency.toUpperCase(),
          canonical_revision_id: revisionId,
          canonical_revision_hash: evidence.hash,
          canonical_currency: normalized.baseCurrency,
          canonical_timezone: normalized.timezone,
        };
        const manifestJson = canonicalJson(manifest);
        const bridgeCommand = ensureCommand(
          this.deps.sqlite,
          deployment,
          principal,
          this.commandDescriptor(
            { ...manifest, bridge_id: bridgeId, reason: normalized.reason },
            'legal_entity_revision_bridge.create',
            'legal_entity_revision_bridge',
            bridgeId,
            BRIDGE_CONTRACT,
            proof,
            normalized.effectiveFrom,
            createdAt,
            `${normalized.idempotencyKey}:bridge`,
          ),
          this.failConflict.bind(this),
        );
        recordAuditEvent(
          this.deps.sqlite,
          { ...principal, correlationId: bridgeCommand.commandId },
          'legal_entity_revision_bridge.create',
          'legal_entity_revision_bridge',
          bridgeId,
          {
            command_id: bridgeCommand.commandId,
            command_hash: bridgeCommand.commandHash,
            target_kind: 'legal_entity_revision_bridge',
            target_semantic_id: bridgeId,
            target_contract_version: BRIDGE_CONTRACT,
          },
        );
        const bridgeAudit = this.deps.sqlite
          .prepare(
            `SELECT id FROM audit_event
               WHERE action='legal_entity_revision_bridge.create'
                 AND entity_type='legal_entity_revision_bridge'
                 AND entity_id=? AND correlation_id=?
               ORDER BY occurred_at DESC,id DESC LIMIT 1`,
          )
          .get(bridgeId, bridgeCommand.commandId) as { id: string } | undefined;
        if (!bridgeAudit) return this.commandError('Legal-entity bridge audit was not recorded');
        try {
          this.deps.sqlite
            .prepare(
              `INSERT INTO legal_entity_revision_bridge(
                 bridge_id,tenant_id,deployment_id,legacy_legal_entity_id,canonical_revision_id,
                 legacy_legal_entity_code,legacy_legal_entity_name,legacy_legal_entity_version,
                 legacy_currency,canonical_revision_hash,canonical_currency,canonical_timezone,
                 identity_manifest_version,identity_manifest_json,identity_manifest_sha256,
                 command_id,audit_event_id,created_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            )
            .run(
              bridgeId,
              deployment.tenantId,
              deployment.deploymentId,
              legacy.id,
              revisionId,
              legacy.code,
              legacy.legal_name,
              legacy.version,
              legacy.currency.toUpperCase(),
              evidence.hash,
              normalized.baseCurrency,
              normalized.timezone,
              'legal-entity-identity-manifest-v1',
              manifestJson,
              sha256(manifestJson),
              bridgeCommand.commandId,
              bridgeAudit.id,
              createdAt,
            );
        } catch (error) {
          if (isSqliteConflict(error)) return this.commandError('Legal-entity bridge conflicted');
          throw error;
        }
      }
      return {
        revisionId,
        seriesId,
        revisionNumber,
        predecessorRevisionId,
        revisionHash: evidence.hash,
        commandId: command.commandId,
        idempotent: false,
      };
    });
  }

  assignCanonicalLegalEntityToProject(
    principal: Principal,
    input: ProjectLegalEntityAssignmentInput,
  ): ProjectLegalEntityAssignmentResult {
    this.assertActiveFinancePrincipal(principal, true);
    const normalized = this.normalizeAssignmentInput(input);
    const proof = this.stepUpProof(principal);
    return this.deps.transaction(() => {
      const deployment = this.deployment();
      const project = this.deps.sqlite
        .prepare('SELECT id FROM project WHERE id=?')
        .get(normalized.projectId) as { id: string } | undefined;
      if (!project) return this.failValidation('Project not found');
      const revision = this.deps.sqlite
        .prepare(
          `SELECT revision_id,series_id,revision_number,predecessor_revision_id,
                  tenant_id,deployment_id,effective_from,effective_to,base_currency,timezone,
                  revision_hash
             FROM legal_entity_revision
            WHERE revision_id=?`,
        )
        .get(normalized.legalEntityRevisionId) as DbRow | undefined;
      if (!revision) return this.failValidation('Legal-entity revision not found');
      if (
        rowValue(revision, 'tenant_id') !== deployment.tenantId ||
        rowValue(revision, 'deployment_id') !== deployment.deploymentId
      )
        return this.deps.errors.accessDenied('Legal-entity revision scope mismatch');
      const canonicalEvidence = this.deps.sqlite
        .prepare(
          `SELECT evidence_id FROM finance_hash_evidence
            WHERE evidence_type='legal_entity_revision'
              AND contract_version=? AND evidence_hash=?`,
        )
        .get(REVISION_CONTRACT, String(rowValue(revision, 'revision_hash')));
      if (!canonicalEvidence)
        return this.failConflict(
          'Project authority requires a complete Client Essential legal-entity revision',
        );

      const assignmentId = `ce-project-legal-entity-assignment-${sha256(
        `${deployment.tenantId}:${deployment.deploymentId}:${normalized.projectId}:${normalized.idempotencyKey}`,
      ).slice(0, 40)}`;
      const createdAt = this.deps.now();
      const command = ensureCommand(
        this.deps.sqlite,
        deployment,
        principal,
        this.commandDescriptor(
          {
            schema_version: ASSIGNMENT_CONTRACT,
            assignment_id: assignmentId,
            project_id: normalized.projectId,
            legal_entity_revision_id: normalized.legalEntityRevisionId,
            effective_from: normalized.effectiveFrom,
            effective_to: normalized.effectiveTo ?? null,
            reason: normalized.reason,
          },
          'project_legal_entity_assignment.create',
          'project_legal_entity_assignment',
          assignmentId,
          ASSIGNMENT_CONTRACT,
          proof,
          normalized.effectiveFrom,
          createdAt,
          normalized.idempotencyKey,
        ),
        this.failConflict.bind(this),
      );
      const existing = this.deps.sqlite
        .prepare(
          `SELECT assignment_id,project_id,legal_entity_revision_id,effective_from,effective_to,command_id
             FROM project_legal_entity_assignment WHERE assignment_id=?`,
        )
        .get(assignmentId) as DbRow | undefined;
      if (existing) {
        for (const [key, value] of Object.entries({
          project_id: normalized.projectId,
          legal_entity_revision_id: normalized.legalEntityRevisionId,
          effective_from: normalized.effectiveFrom,
          effective_to: normalized.effectiveTo ?? null,
          command_id: command.commandId,
        })) {
          if (rowValue(existing, key) !== value)
            return this.commandError('Project legal-entity assignment is not idempotent');
        }
        return {
          assignmentId,
          projectId: normalized.projectId,
          legalEntityRevisionId: normalized.legalEntityRevisionId,
          effectiveFrom: normalized.effectiveFrom,
          effectiveTo: normalized.effectiveTo ?? null,
          commandId: command.commandId,
          idempotent: true,
        };
      }
      const overlap = this.deps.sqlite
        .prepare(
          `SELECT assignment_id FROM project_legal_entity_assignment
            WHERE project_id=?
              AND effective_from<=COALESCE(?, '9999-12-31')
              AND ?<=COALESCE(effective_to, '9999-12-31')
            LIMIT 1`,
        )
        .get(normalized.projectId, normalized.effectiveTo ?? null, normalized.effectiveFrom) as
        | { assignment_id: string }
        | undefined;
      if (overlap)
        return this.failConflict('Project legal-entity assignment overlaps an existing interval');

      if (normalized.effectiveFrom < String(rowValue(revision, 'effective_from')))
        return this.failValidation('Assignment starts before the legal-entity revision');
      const revisionEffectiveTo = rowValue<string | null>(revision, 'effective_to') ?? null;
      if (
        revisionEffectiveTo !== null &&
        (normalized.effectiveTo === undefined || normalized.effectiveTo > revisionEffectiveTo)
      )
        return this.failValidation('Assignment must end within the legal-entity revision interval');

      const assignmentBytes = Buffer.from(
        canonicalJson({
          schema_version: ASSIGNMENT_CONTRACT,
          assignment_id: assignmentId,
          tenant_id: deployment.tenantId,
          deployment_id: deployment.deploymentId,
          project_id: normalized.projectId,
          legal_entity_revision_id: normalized.legalEntityRevisionId,
          effective_from: normalized.effectiveFrom,
          effective_to: normalized.effectiveTo ?? null,
          reason: normalized.reason,
        }),
      );
      const assignmentEvidenceId = `ce-project-legal-entity-assignment-evidence-${assignmentId}`;
      const assignmentEvidenceHash = ensureEvidence(
        this.deps.sqlite,
        assignmentEvidenceId,
        'configuration_revision',
        ASSIGNMENT_CONTRACT,
        `project-legal-entity-assignment:${assignmentId}`,
        assignmentBytes,
        createdAt,
        this.failConflict.bind(this),
      );
      try {
        this.deps.sqlite
          .prepare(
            `INSERT INTO project_legal_entity_assignment(
               assignment_id,project_id,legal_entity_revision_id,tenant_id,deployment_id,
               effective_from,effective_to,created_at,command_id
             ) VALUES(?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            assignmentId,
            normalized.projectId,
            normalized.legalEntityRevisionId,
            deployment.tenantId,
            deployment.deploymentId,
            normalized.effectiveFrom,
            normalized.effectiveTo ?? null,
            createdAt,
            command.commandId,
          );
      } catch (error) {
        if (isSqliteConflict(error))
          return this.commandError('Project legal-entity assignment conflicted');
        throw error;
      }
      this.appendChange(
        deployment,
        'project_legal_entity_assignment',
        assignmentId,
        'assign',
        normalized.effectiveFrom,
        'configuration_revision',
        assignmentEvidenceId,
        assignmentEvidenceHash,
        command.commandId,
        createdAt,
      );
      recordAuditEvent(
        this.deps.sqlite,
        { ...principal, correlationId: command.commandId },
        'project_legal_entity.assign',
        'project_legal_entity_assignment',
        assignmentId,
        {
          projectId: normalized.projectId,
          before: null,
          after: {
            assignmentId,
            legalEntityRevisionId: normalized.legalEntityRevisionId,
            effectiveFrom: normalized.effectiveFrom,
            effectiveTo: normalized.effectiveTo ?? null,
          },
          reason: normalized.reason,
          commandId: command.commandId,
          commandHash: command.commandHash,
        },
      );
      return {
        assignmentId,
        projectId: normalized.projectId,
        legalEntityRevisionId: normalized.legalEntityRevisionId,
        effectiveFrom: normalized.effectiveFrom,
        effectiveTo: normalized.effectiveTo ?? null,
        commandId: command.commandId,
        idempotent: false,
      };
    });
  }

  listCanonicalLegalEntityRevisionOptions(
    principal: Principal,
  ): CanonicalLegalEntityRevisionOption[] {
    this.assertActiveFinancePrincipal(principal, false);
    const deployment = this.deployment();
    return this.deps.sqlite
      .prepare(
        `SELECT r.revision_id,b.legacy_legal_entity_id,e.code,r.legal_name,r.base_currency,
                r.timezone,r.revision_number,r.effective_from,r.effective_to
           FROM legal_entity_revision_bridge b
           JOIN legal_entity_revision r ON r.revision_id=b.canonical_revision_id
           JOIN legal_entity e ON e.id=b.legacy_legal_entity_id
           JOIN finance_hash_evidence h
             ON h.evidence_type='legal_entity_revision'
            AND h.contract_version=? AND h.evidence_hash=r.revision_hash
          WHERE b.tenant_id=? AND b.deployment_id=?
            AND r.tenant_id=? AND r.deployment_id=? AND e.status='active'
          ORDER BY r.legal_name,r.effective_from DESC,r.revision_number DESC`,
      )
      .all(
        REVISION_CONTRACT,
        deployment.tenantId,
        deployment.deploymentId,
        deployment.tenantId,
        deployment.deploymentId,
      )
      .map((row) => {
        const value = row as DbRow;
        return {
          revisionId: String(value.revision_id),
          legalEntityId: String(value.legacy_legal_entity_id),
          legalEntityCode: String(value.code),
          legalName: String(value.legal_name),
          baseCurrency: String(value.base_currency),
          timezone: String(value.timezone),
          revisionNumber: Number(value.revision_number),
          effectiveFrom: String(value.effective_from),
          effectiveTo: rowValue<string | null>(value, 'effective_to') ?? null,
        };
      });
  }

  listProjectLegalEntityAssignments(
    principal: Principal,
    projectId: string,
  ): ProjectLegalEntityAssignmentView[] {
    this.assertActiveFinancePrincipal(principal, false);
    const cleanProjectId = this.assertText(projectId, 'Project id', 200);
    const deployment = this.deployment();
    if (!this.deps.sqlite.prepare('SELECT id FROM project WHERE id=?').get(cleanProjectId))
      return this.failValidation('Project not found');
    return this.deps.sqlite
      .prepare(
        `SELECT a.assignment_id,a.project_id,a.legal_entity_revision_id,
                b.legacy_legal_entity_id,e.code,r.legal_name,r.base_currency,r.revision_number,
                a.effective_from,a.effective_to
           FROM project_legal_entity_assignment a
           JOIN legal_entity_revision r ON r.revision_id=a.legal_entity_revision_id
           JOIN legal_entity_revision_bridge b ON b.canonical_revision_id=r.revision_id
           JOIN legal_entity e ON e.id=b.legacy_legal_entity_id
          WHERE a.project_id=? AND a.tenant_id=? AND a.deployment_id=?
            AND r.tenant_id=? AND r.deployment_id=?
            AND b.tenant_id=? AND b.deployment_id=?
          ORDER BY a.effective_from DESC,a.assignment_id DESC`,
      )
      .all(
        cleanProjectId,
        deployment.tenantId,
        deployment.deploymentId,
        deployment.tenantId,
        deployment.deploymentId,
        deployment.tenantId,
        deployment.deploymentId,
      )
      .map((row) => {
        const value = row as DbRow;
        return {
          assignmentId: String(value.assignment_id),
          projectId: String(value.project_id),
          revisionId: String(value.legal_entity_revision_id),
          legalEntityId: String(value.legacy_legal_entity_id),
          legalEntityCode: String(value.code),
          legalName: String(value.legal_name),
          baseCurrency: String(value.base_currency),
          revisionNumber: Number(value.revision_number),
          effectiveFrom: String(value.effective_from),
          effectiveTo: rowValue<string | null>(value, 'effective_to') ?? null,
        };
      });
  }

  resolveCanonicalProjectLegalEntity(
    principal: Principal,
    projectId: string,
    onDate: string,
  ): ResolvedCanonicalProjectLegalEntity {
    this.assertActiveFinancePrincipal(principal, false);
    const cleanProjectId = this.assertText(projectId, 'Project id', 200);
    const cleanDate = this.assertIsoDate(onDate, 'Resolution date');
    const deployment = this.deployment();
    if (!this.deps.sqlite.prepare('SELECT id FROM project WHERE id=?').get(cleanProjectId))
      return this.failValidation('Project not found');
    const rows = this.deps.sqlite
      .prepare(
        `SELECT a.assignment_id,a.project_id,a.effective_from assignment_effective_from,
                a.effective_to assignment_effective_to,
                r.revision_id,r.series_id,r.revision_number,r.predecessor_revision_id,
                r.legal_name,r.tax_identifier,r.registration_identifier,r.address_line1,
                r.address_line2,r.locality,r.region,r.postal_code,r.country_code,
                r.base_currency,r.timezone,r.effective_from,r.effective_to
           FROM project_legal_entity_assignment a
           JOIN legal_entity_revision r ON r.revision_id=a.legal_entity_revision_id
          WHERE a.project_id=? AND a.tenant_id=? AND a.deployment_id=?
            AND a.effective_from<=?
            AND (a.effective_to IS NULL OR a.effective_to>=?)
            AND r.tenant_id=? AND r.deployment_id=?
            AND r.effective_from<=?
            AND (r.effective_to IS NULL OR r.effective_to>=?)`,
      )
      .all(
        cleanProjectId,
        deployment.tenantId,
        deployment.deploymentId,
        cleanDate,
        cleanDate,
        deployment.tenantId,
        deployment.deploymentId,
        cleanDate,
        cleanDate,
      ) as DbRow[];
    if (rows.length === 0)
      return this.failConflict('No canonical legal-entity assignment is effective on this date');
    if (rows.length !== 1)
      return this.failConflict(
        'Multiple canonical legal-entity assignments are effective on this date',
      );
    const row = rows[0];
    if (!row) return this.failConflict('Canonical legal-entity assignment could not be resolved');
    return {
      assignmentId: String(row.assignment_id),
      projectId: String(row.project_id),
      revisionId: String(row.revision_id),
      seriesId: String(row.series_id),
      revisionNumber: Number(row.revision_number),
      predecessorRevisionId: rowValue<string | null>(row, 'predecessor_revision_id') ?? null,
      legalName: String(row.legal_name),
      taxIdentifier: String(row.tax_identifier),
      registrationIdentifier: rowValue<string | null>(row, 'registration_identifier') ?? null,
      addressLine1: String(row.address_line1),
      addressLine2: rowValue<string | null>(row, 'address_line2') ?? null,
      locality: String(row.locality),
      region: rowValue<string | null>(row, 'region') ?? null,
      postalCode: String(row.postal_code),
      countryCode: String(row.country_code),
      baseCurrency: String(row.base_currency),
      timezone: String(row.timezone),
      effectiveFrom: String(row.effective_from),
      effectiveTo: rowValue<string | null>(row, 'effective_to') ?? null,
      assignmentEffectiveFrom: String(row.assignment_effective_from),
      assignmentEffectiveTo: rowValue<string | null>(row, 'assignment_effective_to') ?? null,
    };
  }
}
