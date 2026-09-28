import { describe, expect, it } from 'vitest';
import { reportActions } from '../../apps/portal/src/lib/server/actions/operations-actions';

describe('report submission session boundary', () => {
  it('returns a typed sign-in remedy when the session ends before the repository opens', async () => {
    const form = new FormData();
    form.set('id', '11111111-1111-4111-8111-111111111111');
    form.set('type', 'daily');
    form.set('version', '2');
    const result = await reportActions.submitReport({
      params: { section: 'reports' },
      request: new Request('http://localhost/app/reports?/submitReport', {
        method: 'POST',
        body: form,
      }),
      locals: {},
    } as never);

    expect(result.status).toBe(401);
    expect(result.data).toMatchObject({
      code: 'REPORT_SIGN_IN_REQUIRED',
      messageKey: 'problem.report.signInRequired',
      actionName: 'submitReport',
      remedies: [{ id: 'sign_in_again' }],
      values: { id: '11111111-1111-4111-8111-111111111111', type: 'daily', version: '2' },
    });
    expect(JSON.parse(JSON.stringify(result.data))).toEqual(result.data);
  });

  it('requires sign-in even when the submitted fields are invalid', async () => {
    const form = new FormData();
    form.set('type', 'unknown');
    form.set('version', 'bad');
    const result = await reportActions.submitReport({
      params: { section: 'reports' },
      request: new Request('http://localhost/app/reports?/submitReport', {
        method: 'POST',
        body: form,
      }),
      locals: {},
    } as never);

    expect(result.status).toBe(401);
    expect(result.data).toMatchObject({
      code: 'REPORT_SIGN_IN_REQUIRED',
      remedies: [{ id: 'sign_in_again' }],
      values: { type: 'unknown', version: 'bad' },
    });
  });

  it('explains an unreadable signed-in submission without opening the repository', async () => {
    const result = await reportActions.submitReport({
      params: { section: 'reports' },
      request: new Request('http://localhost/app/reports?/submitReport', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=missing' },
        body: 'not multipart',
      }),
      locals: { user: { id: 'worker-1' } },
    } as never);

    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({
      code: 'REPORT_SUBMISSION_FIELDS_INVALID',
      actionName: 'submitReport',
      remedies: [{ id: 'review_report' }],
    });
  });
});
