import { afterEach, expect, it } from 'vitest';
import { DigitalWorkersRepository } from '../../packages/database/src/domains/digital-workers/index.ts';
import { NotificationRepository } from '../../packages/database/src/domains/notifications/notification-repository.ts';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.ts';
let fixture: B5LifecycleSecurityFixture | undefined;
afterEach(() => {
  if (fixture) closeB5LifecycleSecurityFixture(fixture);
  fixture = undefined;
});
it('automatically follows up due work once, rechecks assignment/deadline/state, and never sends mail', () => {
  const f = (fixture = createB5LifecycleSecurityFixture());
  const owner = stepUpB5Principal(f.sqlite, f.owner, 'dw-notice');
  const worker = stepUpB5Principal(f.sqlite, f.worker, 'dw-notice');
  const digital = new DigitalWorkersRepository(f.sqlite);
  const item = digital.saveWorkItem(owner, {
    projectId: f.project.id,
    kind: 'evidence',
    title: 'Attach dated handover evidence',
    ownerId: worker.userId,
    dueOn: '2026-01-01',
    requestKey: 'notice-create-001',
  });
  digital.saveWorkItem(owner, {
    projectId: f.project.id,
    kind: 'evidence',
    title: 'Future obligation',
    ownerId: worker.userId,
    dueOn: '2099-01-01',
    requestKey: 'notice-create-002',
  });
  const notification = new NotificationRepository({
    sqlite: f.sqlite,
    transaction: (work) => work(),
    now: () => new Date().toISOString(),
  });
  const mailBefore = f.sqlite
    .prepare("SELECT COUNT(*) n FROM outbox_event WHERE topic='notification.email.requested'")
    .get()!.n;
  notification.dispatchBusinessNotifications();
  notification.dispatchBusinessNotifications();
  const notices = () =>
    f.repository.listNotifications(worker).filter((row) => row.kind === 'digital_work_followup');
  expect(notices()).toHaveLength(1);
  expect(notices()[0]).toMatchObject({
    source_id: item.id,
    record_title: item.title,
    target: `/app/workflow?project=${f.project.id}#item-${item.id}`,
  });
  const changed = digital.updateWorkItem(owner, {
    id: item.id,
    expectedVersion: item.version,
    dueOn: '2026-01-02',
    reason: 'Agreed revised deadline',
    requestKey: 'notice-update-001',
  });
  expect(notices()).toHaveLength(0);
  notification.dispatchBusinessNotifications();
  expect(notices()).toHaveLength(1);
  f.sqlite
    .prepare("UPDATE project_member SET status='inactive' WHERE project_id=? AND user_id=?")
    .run(f.project.id, worker.userId);
  expect(notices()).toHaveLength(0);
  notification.dispatchBusinessNotifications();
  expect(
    f.sqlite
      .prepare("SELECT COUNT(*) n FROM notification WHERE kind='digital_work_followup'")
      .get()!.n,
  ).toBe(2);
  f.sqlite
    .prepare("UPDATE project_member SET status='active' WHERE project_id=? AND user_id=?")
    .run(f.project.id, worker.userId);
  digital.updateWorkItem(owner, {
    id: item.id,
    expectedVersion: changed.version,
    status: 'cancelled',
    reason: 'No longer required',
    requestKey: 'notice-update-002',
  });
  expect(notices()).toHaveLength(0);
  notification.dispatchBusinessNotifications();
  expect(
    f.sqlite
      .prepare("SELECT COUNT(*) n FROM notification WHERE kind='digital_work_followup'")
      .get()!.n,
  ).toBe(2);
  expect(
    f.sqlite
      .prepare("SELECT COUNT(*) n FROM outbox_event WHERE topic='notification.email.requested'")
      .get()!.n,
  ).toBe(mailBefore);
});
