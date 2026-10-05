import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { billingStreamDefaults } from '../../apps/portal/src/lib/portal/billing-stream-defaults';

describe('selected project billing defaults', () => {
  it('uses project PO/currency and explicit client terms including zero days', () => {
    expect(
      billingStreamDefaults(
        {
          id: 'project-a',
          currency: 'EUR',
          po_number: 'PROJECT-PO',
          client_po_reference: 'CLIENT-PO',
          client_payment_terms_days: 0,
          client_billing_email: 'billing@example.com',
        },
        [],
      ),
    ).toEqual({
      currency: 'EUR',
      poNumber: 'PROJECT-PO',
      paymentTermsDays: '0',
      hasClientPaymentTerms: true,
      recipientEmail: 'billing@example.com',
      billingContactId: '',
    });
  });

  it('uses the client PO when the project has no reference', () => {
    expect(
      billingStreamDefaults({ po_number: null, client_po_reference: 'CLIENT-PO' }, []).poNumber,
    ).toBe('CLIENT-PO');
  });

  it('selects a uniquely primary billing contact belonging to this client', () => {
    const contacts = [
      { id: 'other-client', client_id: 'b', is_primary: 1, is_billing_contact: 1 },
      { id: 'operational', client_id: 'a', is_primary: 1, is_billing_contact: 0 },
      { id: 'secondary', client_id: 'a', is_primary: 0, is_billing_contact: 1 },
      {
        id: 'billing',
        client_id: 'a',
        is_primary: 1,
        is_billing_contact: 1,
        email: 'a@example.com',
      },
    ];
    expect(billingStreamDefaults({ client_id: 'a' }, contacts)).toMatchObject({
      billingContactId: 'billing',
      recipientEmail: 'a@example.com',
    });
  });

  it('leaves ambiguous billing contacts for the user to choose', () => {
    const contacts = ['first', 'second'].map((id) => ({
      id,
      client_id: 'a',
      is_billing_contact: true,
      is_primary: true,
    }));
    expect(billingStreamDefaults({ client_id: 'a' }, contacts).billingContactId).toBe('');
  });

  it('starts clean for a different project and uses the stated fallback only when terms are absent', () => {
    const before = billingStreamDefaults(
      { currency: 'USD', po_number: 'A', client_payment_terms_days: 60 },
      [],
    );
    const after = billingStreamDefaults({ currency: 'EUR', client_id: 'b' }, []);
    expect(before.paymentTermsDays).toBe('60');
    expect(after).toEqual({
      currency: 'EUR',
      poNumber: '',
      paymentTermsDays: '30',
      hasClientPaymentTerms: false,
      recipientEmail: '',
      billingContactId: '',
    });
    expect(billingStreamDefaults(undefined, []).currency).toBe('');
  });

  it.each([-1, 366, '30 days', '1.5'])('does not use invalid client terms %s', (terms) => {
    expect(
      billingStreamDefaults({ client_payment_terms_days: terms }, []).hasClientPaymentTerms,
    ).toBe(false);
  });
});

const billingSource = readFileSync(
  'apps/portal/src/lib/portal/sections/BillingSection.svelte',
  'utf8',
);
const scriptSource = billingSource.slice(
  billingSource.indexOf('>') + 1,
  billingSource.indexOf('</script>'),
);
const script = ts.createSourceFile('billing.ts', scriptSource, ts.ScriptTarget.Latest, true);
function actualFunction(name: string): string {
  const declaration = script.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!declaration) throw new Error(`Missing Billing function ${name}`);
  return ts.transpileModule(declaration.getText(script), {
    compilerOptions: { target: ts.ScriptTarget.ESNext },
  }).outputText;
}

describe('billing directory edit protection', () => {
  function taxEditor(accept: boolean, dirty = true) {
    const confirm = vi.fn(() => accept);
    const factory = new Function(
      'document',
      'window',
      'hasUnsavedFormChanges',
      'translate',
      'tick',
      `
      let selectedTaxProfileId = 'tax-a';
      const taxProfileEditId = 'tax-a';
      ${actualFunction('openTaxProfile')}
      return { openTaxProfile, selected: () => selectedTaxProfileId };
    `,
    );
    const editor = factory(
      { querySelectorAll: () => [{}], getElementById: () => null },
      { confirm },
      () => dirty,
      (value: string) => value,
      () => Promise.resolve(),
    );
    return { editor, confirm };
  }

  it('keeps the current tax editor when discarding unsaved changes is declined', async () => {
    const { editor, confirm } = taxEditor(false);
    await editor.openTaxProfile('tax-b');
    expect(confirm).toHaveBeenCalledOnce();
    expect(editor.selected()).toBe('tax-a');
  });

  it('switches tax editor after explicit discard confirmation', async () => {
    const { editor, confirm } = taxEditor(true);
    await editor.openTaxProfile('tax-b');
    expect(confirm).toHaveBeenCalledOnce();
    expect(editor.selected()).toBe('tax-b');
  });

  it('does not ask to discard when focusing the same tax editor', async () => {
    const { editor, confirm } = taxEditor(false);
    await editor.openTaxProfile('tax-a', true);
    expect(confirm).not.toHaveBeenCalled();
    expect(editor.selected()).toBe('tax-a');
  });

  it('keeps setup mounted when an internal workspace switch is declined', () => {
    const factory = new Function(
      'confirmBillingDirectoryChanges',
      `
      let workspace = 'setup';
      let setupAction = 'tax';
      ${actualFunction('selectBillingWorkspace')}
      return { selectBillingWorkspace, workspace: () => workspace };
    `,
    );
    const confirm = vi.fn(() => false);
    const workspace = factory(confirm);
    workspace.selectBillingWorkspace('streams');
    expect(confirm).toHaveBeenCalledOnce();
    expect(workspace.workspace()).toBe('setup');
    expect(workspace.selectBillingWorkspace('setup', 'entity')).toBe(false);
    expect(workspace.workspace()).toBe('setup');
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});

function actualStreamEnhancement(): string {
  const ast = parse(billingSource, { modern: true });
  let expression = '';
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const attributes = node.attributes as Array<Record<string, unknown>> | undefined;
    if (
      node.type === 'RegularElement' &&
      node.name === 'form' &&
      attributes?.some((attribute) => {
        const value = attribute.value as Array<{ data?: string }> | undefined;
        return attribute.name === 'action' && value?.[0]?.data === '?/createBillingRule';
      })
    ) {
      const directive = attributes.find(
        (attribute) => attribute.type === 'UseDirective' && attribute.name === 'enhance',
      );
      const source = directive?.expression as { start: number; end: number } | undefined;
      if (source) expression = billingSource.slice(source.start, source.end);
    }
    for (const nested of Object.values(node)) {
      if (Array.isArray(nested)) nested.forEach(visit);
      else if (nested && typeof nested === 'object') visit(nested);
    }
  }
  visit(ast.fragment);
  if (!expression) throw new Error('Missing billing stream enhancement');
  return expression;
}

describe('successful billing stream form reset', () => {
  it.each(['success', 'failure'])('resets project defaults only for %s', async (type) => {
    const applyDefaults = vi.fn();
    const form = { reset: vi.fn() };
    const update = vi.fn(async () => undefined);
    const enhance = new Function(
      'applySetupProjectDefaults',
      `return (${actualStreamEnhancement()});`,
    )(applyDefaults);
    const result = enhance({ formElement: form });
    await result({ result: { type }, update });
    expect(update).toHaveBeenCalledWith({ reset: false });
    if (type === 'success') {
      expect(form.reset).toHaveBeenCalledOnce();
      expect(applyDefaults).toHaveBeenCalledWith('', form);
    } else {
      expect(form.reset).not.toHaveBeenCalled();
      expect(applyDefaults).not.toHaveBeenCalled();
    }
  });
});
