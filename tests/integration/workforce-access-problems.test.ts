import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  seedB5User,
  stepUpB5Principal,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});
const { accessActions } =
  await import('../../apps/portal/src/lib/server/actions/access-actions.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  const principal = stepUpB5Principal(value.sqlite, value.owner, 'access-problems');
  const sqlite = new Proxy(value.sqlite, {
    get(target, key) {
      if (key === 'close') return vi.fn();
      const member = Reflect.get(target, key);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
  openPortalRepository.mockReturnValue({ repository: value.repository, principal, sqlite });
  return value;
}
function event(form: Record<string, string>) {
  return {
    locals: {
      correlationId: 'access-problem-test',
      user: { email: 'antonny.luty@j-aautomation.com', role: 'owner_admin' },
      session: { id: 'test-session' },
    },
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.clearAllMocks();
});

describe('known workforce access blockers', () => {
  it('gives a field-local response for missing local credentials', async () => {
    expect(
      await accessActions.createLocalPortalUser(
        event({ name: '', email: 'new@example.test', password: 'short', role: 'worker' }),
      ),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'ACCESS_LOCAL_CREDENTIALS_INVALID',
        fieldErrors: {
          name: ['Enter the person’s name.'],
          password: ['Use a password with 12–128 characters.'],
        },
      },
    });
  });

  it('explains a duplicate portal email without creating another account', async () => {
    const value = fixture();
    const workerId = randomUUID();
    seedB5User(value.sqlite, workerId, 'worker');
    const email = `${workerId}@example.test`;
    expect(
      await accessActions.createLocalPortalUser(
        event({
          name: 'Second worker',
          email,
          password: 'unique-password-2026',
          role: 'worker',
        }),
      ),
    ).toMatchObject({
      status: 409,
      data: {
        code: 'ACCESS_EMAIL_ALREADY_USED',
        messageKey: 'problem.access.emailAlreadyUsed',
        fieldErrors: {
          email: [
            'A portal account already uses this email. Choose the existing person or another email.',
          ],
        },
        remedies: [{ id: 'review_existing_person' }],
      },
    });
    expect(
      value.sqlite.prepare('SELECT COUNT(*) count FROM user WHERE lower(email)=?').get(email),
    ).toEqual({ count: 1 });
  });

  it('limits supplier profiles to worker accounts', async () => {
    const value = fixture();
    const financeId = randomUUID();
    seedB5User(value.sqlite, financeId, 'finance_admin');
    expect(
      await accessActions.setWorkforceProfile(
        event({ workerId: financeId, profile: 'external_technician', supplierId: randomUUID() }),
      ),
    ).toMatchObject({
      status: 400,
      data: {
        code: 'ACCESS_SUPPLIER_WORKER_REQUIRED',
        fieldErrors: {
          workerId: [
            'Only worker accounts can receive a supplier profile. Choose a worker or review this person’s role.',
          ],
        },
      },
    });
  });
});
