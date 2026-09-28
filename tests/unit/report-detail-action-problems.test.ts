import { describe, expect, it } from 'vitest';
import { AccessDeniedError, ConflictError, ValidationError } from '@ja/database';
import { actions } from '../../apps/portal/src/routes/app/reports/[id]/+page.server';
import { reportActionFailure } from '../../apps/portal/src/lib/server/actions/operations-actions';

const reportId = '11111111-1111-4111-8111-111111111111';

function event(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return {
    request: new Request(`http://localhost/app/reports/${reportId}?/updateReport`, {
      method: 'POST',
      body: form,
    }),
    params: { id: reportId },
    locals: { user: { id: 'worker-1' } },
  } as never;
}

describe('report detail action problems', () => {
  it('explains a report link and form mismatch with a review remedy', async () => {
    const response = await actions.updateReport(
      event({
        id: '22222222-2222-4222-8222-222222222222',
        type: 'daily',
        title: 'My entered title',
      }),
    );
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'REPORT_ROUTE_MISMATCH',
      messageKey: 'problem.report.routeMismatch',
      actionName: 'updateReport',
      values: { title: 'My entered title' },
      remedies: [{ id: 'review_report' }],
    });
  });

  it('returns field errors and entered values from a native invalid report POST', async () => {
    const response = await actions.updateReport(
      event({
        id: reportId,
        type: 'daily',
        version: 'bad',
        summary: 'Retain this summary',
      }),
    );
    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      code: 'REPORT_FIELDS_INVALID',
      messageKey: 'problem.report.fieldsInvalid',
      actionName: 'updateReport',
      values: { summary: 'Retain this summary' },
      fieldErrors: expect.any(Object),
      remedies: [{ id: 'review_report_fields' }],
    });
    expect(Object.keys(response.data.fieldErrors).length).toBeGreaterThan(0);
    expect(response.data.fieldErrors).toHaveProperty('version');
  });

  it.each([
    [new ConflictError('Report changed or cannot be edited'), 'REPORT_DRAFT_CHANGED', 409],
    [new AccessDeniedError('Report edit access required'), 'REPORT_EDIT_ACCESS_REQUIRED', 403],
    [new AccessDeniedError('Project review required'), 'REPORT_ASSIGNMENT_REQUIRED', 403],
    [new AccessDeniedError('Active account required'), 'REPORT_ACTIVE_ACCOUNT_REQUIRED', 403],
    [new ValidationError('Report not found'), 'REPORT_NOT_FOUND', 404],
  ])('maps a known repository blocker without losing the report draft', (cause, code, status) => {
    const response = reportActionFailure(cause, {
      actionName: 'updateReport',
      type: 'daily',
      summary: 'Retain this summary',
    });
    expect(response.status).toBe(status);
    expect(response.data).toMatchObject({
      code,
      actionName: 'updateReport',
      values: { summary: 'Retain this summary' },
      remedies: [{ id: expect.any(String) }],
    });
  });
});
