import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portalText, portalCatalog } from '../../apps/portal/src/lib/portal-i18n';

const portalRoot = resolve('apps/portal');
const { parse } = createRequire(join(portalRoot, 'package.json'))('svelte/compiler') as {
  parse(source: string, options: { modern: boolean }): { fragment: unknown };
};

// These are identifiers, language endonyms or standard units, not translated prose.
const invariantText =
  /^(?:[|·]?\s*J&A (?:Automation|Portal)(?: ·)?|webmail\.j-aautomation\.com ↗|USD|BRL|EUR|EN|ES|PT-BR|English|Español|Português(?: \(Brasil\))?|bytes|min ·|\d+ GB|SHA-256:)$/u;

describe('visible portal locale coverage', () => {
  it('does not leave untranslated literal prose or accessibility labels in Svelte markup', () => {
    const sourceRoot = join(portalRoot, 'src');
    const failures: string[] = [];
    for (const file of readdirSync(sourceRoot, { recursive: true }).filter((file) =>
      String(file).endsWith('.svelte'),
    )) {
      const source = readFileSync(join(sourceRoot, String(file)), 'utf8');
      const tree = parse(source, { modern: true });
      function visit(value: unknown): void {
        if (!value || typeof value !== 'object') return;
        const node = value as Record<string, unknown>;
        if (
          node.type === 'Attribute' &&
          !['title', 'alt', 'aria-label', 'placeholder'].includes(String(node.name))
        )
          return;
        if (node.type === 'Text') {
          const text = String(node.data).trim().replace(/\s+/gu, ' ');
          if (/[A-Za-z]{2}/u.test(text) && !invariantText.test(text)) {
            const line = source.slice(0, Number(node.start)).split('\n').length;
            failures.push(`${file}:${line}: ${text}`);
          }
        }
        for (const [key, child] of Object.entries(node)) {
          if (['instance', 'module', 'css', 'loc'].includes(key)) continue;
          if (Array.isArray(child)) child.forEach(visit);
          else if (child && typeof child === 'object') visit(child);
        }
      }
      visit(tree.fragment);
    }
    expect(failures).toEqual([]);
  });

  it('renders natural English action feedback and specific multilingual closeout outcomes', () => {
    const english: Record<string, string> = {
      'action.access.accountStatus.updated': 'Account status updated.',
      'action.approval.decisionRecorded': 'Decision recorded.',
      'action.billing.invoiceIssued': 'Invoice issued.',
      'action.billing.paymentRecorded': 'Payment recorded.',
      'action.billing.streamSaved': 'Billing stream saved.',
      'action.projects.clientCreated': 'Client created.',
      'action.time.draftSaved': 'Time draft saved.',
      'action.validation.accountStatus': 'Invalid account status change.',
    };
    for (const [key, value] of Object.entries(english)) expect(portalText('en', key)).toBe(value);
    expect(portalText('es', 'action.closeout.draftPrepared')).toBe('Borrador de cierre preparado.');
    expect(portalText('pt', 'action.closeout.packagesFinalized')).toBe(
      'Pacotes de encerramento finalizados.',
    );
    expect(portalText('es', 'action.reports.periodFollowupRecorded')).toBe(
      'Seguimiento del período registrado.',
    );
    expect(portalText('pt', 'action.reports.periodFollowupRecorded')).toBe(
      'Acompanhamento do período registrado.',
    );
    expect(
      Object.entries(portalCatalog.en).filter(
        ([key, value]) =>
          key.startsWith('action.') && value === 'The action could not be completed.',
      ),
    ).toEqual([]);
    for (const [key, value] of Object.entries(portalCatalog.en)) {
      if (!key.startsWith('action.')) continue;
      expect(value, key).not.toMatch(
        /^(?:Access|Approval|Billing|Finance|Projects|Reports|Time|Expense|Validation) [a-z]+ [A-Z][a-z]+/u,
      );
    }
    expect(portalText('es', 'Markup (basis points)')).toBe('Recargo (puntos básicos)');
    expect(portalText('es', 'Subtotal')).toBe('Subtotal');
    expect(portalText('pt', 'Subtotal')).toBe('Subtotal');
    expect(portalText('es', 'Auditor')).toBe('Auditor');
  });

  it('reports successful financial saves as success in every language', () => {
    const savedKeys = [
      'action.billing.invoicePlanningDatesSaved',
      'action.finance.compensationExpectedPaymentSaved',
      'action.finance.expenseClassified',
      'action.finance.expensePlanningDatesSaved',
      'action.finance.projectCommercialPolicySaved',
    ];
    for (const key of savedKeys) {
      expect(portalText('en', key), key).toMatch(/saved\.$/u);
      expect(portalText('es', key), key).toMatch(/guardad[ao]s?\.$/u);
      expect(portalText('pt', key), key).toMatch(/salv[ao]s?\.$/u);
      expect(portalText('es', key)).not.toContain('no se pudo');
      expect(portalText('pt', key)).not.toContain('Não foi possível');
    }
  });

  it('preserves natural auth, financial and worker action wording instead of word-by-word substitutions', () => {
    const examples = [
      ['Secure company access.', 'Acceso seguro a la empresa.', 'Acesso seguro à empresa.'],
      [
        'Enter a recovery code',
        'Introduce un código de recuperación',
        'Digite um código de recuperação',
      ],
      ['Enter your password', 'Introduce tu contraseña', 'Digite sua senha'],
      ['Primary navigation', 'Navegación principal', 'Navegação principal'],
      ['Client payment', 'Pago del cliente', 'Pagamento do cliente'],
      [
        'Client labor rate',
        'Tarifa de mano de obra para el cliente',
        'Tarifa de mão de obra para o cliente',
      ],
      ['Internal loaded cost', 'Coste interno con cargas', 'Custo interno com encargos'],
      ['Budget type', 'Tipo de presupuesto', 'Tipo de orçamento'],
      ['Open record →', 'Abrir registro →', 'Abrir registro →'],
      ['Edit draft', 'Editar borrador', 'Editar rascunho'],
      ['Actual recorded', 'Tiempo real registrado', 'Tempo real registrado'],
    ];
    for (const [key, es, pt] of examples) {
      expect(portalText('es', key), key).toBe(es);
      expect(portalText('pt', key), key).toBe(pt);
    }
  });

  it('uses natural localized copy for shared required fields, closeout, authentication and invoice details', () => {
    expect(portalText('es', 'Project closeout')).toBe('Cierre del proyecto');
    expect(portalText('pt', 'Project closeout')).toBe('Encerramento do projeto');
    expect(portalText('es', 'Required')).toBe('Obligatorio');
    expect(portalText('pt', 'Required')).toBe('Obrigatório');
    expect(portalText('en', 'first.last')).toBe('first.last');
    expect(portalText('es', 'first.last')).toBe('nombre.apellido');
    expect(portalText('pt', 'first.last')).toBe('nome.sobrenome');
    expect(portalText('pt', 'Employee portal')).toBe('Portal do trabalhador');
    expect(portalText('es', 'For example: BBS Mexico')).toBe('Por ejemplo: BBS México');
  });
});
