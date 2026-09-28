import { describe, expect, it, vi } from 'vitest';
import { V3AccessDeniedError, V3ConflictError, V3ValidationError } from '@ja/database';
import {
  reportAttachmentFailureResponse,
  reportAttachmentSignInResponse,
} from '../../apps/portal/src/lib/server/report-attachment-problem';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', () => ({ openPortalRepository }));

const { POST: cancelReportAttachment } =
  await import('../../apps/portal/src/routes/app/api/reports/[id]/attachments/[documentId]/cancel/+server.ts');

describe('report attachment API problems', () => {
  it.each([
    [
      new V3ConflictError('The report changed. Refresh before attaching a file.'),
      409,
      'REPORT_ATTACHMENT_STALE_VERSION',
      'review_updated_report',
    ],
    [
      new V3ConflictError('Approved or finalized reports cannot receive attachments'),
      409,
      'REPORT_ATTACHMENT_REPORT_LOCKED',
      'review_report_correction',
    ],
    [
      new V3ConflictError('Attachment predecessor already has a successor'),
      409,
      'REPORT_ATTACHMENT_PREDECESSOR_CHANGED',
      'review_attachments',
    ],
    [
      new V3ConflictError('Report attachment content already exists'),
      409,
      'REPORT_ATTACHMENT_DUPLICATE_CONTENT',
      'review_attachments',
    ],
    [
      new V3AccessDeniedError('Project assignment access required'),
      403,
      'REPORT_ATTACHMENT_ACCESS_REQUIRED',
      'contact_report_owner',
    ],
    [
      new V3ValidationError('Attachment content does not match its media type'),
      400,
      'REPORT_ATTACHMENT_FILE_INVALID',
      'choose_valid_file',
    ],
    [
      new V3ValidationError('Daily reports accept daily attachments only'),
      400,
      'REPORT_ATTACHMENT_DAILY_KIND_REQUIRED',
      'correct_fields',
    ],
    [
      new V3ValidationError('Technical attachment kind is invalid'),
      400,
      'REPORT_ATTACHMENT_TECHNICAL_KIND_INVALID',
      'correct_fields',
    ],
  ] as const)('returns a safe, typed response for %s', async (error, status, code, remedy) => {
    const response = reportAttachmentFailureResponse(error);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      success: false,
      code,
      messageKey: expect.stringMatching(/^problem\.reportAttachment\./),
      params: {},
      fieldErrors: {},
      remedies: [{ id: remedy }],
      correlationId: expect.any(String),
    });
  });

  it.each([
    ['Daily reports accept daily attachments only', 'problem.reportAttachment.dailyKindRequired'],
    ['Technical attachment kind is invalid', 'problem.reportAttachment.technicalKindInvalid'],
  ])('points the kind error at the retained attachmentKind input', async (message, key) => {
    const response = reportAttachmentFailureResponse(new V3ValidationError(message));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      messageKey: key,
      fieldErrors: { attachmentKind: [key] },
      remedies: [{ id: 'correct_fields' }],
    });
  });

  it('returns a typed 401 for an expired session', async () => {
    const response = reportAttachmentSignInResponse();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'REPORT_ATTACHMENT_SIGN_IN_REQUIRED',
      messageKey: 'problem.reportAttachment.signInRequired',
      remedies: [{ id: 'sign_in_again' }],
    });
  });

  it('hides unexpected technical details and provides a reference ID', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = reportAttachmentFailureResponse(new Error('private filesystem path'));
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'REPORT_ATTACHMENT_UNEXPECTED',
        correlationId: expect.any(String),
      });
      expect(JSON.stringify(body)).not.toContain('private filesystem path');
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('keeps repository startup errors typed on cancellation', async () => {
    openPortalRepository.mockImplementation(() => {
      throw new Error('private database location');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await cancelReportAttachment({
        locals: { user: { id: 'worker-1' }, session: { id: 'session-1' } },
        params: { id: 'report-1', documentId: 'document-1' },
      } as never);
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        code: 'REPORT_ATTACHMENT_UNEXPECTED',
        correlationId: expect.any(String),
      });
      expect(JSON.stringify(body)).not.toContain('private database location');
    } finally {
      log.mockRestore();
      openPortalRepository.mockReset();
    }
  });
});
