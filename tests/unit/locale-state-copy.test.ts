import { describe, expect, it } from 'vitest';
import { reviewCopy } from '../../apps/portal/src/routes/app/reports/review/copy';
import { notificationCopy } from '../../apps/portal/src/lib/notifications/copy';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';
import { copy as financePreviewCopy } from '../../apps/portal/src/routes/app/finance/preview/copy';
import { readFileSync } from 'node:fs';
import { portalCatalog } from '../../apps/portal/src/lib/portal-i18n';
import { portalTitles, portalViewTitles } from '../../apps/portal/src/lib/portal-navigation';

function leaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (!value || typeof value !== 'object') return {};
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, entry]) => leaves(entry, `${prefix}.${key}`)),
  );
}

describe('conditional workflow copy in all portal languages', () => {
  it('registers every dynamic section and view heading with localized text', () => {
    const titles = [
      ...Object.values(portalTitles),
      ...Object.values(portalViewTitles).flatMap((views) => Object.values(views)),
    ];
    for (const title of titles) {
      expect(portalCatalog.en).toHaveProperty(title);
      for (const locale of ['es', 'pt'] as const) expect(portalText(locale, title)).not.toBe(title);
    }
  });
  it('registers and translates operational category labels passed through dynamic options', () => {
    const source = readFileSync('apps/portal/src/lib/portal/sections/TimeSection.svelte', 'utf8');
    const labels = [...source.matchAll(/\{ value: '[^']+', label: '([^']+)' \}/gu)].map(
      (match) => match[1],
    );
    expect(labels).toHaveLength(9);
    for (const label of labels) {
      expect(portalCatalog.en).toHaveProperty(label);
      for (const locale of ['es', 'pt'] as const) expect(portalText(locale, label)).not.toBe(label);
    }
    expect(portalText('es', 'Work')).toBe('Trabajo');
    expect(portalText('pt', 'Work')).toBe('Trabalho');
    expect(portalText('es', 'Standby')).toBe('Guardia / espera');
    expect(portalText('pt', 'Standby')).toBe('Plantão / espera');
    for (const label of ['Travel operational detail', 'Standby reason']) {
      expect(portalCatalog.en).toHaveProperty(label);
      for (const locale of ['es', 'pt'] as const) expect(portalText(locale, label)).not.toBe(label);
    }
  });
  it('preserves every commercial example label and its financial meaning', () => {
    for (const locale of ['es', 'pt'] as const) {
      expect(Object.keys(financePreviewCopy[locale]).sort()).toEqual(
        Object.keys(financePreviewCopy.en).sort(),
      );
    }
    expect(financePreviewCopy.es.laborRevenue).toMatch(/mano de obra/iu);
    expect(financePreviewCopy.es.laborCost).toMatch(/mano de obra/iu);
  });
  it('translates every nested report review outcome, including blocked periods', () => {
    const english = leaves(reviewCopy.en);
    for (const locale of ['es', 'pt'] as const) {
      const translated = leaves(reviewCopy[locale]);
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(english)) {
        expect(translated[key].trim(), `${locale}${key}`).not.toBe('');
        if (value.split(/\s+/u).length > 2)
          expect(translated[key], `${locale}${key}`).not.toBe(value);
      }
    }
  });
  it('uses Brazilian Portuguese in notifications and the unknown-event fallback', () => {
    for (const kind of [
      'missing_time',
      'approval_requested_time',
      'approval_returned_expense',
      'period_ready',
      'period_blocked',
      'signature_outstanding',
      'invoice_overdue',
      'assignment_published',
      'report_submitted',
      'future_kind',
    ]) {
      const message = notificationCopy(kind, 'pt');
      expect(`${message.subject} ${message.body}`).not.toMatch(
        /registo|registe|reveja|rever|faturação|a aguardar/iu,
      );
    }
  });
  it('keeps revenue limits distinct from budgets and hours distinct from time savings', () => {
    expect(portalText('es', 'Time')).toBe('Horas');
    expect(portalText('pt', 'Time')).toBe('Horas');
    expect(portalText('es', 'Actual time')).toBe('Horas reales');
    expect(portalText('pt', 'Actual time')).toBe('Horas trabalhadas');
    expect(portalText('es', 'Revenue cap')).toBe('Límite de ingresos');
    expect(portalText('pt', 'Revenue cap')).toBe('Limite de receita');
    expect(portalText('es', 'No time economics are available for this project.')).toContain(
      'datos económicos de las horas',
    );
    expect(portalText('pt', 'No time economics are available for this project.')).toContain(
      'dados financeiros das horas',
    );
  });
});
