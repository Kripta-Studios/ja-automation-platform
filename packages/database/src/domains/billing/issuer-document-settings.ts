import type { DatabaseSync } from 'node:sqlite';
import { canManageBilling, type Principal } from '@ja/domain';
import { issuerDocumentSettingsInputSchema } from '@ja/schemas';
import { assertActiveAccount, assertLiveSession } from '../../core/authorization.ts';
import { recordAuditEvent } from '../../core/audit.ts';
import { runImmediateTransaction } from '../../core/transaction.ts';
import { issuerPaymentDefaults } from './issuer-payment-defaults.ts';

type ErrorConstructor = new (message: string) => Error;
export type IssuerSettingsErrors = {
  access: ErrorConstructor;
  conflict: ErrorConstructor;
  validation: ErrorConstructor;
};
const fields = {
  bankSwiftNumber: 'bank_swift_number',
  bankAccountNumber: 'bank_account_number',
  bankName: 'bank_name',
  beneficiary: 'beneficiary',
  companyDivision: 'company_division',
  companyPhone: 'company_phone',
  companyEmail: 'company_email',
  companyWebsite: 'company_website',
} as const;

export function readIssuerDocumentSettings(
  sqlite: DatabaseSync,
  legalEntityId: string,
  currency: string,
) {
  const issuer = sqlite
    .prepare('SELECT id,code,currency,status FROM legal_entity WHERE id=?')
    .get(legalEntityId);
  if (!issuer || issuer.currency !== currency)
    throw new Error('Issuing entity currency does not match document settings');
  const row = sqlite
    .prepare(
      `SELECT s.* FROM issuer_document_settings s JOIN deployment_identity d
    ON d.tenant_id=s.tenant_id AND d.deployment_id=s.deployment_id AND d.singleton=1
    WHERE s.legal_entity_id=? AND s.currency=?`,
    )
    .get(legalEntityId, currency);
  const defaults = issuerPaymentDefaults(issuer.code, currency);
  return {
    legalEntityId,
    currency,
    version: Number(row?.version ?? 0),
    ...Object.fromEntries(
      Object.entries(fields).map(([name, column]) => [
        name,
        String(row?.[column] ?? defaults[name] ?? ''),
      ]),
    ),
  } as { legalEntityId: string; currency: string; version: number } & Record<
    keyof typeof fields,
    string
  >;
}

export function issuerSettingsPresentation(
  settings: ReturnType<typeof readIssuerDocumentSettings>,
) {
  return {
    termsAndInstructions: {
      bankSwiftNumber: settings.bankSwiftNumber,
      bankAccountNumber: settings.bankAccountNumber,
      bankName: settings.bankName,
      beneficiary: settings.beneficiary,
    },
    companyInfo: {
      division: settings.companyDivision,
      phone: settings.companyPhone,
      email: settings.companyEmail,
      website: settings.companyWebsite,
    },
  };
}

/** Keep saved draft content intact while making cached artifacts and open editors stale. */
export function invalidateDraftPresentation(
  sqlite: DatabaseSync,
  predicate: string,
  values: readonly (string | number)[],
  excludeInvoiceId = '',
) {
  return sqlite
    .prepare(
      `UPDATE invoice SET pdf_status='pending',pdf_storage_key=NULL,pdf_sha256=NULL,
    pdf_generated_at=NULL,pdf_byte_length=NULL,updated_at=?,version=version+1
    WHERE state='draft' AND id<>? AND (${predicate})
    AND EXISTS(SELECT 1 FROM deployment_identity d WHERE d.singleton=1
      AND (invoice.tenant_id IS NULL OR invoice.tenant_id=d.tenant_id)
      AND (invoice.deployment_id IS NULL OR invoice.deployment_id=d.deployment_id))
    AND NOT EXISTS(SELECT 1 FROM localized_pdf_variant v WHERE v.owner_type='invoice' AND v.owner_id=invoice.id)`,
    )
    .run(new Date().toISOString(), excludeInvoiceId, ...values).changes;
}

export function updateIssuerDocumentSettings(
  sqlite: DatabaseSync,
  principal: Principal,
  input: unknown,
  errors: IssuerSettingsErrors,
  excludeInvoiceId = '',
) {
  assertActiveAccount(sqlite, principal, errors.access);
  assertLiveSession(sqlite, principal, errors.access);
  if (!canManageBilling(principal)) throw new errors.access('Finance role required');
  const parsed = issuerDocumentSettingsInputSchema.safeParse(input);
  if (!parsed.success)
    throw new errors.validation('Check the issuing company payment and contact fields.');
  const data = parsed.data;
  return runImmediateTransaction(sqlite, 'issuer-document-settings', () => {
    assertActiveAccount(sqlite, principal, errors.access);
    assertLiveSession(sqlite, principal, errors.access);
    const role = sqlite.prepare('SELECT role FROM user WHERE id=?').get(principal.userId)?.role;
    if (role !== 'owner_admin' && role !== 'finance_admin')
      throw new errors.access('Finance role required');
    const issuer = sqlite
      .prepare("SELECT id,currency FROM legal_entity WHERE id=? AND status='active'")
      .get(data.legalEntityId);
    if (!issuer || issuer.currency !== data.currency)
      throw new errors.validation('Active issuing company with matching currency required');
    const before = readIssuerDocumentSettings(sqlite, data.legalEntityId, data.currency);
    if (before.version !== data.expectedVersion)
      throw new errors.conflict(
        'The issuing company payment or contact settings changed. Refresh before saving.',
      );
    const after = { ...before };
    for (const name of Object.keys(fields) as Array<keyof typeof fields>)
      if (data[name] !== undefined) after[name] = data[name]!;
    const changed = (Object.keys(fields) as Array<keyof typeof fields>).filter(
      (name) => after[name] !== before[name],
    );
    if (!changed.length) return { success: true, settings: before, affectedDrafts: 0 };
    const deployment = sqlite
      .prepare('SELECT tenant_id,deployment_id FROM deployment_identity WHERE singleton=1')
      .get();
    if (!deployment) throw new errors.validation('Deployment identity is not configured');
    const timestamp = new Date().toISOString();
    const values = (Object.keys(fields) as Array<keyof typeof fields>).map((name) => after[name]);
    if (before.version === 0) {
      sqlite
        .prepare(
          `INSERT INTO issuer_document_settings(tenant_id,deployment_id,legal_entity_id,currency,
        ${Object.values(fields).join(',')},version,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
        )
        .run(
          String(deployment.tenant_id),
          String(deployment.deployment_id),
          data.legalEntityId,
          data.currency,
          ...values,
          timestamp,
          timestamp,
          principal.userId,
        );
    } else {
      const result = sqlite
        .prepare(
          `UPDATE issuer_document_settings SET ${Object.values(fields)
            .map((column) => `${column}=?`)
            .join(',')},
        version=version+1,updated_at=?,updated_by=? WHERE tenant_id=? AND deployment_id=? AND legal_entity_id=? AND currency=? AND version=?`,
        )
        .run(
          ...values,
          timestamp,
          principal.userId,
          String(deployment.tenant_id),
          String(deployment.deployment_id),
          data.legalEntityId,
          data.currency,
          before.version,
        );
      if (result.changes !== 1)
        throw new errors.conflict(
          'The issuing company payment or contact settings changed. Refresh before saving.',
        );
    }
    after.version += 1;
    const affectedDrafts = invalidateDraftPresentation(
      sqlite,
      'currency=? AND billing_rule_id IN (SELECT id FROM billing_rule WHERE legal_entity_id=?)',
      [data.currency, data.legalEntityId],
      excludeInvoiceId,
    );
    recordAuditEvent(
      sqlite,
      principal,
      'issuer_document_settings.update',
      'issuer_document_settings',
      `${data.legalEntityId}:${data.currency}`,
      { before, after, changedFields: changed, affectedDrafts },
    );
    return { success: true, settings: after, affectedDrafts };
  });
}

/** Assigned canonical successor revisions share the issuer's genesis bridge identity. */
export function resolveInvoiceIssuerAuthority(
  sqlite: DatabaseSync,
  projectId: string,
  legalEntityId: string,
  currency: string,
  periodStart: string,
  periodEnd: string,
) {
  return sqlite
    .prepare(
      `SELECT rev.*,bridge.legacy_legal_entity_id
    FROM project_legal_entity_assignment a JOIN legal_entity_revision rev ON rev.revision_id=a.legal_entity_revision_id
    JOIN legal_entity_revision genesis ON genesis.series_id=rev.series_id AND genesis.predecessor_revision_id IS NULL
    JOIN legal_entity_revision_bridge bridge ON bridge.canonical_revision_id=genesis.revision_id
    JOIN deployment_identity d ON d.singleton=1 AND d.tenant_id=a.tenant_id AND d.deployment_id=a.deployment_id
      AND d.tenant_id=rev.tenant_id AND d.deployment_id=rev.deployment_id
      AND d.tenant_id=bridge.tenant_id AND d.deployment_id=bridge.deployment_id
    WHERE a.project_id=? AND bridge.legacy_legal_entity_id=? AND rev.base_currency=?
      AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)
      AND rev.effective_from<=? AND (rev.effective_to IS NULL OR rev.effective_to>=?)
    ORDER BY a.effective_from DESC,rev.revision_number DESC,a.assignment_id DESC LIMIT 1`,
    )
    .get(projectId, legalEntityId, currency, periodStart, periodEnd, periodStart, periodEnd);
}

export function effectivePurchaseReference(
  stream: unknown,
  project: unknown,
  client: unknown = null,
): string | null {
  for (const value of [stream, project, client])
    if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}
