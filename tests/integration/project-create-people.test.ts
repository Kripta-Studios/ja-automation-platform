import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccessDeniedError,
  ValidationError,
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

let nextProjectCostCenter = 100;

function projectInput(value: B5LifecycleSecurityFixture, name: string) {
  return {
    clientId: value.client.id,
    costCenterCode: `QA-${name}-${nextProjectCostCenter++}`,
    name,
    timezone: 'Europe/Madrid',
    currency: 'EUR' as const,
    billingModel: 'tm' as const,
  };
}

describe('people selected during project creation', () => {
  it('builds project references from cost centers, allowing repeated and free-text centers', () => {
    // Owner decision 2026-11-16: cost centers are free text and may repeat.
    const value = fixture();
    const numeric = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Numeric center'),
      costCenterCode: '004',
    });
    // Clients without a short code keep the historical numbering.
    expect(numeric.projectNumber).toBe(`${value.client.clientNumber}-P-004`);

    const prefixed = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Prefixed center'),
      costCenterCode: 'QA-9876',
    });
    expect(prefixed.projectNumber).toBe(`${value.client.clientNumber}-P-9876`);

    const shortSuffix = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Short suffix'),
      costCenterCode: 'QA-7',
    });
    expect(shortSuffix.projectNumber).toBe(`${value.client.clientNumber}-P-007`);

    value.repository.updateProject(value.owner, {
      projectId: numeric.id,
      costCenterCode: '005',
    });
    expect(
      value.sqlite.prepare('SELECT project_number FROM project WHERE id=?').get(numeric.id),
    ).toEqual({ project_number: `${value.client.clientNumber}-P-005` });

    // Repeated cost centers get an automatic suffix instead of an error.
    const duplicate = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Duplicate center'),
      costCenterCode: 'QA-9876',
    });
    expect(duplicate.projectNumber).toBe(`${value.client.clientNumber}-P-9876-2`);

    // Free-text cost centers are allowed.
    const text = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Text center'),
      costCenterCode: 'QA CENTER',
    });
    expect(text.projectNumber).toBe(`${value.client.clientNumber}-QA-CENTER`);

    // A client code prefixes the reference: "IMPC-001", then "IMPC-001-2".
    value.sqlite.prepare("UPDATE client SET client_code='IMPC' WHERE id=?").run(value.client.id);
    const coded = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Coded client'),
      costCenterCode: '001',
    });
    expect(coded.projectNumber).toBe('IMPC-001');
    const codedAgain = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Coded client again'),
      costCenterCode: '001',
    });
    expect(codedAgain.projectNumber).toBe('IMPC-001-2');

    // The owner may edit the reference directly; collisions are rejected.
    expect(() =>
      value.repository.updateProject(value.owner, {
        projectId: codedAgain.id,
        projectNumber: 'impc-001',
      }),
    ).toThrow(/Project reference is already used/);
    value.repository.updateProject(value.owner, {
      projectId: codedAgain.id,
      projectNumber: 'IMPC-001 Plant B',
    });
    expect(
      value.sqlite.prepare('SELECT project_number FROM project WHERE id=?').get(codedAgain.id),
    ).toEqual({ project_number: 'IMPC-001 Plant B' });
    // Blank rebuilds it from client code and cost center.
    value.repository.updateProject(value.owner, { projectId: codedAgain.id, projectNumber: '' });
    expect(
      value.sqlite.prepare('SELECT project_number FROM project WHERE id=?').get(codedAgain.id),
    ).toEqual({ project_number: 'IMPC-001-2' });
  });

  it('keeps an invoiced project reference unless the owner renames it explicitly', () => {
    const value = fixture();
    const project = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Invoiced center'),
      costCenterCode: 'CC-042',
    });
    const timestamp = '2026-09-25T12:00:00.000Z';
    value.sqlite
      .prepare(
        `INSERT INTO invoice(id,project_id,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,created_at,updated_at,version)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'qa-project-number-invoice',
        project.id,
        'labor',
        'draft',
        'EUR',
        0,
        0,
        0,
        timestamp,
        timestamp,
        1,
      );

    // Changing only the cost center keeps the invoiced reference.
    value.repository.updateProject(value.owner, {
      projectId: project.id,
      costCenterCode: 'CC-043',
    });
    expect(
      value.sqlite
        .prepare('SELECT project_number,cost_center_code FROM project WHERE id=?')
        .get(project.id),
    ).toEqual({ project_number: `${value.client.clientNumber}-P-042`, cost_center_code: 'CC-043' });
    // The owner may still rename it explicitly (issued invoices keep their snapshot).
    value.repository.updateProject(value.owner, {
      projectId: project.id,
      projectNumber: 'CC-043-RENAMED',
    });
    expect(
      value.sqlite.prepare('SELECT project_number FROM project WHERE id=?').get(project.id),
    ).toEqual({ project_number: 'CC-043-RENAMED' });
  });

  it('requires a cost center for every new project, including direct repository writes', () => {
    const value = fixture();
    for (const costCenterCode of [undefined, '', '   ']) {
      expect(() =>
        value.repository.createProject(value.owner, {
          ...projectInput(value, 'Missing cost center'),
          costCenterCode,
        }),
      ).toThrow(/Cost center code is required/);
    }
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM project WHERE name='Missing cost center'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('rejects worker start dates before project start or after planned end', () => {
    const value = fixture();
    for (const assignmentDate of ['2026-09-23', '2026-10-01']) {
      expect(() =>
        value.repository.createProject(value.owner, {
          ...projectInput(value, `Out-of-period ${assignmentDate}`),
          startDate: '2026-09-24',
          plannedEndDate: '2026-09-30',
          initialWorkerIds: ['b5-worker'],
          initialWorkersStartOn: assignmentDate,
        }),
      ).toThrow(/Worker assignment start date must be within project dates/);
    }
    const boundary = value.repository.createProject(value.owner, {
      ...projectInput(value, 'End boundary assignment'),
      startDate: '2026-09-24',
      plannedEndDate: '2026-09-30',
      initialWorkerIds: ['b5-worker'],
      initialWorkersStartOn: '2026-09-30',
    });
    expect(
      value.sqlite
        .prepare('SELECT starts_on FROM project_member WHERE project_id=?')
        .get(boundary.id),
    ).toEqual({ starts_on: '2026-09-30' });
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM project WHERE name LIKE 'Out-of-period %'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('saves all selected active workers with one effective date and no invented rates', () => {
    const value = fixture();
    const created = value.repository.createProject(value.owner, {
      ...projectInput(value, 'People at create'),
      startDate: '2026-10-01',
      initialWorkerIds: ['b5-worker', 'b5-outsider'],
      initialWorkersStartOn: '2026-10-03',
    });

    expect(
      value.sqlite
        .prepare(
          `SELECT user_id,starts_on,assignment_role,can_review FROM project_member
            WHERE project_id=? ORDER BY user_id`,
        )
        .all(created.id),
    ).toEqual([
      { user_id: 'b5-outsider', starts_on: '2026-10-03', assignment_role: 'worker', can_review: 0 },
      { user_id: 'b5-worker', starts_on: '2026-10-03', assignment_role: 'worker', can_review: 0 },
    ]);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM client_labor_rate WHERE project_id=?')
        .get(created.id),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM compensation_rule WHERE project_id=?')
        .get(created.id),
    ).toEqual({ count: 0 });
  });

  it('uses the project-local start date when no dates are supplied', () => {
    const value = fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T23:00:00.000Z'));
    const created = value.repository.createProject(value.owner, {
      ...projectInput(value, 'Project local day'),
      initialWorkerIds: ['b5-outsider'],
    });
    expect(
      value.sqlite.prepare('SELECT start_date FROM project WHERE id=?').get(created.id),
    ).toEqual({ start_date: '2026-09-24' });
    expect(
      value.sqlite
        .prepare('SELECT starts_on FROM project_member WHERE project_id=?')
        .get(created.id),
    ).toEqual({ starts_on: '2026-09-24' });
  });

  it('allows an empty team while rejecting duplicates, inactive workers and finance assignments', () => {
    const value = fixture();
    const empty = value.repository.createProject(value.finance, projectInput(value, 'Empty draft'));
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM project_member WHERE project_id=?')
        .get(empty.id),
    ).toEqual({ count: 0 });
    expect(() =>
      value.repository.createProject(value.owner, {
        ...projectInput(value, 'Duplicate worker'),
        initialWorkerIds: ['b5-worker', 'b5-worker'],
      }),
    ).toThrow(/Selected worker 2 is duplicated/);
    value.sqlite.prepare("UPDATE user SET status='suspended' WHERE id='b5-outsider'").run();
    expect(() =>
      value.repository.createProject(value.owner, {
        ...projectInput(value, 'Inactive worker'),
        initialWorkerIds: ['b5-worker', 'b5-outsider'],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      value.repository.createProject(value.finance, {
        ...projectInput(value, 'Unauthorized workers'),
        initialWorkerIds: ['b5-worker'],
      }),
    ).toThrow(AccessDeniedError);
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM project WHERE name IN ('Duplicate worker','Inactive worker','Unauthorized workers')",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it('rolls back project and first membership when a later insert fails', () => {
    const value = fixture();
    value.sqlite.exec(`
      CREATE TRIGGER qa_reject_second_worker BEFORE INSERT ON project_member
      WHEN NEW.user_id='b5-outsider'
      BEGIN SELECT RAISE(ABORT, 'QA membership insertion failure'); END;
    `);
    const before = value.sqlite
      .prepare('SELECT COUNT(*) count FROM project WHERE client_id=?')
      .get(value.client.id);
    expect(() =>
      value.repository.createProject(value.owner, {
        ...projectInput(value, 'Atomic worker insert'),
        initialWorkerIds: ['b5-worker', 'b5-outsider'],
      }),
    ).toThrow(/QA membership insertion failure/);
    expect(
      value.sqlite
        .prepare('SELECT COUNT(*) count FROM project WHERE client_id=?')
        .get(value.client.id),
    ).toEqual(before);
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM project WHERE name='Atomic worker insert'")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite
        .prepare("SELECT COUNT(*) count FROM project_member WHERE user_id='b5-worker'")
        .get(),
    ).toEqual({ count: 1 }); // The fixture's original project assignment only.
  });
});
