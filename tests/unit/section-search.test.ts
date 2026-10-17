import { describe, expect, it } from 'vitest';
import {
  searchSectionDestinations,
  sectionSearchTokens,
  workspaceRecordSearchHref,
} from '../../apps/portal/src/lib/portal/ui/section-search';
import { searchAssistantTasks } from '../../apps/portal/src/lib/portal/assistant/matcher';
import type { NavItem } from '../../apps/portal/src/lib/portal-navigation';

const privateArtifact: NavItem = {
  section: 'documents',
  label: 'Artefacto privado',
  icon: 'document',
  href: '/app/documents',
};
const options = (
  role: string,
  locale: 'en' | 'es' | 'pt' = 'en',
  items: readonly NavItem[] = [],
  canonicalOwner = false,
) => ({
  items,
  context: { role, canonicalOwner },
  locale,
  translate: (key: string) => key,
  itemHref: (item: NavItem) => item.href ?? `/app/${item.section}`,
});

describe('coordinated section and task search', () => {
  it('normalizes accents and separates whole words', () => {
    expect(sectionSearchTokens('IVA · privado · compensación')).toEqual([
      'iva',
      'privado',
      'compensacion',
    ]);
  });

  it.each([
    ['crear factura', 'es', 'invoice-create'],
    ['create invoice', 'en', 'invoice-create'],
    ['criar fatura', 'pt', 'invoice-create'],
    ['impuestos', 'es', 'billing-tax'],
    ['VAT', 'en', 'billing-tax'],
    ['imposto', 'pt', 'billing-tax'],
    ['salario', 'es', 'finance-compensation-create'],
    ['salary', 'en', 'finance-compensation-create'],
    ['salário', 'pt', 'finance-compensation-create'],
  ] as const)('finds %s as an authorized result in %s', (query, locale, expectedId) => {
    const result = searchSectionDestinations(query, options('owner_admin', locale));
    const first = [...result.configurations, ...result.actions, ...result.sections][0];
    expect(first?.task?.id).toBe(expectedId);
    expect(result.count).toBeGreaterThan(0);
  });

  it('keeps IVA on the tax vocabulary and never matches a private label by substring', () => {
    const finance = searchSectionDestinations(
      'IVA',
      options('finance_admin', 'es', [privateArtifact]),
    );
    expect(finance.configurations[0]?.task?.id).toBe('billing-tax');
    expect(JSON.stringify(finance)).not.toContain('Artefacto privado');

    const auditor = searchSectionDestinations(
      'IVA',
      options('auditor_read_only', 'es', [privateArtifact]),
    );
    expect(auditor.count).toBe(0);
    expect(JSON.stringify(auditor)).not.toContain('Artefacto privado');
  });

  it('routes salary searches to each role’s permitted destination', () => {
    const finance = searchSectionDestinations('salary', options('finance_admin'));
    expect(finance.configurations[0]?.task?.id).toBe('finance-compensation-create');

    const worker = searchSectionDestinations('salary', options('worker'));
    expect(worker.sections[0]?.task?.id).toBe('pay-statement');
    expect(JSON.stringify(worker)).not.toMatch(/finance-compensation|billing-tax|invoice-create/u);

    const manager = searchSectionDestinations('compensación', options('project_manager', 'es'));
    expect(manager.sections[0]?.task?.id).toBe('pay-statement');
    expect(JSON.stringify(manager)).not.toMatch(/finance-compensation|billing-tax|invoice-create/u);

    const auditor = searchSectionDestinations('compensation', options('auditor_read_only'));
    expect(auditor.sections[0]?.task?.id).toBe('finance-economic');
    expect(JSON.stringify(auditor)).not.toMatch(
      /finance-compensation-create|billing-tax|invoice-create/u,
    );
  });

  it('matches canonical-owner invite search with the task assistant and fails closed otherwise', () => {
    const query = 'invite a worker';
    const canonicalOwner = { role: 'owner_admin', canonicalOwner: true };
    const assistantTaskIds = searchAssistantTasks(query, canonicalOwner, 'en').matches.map(
      ({ task }) => task.id,
    );
    const sectionResults = searchSectionDestinations(query, {
      ...options('owner_admin', 'en', [], true),
      context: canonicalOwner,
    });

    expect(assistantTaskIds).toContain('team-invite');
    expect(sectionResults.actions.map(({ task }) => task?.id)).toEqual(assistantTaskIds);

    const noncanonicalOwner = { role: 'owner_admin', canonicalOwner: false };
    expect(searchAssistantTasks(query, noncanonicalOwner, 'en').matches).toEqual([]);
    expect(searchSectionDestinations(query, options('owner_admin')).count).toBe(0);
  });

  it('does not treat a record search handoff as a search result', () => {
    const result = searchSectionDestinations('IVA', options('auditor_read_only'));
    expect(result).toEqual({ actions: [], configurations: [], sections: [], count: 0 });
  });

  it('hands record searches to the existing role landing with query and locale', () => {
    const ownerTarget = new URL(
      workspaceRecordSearchHref('/j-aautomation', 'owner_admin', 'Body Shop', 'es'),
      'https://portal.invalid',
    );
    expect(ownerTarget.pathname).toBe('/j-aautomation/app/');
    expect(ownerTarget.searchParams.get('q')).toBe('Body Shop');
    expect(ownerTarget.searchParams.get('lang')).toBe('es');

    for (const role of ['finance_admin', 'auditor_read_only']) {
      const target = new URL(
        workspaceRecordSearchHref('/j-aautomation', role, 'Body Shop', 'pt'),
        'https://portal.invalid',
      );
      expect(target.pathname).toBe('/j-aautomation/app/finance');
      expect(target.searchParams.get('view')).toBe('overview');
      expect(target.searchParams.get('q')).toBe('Body Shop');
      expect(target.searchParams.get('lang')).toBe('pt');
    }
  });
});
