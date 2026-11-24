import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';
import {
  SignedSheetInputError,
  removeSignedWeekSheet,
  signedSheetWeekSent,
} from '../../apps/portal/src/lib/server/signed-week-sheets.js';

let fixture: B5LifecycleSecurityFixture | undefined;
afterEach(() => {
  if (fixture) closeB5LifecycleSecurityFixture(fixture);
  fixture = undefined;
});

const weekStart = '2026-11-16';
function setup() {
  fixture = createB5LifecycleSecurityFixture();
  const owner = stepUpB5Principal(fixture.sqlite, fixture.owner, 'sheet-remove-owner');
  const bytes = Buffer.from('%PDF-1.4\nsigned sheet T38\n%%EOF\n');
  const reservation = fixture.v3.reserveUpload(owner, {
    projectId: fixture.project.id,
    originalFilename: 'hoja.pdf',
    artifactType: 'signed_timesheet',
    sensitivity: 'internal',
    artifactMetadata: { kind: 'signed_timesheet', workerId: fixture.worker.userId, weekStart },
  });
  fixture.v3.finalizeUpload(owner, reservation.reservationId, {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mediaType: 'application/pdf',
    byteLength: bytes.length,
  });
  const context = (principal: typeof owner) =>
    ({ ...fixture!, principal }) as unknown as Parameters<typeof removeSignedWeekSheet>[0];
  return { fixture, owner, id: reservation.reservationId, context };
}
const archived = (f: B5LifecycleSecurityFixture, id: string) =>
  (
    f.sqlite.prepare('SELECT archived_at FROM document WHERE id=?').get(id) as {
      archived_at: string | null;
    }
  ).archived_at;

describe('signed week sheet removal (T38)', () => {
  it('lets the uploader remove a sheet from a week that was not sent, with an audit event', () => {
    const { fixture, owner, id, context } = setup();
    removeSignedWeekSheet(context(owner), id);
    expect(archived(fixture, id)).toBeTruthy();
    expect(
      fixture.sqlite
        .prepare(
          "SELECT count(*) n FROM audit_event WHERE action='document.delete' AND entity_id=?",
        )
        .get(id),
    ).toEqual({ n: 1 });
  });

  it('refuses another person and keeps the sheet once the week was sent', () => {
    const { fixture, owner, id, context } = setup();
    const manager = stepUpB5Principal(fixture.sqlite, fixture.manager, 'sheet-remove-manager');
    expect(() => removeSignedWeekSheet(context(manager), id)).toThrow(SignedSheetInputError);
    expect(archived(fixture, id)).toBeNull();
    const created = fixture.repository.createTimeEntry(
      owner,
      {
        projectId: fixture.project.id,
        workDate: '2026-11-18',
        category: 'regular',
        minutes: 60,
        summary: 'Sent week',
      } as never,
      fixture.worker.userId,
    );
    fixture.repository.submitTime(owner, created.id, created.version);
    expect(
      signedSheetWeekSent(fixture.sqlite, {
        projectId: fixture.project.id,
        workerId: fixture.worker.userId,
        weekStart,
      }),
    ).toBe(true);
    try {
      removeSignedWeekSheet(context(owner), id);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SignedSheetInputError);
      expect((error as SignedSheetInputError).code).toBe('sent');
    }
    expect(archived(fixture, id)).toBeNull();
  });
});
