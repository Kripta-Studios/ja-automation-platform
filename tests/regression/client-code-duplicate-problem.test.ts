import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const openPortalRepository = vi.fn();
vi.mock('$lib/server/portal-repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/server/portal-repository')>();
  return { ...original, openPortalRepository };
});
const { projectActions } =
  await import('../../apps/portal/src/lib/server/actions/project-actions.ts');

const fixtures: B5LifecycleSecurityFixture[] = [];
function fixture() {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  openPortalRepository.mockReturnValue({
    repository: value.repository,
    principal: value.owner,
    sqlite: { prepare: value.sqlite.prepare.bind(value.sqlite), close: vi.fn() },
  });
  return value;
}

function event(form: Record<string, string>) {
  return {
    locals: { correlationId: 'client-code-test-reference' },
    params: { section: 'projects' },
    request: new Request('http://localhost/app/projects', {
      method: 'POST',
      body: new URLSearchParams(form),
    }),
  } as never;
}

const clientFields = {
  legalName: 'Duplicate code test client SL',
  displayName: 'Duplicate code test client',
  currency: 'EUR',
  timezone: 'Europe/Madrid',
  billingEmail: 'billing-duplicate@example.test',
  billingAddress: 'Calle de Prueba 2, Madrid',
};

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
  vi.clearAllMocks();
});

describe('duplicate client code form problem', () => {
  it('preserves a new client form and returns a typed field conflict without another write', async () => {
    const value = fixture();
    value.repository.createClient(value.owner, { ...clientFields, clientCode: 'QA-DUP-1' });
    const before = value.sqlite.prepare('SELECT COUNT(*) AS count FROM client').get();

    const result = await projectActions.createClient(
      event({ ...clientFields, clientCode: ' QA-DUP-1 ' }),
    );

    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'CLIENT_CODE_ALREADY_USED',
        messageKey: 'problem.client.codeAlreadyUsed',
        fieldErrors: { clientCode: ['problem.client.codeAlreadyUsed'] },
        remedies: [{ id: 'correct_fields' }],
        values: { clientCode: ' QA-DUP-1 ', legalName: clientFields.legalName },
        actionName: 'createClient',
      },
    });
    expect(JSON.stringify(result)).not.toContain('client_client_code_unique');
    expect(value.sqlite.prepare('SELECT COUNT(*) AS count FROM client').get()).toEqual(before);
  });

  it('keeps an existing client unchanged when its code is changed to one in use', async () => {
    const value = fixture();
    value.repository.createClient(value.owner, { ...clientFields, clientCode: 'QA-DUP-2' });
    const before = value.sqlite
      .prepare('SELECT client_code,version FROM client WHERE id=?')
      .get(value.client.id);

    const result = await projectActions.updateClient(
      event({ clientId: value.client.id, version: '1', clientCode: 'QA-DUP-2' }),
    );

    expect(result).toMatchObject({
      status: 409,
      data: {
        code: 'CLIENT_CODE_ALREADY_USED',
        messageKey: 'problem.client.codeAlreadyUsed',
        fieldErrors: { clientCode: ['problem.client.codeAlreadyUsed'] },
        remedies: [{ id: 'correct_fields', recordId: value.client.id }],
        values: { clientCode: 'QA-DUP-2' },
        actionName: 'updateClient',
      },
    });
    expect(
      value.sqlite
        .prepare('SELECT client_code,version FROM client WHERE id=?')
        .get(value.client.id),
    ).toEqual(before);
  });
});
