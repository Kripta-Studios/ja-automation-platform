import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, ConflictError } from '@ja/database';
import { availabilityInputSchema } from '@ja/schemas';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  type B5LifecycleSecurityFixture,
} from './fixtures/b5-lifecycle-security-fixture.js';

const { openPortalRepository } = vi.hoisted(() => ({ openPortalRepository: vi.fn() }));
vi.mock('$lib/server/portal-repository', () => ({
  openPortalRepository,
  actionFailure: (error: unknown) => {
    throw error;
  },
}));
const { reportActions } = await import('../apps/portal/src/lib/server/actions/operations-actions');

const fixtures: B5LifecycleSecurityFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) closeB5LifecycleSecurityFixture(fixture);
  vi.clearAllMocks();
});
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}
const windowInput = {
  startsAt: '2026-09-21T08:00:00.000Z',
  endsAt: '2026-09-21T16:00:00.000Z',
  availability: 'available' as const,
  note: 'Initial window',
};
const uuid = '11111111-1111-4111-8111-111111111111';

describe('CORE-01/02/15 availability calendar edits', () => {
  it('edits the worker own window without duplicating it and audits before/after', () => {
    const value = fixture();
    const input = { ...windowInput, workerId: value.worker.userId };
    const created = value.repository.setWorkerAvailability(value.worker, input);
    const edited = value.repository.setWorkerAvailability(value.worker, {
      ...input,
      ...created,
      availability: 'unavailable',
      note: ' Vacation ',
    });
    expect(edited).toEqual({ id: created.id, version: 2 });
    expect(value.repository.listWorkerAvailability(value.worker)).toEqual([
      expect.objectContaining({
        id: created.id,
        availability: 'unavailable',
        note: 'Vacation',
        version: 2,
      }),
    ]);
    const audit = value.sqlite
      .prepare(
        "SELECT details_json FROM audit_event WHERE action='worker_availability.update' AND entity_id=?",
      )
      .get(created.id) as { details_json: string };
    expect(JSON.parse(audit.details_json)).toMatchObject({
      before: {
        id: created.id,
        worker_id: value.worker.userId,
        availability: 'available',
        note: 'Initial window',
        version: 1,
      },
      after: {
        id: created.id,
        worker_id: value.worker.userId,
        availability: 'unavailable',
        note: 'Vacation',
        version: 2,
      },
    });
  });

  it('rejects foreign records and IDOR attempts that forge the worker target', () => {
    const value = fixture();
    const input = { ...windowInput, workerId: value.outsider.userId };
    const created = value.repository.setWorkerAvailability(value.owner, input);
    expect(() =>
      value.repository.setWorkerAvailability(value.worker, { ...input, ...created }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.setWorkerAvailability(value.worker, {
        ...input,
        ...created,
        workerId: value.worker.userId,
      }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.setWorkerAvailability(value.owner, {
        ...input,
        ...created,
        workerId: value.worker.userId,
      }),
    ).toThrow(AccessDeniedError);
    expect(
      value.repository.listWorkerAvailability(value.owner, value.outsider.userId)[0],
    ).toMatchObject({ version: 1 });
  });

  it.each(['worker', 'manager'] as const)(
    'allows %s self-service without projects while rejecting access to colleagues',
    (role) => {
      const value = fixture();
      const principal = { ...value[role], projectIds: new Set<string>() };
      value.sqlite
        .prepare("UPDATE project_member SET status='inactive' WHERE user_id=?")
        .run(principal.userId);
      expect(value.repository.listWorkerSkills(principal)).toEqual([]);
      expect(value.repository.listWorkerAvailability(principal)).toEqual([]);
      const skill = value.repository.createSkill(value.owner, {
        code: `SELF-${role}`,
        name: 'Self-reported commissioning',
      });
      value.repository.setWorkerSkill(principal, {
        workerId: principal.userId,
        skillId: skill.id,
        proficiency: 3,
      });
      expect(value.repository.listWorkerSkills(principal)).toEqual([
        expect.objectContaining({ skill_id: skill.id, proficiency: 3, verified_at: null }),
      ]);
      value.repository.deleteWorkerSkill(principal, principal.userId, skill.id);
      expect(value.repository.listWorkerSkills(principal)).toEqual([]);
      const input = { ...windowInput, workerId: principal.userId };
      const created = value.repository.setWorkerAvailability(principal, input);
      value.repository.setWorkerAvailability(principal, {
        ...input,
        ...created,
        availability: 'tentative',
      });
      expect(value.repository.listWorkerAvailability(principal)).toEqual([
        expect.objectContaining({ version: 2, availability: 'tentative' }),
      ]);
      expect(() => value.repository.listWorkerSkills(principal, value.outsider.userId)).toThrow(
        AccessDeniedError,
      );
      expect(() =>
        value.repository.listWorkerAvailability(principal, value.outsider.userId),
      ).toThrow(AccessDeniedError);
      expect(() =>
        value.repository.setWorkerSkill(principal, {
          workerId: value.outsider.userId,
          skillId: skill.id,
          proficiency: 5,
        }),
      ).toThrow(AccessDeniedError);
      expect(() =>
        value.repository.setWorkerAvailability(principal, {
          ...input,
          workerId: value.outsider.userId,
        }),
      ).toThrow(AccessDeniedError);
    },
  );

  it('allows PM edits within active shared projects and denies outside scope', () => {
    const value = fixture();
    const input = { ...windowInput, workerId: value.worker.userId };
    const created = value.repository.setWorkerAvailability(value.owner, input);
    expect(value.repository.setWorkerAvailability(value.manager, { ...input, ...created })).toEqual(
      { id: created.id, version: 2 },
    );
    const outsideInput = { ...windowInput, workerId: value.outsider.userId };
    const outside = value.repository.setWorkerAvailability(value.owner, outsideInput);
    expect(() =>
      value.repository.setWorkerAvailability(value.manager, { ...outsideInput, ...outside }),
    ).toThrow(AccessDeniedError);
    value.sqlite
      .prepare("UPDATE project_member SET status='inactive' WHERE user_id=?")
      .run(value.manager.userId);
    expect(() =>
      value.repository.setWorkerAvailability(value.manager, {
        ...input,
        id: created.id,
        version: 2,
      }),
    ).toThrow(AccessDeniedError);
  });

  it('rejects auditor writes, inactive principals, and inactive worker targets', () => {
    const value = fixture();
    seedB5User(value.sqlite, 'calendar-auditor', 'auditor_read_only');
    const auditor = value.repository.principalFor('calendar-auditor');
    const input = { ...windowInput, workerId: value.worker.userId };
    const created = value.repository.setWorkerAvailability(value.worker, input);
    expect(() => value.repository.setWorkerAvailability(auditor, { ...input, ...created })).toThrow(
      AccessDeniedError,
    );
    value.sqlite.prepare("UPDATE user SET status='suspended' WHERE id=?").run(value.worker.userId);
    expect(() =>
      value.repository.setWorkerAvailability(value.worker, { ...input, ...created }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      value.repository.setWorkerAvailability(value.owner, { ...input, ...created }),
    ).toThrow(/Active worker/);
  });

  it('rejects stale edits without changing the row or adding an audit', () => {
    const value = fixture();
    const input = { ...windowInput, workerId: value.worker.userId };
    const created = value.repository.setWorkerAvailability(value.worker, input);
    value.repository.setWorkerAvailability(value.worker, {
      ...input,
      ...created,
      note: 'First editor',
    });
    expect(() =>
      value.repository.setWorkerAvailability(value.worker, {
        ...input,
        ...created,
        note: 'Stale overwrite',
      }),
    ).toThrow(ConflictError);
    expect(value.repository.listWorkerAvailability(value.worker)[0]).toMatchObject({
      version: 2,
      note: 'First editor',
    });
    expect(
      value.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_event WHERE action='worker_availability.update'",
        )
        .get(),
    ).toEqual({ count: 1 });
  });

  it('rolls the update back when its append-only audit cannot be written', () => {
    const value = fixture();
    const input = { ...windowInput, workerId: value.worker.userId };
    const created = value.repository.setWorkerAvailability(value.worker, input);
    value.sqlite.exec(
      "CREATE TRIGGER fail_availability_audit BEFORE INSERT ON audit_event WHEN NEW.action='worker_availability.update' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
    );
    expect(() =>
      value.repository.setWorkerAvailability(value.worker, {
        ...input,
        ...created,
        note: 'Must roll back',
      }),
    ).toThrow(/audit unavailable/);
    expect(value.repository.listWorkerAvailability(value.worker)[0]).toMatchObject({
      version: 1,
      note: 'Initial window',
    });
  });

  it.each([
    { startsAt: 'not-a-date' },
    { endsAt: 'Infinity' },
    { endsAt: windowInput.startsAt },
    { endsAt: '2026-09-20T00:00:00.000Z' },
  ])('rejects invalid or reversed windows: %j', (dates) => {
    const value = fixture();
    expect(() =>
      value.repository.setWorkerAvailability(value.worker, {
        ...windowInput,
        workerId: value.worker.userId,
        ...dates,
      }),
    ).toThrow(/Availability/);
    expect(value.repository.listWorkerAvailability(value.worker)).toEqual([]);
  });

  it('requires a positive version and id together at schema and repository boundaries', () => {
    const value = fixture();
    const input = { ...windowInput, workerId: value.worker.userId };
    for (const extra of [
      { id: uuid },
      { version: 1 },
      { id: uuid, version: 0 },
      { id: uuid, version: 1.5 },
    ]) {
      expect(() =>
        value.repository.setWorkerAvailability(value.worker, { ...input, ...extra }),
      ).toThrow(/id and version/);
      expect(
        availabilityInputSchema.safeParse({ ...input, workerId: uuid, ...extra }).success,
      ).toBe(false);
    }
    expect(availabilityInputSchema.safeParse({ ...input, workerId: uuid }).success).toBe(true);
    expect(
      availabilityInputSchema.safeParse({ ...input, workerId: uuid, id: uuid, version: '1' })
        .success,
    ).toBe(true);
  });
});

describe('calendar datetime action boundary', () => {
  it('submits an existing availability id and coerced version without losing date values', async () => {
    const setWorkerAvailability = vi.fn();
    const context = {
      repository: { setWorkerAvailability },
      principal: { userId: uuid },
      sqlite: { close: vi.fn() },
    };
    openPortalRepository.mockReturnValue(context);
    const result = await reportActions.setAvailability({
      locals: {},
      params: { section: 'profile' },
      request: new Request('http://localhost/app/profile?/setAvailability', {
        method: 'POST',
        body: new URLSearchParams({ ...windowInput, workerId: uuid, id: uuid, version: '2' }),
      }),
    } as never);
    expect(result).toMatchObject({ success: true });
    expect(setWorkerAvailability).toHaveBeenCalledWith(context.principal, {
      ...windowInput,
      workerId: uuid,
      id: uuid,
      version: 2,
    });
    expect(context.sqlite.close).toHaveBeenCalledOnce();
  });

  it('rejects malformed planning dates before opening the repository', async () => {
    const result = await reportActions.createPlanning({
      locals: {},
      params: { section: 'planning' },
      request: new Request('http://localhost/app/planning?/createPlanning', {
        method: 'POST',
        body: new URLSearchParams({
          projectId: uuid,
          workerId: uuid,
          startsAt: 'invalid',
          endsAt: windowInput.endsAt,
          plannedMinutes: '480',
        }),
      }),
    } as never);
    expect(result).toMatchObject({ status: 400 });
    expect(openPortalRepository).not.toHaveBeenCalled();
  });

  it.each(['2026-09-21T08:00', '2026-09-21T08:00:00.000Z'])(
    'publishes a planning entry from %s using canonical timestamps',
    async (startsAt) => {
      const createPlanningAssignment = vi.fn();
      const context = {
        repository: { createPlanningAssignment },
        principal: { userId: uuid },
        sqlite: { close: vi.fn() },
      };
      openPortalRepository.mockReturnValue(context);
      const endsAt = startsAt.includes('Z') ? '2026-09-21T16:00:00.000Z' : '2026-09-21T16:00';
      const result = await reportActions.createPlanning({
        locals: {},
        params: { section: 'planning' },
        request: new Request('http://localhost/app/planning?/createPlanning', {
          method: 'POST',
          body: new URLSearchParams({
            projectId: uuid,
            workerId: uuid,
            startsAt,
            endsAt,
            plannedMinutes: '480',
          }),
        }),
      } as never);
      expect(result).toMatchObject({ success: true });
      expect(createPlanningAssignment).toHaveBeenCalledWith(
        context.principal,
        expect.objectContaining({
          startsAt: windowInput.startsAt,
          endsAt: windowInput.endsAt,
          plannedMinutes: 480,
        }),
      );
      expect(context.sqlite.close).toHaveBeenCalledOnce();
    },
  );
});
