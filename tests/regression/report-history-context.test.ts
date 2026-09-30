import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isReportHistoryAction,
  translateReportHistoryAction,
} from '../../apps/portal/src/lib/portal-i18n';
import { reportHistoryChangedFieldLabel } from '../../apps/portal/src/lib/i18n/report-history';
import { standaloneText } from '../../apps/portal/src/routes/app/standalone-locale';

const reportDetailSource = readFileSync(
  resolve(process.cwd(), 'apps/portal/src/routes/app/reports/[id]/+page.svelte'),
  'utf8',
);

describe('report history contextual labels', () => {
  it('localizes known changed-field captions while preserving unknown legacy identifiers', () => {
    const summaryLabels = { en: 'Shift summary', es: 'Resumen del turno', pt: 'Resumo do turno' };
    const fields = ['summary', 'tasksCompleted', 'changeSummary', 'legacy_custom_field'];
    for (const locale of ['en', 'es', 'pt'] as const) {
      const captions = fields.map((field) => {
        const key = reportHistoryChangedFieldLabel(field);
        return key ? standaloneText(locale, key) : field;
      });
      expect(captions[0]).toBe(summaryLabels[locale]);
      expect(captions[1]).not.toBe('tasksCompleted');
      expect(captions[2]).not.toBe('changeSummary');
      expect(captions[3]).toBe('legacy_custom_field');
      expect(fields).toEqual(['summary', 'tasksCompleted', 'changeSummary', 'legacy_custom_field']);
    }
    expect(reportHistoryChangedFieldLabel('__proto__')).toBeNull();
    expect(reportHistoryChangedFieldLabel('constructor')).toBeNull();
    expect(reportHistoryChangedFieldLabel(null)).toBeNull();
  });
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

  it('distinguishes notification processing while preserving report edits and legacy deletion context', () => {
    const notificationLabels = {
      en: 'Report change notifications processed',
      es: 'Notificaciones de cambios del informe procesadas',
      pt: 'Notificações de alterações do relatório processadas',
    };
    for (const locale of ['en', 'es', 'pt'] as const) {
      const notification = translateReportHistoryAction(locale, 'report.report_modified');
      expect(notification).toBe(notificationLabels[locale]);
      for (const record of ['daily', 'technical'] as const) {
        const update = translateReportHistoryAction(locale, `report.${record}.update`);
        expect(notification).not.toBe(update);
        expect(translateReportHistoryAction(locale, `report.${record}.report_modified`)).toBe(
          update,
        );
      }
    }
    expect(isReportHistoryAction('report.report_modified')).toBe(true);

    // Retained existing source check for the source-specific legacy deletion label.
    expect(reportDetailSource).toContain("action === 'report.report_deleted'");
    expect(reportDetailSource).toContain("? 'daily_report.delete'");
    expect(reportDetailSource).toContain(": 'technical_report.delete'");

    const legacyToCanonical = {
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
