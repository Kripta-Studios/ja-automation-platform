import { describe, expect, it } from 'vitest';
import { helpWorkflows } from '../portal/help-workflows';
import { portalText } from '../portal-i18n';
import { translate } from './catalog';

describe('localized help workflow labels', () => {
  it.each(['es', 'pt'] as const)(
    'uses the same %s labels as the operational controls',
    (locale) => {
      const topics = helpWorkflows('owner_admin', undefined, locale);
      for (const [route, labels] of [
        ['time', ['Log time', 'Save draft', 'Submit']],
        ['expenses', ['Record expense', 'Approved', 'Worker reimbursement queue']],
        ['reports', ['Daily', 'Technical / PLC', 'Client Sign-off']],
        ['approvals', ['Project approvals']],
        ['projects', ['Team', 'Planning']],
        [
          'finance?view=economic',
          [
            'Economic Review',
            'Source records',
            'Compensation settlements',
            'Expected worker payment',
          ],
        ],
        ['ledger', ['Collections / Ledger', 'Cash calendar']],
        ['accounting', ['Generate pack', 'Queued', 'Ready', 'Failed', 'Finalize']],
        ['supplier/report', ['Owner', 'Operational report']],
      ] as const) {
        const topic = topics.find((entry) => entry.route === route);
        expect(topic, route).toBeDefined();
        for (const label of labels) {
          expect(topic!.body, `${route}: ${label}`).toContain(translate(locale, label));
          expect(topic!.body, `${route}: untranslated ${label}`).not.toContain(label);
        }
      }
      const navigation = topics.find((entry) => entry.route === '');
      expect(navigation, 'role-resolved application landing').toBeDefined();
      expect(navigation!.title).toBe(
        locale === 'es'
          ? 'Buscar secciones, tareas y registros'
          : 'Encontrar seções, tarefas e registros',
      );
      expect(navigation!.body).toContain(portalText(locale, 'Go to section'));
      expect(navigation!.body).toContain(
        locale === 'es' ? 'Buscar una tarea' : 'Buscar uma tarefa',
      );
      expect(navigation!.body).toContain(locale === 'es' ? '200 %' : '200%');
      expect(navigation!.body).toContain(locale === 'es' ? 'Supplier team' : 'Supplier team');

      const billing = topics.find((entry) => entry.route === 'billing');
      expect(billing).toBeDefined();
      expect(billing!.title).toBe(
        locale === 'es'
          ? 'Preparar, revisar y emitir una factura'
          : 'Preparar, revisar e emitir uma fatura',
      );
      const billingClaims =
        locale === 'es'
          ? [
              'Período completo o hito',
              'Trabajador, Mostrar y Tipo de registro',
              'Quitar selección',
              'recuentos visibles/seleccionados',
              'tres etapas, 12 detalles y nueve accesos directos',
              'Editar ajustes del flujo seleccionado',
              translate(locale, 'New effective-dated conditions'),
              'no se creó ni emitió ningún borrador',
              'no bloquean un borrador',
              'no lo emite ni lo envía',
            ]
          : [
              'Período completo ou marco',
              'Trabalhador, Mostrar e Tipo de registro',
              'Limpar seleção',
              'quantidades visíveis/selecionadas',
              'três etapas, 12 detalhes e nove atalhos diretos',
              'Editar configurações do fluxo selecionado',
              translate(locale, 'New effective-dated conditions'),
              'nenhum rascunho foi criado ou emitido',
              'não bloqueiam um rascunho',
              'não o emite nem envia',
            ];
      for (const claim of billingClaims) expect(billing!.body, claim).toContain(claim);
      expect(billing!.body).toContain(
        locale === 'es' ? 'nunca una selección parcial' : 'nunca uma seleção parcial',
      );
      expect(JSON.stringify(topics)).not.toContain('{{');
    },
  );

  it('keeps supplier guides limited to their operational routes', () => {
    const routes = helpWorkflows('worker', 'external_technician', 'pt').map((entry) => entry.route);
    expect(routes).toEqual(['', 'time', 'expenses', 'reports', 'supplier/report']);
    const supplier = helpWorkflows('worker', 'external_technician', 'en');
    expect(supplier.some((entry) => entry.route === 'billing')).toBe(false);
    expect(supplier.some((entry) => entry.route === 'finance?view=economic')).toBe(false);
    expect(
      helpWorkflows('auditor_read_only', undefined, 'en').some(
        (entry) => entry.route === 'billing',
      ),
    ).toBe(false);
    expect(
      helpWorkflows('owner_admin', undefined, 'en').some((entry) => entry.route === 'billing'),
    ).toBe(true);
    expect(
      helpWorkflows('finance_admin', undefined, 'en').some((entry) => entry.route === 'billing'),
    ).toBe(true);
  });
});
