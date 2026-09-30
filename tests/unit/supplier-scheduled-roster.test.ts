import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
  intersectSupplierAssignment,
  readSupplierProjectRoster,
} from '../../packages/database/src/domains/workforce/supplier-project-roster';
import { supplierRosterForDate } from '../../apps/portal/src/lib/portal/supplier-roster';

const technician = {
  id: 'own-worker',
  name: 'Own technician',
  supplierId: 'own-supplier',
  startsOn: '2026-10-01',
  endsOn: null,
};

describe('scheduled supplier roster', () => {
  it('projects only current-grant supplier assignments overlapping the authorized window', () => {
    const all = vi.fn(() => [technician]);
    const prepare = vi.fn(() => ({ all }));
    const scope = { supplierId: 'own-supplier', startsOn: '2026-09-01', endsOn: '2026-10-31' };
    const roster = readSupplierProjectRoster(
      { prepare } as unknown as DatabaseSync,
      'project',
      scope,
    );
    const query = prepare.mock.calls[0]?.[0];
    expect(query).toContain('sup.supplier_id=?');
    expect(query).toContain("pm.starts_on<=COALESCE(?, '9999-12-31')");
    expect(query).toContain('(pm.ends_on IS NULL OR pm.ends_on>=?)');
    expect(query).toContain("pm.status='active'");
    expect(query).toContain("sup.profile='external_technician'");
    expect(query).toContain("u.status='active'");
    expect(query).toContain("s.status='active'");
    expect(all).toHaveBeenCalledWith('project', 'own-supplier', '2026-10-31', '2026-09-01');
    expect(roster[0]?.endsOn).toBe('2026-10-31');
  });

  it.each([
    ['2026-09-01', null, '2026-09-15', '2026-10-31', '2026-09-15', '2026-10-31'],
    ['2026-10-01', '2026-10-15', '2026-09-15', null, '2026-10-01', '2026-10-15'],
    ['2026-10-01', null, '2026-09-15', null, '2026-10-01', null],
  ])(
    'intersects assignment %s/%s with grant %s/%s',
    (startsOn, endsOn, grantStart, grantEnd, expectedStart, expectedEnd) => {
      const row = { ...technician, startsOn: startsOn!, endsOn };
      expect(intersectSupplierAssignment(row, { startsOn: grantStart!, endsOn: grantEnd })).toEqual(
        {
          ...row,
          startsOn: expectedStart,
          endsOn: expectedEnd,
        },
      );
      expect(row.endsOn).toBe(endsOn);
    },
  );

  it('selects future personnel on their valid work date, deduplicating overlapping assignments', () => {
    const roster = [technician, { ...technician, startsOn: '2026-10-02' }];
    expect(supplierRosterForDate(roster, '2026-09-30')).toEqual([]);
    expect(supplierRosterForDate(roster, '2026-10-01')).toEqual([technician]);
    expect(supplierRosterForDate(roster, '2026-10-02')).toEqual([technician]);
  });

  it('denies dates beyond assignment/grant boundaries and keeps inclusive final-day eligibility', () => {
    const row = intersectSupplierAssignment(technician, {
      startsOn: '2026-09-01',
      endsOn: '2026-10-31',
    });
    expect(supplierRosterForDate([row], '2026-10-31')).toEqual([row]);
    expect(supplierRosterForDate([row], '2026-11-01')).toEqual([]);
    expect(supplierRosterForDate([{ ...row, startsOn: '2026-11-01' }], '2026-10-31')).toEqual([]);
  });

  it('keeps scheduled choices in native forms without claiming a different work date', () => {
    expect(supplierRosterForDate([technician, technician], '')).toEqual([technician]);
  });
});
