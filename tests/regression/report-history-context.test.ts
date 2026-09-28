import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translateReportHistoryAction } from '../../apps/portal/src/lib/portal-i18n';

const reportDetailSource = readFileSync(
  resolve(process.cwd(), 'apps/portal/src/routes/app/reports/[id]/+page.svelte'),
  'utf8',
);

describe('report history contextual labels', () => {
  it('renders semantic create/update/delete labels for daily and technical reports in every locale', () => {
    const expected: Record<'en' | 'es' | 'pt', Record<string, string>> = {
      en: {
        'daily_report.create': 'Daily report created',
        'daily_report.update': 'Daily report updated',
        'daily_report.delete': 'Daily report deleted',
        'technical_report.create': 'Technical report created',
        'technical_report.update': 'Technical report updated',
        'technical_report.delete': 'Technical report deleted',
      },
      es: {
        'daily_report.create': 'Informe diario creado',
        'daily_report.update': 'Informe diario actualizado',
        'daily_report.delete': 'Informe diario eliminado',
        'technical_report.create': 'Informe técnico creado',
        'technical_report.update': 'Informe técnico actualizado',
        'technical_report.delete': 'Informe técnico eliminado',
      },
      pt: {
        'daily_report.create': 'Relatório diário criado',
        'daily_report.update': 'Relatório diário atualizado',
        'daily_report.delete': 'Relatório diário excluído',
        'technical_report.create': 'Relatório técnico criado',
        'technical_report.update': 'Relatório técnico atualizado',
        'technical_report.delete': 'Relatório técnico excluído',
      },
    };

    for (const locale of ['en', 'es', 'pt'] as const)
      for (const [action, label] of Object.entries(expected[locale]))
        expect(translateReportHistoryAction(locale, action), `${locale} ${action}`).toBe(label);
  });

  it('contextualizes legacy generic update/delete rows from the loaded report type', () => {
    expect(reportDetailSource).toContain("action === 'report.report_modified'");
    expect(reportDetailSource).toContain("action === 'report.report_deleted'");
    expect(reportDetailSource).toContain("? 'daily_report.update'");
    expect(reportDetailSource).toContain(": 'technical_report.update'");
    expect(reportDetailSource).toContain("? 'daily_report.delete'");
    expect(reportDetailSource).toContain(": 'technical_report.delete'");

    const legacyToCanonical = {
      'report.report_modified': ['daily_report.update', 'technical_report.update'],
      'report.report_deleted': ['daily_report.delete', 'technical_report.delete'],
    } as const;
    for (const [legacy, canonical] of Object.entries(legacyToCanonical)) {
      expect(translateReportHistoryAction('es', canonical[0])).not.toBeNull();
      expect(translateReportHistoryAction('es', canonical[1])).not.toBeNull();
      expect(translateReportHistoryAction('pt', canonical[0])).not.toBeNull();
      expect(translateReportHistoryAction('pt', canonical[1])).not.toBeNull();
      expect(translateReportHistoryAction('en', legacy)).toBeNull();
    }
  });
});
