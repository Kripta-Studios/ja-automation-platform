import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedError, V3AccessDeniedError } from '@ja/database';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));
vi.mock('$lib/server/report-attachment-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/report-attachment-route')>()),
  validateReportAttachmentFile: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock('$lib/server/private-artifact-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/private-artifact-access')>()),
  writePrivateFileExclusive: vi.fn(async () => undefined),
  removePrivateFileIfPresent: vi.fn(async () => undefined),
}));

import { openPortalRepository } from '$lib/server/portal-repository';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import {
  expenseActionFailure,
  expenseActions,
} from '../../apps/portal/src/lib/server/actions/expense-actions';

const projectId = '11111111-1111-4111-8111-111111111111';
const reservationId = '22222222-2222-4222-8222-222222222222';
const storageKey = `uploads/2026/09/27/${reservationId}/receipt.pdf`;
const receipt = new File(['%PDF-1.4\nreceipt'], 'receipt.pdf', { type: 'application/pdf' });

function requestWithReceipt(): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    projectId,
    spentOn: '2026-09-27',
    vendor: 'Parking',
    category: 'parking',
    description: 'Parking at the client site',
    currency: 'EUR',
    amount: '12.50',
    whoPaid: 'worker',
  }))
    form.set(key, value);
  form.set('receipt', receipt);
  return new Request('http://localhost/app/expenses?/createExpense', {
    method: 'POST',
    body: form,
  });
}

const close = vi.fn();
const reserveUpload = vi.fn();
const finalizeUpload = vi.fn();
const cancelUploadReservation = vi.fn();
const createExpense = vi.fn();
const removeUnreferencedReceipt = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  reserveUpload.mockReturnValue({ reservationId, storageKey });
  vi.mocked(openPortalRepository).mockReturnValue({
    principal: { userId: 'worker-1', role: 'worker' },
    sqlite: { close },
    v3: { reserveUpload, finalizeUpload, cancelUploadReservation },
    repository: { createExpense, removeUnreferencedReceipt },
  } as unknown as ReturnType<typeof openPortalRepository>);
});

describe('expense access failures', () => {
  it.each([
    [
      new V3AccessDeniedError('Project access required'),
      403,
      'EXPENSE_RECEIPT_PROJECT_ACCESS_REVOKED',
      'problem.expense.receiptProjectAccessRevoked',
      'contact_project_owner',
    ],
    [
      new V3AccessDeniedError('Active account required'),
      403,
      'EXPENSE_ACCOUNT_INACTIVE',
      'problem.expense.accountInactive',
      'contact_owner',
    ],
    [
      new AccessDeniedError('Active account required'),
      403,
      'EXPENSE_ACCOUNT_INACTIVE',
      'problem.expense.accountInactive',
      'contact_owner',
    ],
    [
      new AccessDeniedError('Live authenticated session required'),
      401,
      'EXPENSE_SESSION_ENDED',
      'problem.expense.sessionEnded',
      'sign_in_again',
    ],
    [
      new V3AccessDeniedError('Read-only role'),
      403,
      'EXPENSE_READ_ONLY_ROLE',
      'problem.expense.readOnlyRole',
      'contact_owner',
    ],
    [
      new V3AccessDeniedError('Receipt must belong to the expense project'),
      403,
      'EXPENSE_RECEIPT_PROJECT_MISMATCH',
      'problem.expense.receiptProjectMismatch',
      'attach_receipt',
    ],
  ] as const)(
    'maps %s with retained safe fields and a role-safe remedy',
    (error, status, code, messageKey, remedy) => {
      const response = expenseActionFailure(error, {
        projectId,
        spentOn: '2026-09-27',
        amount: '12.50',
        receipt,
        secret: 'do-not-return',
      });
      expect(response).toMatchObject({
        status,
        data: {
          code,
          messageKey,
          remedies: [{ id: remedy }],
          values: { projectId, spentOn: '2026-09-27', amount: '12.50', receiptNeedsReattach: true },
        },
      });
      expect(JSON.stringify(response.data)).not.toContain('do-not-return');
      expect(JSON.stringify(response.data)).not.toContain('receipt.pdf');
    },
  );

  it('denies a receipt before reservation without creating an expense or file', async () => {
    reserveUpload.mockImplementation(() => {
      throw new V3AccessDeniedError('Project access required');
    });
    const response = await expenseActions.createExpense({
      request: requestWithReceipt(),
      params: { section: 'expenses' },
    } as never);
    expect(response).toMatchObject({
      status: 403,
      data: {
        code: 'EXPENSE_RECEIPT_PROJECT_ACCESS_REVOKED',
        values: { projectId, amount: '12.50', receiptNeedsReattach: true },
      },
    });
    expect(writePrivateFileExclusive).not.toHaveBeenCalled();
    expect(finalizeUpload).not.toHaveBeenCalled();
    expect(createExpense).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('cleans up private receipt bytes after access is revoked before finalization', async () => {
    finalizeUpload.mockImplementation(() => {
      throw new V3AccessDeniedError('Project access required');
    });
    const response = await expenseActions.createExpense({
      request: requestWithReceipt(),
      params: { section: 'expenses' },
    } as never);
    expect(response).toMatchObject({
      status: 403,
      data: {
        code: 'EXPENSE_RECEIPT_PROJECT_ACCESS_REVOKED',
        values: { projectId, amount: '12.50', receiptNeedsReattach: true },
      },
    });
    expect(writePrivateFileExclusive).toHaveBeenCalledOnce();
    expect(cancelUploadReservation).toHaveBeenCalledWith(expect.any(Object), reservationId);
    expect(removePrivateFileIfPresent).toHaveBeenCalledWith(expect.any(String), storageKey);
    expect(createExpense).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
