import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientInputSchema, clientUpdateInputSchema, projectInputSchema } from '@ja/schemas';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const shell = read('apps/portal/src/lib/PortalShell.svelte');
const projectActions = read('apps/portal/src/lib/server/actions/project-actions.ts');
const detail = read('apps/portal/src/routes/app/projects/[id]/+page.svelte');
const detailServer = read('apps/portal/src/routes/app/projects/[id]/+page.server.ts');

const clientFields = {
  legalName: 'Identifier Client SL',
  displayName: 'Identifier Client',
  currency: 'EUR',
  timezone: 'Europe/Madrid',
  billingEmail: 'billing@example.test',
  billingAddress: 'Calle 42, Madrid',
};

const projectFields = {
  clientId: '00000000-0000-4000-8000-000000000001',
  name: 'Identifier project',
  timezone: 'Europe/Madrid',
  currency: 'EUR',
  billingModel: 'tm',
};

describe('Client Essential identifier portal contract', () => {
  it('accepts and normalizes an optional client code while rejecting over-posted fields', () => {
    expect(clientInputSchema.parse({ ...clientFields, clientCode: '  JNA-42  ' })).toMatchObject({
      clientCode: 'JNA-42',
    });
    expect(clientInputSchema.parse({ ...clientFields, clientCode: '' })).toMatchObject({
      clientCode: undefined,
    });
    expect(
      clientInputSchema.safeParse({ ...clientFields, forbiddenFinanceField: 'margin' }).success,
    ).toBe(false);
  });

  it('keeps client-code clearing explicit in the versioned update contract', () => {
    expect(
      clientUpdateInputSchema.parse({
        clientId: '00000000-0000-4000-8000-000000000001',
        version: '2',
        clientCode: '',
      }),
    ).toMatchObject({ clientCode: null, version: 2 });
    expect(
      clientUpdateInputSchema.safeParse({
        clientId: '00000000-0000-4000-8000-000000000001',
        version: '2',
        forbiddenFinanceField: 'tax',
      }).success,
    ).toBe(false);
  });

  it('requires a cost-center code for new project actions while preserving legacy-safe storage', () => {
    expect(
      projectInputSchema.parse({ ...projectFields, costCenterCode: '  CC-001  ' }),
    ).toMatchObject({ costCenterCode: 'CC-001' });
    expect(projectInputSchema.safeParse(projectFields).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...projectFields, costCenterCode: '' }).success).toBe(
      false,
    );
  });

  it('exposes the fields through the authorized create/edit surfaces and maps updates server-side', () => {
    expect(shell).toContain('name="clientCode"');
    expect(shell).toContain('maxlength="40"');
    expect(shell).toContain('name="costCenterCode"');
    expect(shell).toContain('maxlength="120"');
    expect(projectActions).toContain("costCenterCode: text('costCenterCode')");
    expect(detail).toContain('name="costCenterCode"');
    expect(detail).toContain('maxlength="120"');
    expect(detailServer).toContain("costCenterCode: text('costCenterCode')");
  });
});
