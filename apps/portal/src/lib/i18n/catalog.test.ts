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

  it('renders billing and ledger warnings through the runtime catalog in every locale', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const key of [
        'problem.warning.billingStreamNoTaxProfile',
        'problem.warning.collectionsLedgerExportNoRows',
        'problem.warning.collectionsLedgerExportFilteredEmpty',
        'problem.warning.collectionsLedgerExportMissingIssueDates',
        'problem.remedy.createTaxProfile',
        'problem.remedy.clearLedgerFilters',
        'problem.remedy.reviewBilling',
      ]) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
  });

  it('renders the receipt preview fallback through the runtime catalog in every locale', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const key of [
        'problem.expenseReceipt.previewReady',
        'problem.expenseReceipt.previewFallback',
        'problem.expenseReceipt.downloadVerified',
      ]) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
  });

  it('renders invoice and report PDF failures through the runtime catalog in every locale', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const resource of ['invoice', 'report']) {
        for (const state of [
          'pdfSignInRequired',
          'pdfUnavailable',
          'pdfNotReady',
          'pdfIntegrityBlocked',
          'pdfServiceUnavailable',
          'pdfNetworkUnavailable',
          'pdfInvalidResponse',
          'pdfPopupBlocked',
          'pdfPreviewFallback',
        ]) {
          const key = `problem.${resource}.${state}`;
          expect(translate(locale, key)).not.toBe(key);
        }
      }
    }
  });

  it('renders worker-statement download recovery in every locale', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const key of [
        'problem.workerStatement.downloadNetworkUnavailable',
        'problem.workerStatement.downloadInvalidResponse',
        'problem.workerStatement.downloadStatusUnknown',
        'problem.workerStatement.signInAgain',
        'problem.workerStatement.returnToWork',
      ]) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
  });

  it('renders Accounting Pack retry setup failures with a reference in every locale', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const value = translate(locale, 'problem.accountingPack.retryServiceUnavailable', {
        correlationId: 'qa-reference-1234',
      });
      expect(value).toContain('qa-reference-1234');
      expect(value).not.toContain('{correlationId}');
    }
  });

  it('renders supplier report CSV failures and remedies in every locale', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const key of [
        'problem.supplier.reportProjectUnavailable',
        'problem.supplier.reportProjectScopeChanged',
        'problem.supplier.reportSupplierUnavailable',
        'problem.supplier.reportNoProjects',
        'problem.supplier.reportSignInRequired',
        'problem.supplier.reportRoleRequired',
        'problem.supplier.reportServiceUnavailable',
        'problem.supplier.reportCsvNetworkUnavailable',
        'problem.supplier.reportCsvInvalidResponse',
        'problem.supplier.reportUnavailableProjectOption',
        'problem.remedy.reviewSupplierProject',
        'problem.remedy.retrySupplierReportDownload',
        'problem.remedy.chooseSupplier',
      ]) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
  });

  it('explains time correction races in every locale', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const key of [
        'problem.time.correctionAlreadyExists',
        'problem.time.correctionRetryChanged',
        'problem.time.correctionValuesRetained',
        'problem.time.correctionStateBlocked',
        'problem.time.correctionFinanciallyFinalized',
        'problem.time.correctionSettledCompensation',
        'problem.time.correctionReturnedChanged',
        'problem.time.correctionAccessRequired',
        'problem.time.correctionReasonInvalid',
        'problem.time.correctionRecordUnavailable',
        'problem.time.correctionDateAssignmentRequired',
        'problem.time.correctionAssignmentAccessChanged',
        'problem.time.correctionCorrectedDateAccessRequired',
      ]) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
  });

  it('separates commercial-rule failure guidance from its stale option label', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const guidance = translate(locale, 'problem.finance.assignmentCommercialRuleUnavailable');
      const option = translate(locale, 'problem.finance.assignmentCommercialUnavailableOption');
      expect(guidance).not.toBe('problem.finance.assignmentCommercialRuleUnavailable');
      expect(option).not.toBe('problem.finance.assignmentCommercialUnavailableOption');
      expect(guidance).not.toBe(option);
    }
  });

  it('localizes the stale assignment commercial review guidance', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const guidance = translate(locale, 'problem.finance.assignmentCommercialVersionChanged');
      expect(guidance).not.toBe('problem.finance.assignmentCommercialVersionChanged');
      expect(guidance.length).toBeGreaterThan(70);
      for (const key of [
        'problem.finance.assignmentCommercialCurrentChoices',
        'problem.finance.assignmentCommercialYourChoices',
        'problem.finance.assignmentCommercialChoiceChanged',
        'problem.finance.assignmentCommercialChoiceSame',
        'problem.finance.assignmentCommercialReviewStatus',
        'problem.finance.assignmentCommercialMissingAtDate',
        'problem.remedy.reviewAssignmentDates',
        'problem.finance.expensePlanningRecordUnavailable',
        'problem.finance.expensePlanningAttemptedDates',
        'problem.remedy.reviewFinanceExpenses',
      ]) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
  });

  it('localizes the inactive workforce supplier recovery', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const key of [
        'problem.access.workforceSupplierInactive',
        'problem.access.workforceSupplierUnavailableOption',
        'problem.remedy.reviewSupplierStatus',
      ]) {
        expect(translate(locale, key)).not.toBe(key);
      }
    }
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
