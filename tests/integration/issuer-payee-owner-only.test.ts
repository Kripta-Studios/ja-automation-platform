import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@ja/database';
import { isValidBic, isValidIban, issuerDocumentSettingsInputSchema } from '@ja/schemas';
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
});
