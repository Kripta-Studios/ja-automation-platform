import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@ja/database';
import {
  isValidAbaRoutingNumber,
  isValidBic,
  isValidIban,
  issuerDocumentSettingsInputSchema,
} from '@ja/schemas';
import { renderInvoiceTemplate } from '../../packages/invoice-templates/src/index.ts';
import { readIssuerDocumentSettings } from '../../packages/database/src/domains/billing/issuer-document-settings.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';

// T01 (audit 2026-11-22, decision D1): company bank and payee details printed on every
// invoice are owner-only, validated, audited and notified to the owner.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) closeB5LifecycleSecurityFixture(f);
});

function fixture() {
  const f = createB5LifecycleSecurityFixture();
  fixtures.push(f);
  const entity = f.sqlite
    .prepare("SELECT id,currency FROM legal_entity WHERE status='active' ORDER BY id LIMIT 1")
    .get() as { id: string; currency: string };
  return { f, entity };
}

function version(f: B5LifecycleSecurityFixture, legalEntityId: string, currency: string) {
  return Number(
    (
      f.sqlite
        .prepare(
          'SELECT version FROM issuer_document_settings WHERE legal_entity_id=? AND currency=?',
        )
        .get(legalEntityId, currency) as { version: number } | undefined
    )?.version ?? 0,
  );
}

describe('issuer bank and payee details (T01)', () => {
  it('validates SWIFT/BIC and IBAN checksums', () => {
    expect(isValidBic('WFBIUS6S')).toBe(true);
    expect(isValidBic('DEUTDEFF500')).toBe(true);
    expect(isValidBic('XXX')).toBe(false);
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('DE89 3704 0044 0532 0130 01')).toBe(false);
    const base = { legalEntityId: 'legal-entity-ja-usa', currency: 'USD', expectedVersion: 0 };
    expect(
      issuerDocumentSettingsInputSchema.safeParse({ ...base, bankSwiftNumber: 'XXX' }).success,
    ).toBe(false);
    expect(
      issuerDocumentSettingsInputSchema.safeParse({ ...base, bankAccountNumber: 'DE00123' })
        .success,
    ).toBe(false);
    expect(
      issuerDocumentSettingsInputSchema.safeParse({ ...base, bankAccountNumber: '8769915615' })
        .success,
    ).toBe(true);
  });

  it('refuses a finance change of the payee and keeps company contact edits allowed', () => {
    const { f, entity } = fixture();
    const finance = stepUpB5Principal(f.sqlite, f.finance, 'issuer-finance');
    expect(() =>
      f.repository.updateIssuerDocumentSettings(finance, {
        legalEntityId: entity.id,
        currency: entity.currency,
        expectedVersion: 0,
        bankSwiftNumber: 'CANARYUS',
        bankName: 'CANARY-BANK',
      }),
    ).toThrow(AccessDeniedError);
    expect(version(f, entity.id, entity.currency)).toBe(0);
    const saved = f.repository.updateIssuerDocumentSettings(finance, {
      legalEntityId: entity.id,
      currency: entity.currency,
      expectedVersion: 0,
      companyPhone: '+1 512 555 0100',
    });
    expect(saved.changedFields).toEqual(['companyPhone']);
    expect(version(f, entity.id, entity.currency)).toBe(1);
  });

  it('lets the owner change the payee, audits it and notifies the owner', () => {
    const { f, entity } = fixture();
    const owner = stepUpB5Principal(f.sqlite, f.owner, 'issuer-owner');
    const saved = f.repository.updateIssuerDocumentSettings(owner, {
      legalEntityId: entity.id,
      currency: entity.currency,
      expectedVersion: 0,
      bankSwiftNumber: 'DEUTDEFF',
    });
    expect(saved.changedFields).toEqual(['bankSwiftNumber']);
    const audit = f.sqlite
      .prepare(
        "SELECT details_json payload_json FROM audit_event WHERE action='issuer_document_settings.update' ORDER BY rowid DESC LIMIT 1",
      )
      .get() as { payload_json: string } | undefined;
    expect(JSON.parse(audit?.payload_json ?? '{}')).toMatchObject({
      payeeChanged: ['bankSwiftNumber'],
    });
    const notices = f.sqlite
      .prepare("SELECT user_id,subject_id FROM notification WHERE kind='issuer_payee_changed'")
      .all() as Array<{ user_id: string; subject_id: string }>;
    expect(notices).toEqual([
      { user_id: 'b5-owner', subject_id: `${entity.id}:${entity.currency}:v1` },
    ]);
  });

  it('validates ACH and wire routing numbers (ABA) and the EUR SWIFT code', () => {
    expect(isValidAbaRoutingNumber('111000025')).toBe(true);
    expect(isValidAbaRoutingNumber('026009593')).toBe(true);
    expect(isValidAbaRoutingNumber('026009594')).toBe(false);
    expect(isValidAbaRoutingNumber('12345678')).toBe(false);
    const base = { legalEntityId: 'legal-entity-ja-usa', currency: 'USD', expectedVersion: 0 };
    const parse = (extra: Record<string, string>) =>
      issuerDocumentSettingsInputSchema.safeParse({ ...base, ...extra });
    expect(parse({ bankAchRouting: '111000025', bankWireRouting: '026009593' }).success).toBe(true);
    expect(parse({ bankAchRouting: '11100002' }).success).toBe(false);
    expect(parse({ bankWireRouting: 'ABCDEFGHI' }).success).toBe(false);
    expect(parse({ bankSwiftEur: 'BOFAUS6S' }).success).toBe(true);
    expect(parse({ bankSwiftEur: 'EUR' }).success).toBe(false);
    expect(parse({ bankAchRouting: '', bankWireRouting: '', bankSwiftEur: '' }).success).toBe(true);
  });

  it('starts the J&A USD issuer with the Bank of America routing and EUR SWIFT values', () => {
    const { f } = fixture();
    const issuer = f.sqlite
      .prepare("SELECT id FROM legal_entity WHERE code='JA-USA' AND currency='USD'")
      .get() as { id: string } | undefined;
    expect(issuer).toBeDefined();
    const settings = readIssuerDocumentSettings(f.sqlite, issuer!.id, 'USD');
    expect(settings).toMatchObject({
      bankAccountNumber: '488117823145',
      bankAchRouting: '111000025',
      bankWireRouting: '026009593',
      bankSwiftEur: 'BOFAUS6S',
    });
  });

  it('keeps the routing and EUR SWIFT fields owner-only and audited like the other payee fields', () => {
    const { f, entity } = fixture();
    const finance = stepUpB5Principal(f.sqlite, f.finance, 'issuer-finance-routing');
    for (const field of ['bankAchRouting', 'bankWireRouting', 'bankSwiftEur'])
      expect(() =>
        f.repository.updateIssuerDocumentSettings(finance, {
          legalEntityId: entity.id,
          currency: entity.currency,
          expectedVersion: 0,
          [field]: field === 'bankSwiftEur' ? 'DEUTDEFF' : '021000021',
        }),
      ).toThrow(AccessDeniedError);
    expect(version(f, entity.id, entity.currency)).toBe(0);
    const owner = stepUpB5Principal(f.sqlite, f.owner, 'issuer-owner-routing');
    const saved = f.repository.updateIssuerDocumentSettings(owner, {
      legalEntityId: entity.id,
      currency: entity.currency,
      expectedVersion: 0,
      bankAchRouting: '021000021',
      bankWireRouting: '011000138',
      bankSwiftEur: 'DEUTDEFF',
    });
    expect(saved.changedFields).toEqual(
      expect.arrayContaining(['bankAchRouting', 'bankWireRouting', 'bankSwiftEur']),
    );
    const row = f.sqlite
      .prepare(
        'SELECT bank_ach_routing_number ach,bank_wire_routing_number wire,bank_swift_eur eur FROM issuer_document_settings WHERE legal_entity_id=? AND currency=?',
      )
      .get(entity.id, entity.currency);
    expect(row).toEqual({ ach: '021000021', wire: '011000138', eur: 'DEUTDEFF' });
    const audit = f.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE action='issuer_document_settings.update' ORDER BY rowid DESC LIMIT 1",
      )
      .get() as { details_json: string };
    expect(JSON.parse(audit.details_json).payeeChanged).toEqual(
      expect.arrayContaining(['bankAchRouting', 'bankWireRouting', 'bankSwiftEur']),
    );
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) n FROM notification WHERE kind='issuer_payee_changed'")
        .get(),
    ).toEqual({ n: 1 });
    // Clearing a field stores '' and stops printing it (no fallback to the starting value).
    f.repository.updateIssuerDocumentSettings(owner, {
      legalEntityId: entity.id,
      currency: entity.currency,
      expectedVersion: 1,
      bankSwiftEur: '',
    });
    expect(readIssuerDocumentSettings(f.sqlite, entity.id, entity.currency).bankSwiftEur).toBe('');
  });

  it('prints the routing numbers and EUR SWIFT in the invoice payment block only when filled', () => {
    const snapshot = (terms: Record<string, string>) =>
      renderInvoiceTemplate({
        templateId: 'standard',
        state: 'draft',
        currency: 'USD',
        calculation: { currency: 'USD', subtotalMinor: '1000', totalMinor: '1000' },
        termsAndInstructions: terms,
      } as never).totalsBody;
    const filled = snapshot({
      bankAccountNumber: '488117823145',
      bankAchRouting: '111000025',
      bankWireRouting: '026009593',
      bankSwiftEur: 'BOFAUS6S',
    });
    expect(filled).toContain('data-invoice-field="bankAchRouting"');
    expect(filled).toContain('ACH routing number:</strong> 111000025');
    expect(filled).toContain('Wire routing number (domestic):</strong> 026009593');
    expect(filled).toContain('SWIFT code for EUR payments:</strong> BOFAUS6S');
    const empty = snapshot({ bankAccountNumber: '488117823145' });
    expect(empty).not.toContain('bankAchRouting');
    expect(empty).not.toContain('bankSwiftEur');
  });
});
