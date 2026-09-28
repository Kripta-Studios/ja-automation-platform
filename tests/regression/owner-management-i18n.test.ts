import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  OwnerCatalogManagement,
  OwnerRecordManagement,
  ValidationError,
} from '@ja/database';
import { openPortalRepository } from '../../apps/portal/src/lib/server/portal-repository';
import { _managementFailure, actions } from '../../apps/portal/src/routes/app/manage/+page.server';
import { translate } from '../../apps/portal/src/lib/i18n/catalog';
import { localizedServerFieldMessage } from '../../apps/portal/src/lib/portal/ui/form-validation';

vi.mock('../../apps/portal/src/lib/server/portal-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/portal/src/lib/server/portal-repository')>()),
  openPortalRepository: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

describe('Owner management localized failure boundary', () => {
  it('uses a translated field hint for an invalid catalog value instead of raw repository text', () => {
    const result = _managementFailure(new ValidationError('Invalid Safety impact'), {
      kind: 'technical_change',
      safety_impact: 'unexpected',
    }) as {
      status: number;
      data: { fieldErrors: Record<string, string[]>; values: Record<string, string> };
    };
    expect(result.status).toBe(400);
    expect(result.data.fieldErrors.safety_impact).toEqual(['Enter a valid value.']);
    expect(localizedServerFieldMessage('es', result.data.fieldErrors.safety_impact![0]!)).toBe(
      'Introduce un valor válido.',
    );
    expect(localizedServerFieldMessage('pt', result.data.fieldErrors.safety_impact![0]!)).toBe(
      'Informe um valor válido.',
    );
    expect(result.data.values.safety_impact).toBe('unexpected');
  });

  it.each(['manageCatalog', 'manageRecord'] as const)(
    'rejects unsupported %s operations with a typed field error before mutation',
    async (name) => {
      vi.mocked(openPortalRepository).mockReturnValue({
        sqlite: { close: vi.fn() },
        principal: {},
      } as never);
      vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {});
      const mutation =
        name === 'manageCatalog'
          ? vi.spyOn(OwnerCatalogManagement.prototype, 'mutate')
          : vi.spyOn(OwnerRecordManagement.prototype, 'mutate');
      const result = (await actions[name]!({
        locals: {},
        request: new Request('http://localhost/app/manage', {
          method: 'POST',
          body: new URLSearchParams({
            id: 'record-1',
            confirmed: 'yes',
            kind: 'project_milestone',
            recordType: 'expense',
            operation: 'publish_without_review',
            version: '1',
            reason: 'User entered reason',
          }),
        }),
      } as never)) as {
        status: number;
        data: {
          code: string;
          fieldErrors: Record<string, string[]>;
          values: Record<string, string>;
        };
      };
      expect(result.status).toBe(400);
      expect(result.data.code).toBe('MANAGEMENT_OPERATION_INVALID');
      expect(result.data.fieldErrors.operation).toEqual(['problem.management.operationInvalid']);
      expect(result.data.values.reason).toBe('User entered reason');
      expect(mutation).not.toHaveBeenCalled();
    },
  );

  it.each(['manageCatalog', 'manageRecord'] as const)(
    'keeps %s conflict feedback localized and preserves entered data',
    async (name) => {
      const close = vi.fn();
      vi.mocked(openPortalRepository).mockReturnValue({
        sqlite: { close },
        principal: {},
      } as never);
      vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {});
      const mutation =
        name === 'manageCatalog'
          ? vi.spyOn(OwnerCatalogManagement.prototype, 'mutate')
          : vi.spyOn(OwnerRecordManagement.prototype, 'mutate');
      mutation.mockImplementation(() => {
        throw new ConflictError('Record changed. Reload before continuing.');
      });
      const values = {
        id: 'original-record-id',
        confirmed: 'yes',
        kind: 'project_milestone',
        recordType: 'expense',
        operation: name === 'manageRecord' ? 'delete' : 'update',
        version: '1',
        reason: 'Motivo original do usuário',
        note: 'Client-entered wording',
      };
      const result = (await actions[name]!({
        locals: {},
        request: new Request('http://localhost/app/manage', {
          method: 'POST',
          body: new URLSearchParams(values),
        }),
      } as never)) as {
        status: number;
        data: { messageKey: string; message: string; values: typeof values; recordId: string };
      };
      expect(result.status).toBe(409);
      expect(result.data.messageKey).toBe('action.management.changed');
      expect(translate('es', result.data.messageKey)).toBe(
        'Este registro cambió. Tus datos siguen en este formulario. Compáralos con el registro actual antes de volver a aplicar tus cambios.',
      );
      expect(translate('pt', result.data.messageKey)).toBe(
        'Este registro mudou. Seus dados continuam neste formulário. Compare-os com o registro atual antes de aplicar suas alterações novamente.',
      );
      expect(result.data.message).not.toContain('Reload before continuing');
      expect(result.data.values).toEqual(
        Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'confirmed')),
      );
      expect(result.data.recordId).toBe(values.id);
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it('replaces repository field errors without discarding the submitted catalog fields', async () => {
    vi.mocked(openPortalRepository).mockReturnValue({
      sqlite: { close: vi.fn() },
      principal: {},
    } as never);
    vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {});
    vi.spyOn(OwnerCatalogManagement.prototype, 'mutate').mockImplementation(() => {
      throw new ValidationError('Invalid Planned minutes');
    });
    const result = (await actions.manageCatalog!({
      locals: {},
      request: new Request('http://localhost/app/manage', {
        method: 'POST',
        body: new URLSearchParams({
          id: '',
          confirmed: 'yes',
          kind: 'project_milestone',
          operation: 'update',
          planned_minutes: '0',
        }),
      }),
    } as never)) as {
      status: number;
      data: {
        messageKey: string;
        message: string;
        values: Record<string, string>;
        recordId: string;
      };
    };
    expect(result.status).toBe(400);
    expect(result.data.messageKey).toBe('action.management.plannedMinutes');
    expect(result.data.message).not.toContain('Invalid Planned minutes');
    expect(result.data.values.planned_minutes).toBe('0');
    expect(result.data.recordId).toBe('');
  });
  it.each([
    [
      'Planning overlaps another assignment',
      'action.management.planningOverlap',
      409,
      'Este horário coincide com outra atribuição. Revise o planejamento do colaborador e escolha outro horário.',
    ],
    [
      'Worker is unavailable',
      'action.management.workerUnavailable',
      409,
      'O colaborador está indisponível neste horário. Escolha outro horário ou revise a disponibilidade dele.',
    ],
    [
      'Manage the linked invoice before changing this milestone',
      'action.management.linkedMilestoneInvoice',
      409,
      'Este marco está vinculado a uma fatura. Abra a fatura e revise as opções de correção antes de alterar o marco.',
    ],
    [
      'Finalized reports require a versioned correction',
      'action.management.finalReport',
      409,
      'Esta alteração pertence a um relatório finalizado. Abra o relatório e use uma correção versionada.',
    ],
    [
      'A reason between 3 and 2000 characters is required',
      'action.management.reason',
      400,
      'Informe um motivo de correção com 3 a 2000 caracteres.',
    ],
    [
      'End must follow start',
      'action.management.windowOrder',
      400,
      'O término deve ser posterior ao início. Altere a data e hora de início ou término.',
    ],
  ])('explains the cause and next step for %s', async (message, key, status, expected) => {
    vi.mocked(openPortalRepository).mockReturnValue({
      sqlite: { close: vi.fn() },
      principal: {},
    } as never);
    vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {});
    vi.spyOn(OwnerCatalogManagement.prototype, 'mutate').mockImplementation(() => {
      throw status === 409 ? new ConflictError(message) : new ValidationError(message);
    });
    const values = {
      id: 'record-id',
      confirmed: 'yes',
      kind: 'project_milestone',
      operation: 'update',
      note: 'Original user wording',
    };
    const result = (await actions.manageCatalog!({
      locals: {},
      request: new Request('http://localhost/app/manage', {
        method: 'POST',
        body: new URLSearchParams(values),
      }),
    } as never)) as { status: number; data: { messageKey: string; values: typeof values } };
    expect(result.status).toBe(status);
    expect(result.data.messageKey).toBe(key);
    expect(translate('pt', key)).toBe(expected);
    expect(result.data.values).toEqual(
      Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'confirmed')),
    );
  });

  it('sanitizes unknown conflicts instead of exposing technical details or inventing a cause', async () => {
    vi.mocked(openPortalRepository).mockReturnValue({
      sqlite: { close: vi.fn() },
      principal: {},
    } as never);
    vi.spyOn(OwnerRecordManagement.prototype, 'assertOwner').mockImplementation(() => {});
    vi.spyOn(OwnerCatalogManagement.prototype, 'mutate').mockImplementation(() => {
      throw new ConflictError('PRIVATE_SQL_CONSTRAINT');
    });
    const result = (await actions.manageCatalog!({
      locals: {},
      request: new Request('http://localhost/app/manage', {
        method: 'POST',
        body: new URLSearchParams({
          confirmed: 'yes',
          kind: 'project_milestone',
          operation: 'update',
        }),
      }),
    } as never)) as { data: { messageKey: string; message: string } };
    expect(result.data.messageKey).toBe('action.error.conflict');
    expect(result.data.message).not.toContain('PRIVATE_SQL_CONSTRAINT');
  });
});
