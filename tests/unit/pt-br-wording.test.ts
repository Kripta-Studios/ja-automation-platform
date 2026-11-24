import { describe, expect, it } from 'vitest';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';
import { portalCatalogKeys } from '../../apps/portal/src/lib/i18n/catalog';
import { explicitCoverageLiterals } from '../../apps/portal/src/lib/i18n/coverage-literals';
import { tasksForContext } from '../../apps/portal/src/lib/portal/assistant/catalog';

/** European-Portuguese words the Brazilian crews flagged (audit T78, crewlead-2). */
const PT_PT =
  /\b(Registar|registar|registos?|Registos?|equipas?|Equipa|Submeter|submeter|controlos|Reveja|reveja|ficheiros?|utilizador(?:es)?|Introduza|introduza|a aguardar|por pagar)\b/u;

describe('PT-BR wording (audit T78)', () => {
  it('serves no European-Portuguese words in the portal catalog', () => {
    const keys = new Set([...portalCatalogKeys, ...Object.keys(explicitCoverageLiterals)]);
    const offenders = [...keys]
      .map((key) => portalText('pt', key))
      .filter((value) => PT_PT.test(value));
    expect(offenders).toEqual([]);
  });

  it('uses Brazilian wording in the search task titles', () => {
    for (const role of ['worker', 'owner_admin', 'project_manager', 'finance_admin']) {
      const titles = tasksForContext({ role }).map((task) => task.title.pt);
      expect(titles.filter((title) => PT_PT.test(title))).toEqual([]);
    }
  });
});
