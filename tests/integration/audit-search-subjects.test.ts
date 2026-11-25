import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  signInB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

// Round 2 (verify NEW-6): the audit register shows "Hours · <person> · <project>", so a
// search for the person's name finds those rows, not only events that store the name.
const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

describe('audit search matches the computed subjects', () => {
  it('finds the hours of a person by name and of a project by number', () => {
    const base = createB5LifecycleSecurityFixture();
    fixtures.push(base);
    base.sqlite.prepare("UPDATE user SET name='Gabriel Searchable' WHERE id=?").run(base.worker.userId);
    const worker = signInB5Principal(base.sqlite, base.worker, 'audit-search-worker');
    const time = base.repository.createTimeEntry(worker, {
      projectId: base.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 60,
      summary: 'Audit search shift',
    });
    const byName = base.repository.listAuditEvents(base.owner, { view: 'all', search: 'Searchable' });
    expect(byName.map((row) => String(row.entity_id))).toContain(time.id);
    expect(base.repository.countAuditEvents(base.owner, { view: 'all', search: 'Searchable' })).toBe(
      byName.length,
    );
    const nobody = base.repository.listAuditEvents(base.owner, { view: 'all', search: 'Nobody Here' });
    expect(nobody.map((row) => String(row.entity_id))).not.toContain(time.id);
  });
});
