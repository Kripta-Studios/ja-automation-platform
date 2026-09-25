import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));
vi.mock('@ja/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ja/database')>()),
  assertLiveSession: vi.fn(),
}));

import {
  AccessDeniedError,
  ConflictError,
  OwnerCatalogManagement,
  OwnerRecordManagement,
} from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { actions as managementActions } from '../../apps/portal/src/routes/app/manage/+page.server';
import { actions as previewActions } from '../../apps/portal/src/routes/app/finance/preview/+page.server';

const repository = { listFinanceProjects: vi.fn(() => []) };
const close = vi.fn();

function request(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request('http://local.test/action', { method: 'POST', body: form });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(openPortalRepository).mockReturnValue({
    sqlite: { close },
    principal: { role: 'owner_admin' },
    repository,
  } as unknown as ReturnType<typeof openPortalRepository>);
  vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {});
  close.mockClear();
});

describe('management and Finance preview action problems', () => {
  it('preserves a stale management record with one typed remedy', async () => {
    vi.spyOn(OwnerCatalogManagement.prototype, 'mutate').mockImplementation(() => {
      throw new ConflictError('Record changed. Reload before continuing.');
    });
    const result = await managementActions.manageCatalog!({
      locals: { user: { id: 'owner' } },
      request: request({
        kind: 'planning_assignment',
        id: 'record-123',
        reason: 'Review this',
        confirmed: 'yes',
        token: 'private-token',
      }),
    } as never);
    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'ACTION_MANAGEMENT_CHANGED',
        messageKey: 'action.management.changed',
        values: { id: 'record-123', reason: 'Review this' },
        recordId: 'record-123',
        remedies: [{ id: 'review_updated_record', recordId: 'record-123' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('private-token');
  });

  it('requires explicit confirmation and retains entered values', async () => {
    const result = await managementActions.manageRecord!({
      locals: { user: { id: 'owner' } },
      request: request({ recordType: 'expense', id: 'expense-123', reason: 'Review this' }),
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'MANAGEMENT_CONFIRMATION_REQUIRED',
        fieldErrors: { confirmed: ['Confirm the operation'] },
        values: { id: 'expense-123', reason: 'Review this' },
      },
    });
  });

  it('gives denied Owner management only a contact remedy', async () => {
    vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {
      throw new AccessDeniedError('Owner administration required');
    });
    const result = await managementActions.manageRecord!({
      locals: { user: { id: 'manager' } },
      request: request({ recordType: 'expense', id: 'expense-123' }),
    } as never);
    expect(result).toMatchObject({
      status: 403,
      data: { code: 'MANAGEMENT_OWNER_REQUIRED', remedies: [{ id: 'contact_owner' }] },
    });
  });

  it('keeps preview legacy fields and shared field errors together', async () => {
    const result = await previewActions.default!({
      locals: { user: { id: 'owner' }, session: { id: 'session' } },
      request: request({ workHours: 'bad' }),
    } as never);
    expect(result).toMatchObject({
      status: 400,
      data: {
        code: 'FINANCE_PREVIEW_INVALID_FIELDS',
        invalid: true,
        result: null,
        periods: [],
        fieldErrors: { workHours: ['Enter 0 to 24 hours in whole-minute increments.'] },
        values: { workHours: 'bad' },
      },
    });
    expect((result as { data: { fields: string[] } }).data.fields).toContain('workHours');
  });
});
