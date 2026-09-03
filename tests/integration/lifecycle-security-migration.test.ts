import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('B5 lifecycle/security migration integration', () => {
  it('adds an active legal-entity state while preserving migration integrity', () => {
    const value = fixture();
    const columns = value.sqlite.prepare("PRAGMA table_info('legal_entity')").all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const status = columns.find((column) => column.name === 'status');

    expect(status).toMatchObject({ notnull: 1, dflt_value: "'active'" });
    expect(value.sqlite.prepare('PRAGMA integrity_check').get()).toEqual({
      integrity_check: 'ok',
    });
    expect(
      value.sqlite.prepare('SELECT MAX(version) AS version FROM schema_migration').get() as {
        version: number;
      },
    ).toEqual({ version: 35 });
  });

  it('permits the repository archive flow but never reactivates or deletes history', () => {
    const value = fixture();
    const entity = value.repository.createLegalEntity(value.owner, {
      code: 'B5-LIFECYCLE',
      legalName: 'B5 Lifecycle Entity',
      currency: 'EUR',
      billingAddress: 'Madrid',
      companyIdentifiers: 'ES-B5-LIFECYCLE',
    });

    expect(
      value.sqlite.prepare('SELECT status,version FROM legal_entity WHERE id=?').get(entity.id),
    ).toEqual({ status: 'active', version: 1 });

    const steppedOwner = stepUpB5Principal(value.sqlite, value.owner, 'archive-legal-entity');
    expect(() => value.repository.archiveLegalEntity(steppedOwner, entity.id)).not.toThrow();
    expect(
      value.sqlite.prepare('SELECT status,version FROM legal_entity WHERE id=?').get(entity.id),
    ).toEqual({ status: 'archived', version: 2 });

    expect(() =>
      value.sqlite
        .prepare("UPDATE legal_entity SET status='active',version=version+1 WHERE id=?")
        .run(entity.id),
    ).toThrow(/legal entity lifecycle|immutable/i);
    expect(() =>
      value.sqlite.prepare('DELETE FROM legal_entity WHERE id=?').run(entity.id),
    ).toThrow(/legal entity history|retained/i);
    expect(
      value.sqlite.prepare('SELECT status,version FROM legal_entity WHERE id=?').get(entity.id),
    ).toEqual({ status: 'archived', version: 2 });
  });
});
