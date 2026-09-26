import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

import {
  AccessDeniedError,
  ConflictError,
  ProjectBillingSetupRepository,
  ReadinessError,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { portalText } from '$lib/portal-i18n';
import { actions } from '../../apps/portal/src/routes/app/projects/[id]/+page.server';

const projectId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const ruleId = '33333333-3333-4333-8333-333333333333';
const repository = {
  submitProjectMilestone: vi.fn(),
  listBillingRules: vi.fn(() => [{ id: ruleId, project_id: projectId }]),
  createInvoiceDraft: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
};
const close = vi.fn();
const get = vi.fn(() => ({ project_id: projectId }));

function request(values: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request('http://local.test/action', { method: 'POST', body: form });
}

async function submit(
  name: keyof typeof actions,
  values: Record<string, string>,
  role = 'owner_admin',
) {
  const action = actions[name];
  if (!action) throw new Error(`Missing action ${name}`);
  return action({
    request: request(values),
    params: { id: projectId },
    locals: { user: { id: 'user-1', role } },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  get.mockReturnValue({ project_id: projectId });
  repository.listBillingRules.mockReturnValue([{ id: ruleId, project_id: projectId }]);
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'user-1', role: 'owner_admin' },
    sqlite: { prepare: () => ({ get }), close },
    repository,
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('project detail action problems', () => {
  it('preserves a stale milestone reference with a review remedy', async () => {
    repository.submitProjectMilestone.mockImplementation(() => {
      throw new ConflictError('Milestone changed or not found');
    });
    const result = await submit('submitMilestone', { id: memberId, version: '4' });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_MILESTONE_CHANGED',
        actionName: 'submitMilestone',
        values: { id: memberId, version: '4' },
        remedies: [{ id: 'review_updated_record', projectId }],
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('returns a role-safe milestone denial', async () => {
    repository.submitProjectMilestone.mockImplementation(() => {
      throw new AccessDeniedError('Project milestone administration required');
    });
    const result = await submit('submitMilestone', { id: memberId, version: '4' }, 'worker');
    expect(result).toMatchObject({
      status: 403,
      data: {
        code: 'PROJECT_MILESTONE_ROLE_REQUIRED',
        remedies: [{ id: 'contact_owner', projectId }],
      },
    });
  });

  it('keeps person commercial terms separate from finalized worker settlement history', async () => {
    vi.spyOn(ProjectBillingSetupRepository.prototype, 'savePersonTerms').mockImplementation(() => {
      throw new ConflictError(
        'Invoice or finalized worker settlement history overlaps these terms. Choose a later effective date.',
      );
    });
    const result = await submit('savePersonTerms', {
      projectId,
      projectMemberId: memberId,
      workerId: 'worker-1',
      expectedFingerprint: 'a'.repeat(64),
      effectiveFrom: '2026-09-25',
      customerHourlyRate: '80.00',
      workerPayType: 'Hourly',
      workerPayAmount: '35.00',
      percentageBasis: 'CLIENT_LABOR_BEFORE_TAX',
      expensePayer: 'worker',
      workerReimbursement: 'at_cost',
      clientRecovery: 'at_cost',
      markupPercent: '',
    });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_PERSON_TERMS_HISTORY_LOCKED',
        action: 'savePersonTerms',
        fieldErrors: { effectiveFrom: ['problem.projectDetail.personTermsHistoryLocked'] },
        values: { customerHourlyRate: '80.00', workerPayAmount: '35.00' },
      },
    });
  });

  it('returns field errors and values for invalid billing setup', async () => {
    const result = await submit('saveBillingSetup', { projectId, mode: 'invalid' });
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'PROJECT_BILLING_SETUP_INVALID',
        action: 'saveBillingSetup',
        values: { mode: 'invalid' },
      },
    });
    expect(Object.keys((result as { data: { fieldErrors: object } }).data.fieldErrors)).toContain(
      'mode',
    );
  });

  it('uses a Portuguese catalog key for inline billing payment terms errors', async () => {
    const result = await submit('saveBillingSetup', {
      projectId,
      expectedVersion: '2',
      expectedRulesFingerprint: 'a'.repeat(64),
      requestKey: memberId,
      mode: 'combined',
      effectiveFrom: '2026-09-25',
      legalEntityId: 'entity-1',
      laborTaxProfileId: '',
      expenseTaxProfileId: '',
      cadenceType: 'monthly',
      expenseCadenceType: 'monthly',
      invoiceLayout: 'default',
      groupingMode: 'detail',
      paymentTermsDays: '500',
      autoGenerateDraft: 'false',
      saveAsTemplate: 'false',
    });
    const fieldKey = (result as { data: { fields: Record<string, string[]> } }).data.fields
      .paymentTermsDays?.[0];
    expect(fieldKey).toBe('problem.projectDetail.billingPaymentTermsInvalid');
    expect(portalText('pt', fieldKey!)).toContain('0 a 365 dias');
  });

  it('identifies a stale billing setup without losing its configuration', async () => {
    vi.spyOn(ProjectBillingSetupRepository.prototype, 'save').mockImplementation(() => {
      throw new ConflictError('Billing setup changed. Reload before saving.');
    });
    const result = await submit('saveBillingSetup', {
      projectId,
      expectedVersion: '2',
      expectedRulesFingerprint: 'a'.repeat(64),
      requestKey: memberId,
      mode: 'combined',
      effectiveFrom: '2026-09-25',
      legalEntityId: 'entity-1',
      laborTaxProfileId: '',
      expenseTaxProfileId: '',
      cadenceType: 'monthly',
      expenseCadenceType: 'monthly',
      invoiceLayout: 'default',
      groupingMode: 'detail',
      paymentTermsDays: '30',
      autoGenerateDraft: 'false',
      saveAsTemplate: 'false',
    });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_BILLING_SETUP_CHANGED',
        action: 'saveBillingSetup',
        values: { mode: 'combined', paymentTermsDays: '30' },
        remedies: [{ id: 'review_billing_setup', projectId }],
      },
    });
  });

  it('rejects a billing stream that disappeared before invoice draft creation', async () => {
    repository.listBillingRules.mockReturnValue([]);
    const result = await submit('createInvoiceDraft', {
      billingRuleId: ruleId,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-15',
    });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_INVOICE_RULE_UNAVAILABLE',
        actionName: 'createInvoiceDraft',
        values: { billingRuleId: ruleId },
      },
    });
  });

  it('keeps billing readiness reasons and entered dates in the typed failure', async () => {
    repository.createInvoiceDraft.mockImplementation(() => {
      throw new ReadinessError([{ code: 'pending_time_approval' }]);
    });
    const result = await submit('createInvoiceDraft', {
      billingRuleId: ruleId,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-15',
    });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'BILLING_READINESS_PENDING_TIME_APPROVAL',
        actionName: 'createInvoiceDraft',
        reasons: [{ code: 'pending_time_approval' }],
        values: { periodStart: '2026-09-01', periodEnd: '2026-09-15' },
        remedies: [{ id: 'review_pending_records' }],
      },
    });
  });

  it('reports project stale updates with retained fields', async () => {
    repository.updateProject.mockImplementation(() => {
      throw new ConflictError('Project changed before update');
    });
    const result = await submit('updateProject', { projectId, version: '2', name: 'Edited name' });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_DETAIL_CHANGED',
        messageKey: 'problem.project.stale',
        values: { name: 'Edited name', version: '2' },
      },
    });
  });

  it('explains why a project with time history cannot be deleted', async () => {
    repository.deleteProject.mockImplementation(() => {
      throw new ConflictError(
        'Project has recorded time entries and cannot be deleted. Please archive the project instead.',
      );
    });
    const result = await submit('deleteProject', { projectId });
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'PROJECT_DELETE_HAS_TIME',
        remedies: [{ id: 'review_project_status', projectId }],
      },
    });
  });

  it('keeps matching text from an unexpected exception on the safe 500 path', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    repository.updateProject.mockImplementation(() => {
      throw new Error('Project changed before update');
    });
    const result = await submit('updateProject', { projectId, version: '2' });
    expect(result).toMatchObject({ status: 500, data: { code: 'UNEXPECTED_ERROR' } });
    expect(log).toHaveBeenCalled();
  });
});
