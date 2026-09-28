import { describe, expect, it } from 'vitest';
import { portalNavigationForRole, portalTitleFor } from '../portal-navigation';
import { isExplicitCoverageTranslation, translate } from './catalog';

const personas = [
  ['worker', undefined],
  ['project_manager', undefined],
  ['finance_admin', undefined],
  ['owner_admin', undefined],
  ['auditor_read_only', undefined],
  ['worker', 'supplier_coordinator'],
  ['worker', 'external_technician'],
] as const;

describe('localized navigation for every portal persona', () => {
  it.each(personas)(
    'covers all navigation groups for %s / %s in EN, ES and PT-BR',
    (role, profile) => {
      const navigation = portalNavigationForRole('/portal', role, profile);
      const labels = Object.values(navigation)
        .flat()
        .map((item) => item.label);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(translate('en', label), label).toBe(label);
        for (const locale of ['es', 'pt'] as const) {
          expect(isExplicitCoverageTranslation(locale, label), `${locale}: ${label}`).toBe(true);
          expect(translate(locale, label), `${locale}: ${label}`).not.toBe(label);
          expect(translate(locale, label).trim(), `${locale}: ${label}`).not.toBe('');
        }
      }
    },
  );

  it.each(['supplier_coordinator', 'external_technician'])(
    'renders Help in the selected language for %s',
    (profile) => {
      const help = portalNavigationForRole('', 'worker', profile).secondary.find(
        (item) => item.section === 'help',
      );
      expect(help).toBeDefined();
      expect(translate('en', help!.label)).toBe('Help');
      expect(translate('es', help!.label)).toBe('Ayuda');
      expect(translate('pt', help!.label)).toBe('Ajuda');
    },
  );

  it.each([
    ['en', 'Profile and security', 'Report: Profile and security'],
    ['es', 'Perfil y seguridad', 'Informe: Perfil y seguridad'],
    ['pt', 'Perfil e segurança', 'Relatório: Perfil e segurança'],
  ] as const)(
    'uses a localized section title in the %s breadcrumb and print heading',
    (locale, expectedTitle, expectedReport) => {
      const title = translate(locale, portalTitleFor('profile'));
      expect(title).toBe(expectedTitle);
      expect(translate(locale, 'Report: {title}', { title })).toBe(expectedReport);
    },
  );
});
