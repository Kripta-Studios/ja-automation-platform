import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { PortalRepository, V3Repository, createDatabase } from '@ja/database';
import type { Principal } from '@ja/domain';

/**
 * A database with one CP-numbered (or prefix/year) issuer, a client "IMPC" and helpers to
 * create projects and issue invoices (client/project invoice numbers, owner decision
 * 2026-11-25). The caller removes `directories` and restores the deployment identity.
 */
export const invoiceNumberingDirectories: string[] = [];

export function seedUser(sqlite: ReturnType<typeof createDatabase>['sqlite'], id: string, role: string) {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user(id,name,email,role,status,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      id,
      role === 'owner_admin' ? 'antonny.luty@j-aautomation.com' : `${id}@example.com`,
      role,
      'active',
      1,
      now,
      now,
    );
}

export function setupInvoiceNumbering(format: 'client_project_sequence' | 'prefix_year_sequence') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-25T12:00:00.000Z'));
  const directory = mkdtempSync(join(tmpdir(), 'ja-cp-numbers-'));
  invoiceNumberingDirectories.push(directory);
  const { sqlite } = createDatabase(join(directory, 'app.db'));
  const repository = new PortalRepository(sqlite);
  const v3 = new V3Repository(sqlite);
  seedUser(sqlite, 'owner', 'owner_admin');
  seedUser(sqlite, 'finance', 'finance_admin');
  const sessionId = 'cp-numbers-finance-session';
  const at = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(sessionId, `${sessionId}-token`, 'finance', new Date(Date.now() + 3_600_000).toISOString(), at, at, at);
  const ownerSessionId = 'cp-numbers-owner-session';
  sqlite
    .prepare(
      'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
    )
    .run(ownerSessionId, `${ownerSessionId}-token`, 'owner', new Date(Date.now() + 3_600_000).toISOString(), at, at, at);
  const owner: Principal = {
    userId: 'owner',
    role: 'owner_admin',
    projectIds: new Set(),
    sessionId: ownerSessionId,
  };
  const finance: Principal = { userId: 'finance', role: 'finance_admin', projectIds: new Set(), sessionId };
  const entity = repository.createLegalEntity(owner, {
    code: 'CPNUM',
    legalName: 'Numbering Entity',
    currency: 'USD',
    billingAddress: 'Configured address',
    companyIdentifiers: 'Configured identifiers',
  });
  const revision = v3.createCanonicalLegalEntityRevision(finance, {
    legacyLegalEntityId: entity.id,
    effectiveFrom: '2026-01-01',
    legalName: 'Numbering Entity',
    taxIdentifier: 'USCPNUM001',
    addressLine1: 'Configured address',
    locality: 'Austin',
    postalCode: '78701',
    countryCode: 'US',
    baseCurrency: 'USD',
    timezone: 'UTC',
    reason: 'Numbering fixture',
    idempotencyKey: 'cp-numbers:revision',
  });
  repository.createInvoiceNumberPolicy(owner, {
    legalEntityId: entity.id,
    prefix: '123',
    digits: 6,
    effectiveFrom: '2026-01-01',
    accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    numberFormat: format,
  });
  const client = repository.createClient(owner, {
    legalName: 'IMPC Gmbh',
    displayName: 'IMPC Gmbh',
    currency: 'USD',
    timezone: 'UTC',
    billingEmail: 'billing@impc.example',
    billingAddress: 'IMPC billing address',
  });
  sqlite.prepare("UPDATE client SET client_code='IMPC' WHERE id=?").run(client.id);
  let counter = 0;
  const project = (costCenterCode: string) => {
    counter += 1;
    const created = repository.createProject(owner, {
      costCenterCode,
      clientId: client.id,
      name: `Project ${counter}`,
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'all_in',
      fixedPriceMinor: 10_000n,
    });
    v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: created.id,
      legalEntityRevisionId: revision.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Numbering fixture project',
      idempotencyKey: `cp-numbers:assignment:${counter}`,
    });
    const rule = repository.createBillingRule(finance, {
      projectId: created.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
    });
    return { id: created.id, ruleId: rule.id };
  };
  repository.createTaxProfile(finance, {
    name: 'No tax',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    components: [{ name: 'No tax', basisPoints: 0 }],
  });
  const issue = (ruleId: string, start: string, end: string) => {
    const draft = repository.createInvoiceDraft(finance, ruleId, start, end);
    const preview = repository.invoicePreview(finance, draft.id).invoice as {
      draft_number_preview: { number: string | null } | null;
    };
    repository.approveInvoiceDraft(finance, draft.id);
    const issued = repository.issueInvoice(finance, draft.id, 'en');
    return { id: draft.id, preview: preview.draft_number_preview?.number ?? null, number: issued.invoiceNumber };
  };
  return { sqlite, repository, v3, owner, finance, client, project, issue, directory };
}

