import { afterEach, describe, expect, it } from 'vitest';
import {
  createFieldCapture,
  type CaptureInput,
} from '../../packages/database/src/domains/field-capture/index.ts';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}
function input(projectId: string): CaptureInput {
  return {
    requestKey: 'capture_req_1234567890',
    projectId,
    workDate: '2026-10-11',
    workSummary: 'Replaced sensor; wiring test pending.',
    time: { category: 'service', minutes: 47 },
    report: {
      tasksCompleted: 'Sensor replaced',
      problemsFound: 'Wiring test pending',
      downtimeMinutes: 0,
      safetyRelated: false,
    },
    expense: {
      category: 'ground_transport',
      description: 'Bus fare to site',
      currency: 'EUR',
      amountMinor: '230',
      whoPaid: 'worker',
    },
  };
}

describe('field capture', () => {
  it('creates three canonical drafts atomically and returns identical links on retry', () => {
    const value = fixture();
    const worker = stepUpB5Principal(value.sqlite, value.worker, 'capture');
    const request = input(value.project.id);
    const first = createFieldCapture(value.sqlite, value.repository, worker, request);
    expect(first.records.map((row) => row.type)).toEqual(['time', 'report', 'expense']);
    expect(first.records.every((row) => row.state === 'draft')).toBe(true);
    expect(createFieldCapture(value.sqlite, value.repository, worker, request)).toEqual({
      ...first,
      replayed: true,
    });
    expect(value.sqlite.prepare('SELECT count(*) n FROM capture_request').get()).toMatchObject({
      n: 1,
    });
    const time = value.sqlite
      .prepare('SELECT minutes,activity_summary,approval_state FROM time_entry WHERE id=?')
      .get(first.records[0].id);
    expect(time).toMatchObject({
      minutes: 47,
      activity_summary: request.workSummary,
      approval_state: 'draft',
    });
    const report = value.sqlite
      .prepare('SELECT summary,problems_found,approval_state FROM daily_report WHERE id=?')
      .get(first.records[1].id);
    expect(report).toMatchObject({
      summary: request.workSummary,
      problems_found: 'Wiring test pending',
      approval_state: 'draft',
    });
    expect(
      value.sqlite
        .prepare('SELECT approval_state,description FROM expense WHERE id=?')
        .get(first.records[2].id),
    ).toMatchObject({ approval_state: 'draft', description: 'Bus fare to site' });
    expect(() =>
      createFieldCapture(value.sqlite, value.repository, worker, {
        ...request,
        workSummary: 'Changed',
      }),
    ).toThrow(/changed/);
  });

  it('rejects invalid facts before any write and rolls back if a later canonical command rejects', () => {
    const value = fixture();
    const worker = stepUpB5Principal(value.sqlite, value.worker, 'invalid-capture');
    const request = input(value.project.id);
    expect(() =>
      createFieldCapture(value.sqlite, value.repository, worker, {
        ...request,
        time: { category: 'service', minutes: 0 },
      }),
    ).toThrow(/Actual time/);
    expect(() =>
      createFieldCapture(value.sqlite, value.repository, worker, {
        ...request,
        expense: { ...request.expense!, currency: 'EUR', amountMinor: '0' },
      }),
    ).toThrow(/amount/);
    expect(value.sqlite.prepare('SELECT count(*) n FROM capture_request').get()).toMatchObject({
      n: 0,
    });
    value.sqlite.exec(
      "CREATE TRIGGER fail_capture_expense BEFORE INSERT ON expense BEGIN SELECT RAISE(ABORT,'expense insert unavailable'); END",
    );
    expect(() => createFieldCapture(value.sqlite, value.repository, worker, request)).toThrow(
      /expense insert unavailable/,
    );
    expect(
      value.sqlite
        .prepare('SELECT count(*) n FROM time_entry WHERE activity_summary=?')
        .get(request.workSummary),
    ).toMatchObject({ n: 0 });
    expect(value.sqlite.prepare('SELECT count(*) n FROM capture_request').get()).toMatchObject({
      n: 0,
    });
  });

  it('checks live session and current assignment even for a replay', () => {
    const value = fixture();
    const worker = stepUpB5Principal(value.sqlite, value.worker, 'revoked-capture');
    const request = input(value.project.id);
    createFieldCapture(value.sqlite, value.repository, worker, request);
    expect(() => createFieldCapture(value.sqlite, value.repository, value.worker, request)).toThrow(
      /Live authenticated session/,
    );
    value.sqlite
      .prepare("UPDATE project_member SET status='inactive' WHERE project_id=? AND user_id=?")
      .run(value.project.id, worker.userId);
    expect(() => createFieldCapture(value.sqlite, value.repository, worker, request)).toThrow(
      /assignment/,
    );
    expect(() =>
      createFieldCapture(value.sqlite, value.repository, value.outsider, {
        ...request,
        requestKey: 'capture_outsider_123456',
      }),
    ).toThrow();
  });

  it('leaves expense submission under the existing receipt guard', () => {
    const value = fixture();
    const worker = stepUpB5Principal(value.sqlite, value.worker, 'capture-receipt');
    const request = {
      ...input(value.project.id),
      requestKey: 'capture_receipt_1234567890',
      time: undefined,
      report: undefined,
    };
    const result = createFieldCapture(value.sqlite, value.repository, worker, request);
    const id = result.records[0].id;
    value.sqlite.prepare('UPDATE expense SET receipt_required=1 WHERE id=?').run(id);
    expect(() => value.repository.submitExpense(worker, id, 1)).toThrow(/receipt/i);
    expect(
      value.sqlite.prepare('SELECT approval_state FROM expense WHERE id=?').get(id),
    ).toMatchObject({ approval_state: 'draft' });
  });
});
