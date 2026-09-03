import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V3AccessDeniedError } from '@ja/database';
import { projectLegalEntityAssignmentInputSchema } from '@ja/schemas';

const openPortalRepository = vi.fn();

vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});

const { financeActions } =
  await import('../../apps/portal/src/lib/server/actions/finance-actions.ts');

const validForm = {
  projectId: '11111111-1111-4111-8111-111111111111',
  legalEntityRevisionId: `ce-legal-entity-revision-${'a'.repeat(40)}`,
  effectiveFrom: '2026-08-01',
  effectiveTo: '',
  reason: 'Bind the UAT project to the reviewed issuing authority',
  idempotencyKey: 'uat-project-authority:11111111',
};

function event(form: Record<string, string>, role = 'finance_admin', section = 'finance') {
  return {
    locals: {
      user: {
        id: `${role}-1`,
        name: role,
        email: `${role}@example.test`,
        role,
        status: 'active',
      },
      session: {
        id: `${role}-session`,
        userId: `${role}-1`,
        expiresAt: new Date(Date.now() + 60_000),
      },
      correlationId: 'canonical-project-authority-action',
    },
    params: { section },
    request: new Request(`http://localhost/app/${section}?/assignProjectLegalEntity`, {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}

function context(role: string, assign = vi.fn()) {
  return {
    v3: { assignCanonicalLegalEntityToProject: assign },
    principal: {
      userId: `${role}-1`,
      role,
      projectIds: new Set<string>(),
      sessionId: `${role}-session`,
    },
    sqlite: { close: vi.fn() },
  };
}

describe('canonical project legal-entity Finance action', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['worker', 'project_manager', 'auditor_read_only'])(
    'denies %s before validating sensitive canonical assignment input',
    async (role) => {
      const value = context(role);
      openPortalRepository.mockReturnValue(value);

      const result = await financeActions.assignProjectLegalEntity(
        event({ projectId: 'not-a-project' }, role),
      );

      expect(result).toMatchObject({
        status: 403,
        data: { success: false, messageKey: 'action.error.forbidden' },
      });
      expect(value.v3.assignCanonicalLegalEntityToProject).not.toHaveBeenCalled();
      expect(value.sqlite.close).toHaveBeenCalledOnce();
    },
  );

  it('uses a strict normalized contract and delegates to the transactional canonical command', async () => {
    const assign = vi.fn(() => ({ assignmentId: 'assignment-1', idempotent: false }));
    const value = context('finance_admin', assign);
    openPortalRepository.mockReturnValue(value);

    expect(projectLegalEntityAssignmentInputSchema.safeParse(validForm).success).toBe(true);
    const result = await financeActions.assignProjectLegalEntity(event(validForm));

    expect(assign).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'finance_admin',
        sessionId: 'finance_admin-session',
      }),
      {
        projectId: validForm.projectId,
        legalEntityRevisionId: validForm.legalEntityRevisionId,
        effectiveFrom: '2026-08-01',
        effectiveTo: undefined,
        reason: validForm.reason,
        idempotencyKey: validForm.idempotencyKey,
      },
    );
    expect(result).toMatchObject({
      success: true,
      messageKey: 'action.finance.projectLegalEntityAssigned',
      messageParams: { idempotent: false },
    });
    expect(value.sqlite.close).toHaveBeenCalledOnce();
  });

  it('returns step-up-required without creating an assignment', async () => {
    const assign = vi.fn(() => {
      throw new V3AccessDeniedError('Recent step-up authentication is required');
    });
    const value = context('owner_admin', assign);
    openPortalRepository.mockReturnValue(value);

    const result = await financeActions.assignProjectLegalEntity(event(validForm, 'owner_admin'));

    expect(result).toMatchObject({
      status: 403,
      data: {
        success: false,
        messageKey: 'action.error.stepUpRequired',
        stepUpRequired: true,
      },
    });
    expect(assign).toHaveBeenCalledOnce();
    expect(value.sqlite.close).toHaveBeenCalledOnce();
  });

  it('rejects over-posted or reversed intervals before invoking the command', async () => {
    const value = context('finance_admin');
    openPortalRepository.mockReturnValue(value);

    for (const form of [
      { ...validForm, legalName: 'Forged browser authority' },
      { ...validForm, effectiveTo: '2026-07-31' },
    ]) {
      const result = await financeActions.assignProjectLegalEntity(event(form));
      expect(result).toMatchObject({ status: 400 });
    }
    expect(value.v3.assignCanonicalLegalEntityToProject).not.toHaveBeenCalled();
  });
});
