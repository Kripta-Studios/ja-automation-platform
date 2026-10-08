import { describe, expect, it } from 'vitest';
import {
  contactProblemMatches,
  managementProblem,
  retainedContactCheck,
  retainedContactValue,
} from '../../apps/portal/src/lib/portal/management-recovery';

const payload = {
  success: false,
  code: 'CLIENT_CONTACT_FIELDS_INVALID',
  messageKey: 'problem.client.contactFieldsInvalid',
  actionName: 'updateClientContact',
  params: {},
  correlationId: 'management-test',
  fieldErrors: { email: ['Invalid email address'] },
  remedies: [{ id: 'correct_fields' }],
  values: { contactId: 'contact-a', name: 'Retained name', isPrimary: 'on' },
};

describe('management failure retention', () => {
  it('normalizes native and enhanced failures without treating success as recovery', () => {
    expect(managementProblem(payload)).toEqual(payload);
    expect(managementProblem({ type: 'failure', data: payload })).toEqual(payload);
    expect(managementProblem({ ...payload, success: true })).toBeNull();
    expect(managementProblem({ values: payload.values })).toBeNull();
  });

  it('restores a rejected contact only into the matching action and record', () => {
    const problem = managementProblem(payload);
    expect(contactProblemMatches(problem, 'updateClientContact', 'contact-a')).toBe(true);
    expect(retainedContactValue(problem, 'updateClientContact', 'contact-a', 'name', 'Saved')).toBe(
      'Retained name',
    );
    expect(
      retainedContactValue(problem, 'updateClientContact', 'contact-b', 'name', 'Other client'),
    ).toBe('Other client');
    expect(retainedContactValue(problem, 'createClientContact', 'contact-a', 'name', 'New')).toBe(
      'New',
    );
  });

  it('preserves checked and explicitly unchecked state on the rejected form', () => {
    const problem = managementProblem(payload);
    expect(retainedContactCheck(problem, 'updateClientContact', 'contact-a', 'isPrimary')).toBe(
      true,
    );
    expect(
      retainedContactCheck(problem, 'updateClientContact', 'contact-a', 'isBillingContact', true),
    ).toBe(false);
    expect(
      retainedContactCheck(problem, 'updateClientContact', 'contact-b', 'isBillingContact', true),
    ).toBe(true);
    expect(
      retainedContactCheck(
        managementProblem({ ...payload, values: { contactId: 'contact-a', isPrimary: 'false' } }),
        'updateClientContact',
        'contact-a',
        'isPrimary',
      ),
    ).toBe(false);
  });
});
