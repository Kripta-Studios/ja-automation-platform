import {
  claimOutboxDelivery,
  markOutboxDelivered,
  resolveMailDelivery,
  parseSignedOutboxRequest,
} from '../../apps/portal/src/lib/server/outbox-mail-delivery.ts';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PortalRepository,
  V3Repository,
  createDatabase,
  queueInvoiceEmail,
  listInvoiceEmailDeliveries,
} from '@ja/database';
import type { Principal } from '@ja/domain';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';

const directories: string[] = [];
const restoreDeploymentIdentities: (() => void)[] = [];

beforeEach(() => {
  restoreDeploymentIdentities.push(installB5TestDeploymentIdentity());
});

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  for (const restore of restoreDeploymentIdentities.splice(0).reverse()) restore();
});

function seedUser(
  sqlite: ReturnType<typeof createDatabase>['sqlite'],
  id: string,
  role: string,
): void {
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

describe('explicit invoice email lifecycle', () => {
  it('authorizes, verifies, queues idempotently and records only SMTP acceptance as sent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ja-invoice-lifecycle-'));
    directories.push(directory);
    const { sqlite } = createDatabase(join(directory, 'app.db'));
    const repository = new PortalRepository(sqlite);
    const v3 = new V3Repository(sqlite);
    seedUser(sqlite, 'owner', 'owner_admin');
    seedUser(sqlite, 'finance', 'finance_admin');
    const financeSessionId = 'invoice-lifecycle-finance-session';
    const financeSessionTime = new Date().toISOString();
    sqlite
      .prepare(
        'INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at,step_up_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        financeSessionId,
        `${financeSessionId}-token`,
        'finance',
        new Date(Date.now() + 3_600_000).toISOString(),
        financeSessionTime,
        financeSessionTime,
        financeSessionTime,
      );
    const owner: Principal = { userId: 'owner', role: 'owner_admin', projectIds: new Set() };
    const finance: Principal = {
      userId: 'finance',
      role: 'finance_admin',
      projectIds: new Set(),
      sessionId: financeSessionId,
    };
    const client = repository.createClient(owner, {
      legalName: 'Lifecycle Client',
      displayName: 'Lifecycle Client',
      currency: 'USD',
      timezone: 'UTC',
      billingEmail: 'billing-lifecycle@example.test',
      billingAddress: 'Lifecycle Client billing address',
    });
    const project = repository.createProject(owner, {
      clientId: client.id,
      name: 'Lifecycle Project',
      timezone: 'UTC',
      currency: 'USD',
      billingModel: 'all_in',
      fixedPriceMinor: 10_000n,
    });
    const entity = repository.createLegalEntity(owner, {
      code: 'LIFE',
      legalName: 'Lifecycle Entity',
      currency: 'USD',
      billingAddress: 'Configured address',
      companyIdentifiers: 'Configured identifiers',
    });
    const entityRevision = v3.createCanonicalLegalEntityRevision(finance, {
      legacyLegalEntityId: entity.id,
      effectiveFrom: '2026-01-01',
      legalName: 'Lifecycle Entity',
      taxIdentifier: 'ESLIFECYCLE001',
      addressLine1: 'Configured address',
      locality: 'Madrid',
      postalCode: '28001',
      countryCode: 'ES',
      baseCurrency: 'USD',
      timezone: 'UTC',
      reason: 'Bind lifecycle fixture to canonical invoice authority',
      idempotencyKey: 'invoice-lifecycle:legal-entity-revision',
    });
    v3.assignCanonicalLegalEntityToProject(finance, {
      projectId: project.id,
      legalEntityRevisionId: entityRevision.revisionId,
      effectiveFrom: '2026-01-01',
      reason: 'Bind lifecycle fixture project to canonical invoice authority',
      idempotencyKey: 'invoice-lifecycle:legal-entity-assignment',
    });
    repository.createInvoiceNumberPolicy(owner, {
      legalEntityId: entity.id,
      prefix: 'LIFE',
      digits: 6,
      effectiveFrom: '2026-01-01',
      accountantApprovedAt: '2026-01-01T00:00:00.000Z',
    });
    const tax = repository.createTaxProfile(finance, {
      name: 'No tax',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      components: [{ name: 'No tax', basisPoints: 0 }],
    });
    const laborRule = repository.createBillingRule(finance, {
      projectId: project.id,
      legalEntityId: entity.id,
      streamType: 'labor',
      cadenceType: 'custom',
      taxProfileId: tax.id,
      currency: 'USD',
      effectiveFrom: '2026-01-01',
    });
    const original = repository.createInvoiceDraft(
      finance,
      laborRule.id,
      '2026-08-01',
      '2026-08-31',
    );
    expect(() =>
      queueInvoiceEmail(sqlite, finance, {
        invoiceId: original.id,
        recipient: 'billing@example.test',
      }),
    ).toThrow(/Issued invoice/);
    repository.approveInvoiceDraft(finance, original.id);
    repository.issueInvoice(finance, original.id);
    expect(() =>
      queueInvoiceEmail(sqlite, finance, {
        invoiceId: original.id,
        recipient: 'billing@example.test',
      }),
    ).toThrow(/ready PDF/);
    const bytes = Buffer.from('%PDF-1.4\nInvoice test\n%%EOF');
    const hash = createHash('sha256').update(bytes).digest('hex');
    mkdirSync(join(directory, 'invoices'));
    writeFileSync(join(directory, 'invoices/email.pdf'), bytes);
    v3.recordInvoicePdf(finance, original.id, 'invoices/email.pdf', hash, bytes.length);
    const oldRoot = process.env.JA_DOCUMENT_ROOT;
    process.env.JA_DOCUMENT_ROOT = directory;
    try {
      const input = { invoiceId: original.id, recipient: 'billing@example.test' };
      expect(() => queueInvoiceEmail(sqlite, { ...finance, sessionId: undefined }, input)).toThrow(
        /session/,
      );
      expect(() => queueInvoiceEmail(sqlite, { ...finance, role: 'worker' }, input)).toThrow(
        /Finance/,
      );
      expect(() => queueInvoiceEmail(sqlite, { ...finance, role: 'owner_admin' }, input)).toThrow(
        /Finance/,
      );
      expect(() =>
        queueInvoiceEmail(sqlite, finance, {
          ...input,
          recipient: 'a@example.test\r\nBcc:b@example.test',
        }),
      ).toThrow(/recipient/);
      expect(() => queueInvoiceEmail(sqlite, finance, { ...input, recipient: 'invalid' })).toThrow(
        /recipient/,
      );
      writeFileSync(join(directory, 'invoices/email.pdf'), 'corrupt');
      expect(() => queueInvoiceEmail(sqlite, finance, input)).toThrow(/integrity/);
      writeFileSync(join(directory, 'invoices/email.pdf'), bytes);
      const queued = queueInvoiceEmail(sqlite, finance, input);
      expect(queued.status).toBe('queued');
      expect(queueInvoiceEmail(sqlite, finance, input)).toEqual(queued);
      expect(
        queueInvoiceEmail(sqlite, finance, { ...input, recipient: 'Billing@Example.Test' }),
      ).toEqual(queued);
      expect(
        sqlite
          .prepare("SELECT count(*) n FROM outbox_event WHERE topic='invoice.email.requested'")
          .get()?.n,
      ).toBe(1);
      sqlite
        .prepare(
          "UPDATE outbox_event SET last_error='SMTP_DELIVERY_UNCERTAIN',failed_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), queued.id);
      expect(queueInvoiceEmail(sqlite, finance, input)).toMatchObject({
        id: queued.id,
        status: 'uncertain',
      });
      expect(listInvoiceEmailDeliveries(sqlite, finance)[0]?.status).toBe('uncertain');
      expect(
        sqlite.prepare('SELECT failed_at FROM outbox_event WHERE id=?').get(queued.id)?.failed_at,
      ).toBeTruthy();
      sqlite
        .prepare('UPDATE outbox_event SET last_error=NULL,failed_at=NULL WHERE id=?')
        .run(queued.id);
      expect(sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(original.id)?.state).toBe(
        'issued',
      );
      expect(
        sqlite
          .prepare("SELECT count(*) n FROM outbox_event WHERE topic='invoice.email.requested'")
          .get()?.n,
      ).toBe(1);
      sqlite.prepare('UPDATE outbox_event SET attempts=1 WHERE id=?').run(queued.id);
      const row = sqlite.prepare('SELECT * FROM outbox_event WHERE id=?').get(queued.id)!;
      sqlite.prepare("UPDATE outbox_event SET topic='invoice.issued' WHERE id=?").run(queued.id);
      expect(() => queueInvoiceEmail(sqlite, finance, input)).toThrow(/idempotency conflict/);
      sqlite
        .prepare("UPDATE outbox_event SET topic='invoice.email.requested' WHERE id=?")
        .run(queued.id);
      const request = parseSignedOutboxRequest(
        JSON.stringify({
          eventId: row.id,
          topic: row.topic,
          aggregateId: row.aggregate_id,
          idempotencyKey: row.idempotency_key,
          attempts: row.attempts,
          payload: JSON.parse(String(row.payload_json)),
        }),
      );
      const delivery = resolveMailDelivery(sqlite, request, undefined, { documentRoot: directory });
      expect(delivery).toMatchObject({ recipient: input.recipient });
      writeFileSync(join(directory, 'invoices/email.pdf'), 'corrupt');
      expect(() =>
        resolveMailDelivery(sqlite, request, undefined, { documentRoot: directory }),
      ).toThrow(/PDF/);
      writeFileSync(join(directory, 'invoices/email.pdf'), bytes);
      sqlite.prepare("UPDATE user SET status='suspended' WHERE id='finance'").run();
      expect(() =>
        resolveMailDelivery(sqlite, request, undefined, { documentRoot: directory }),
      ).toThrow(/unavailable/);
      sqlite.prepare("UPDATE user SET status='active' WHERE id='finance'").run();
      expect(claimOutboxDelivery(sqlite, request, 'invoice-mail-test-claim')).toBe('claimed');
      expect(listInvoiceEmailDeliveries(sqlite, finance)[0]?.status).toBe('sending');
      markOutboxDelivered(sqlite, request, 'invoice-mail-test-claim');
      expect(sqlite.prepare('SELECT state FROM invoice WHERE id=?').get(original.id)?.state).toBe(
        'sent',
      );
      expect(
        sqlite.prepare('SELECT sent_at FROM invoice WHERE id=?').get(original.id)?.sent_at,
      ).toBeTruthy();
      expect(queueInvoiceEmail(sqlite, finance, input).status).toBe('accepted');
      expect(listInvoiceEmailDeliveries(sqlite, finance)).toMatchObject([
        { invoiceId: original.id, status: 'accepted' },
      ]);
      expect(
        sqlite
          .prepare("SELECT count(*) n FROM invoice_event WHERE invoice_id=? AND event_type='sent'")
          .get(original.id)?.n,
      ).toBe(1);
      sqlite.prepare("UPDATE user SET status='suspended' WHERE id='finance'").run();
      expect(() => queueInvoiceEmail(sqlite, finance, input)).toThrow(/Active/);
    } finally {
      if (oldRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
      else process.env.JA_DOCUMENT_ROOT = oldRoot;
      sqlite.close();
    }
  });
});
