import { describe, expect, it } from 'vitest';
import { expensePolicyIssueLabels } from '../portal/expense-policy-issues';
import {
  INVARIANT_TRANSLATION_KEYS,
  isCoverageInvariantKey,
  portalCatalog,
  portalCatalogKeys,
  translate,
  type PortalTranslationKey,
} from './catalog';

describe('portal locale catalog', () => {
  it('keeps the three catalogs in exact key parity', () => {
    const keys = new Set(portalCatalogKeys);

    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(Object.keys(portalCatalog[locale]).sort()).toEqual([...keys].sort());
    }
  });

  it('does not leave English copy in ES or PT outside the explicit invariant allowlist', () => {
    for (const key of portalCatalogKeys) {
      if (INVARIANT_TRANSLATION_KEYS.has(key) || isCoverageInvariantKey(key)) continue;
      // Spanish and English share the negative; Portuguese must still use Não.
      if (key === 'No') expect(portalCatalog.es[key]).toBe('No');
      else expect(portalCatalog.es[key]).not.toBe(portalCatalog.en[key]);
      expect(portalCatalog.pt[key]).not.toBe(portalCatalog.en[key]);
    }
  });

  it('interpolates named parameters without changing source content', () => {
    const key = 'Hello, {name}' as PortalTranslationKey;
    expect(translate('es', key, { name: 'Ana' })).toBe('Hola, Ana');
    expect(translate('pt', key, { name: 'João' })).toBe('Olá, João');
    expect(translate('en', key, { name: 'Sam' })).toBe('Hello, Sam');
  });

  it('renders payment reversal feedback in every supported locale', () => {
    const key = 'action.billing.paymentReversed' as PortalTranslationKey;
    expect(translate('en', key)).toBe('Payment reversal recorded.');
    expect(translate('es', key)).toBe('Reversión del pago registrada.');
    expect(translate('pt', key)).toBe('Estorno do pagamento registrado.');
  });

  it('explains invoice-draft readiness blockers and resolved periods', () => {
    const key = 'action.billing.readiness.noBillableSources' as PortalTranslationKey;
    expect(translate('en', key)).toMatch(/approved billable hours/i);
    expect(translate('es', key)).toMatch(/facturables aprobados/i);
    expect(translate('pt', key)).toMatch(/faturáveis aprovadas/i);
    expect(
      translate('en', 'action.billing.invoiceDraftCreatedForPeriod' as PortalTranslationKey, {
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
      }),
    ).toContain('2026-08-10 → 2026-08-16');
    expect(translate('en', 'action.validation.accountingPeriod' as PortalTranslationKey)).toMatch(
      /previous complete month/i,
    );
  });

  it('keeps missing runtime keys safe for legacy callers', () => {
    expect(translate('es', 'customer-entered-value')).toBe('customer-entered-value');
  });

  it('localizes linked expenses and the finance terms and legal-revision controls', () => {
    expect(translate('es', 'Add related expense')).toBe('Añadir gasto relacionado');
    expect(translate('pt', 'Time expense occurred (optional)')).toBe(
      'Horário da despesa (opcional)',
    );
    expect(translate('es', 'How labor terms are selected')).toBe(
      'Cómo se seleccionan las condiciones laborales',
    );
    expect(translate('pt', 'Create issuing legal entity revision')).toBe(
      'Criar revisão da entidade emissora',
    );
    expect(translate('es', 'Record expense for')).toBe('Registrar gasto de');
    expect(translate('pt', 'A separate expense is recorded for the selected person.')).toBe(
      'Uma despesa separada é registrada para a pessoa selecionada.',
    );
    expect(translate('es', 'Customer hourly rule')).toBe('Regla de tarifa horaria del cliente');
    expect(translate('pt', 'Save fallback options')).toBe('Salvar opções alternativas');
  });

  it('keeps crew delegation and finance explanations readable in ES and PT', () => {
    expect(translate('es', 'Assign a crew chief')).toBe('Designar un jefe de equipo');
    expect(translate('pt', 'Same hours for each selected member')).toBe(
      'Mesmas horas para cada integrante selecionado',
    );
    expect(translate('es', 'Allocate one crew receipt')).toBe('Distribuir un recibo del equipo');
    expect(translate('pt', 'How this project is calculated')).toBe(
      'Como este projeto é calculado',
    );
    expect(
      translate('es', 'Customer rate {clientRate} · worker pay {payMethod} · internal cost {cost}', {
        clientRate: '55 EUR',
        payMethod: 'por hora',
        cost: '30 EUR',
      }),
    ).toBe('Tarifa al cliente 55 EUR · pago al trabajador por hora · coste interno 30 EUR');
    expect(translate('pt', 'Europe/Madrid')).toBe('Europe/Madrid');
  });

  it('explains expense policy conflicts and issuing-authority 409 in both translated locales', () => {
    expect(
      expensePolicyIssueLabels(['missing_policy'], (key) => translate('es', key)),
    ).toEqual([
      'Ninguna política de gastos de la persona coincide con el pagador, la categoría y la fecha de este gasto.',
    ]);
    expect(
      expensePolicyIssueLabels(['missing_assignment'], (key) => translate('pt', key)),
    ).toEqual(['Nenhuma atribuição ao projeto cobre a data desta despesa.']);
    expect(translate('es', 'action.finance.projectIssuingAuthorityRequired')).toContain(
      'entidad emisora del proyecto',
    );
    expect(translate('pt', 'action.finance.projectIssuingAuthorityRequired')).toContain(
      'entidade emissora do projeto',
    );
  });
});

describe('localized negative decision', () => {
  it('uses Não for Brazilian Portuguese while retaining Spanish and English No', () => {
    expect(translate('pt', 'No')).toBe('Não');
    expect(translate('es', 'No')).toBe('No');
    expect(translate('en', 'No')).toBe('No');
  });
});

describe('generic English action errors', () => {
  it.each([
    ['action.error.conflict', 'This action conflicts with the current record state.'],
    ['action.error.forbidden', 'You do not have permission to perform this action.'],
    ['action.error.invalid', 'Check the submitted values and try again.'],
  ])('keeps %s appropriate to every action boundary', (key, expected) => {
    expect(translate('en', key)).toBe(expected);
  });
});
