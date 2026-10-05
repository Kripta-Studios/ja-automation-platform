import { describe, expect, it } from 'vitest';
import { encodeTechnicalReportChange } from '@ja/schemas';
import { periodReportHtml } from '../../packages/reporting/src/exports';

const narrative = {
  problemSymptom: 'Sensor <A> did not update the display.',
  diagnosisRootCause: 'Incorrect mapping & stale reference.',
  changePerformed: 'Corrected the mapping; validated the signal.\nKept the rollback copy.',
};

function snapshot(changes: string, locale = 'en') {
  return Object.freeze({
    project: Object.freeze({ number: 'BBS-LAB', name: 'Synthetic training bench' }),
    periodStart: '2026-10-02',
    periodEnd: '2026-10-02',
    audience: 'customer',
    locale,
    technicalReports: Object.freeze([
      Object.freeze({ id: 'training-technical', changes, approvalState: 'approved' }),
    ]),
    timeSummary: Object.freeze([
      Object.freeze({ minutes: 360, approvalState: 'approved' }),
      Object.freeze({ minutes: 360, approvalState: 'approved' }),
    ]),
  });
}

describe('period report Technical change presentation', () => {
  it('renders the actual immutable changes schema as labeled narratives without changing the snapshot', () => {
    const source = snapshot(encodeTechnicalReportChange(narrative));
    const original = JSON.stringify(source);
    const html = periodReportHtml(source);

    expect(html).toContain('Problem / symptom: Sensor &lt;A&gt; did not update the display.');
    expect(html).toContain('Diagnosis / root cause: Incorrect mapping &amp; stale reference.');
    expect(html).toContain(
      'Change performed: Corrected the mapping; validated the signal.\nKept the rollback copy.',
    );
    expect(html).not.toContain('ja.technical-report.change.v1');
    expect(html).not.toContain('Sensor <A>');
    expect(html).toContain('12.0 h');
    expect(JSON.stringify(source)).toBe(original);
  });

  it.each(['changes', 'changeSummary', 'change_summary'] as const)(
    'retains historical free-text narratives from %s',
    (field) => {
      const source = snapshot('');
      const html = periodReportHtml({
        ...source,
        technicalReports: [{ [field]: 'Replaced contactor & confirmed operation.' }],
      });
      expect(html).toContain('Change performed: Replaced contactor &amp; confirmed operation.');
    },
  );

  it.each([
    ['es', 'Problema / síntoma:', 'Diagnóstico / causa raíz:', 'Cambio realizado:'],
    ['pt', 'Problema / sintoma:', 'Diagnóstico / causa raiz:', 'Alteração realizada:'],
  ])(
    'localizes labels while preserving source narrative in %s',
    (locale, problem, diagnosis, change) => {
      const html = periodReportHtml(snapshot(encodeTechnicalReportChange(narrative), locale));
      expect(html).toContain(problem);
      expect(html).toContain(diagnosis);
      expect(html).toContain(change);
      expect(html).toContain('Corrected the mapping; validated the signal.');
    },
  );

  it('escapes narrative markup instead of interpreting it as document HTML', () => {
    const html = periodReportHtml(
      snapshot(
        encodeTechnicalReportChange({
          ...narrative,
          changePerformed: '<img src=x onerror=alert(1)>',
        }),
      ),
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('extracts only the three known narrative fields from the recognized schema', () => {
    const html = periodReportHtml(
      snapshot(
        JSON.stringify({
          schema: 'ja.technical-report.change.v1',
          ...narrative,
          unrelatedMetadata: 'must-not-be-rendered',
        }),
      ),
    );
    expect(html).toContain('Corrected the mapping; validated the signal.');
    expect(html).not.toContain('must-not-be-rendered');
    expect(html).not.toContain('unrelatedMetadata');
  });
});
