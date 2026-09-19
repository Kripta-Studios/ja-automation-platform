import { describe, expect, it } from 'vitest';
import { helpWorkflows } from '../portal/help-workflows';
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
        ['approvals', ['Project approvals', 'Finance review']],
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
        ['billing', ['Billing streams']],
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
      expect(JSON.stringify(topics)).not.toContain('{{');
    },
  );

  it('keeps supplier guides limited to their operational routes', () => {
    const routes = helpWorkflows('worker', 'external_technician', 'pt').map((entry) => entry.route);
    expect(routes).toEqual(['time', 'expenses', 'reports', 'supplier/report']);
  });
});
