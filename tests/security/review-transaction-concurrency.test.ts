import type { DatabaseSync } from 'node:sqlite';
import {
  AccessDeniedError,
  ConflictError,
  PortalRepository,
  V3AccessDeniedError,
  V3ConflictError,
  V3Repository,
} from '@ja/database';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

function revokeReviewMembershipWhenTransactionBegins(
  sqlite: DatabaseSync,
  projectId: string,
  reviewerId: string,
): DatabaseSync {
  let armed = true;
  return new Proxy(sqlite, {
    get(target, property) {
      if (property === 'exec') {
        return (sql: string): void => {
          if (armed && /^BEGIN IMMEDIATE\b/u.test(sql.trim())) {
            armed = false;
            target
              .prepare(
                "UPDATE project_member SET can_review=0 WHERE project_id=? AND user_id=? AND status='active'",
              )
              .run(projectId, reviewerId);
          }
          target.exec(sql);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as DatabaseSync;
}

type ReviewSubject = Readonly<{
  entityId: string;
  entityType: string;
  table: 'daily_report' | 'project_milestone' | 'technical_change';
  invoke: () => void;
  accessError: typeof AccessDeniedError | typeof V3AccessDeniedError;
  conflictError: typeof ConflictError | typeof V3ConflictError;
}>;

function submittedReviewSubject(
  value: B5LifecycleSecurityFixture,
  kind: 'report' | 'milestone' | 'technical_change',
  sqlite: DatabaseSync,
): ReviewSubject {
  if (kind === 'report') {
    const report = value.repository.createDailyReport(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      summary: 'Transactional review report',
      tasksCompleted: 'Verified the review boundary',
      downtimeMinutes: 0,
      safetyRelated: false,
    });
    value.repository.submitReport(value.worker, 'daily', report.id, report.version);
    const repository = new PortalRepository(sqlite);
    return {
      entityId: report.id,
      entityType: 'daily_report',
      table: 'daily_report',
      invoke: () => repository.reviewReport(value.manager, 'daily', report.id, 'approved'),
      accessError: AccessDeniedError,
      conflictError: ConflictError,
    };
  }

  if (kind === 'milestone') {
    const milestone = value.repository.createProjectMilestone(value.owner, {
      projectId: value.project.id,
      name: 'Transactional review milestone',
      amountMinor: 12_500n,
    });
    value.repository.submitProjectMilestone(value.owner, milestone.id, milestone.version);
    const repository = new PortalRepository(sqlite);
    return {
      entityId: milestone.id,
      entityType: 'milestone',
      table: 'project_milestone',
      invoke: () => repository.reviewProjectMilestone(value.manager, milestone.id, 'approved'),
      accessError: AccessDeniedError,
      conflictError: ConflictError,
    };
  }

  const change = value.v3.createTechnicalChange(value.worker, {
    projectId: value.project.id,
    component: 'Transactional review component',
    changeMade: 'Added an interlock boundary',
  });
  value.v3.submitTechnicalChange(value.worker, change.id, change.version);
  const repository = new V3Repository(sqlite);
  return {
    entityId: change.id,
    entityType: 'technical_change',
    table: 'technical_change',
    invoke: () => repository.reviewTechnicalChange(value.manager, change.id, 'approved'),
    accessError: V3AccessDeniedError,
    conflictError: V3ConflictError,
  };
}

function expectNoReviewSideEffects(
  value: B5LifecycleSecurityFixture,
  subject: ReviewSubject,
): void {
  expect(
    value.sqlite
      .prepare(`SELECT approval_state FROM ${subject.table} WHERE id=?`)
      .get(subject.entityId),
  ).toEqual({ approval_state: 'submitted' });
  expect(
    value.sqlite
      .prepare('SELECT count(*) count FROM approval_event WHERE entity_type=? AND entity_id=?')
      .get(subject.entityType, subject.entityId),
  ).toEqual({ count: 0 });
  expect(
    value.sqlite
      .prepare('SELECT count(*) count FROM notification WHERE subject_id=?')
      .get(subject.entityId),
  ).toEqual({ count: 0 });
  expect(
    value.sqlite
      .prepare('SELECT count(*) count FROM audit_event WHERE entity_id=? AND action LIKE ?')
      .get(subject.entityId, `%.approved`),
  ).toEqual({ count: 0 });
}

describe('review authorization and state are committed atomically', () => {
  it.each(['report', 'milestone', 'technical_change'] as const)(
    'rejects %s review when PM authority is revoked immediately before the write transaction',
    (kind) => {
      const value = fixture();
      const sqlite = revokeReviewMembershipWhenTransactionBegins(
        value.sqlite,
        value.project.id,
        value.manager.userId,
      );
      const subject = submittedReviewSubject(value, kind, sqlite);

      expect(subject.invoke).toThrow(subject.accessError);
      expectNoReviewSideEffects(value, subject);
    },
  );

  it.each(['report', 'milestone', 'technical_change'] as const)(
    'rolls back %s review side effects when the submitted-state CAS loses',
    (kind) => {
      const value = fixture();
      const subject = submittedReviewSubject(value, kind, value.sqlite);
      value.sqlite.exec(`
        CREATE TEMP TRIGGER cancel_${kind}_review_cas
        BEFORE UPDATE OF approval_state ON ${subject.table}
        WHEN OLD.id='${subject.entityId}' AND OLD.approval_state='submitted'
        BEGIN
          SELECT RAISE(IGNORE);
        END;
      `);

      expect(subject.invoke).toThrow(subject.conflictError);
      expectNoReviewSideEffects(value, subject);
    },
  );
});
