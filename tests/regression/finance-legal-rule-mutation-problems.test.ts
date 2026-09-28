import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import {
  financeActions,
  financeFailure,
} from '../../apps/portal/src/lib/server/actions/finance-actions';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

afterEach(() => vi.mocked(openPortalRepository).mockReset());

const projectId = '00000000-0000-4000-8000-000000000123';
const workerId = '00000000-0000-4000-8000-000000000456';
const ruleId = '00000000-0000-4000-8000-000000000789';
const values = { projectId, workerId, effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' };

const legalCases = [
  {
    action: 'createCanonicalLegalEntityRevision',
    error: new V3ValidationError('Legacy legal entity not found'),
    code: 'FINANCE_LEGACY_LEGAL_ENTITY_UNAVAILABLE',
    key: 'problem.finance.legacyLegalEntityUnavailable',
    field: 'legacyLegalEntityId',
    status: 409,
  },
  {
    action: 'createCanonicalLegalEntityRevision',
    error: new V3ValidationError('Base currency must match the legacy legal entity'),
    code: 'FINANCE_LEGAL_ENTITY_BASE_CURRENCY_MISMATCH',
    key: 'problem.finance.legalEntityBaseCurrencyMismatch',
    field: 'baseCurrency',
    status: 409,
  },
  {
    action: 'createCanonicalLegalEntityRevision',
    error: new V3ConflictError('Legal-entity revision effective date must follow the current tail'),
    code: 'FINANCE_LEGAL_ENTITY_REVISION_DATE_BEFORE_TAIL',
    key: 'problem.finance.legalEntityRevisionDateBeforeTail',
    field: 'effectiveFrom',
    status: 409,
  },
  {
    action: 'assignProjectLegalEntity',
    error: new V3AccessDeniedError('Legal-entity revision scope mismatch'),
    code: 'FINANCE_PROJECT_ISSUER_REVISION_SCOPE_MISMATCH',
    key: 'problem.finance.projectIssuerRevisionScopeMismatch',
    field: 'legalEntityRevisionId',
    status: 403,
  },
  {
    action: 'assignProjectLegalEntity',
    error: new V3ValidationError('Legal-entity revision not found'),
    code: 'FINANCE_PROJECT_ISSUER_REVISION_UNAVAILABLE',
    key: 'problem.finance.projectIssuerRevisionUnavailable',
    field: 'legalEntityRevisionId',
    status: 409,
  },
  {
    action: 'assignProjectLegalEntity',
    error: new V3ValidationError('Assignment starts before the legal-entity revision'),
    code: 'FINANCE_PROJECT_ISSUER_STARTS_BEFORE_REVISION',
    key: 'problem.finance.projectIssuerStartsBeforeRevision',
    field: 'effectiveFrom',
    status: 409,
  },
  {
    action: 'assignProjectLegalEntity',
    error: new V3ValidationError('Assignment must end within the legal-entity revision interval'),
    code: 'FINANCE_PROJECT_ISSUER_ENDS_OUTSIDE_REVISION',
    key: 'problem.finance.projectIssuerEndsOutsideRevision',
    field: 'effectiveTo',
    status: 409,
  },
] as const;

const ruleFamilies = [
  {
    prefix: 'FINANCE_COMPENSATION_RULE',
    supersede: 'supersedeCompensationRule',
    deactivate: 'deactivateCompensationRule',
    missing: 'Compensation rule not found',
    scope: 'A successor must keep the same worker',
    date: 'Successor effective date must follow the existing rule',
    closed: 'Compensation rule is already closed for that date',
    changed: 'Compensation rule changed while superseding',
    inactive: 'Compensation rule is already inactive',
    remedy: 'review_compensation_rules',
  },
  {
    prefix: 'FINANCE_CLIENT_LABOR_RATE',
    supersede: 'supersedeClientLaborRate',
    deactivate: 'deactivateClientLaborRate',
    missing: 'Client labor rate not found',
    scope: 'A successor must keep the same client-rate scope',
    date: 'Successor effective date must follow the existing rate',
    closed: 'Client labor rate is already closed for that date',
    changed: 'Client labor rate changed while superseding',
    inactive: 'Client labor rate is already inactive',
    remedy: 'review_client_labor_rates',
  },
  {
    prefix: 'FINANCE_INTERNAL_COST_RULE',
    supersede: 'supersedeInternalCostRule',
    deactivate: 'deactivateInternalCostRule',
    missing: 'Internal cost rule not found',
    scope: 'A successor must keep the same internal-cost scope',
    date: 'Successor effective date must follow the existing rule',
    closed: 'Internal cost rule is already closed for that date',
    changed: 'Internal cost rule changed while superseding',
    inactive: 'Internal cost rule is already inactive',
    remedy: 'review_internal_cost_rules',
  },
] as const;

describe('Finance legal authority and rule mutation problems', () => {
  it.each(legalCases)('maps $code with localized field guidance', (item) => {
    const result = financeFailure(item.error, { actionName: item.action, projectId, values });
    expect(result.status).toBe(item.status);
    expect(result.data).toMatchObject({
      code: item.code,
      messageKey: item.key,
      values,
      actionName: item.action,
      fieldErrors: { [item.field]: [item.key] },
    });
    expect(result.data.remedies[0].id).toMatch(/^(configure_project_issuer|correct_field)$/);
    expect(result.data.message).not.toBe(item.error.message);
    for (const locale of ['en', 'es', 'pt'] as const)
      expect(translate(locale, result.data.fieldErrors[item.field][0])).toBe(
        translate(locale, item.key),
      );
  });

  for (const family of ruleFamilies) {
    const cases = [
      [family.supersede, family.missing, 'UNAVAILABLE', 'ruleReferenceUnavailable', null],
      [
        family.supersede,
        family.scope,
        'SUCCESSOR_SCOPE_CHANGED',
        'ruleSuccessorScopeChanged',
        null,
      ],
      [
        family.supersede,
        family.date,
        'SUCCESSOR_DATE_INVALID',
        'ruleSuccessorDateInvalid',
        'effectiveFrom',
      ],
      [
        family.supersede,
        family.closed,
        'CLOSED_FOR_SUCCESSOR_DATE',
        'ruleClosedForSuccessorDate',
        'effectiveFrom',
      ],
      [family.supersede, family.changed, 'CHANGED', 'ruleChangedWhileSuperseding', null],
      [family.deactivate, family.missing, 'UNAVAILABLE', 'ruleReferenceUnavailable', null],
      [family.deactivate, family.inactive, 'ALREADY_INACTIVE', 'ruleAlreadyInactive', null],
      [
        family.deactivate,
        'End date must follow the effective date',
        'DEACTIVATION_BEFORE_START',
        'ruleDeactivationBeforeStart',
        null,
      ],
    ] as const;
    it.each(cases)(`${family.prefix} maps %s / %s`, (action, diagnostic, suffix, key, field) => {
      const error = /changed while superseding|already closed|already inactive/u.test(diagnostic)
        ? new V3ConflictError(diagnostic)
        : new V3ValidationError(diagnostic);
      const result = financeFailure(error, { actionName: action, projectId, values });
      const messageKey = `problem.finance.${key}`;
      expect(result.status).toBe(409);
      expect(result.data).toMatchObject({
        code: `${family.prefix}_${suffix}`,
        messageKey,
        actionName: action,
        values,
        remedies: [{ id: family.remedy }],
      });
      expect(result.data.fieldErrors).toEqual(field ? { [field]: [messageKey] } : {});
      expect(result.data.message).not.toBe(diagnostic);
      for (const locale of ['en', 'es', 'pt'] as const) {
        expect(translate(locale, messageKey)).not.toBe(messageKey);
        if (field)
          expect(translate(locale, result.data.fieldErrors[field][0])).toBe(
            translate(locale, messageKey),
          );
      }
    });
  }

  it('distinguishes the compensation successor worker and project scope diagnostics', () => {
    const result = financeFailure(
      new V3ValidationError('A successor must keep the same project scope'),
      {
        actionName: 'supersedeCompensationRule',
        values,
      },
    );
    expect(result.data.code).toBe('FINANCE_COMPENSATION_RULE_SUCCESSOR_SCOPE_CHANGED');
  });

  it('does not map an unrelated action with an identical repository message', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = financeFailure(new ConflictError('Legal-entity revision not found'), {
        actionName: 'createClientLaborRate',
        values,
      });
      expect(result.data.code).not.toBe('FINANCE_PROJECT_ISSUER_REVISION_UNAVAILABLE');
    } finally {
      warning.mockRestore();
    }
  });

  it.each([
    {
      action: 'createCanonicalLegalEntityRevision',
      method: 'createCanonicalLegalEntityRevision',
      form: {
        legacyLegalEntityId: 'legacy-1',
        effectiveFrom: '2026-10-01',
        effectiveTo: '',
        legalName: 'QA Legal',
        taxIdentifier: '',
        registrationIdentifier: '',
        addressLine1: 'Street 1',
        addressLine2: '',
        locality: 'Madrid',
        region: '',
        postalCode: '28001',
        countryCode: 'ES',
        baseCurrency: 'EUR',
        timezone: 'Europe/Madrid',
        reason: 'Review legal authority',
        idempotencyKey: 'test-legal-command-1234',
      },
      error: new V3ValidationError('Legacy legal entity not found'),
      code: 'FINANCE_LEGACY_LEGAL_ENTITY_UNAVAILABLE',
    },
    {
      action: 'assignProjectLegalEntity',
      method: 'assignCanonicalLegalEntityToProject',
      form: {
        projectId,
        legalEntityRevisionId: `ce-legal-entity-revision-${'a'.repeat(40)}`,
        effectiveFrom: '2026-10-01',
        effectiveTo: '',
        reason: 'QA issuer assignment',
        idempotencyKey: 'test-issuer-command-1234',
      },
      error: new V3ValidationError('Legal-entity revision not found'),
      code: 'FINANCE_PROJECT_ISSUER_REVISION_UNAVAILABLE',
    },
    {
      action: 'supersedeCompensationRule',
      method: 'supersedeCompensationRule',
      form: {
        supersedesId: ruleId,
        workerId,
        projectId,
        currency: 'EUR',
        ruleType: 'Hourly',
        rateMinor: '5000',
        effectiveFrom: '2026-10-01',
      },
      error: new V3ValidationError('Successor effective date must follow the existing rule'),
      code: 'FINANCE_COMPENSATION_RULE_SUCCESSOR_DATE_INVALID',
    },
    {
      action: 'deactivateInternalCostRule',
      method: 'deactivateInternalCostRule',
      form: { ruleId },
      error: new V3ConflictError('Internal cost rule is already inactive'),
      code: 'FINANCE_INTERNAL_COST_RULE_ALREADY_INACTIVE',
    },
  ] as const)('retains submitted values in the $action form response', async (item) => {
    const throwProblem = vi.fn(() => {
      throw item.error;
    });
    const close = vi.fn();
    vi.mocked(openPortalRepository).mockReturnValue({
      principal: { userId: 'finance', role: 'finance_admin', projectIds: new Set() },
      sqlite: { close },
      repository: { [item.method]: throwProblem },
      v3: { [item.method]: throwProblem },
    } as never);
    const handler = financeActions[item.action];
    expect(handler).toBeDefined();
    const result = await handler!({
      locals: {},
      params: { section: 'finance' },
      request: new Request('http://localhost/app/finance', {
        method: 'POST',
        body: new URLSearchParams(item.form),
      }),
    } as never);
    expect(throwProblem).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(result.data).toMatchObject({
      code: item.code,
      actionName: item.action,
      values: item.form,
    });
  });
});
