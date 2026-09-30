import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  acknowledgeReportAutosave,
  createReportAutosaveFlight,
  decodeReportAutosaveResult,
  loadedReportAutosaveSnapshot,
  reportRecoveryMatchesLoaded,
  reportFieldlessActionReadiness,
  type ReportAutosaveSnapshot,
} from '../../apps/portal/src/lib/portal/report-autosave';

// Use the installed framework's serializer, rather than replacing serialized data
// with an object (the original runtime failure). The page uses Kit deserialize.
const portalRequire = createRequire(resolve(process.cwd(), 'apps/portal/package.json'));
const kitRequire = createRequire(portalRequire.resolve('@sveltejs/kit/package.json'));
const { parse, stringify } = await import(kitRequire.resolve('devalue'));
const decode = (text: string): unknown => {
  const action = JSON.parse(text);
  if (action.data) action.data = parse(action.data);
  return action;
};
const sent: ReportAutosaveSnapshot = {
  id: 'own-report',
  type: 'daily',
  projectId: 'own-project',
  version: '1',
  summary: 'First edit',
};
const success = { success: true, autosaved: true, id: sent.id, type: sent.type, version: 2 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('own report autosave acknowledgement', () => {
  it('decodes a standard serialized success envelope before adopting its version', () => {
    const response = JSON.stringify({ type: 'success', status: 200, data: stringify(success) });
    const result = decodeReportAutosaveResult(response, decode);
    expect(acknowledgeReportAutosave(sent, sent, result)).toEqual({ version: 2, retained: null });
  });

  it('retains genuine failure data without adopting a remote currentVersion', () => {
    const failure = { success: false, code: 'REPORT_VERSION_CONFLICT', currentVersion: 8 };
    const result = decodeReportAutosaveResult(
      JSON.stringify({ type: 'failure', status: 409, data: stringify(failure) }),
      decode,
    );
    expect(result).toEqual(failure);
    expect(acknowledgeReportAutosave(sent, sent, result)).toBeNull();
  });

  it.each([
    'invalid JSON',
    JSON.stringify({ type: 'redirect', location: '/login' }),
    JSON.stringify({ type: 'success', data: 'malformed serialized data' }),
    JSON.stringify({ type: 'success', data: stringify(['not application data']) }),
  ])('does not acknowledge a malformed or non-data result: %s', (response) => {
    expect(decodeReportAutosaveResult(response, decode)).toEqual({});
  });

  it.each([
    { ...success, id: 'other-report' },
    { ...success, type: 'technical' },
    { ...success, version: 8 },
    { ...success, version: '2' },
    { ...success, autosaved: false },
    { ...success, success: false },
  ])('rejects an acknowledgement outside the exact request: %j', (result) => {
    expect(acknowledgeReportAutosave(sent, sent, result)).toBeNull();
  });

  it('does not bind an old acknowledgement to a changed report, project or recovery base', () => {
    for (const current of [
      { ...sent, id: 'another' },
      { ...sent, type: 'technical' },
      { ...sent, projectId: 'another' },
      { ...sent, version: '3' },
    ])
      expect(acknowledgeReportAutosave(sent, current, success)).toBeNull();
  });

  it('rebases later typing without clearing it or replacing it with the sent snapshot', () => {
    const current: ReportAutosaveSnapshot = { ...sent, summary: 'Newest edit', notes: '' };
    expect(acknowledgeReportAutosave(sent, current, success)).toEqual({
      version: 2,
      retained: { ...current, version: '2' },
    });
    expect(current.version).toBe('1');
    expect(sent.summary).toBe('First edit');
  });

  it('accepts a no-change own acknowledgement without inventing a version increment', () => {
    expect(acknowledgeReportAutosave(sent, sent, { ...success, version: 1 })).toEqual({
      version: 1,
      retained: null,
    });
  });

  it('allows native saving immediately when no autosave is pending', async () => {
    const flight = createReportAutosaveFlight();
    expect(flight.busy()).toBe(false);
    expect(await flight.wait()).toBe(true);
  });

  it('waits for the existing own save, then submits the newest fields with its acknowledged base', async () => {
    const flight = createReportAutosaveFlight();
    const network = deferred<Record<string, unknown>>();
    let current = sent;
    let base = 1;
    const autosave = vi.fn(async () => {
      const ack = acknowledgeReportAutosave(sent, current, await network.promise);
      if (!ack) return false;
      base = ack.version;
      return true;
    });
    const pending = flight.run(autosave);
    expect(flight.run(autosave)).toBe(pending);
    current = { ...sent, summary: 'Typed while saving' };
    const nativeSubmit = vi.fn();
    const manual = flight.wait().then((acknowledged) => {
      if (acknowledged) nativeSubmit({ ...current, version: String(base) });
    });
    await Promise.resolve();
    expect(nativeSubmit).not.toHaveBeenCalled();
    network.resolve(success);
    await manual;
    expect(autosave).toHaveBeenCalledTimes(1);
    expect(nativeSubmit).toHaveBeenCalledExactlyOnceWith({ ...current, version: '2' });
    expect(flight.busy()).toBe(false);
    expect(await flight.wait()).toBe(true);
  });

  it('does not replay a native submit after an in-flight conflict', async () => {
    const flight = createReportAutosaveFlight();
    const network = deferred<boolean>();
    flight.run(() => network.promise);
    const submit = vi.fn();
    const manual = flight.wait().then((acknowledged) => {
      if (acknowledged) submit();
    });
    network.resolve(false);
    await manual;
    expect(submit).not.toHaveBeenCalled();
    expect(flight.busy()).toBe(false);
  });
});

describe('recovery reconciliation against loaded report fields', () => {
  const record = {
    id: 'own-report',
    project_id: 'own-project',
    version: 5,
    work_date: '2026-10-01',
    summary: 'Newest edit',
    tasks_completed: 'Recorded tasks',
    safety_related: 0,
    downtime_minutes: null,
  };
  const loaded = loadedReportAutosaveSnapshot('daily', record)!;
  const stored = { ...loaded, version: '3' };

  it('clears only a complete exact match, ignoring the old optimistic version', () => {
    expect(reportRecoveryMatchesLoaded(stored, loaded, true)).toBe(true);
    expect(stored.version).toBe('3');
    expect(loaded.version).toBe('5');
    expect(loaded.safetyRelated).toBe('off');
    expect(loaded.downtimeMinutes).toBe('0');
    expect(loaded.siteShift).toBe('');
  });

  it.each([
    { ...stored, summary: 'Typing not yet saved' },
    { ...stored, tasksCompleted: '' },
    { ...stored, safetyRelated: 'on' },
    { ...stored, newUnknownField: 'Protected text' },
    { ...stored, id: 'other-report' },
    { ...stored, projectId: 'other-project' },
    { ...stored, type: 'technical' },
    { ...stored, version: 'malformed' },
  ])('protects differing, unknown, or mismatched recovery data: %j', (saved) => {
    expect(reportRecoveryMatchesLoaded(saved, loaded, true)).toBe(false);
  });

  it('protects missing fields and failed-form values even when retained inputs appear identical', () => {
    const incomplete: Record<string, string> = { ...stored };
    delete incomplete.siteShift;
    expect(reportRecoveryMatchesLoaded(incomplete, loaded, true)).toBe(false);
    expect(reportRecoveryMatchesLoaded(stored, loaded, false)).toBe(false);
    expect(reportRecoveryMatchesLoaded(stored, null, true)).toBe(false);
  });

  it('takes technical field truth from the loaded record and preserves explicit empty and zero values', () => {
    const technical = loadedReportAutosaveSnapshot('technical', {
      id: 'technical-report',
      project_id: 'own-project',
      version: 2,
      created_at: '2026-09-30T10:00:00Z',
      change_performed: '',
      change_summary: 'Legacy text',
      system_name: 'Controller',
      safety_related: 1,
      production_impact: 0,
    })!;
    expect(technical.reportDate).toBe('2026-09-30');
    expect(technical.changePerformed).toBe('');
    expect(technical.productionImpact).toBe('0');
    expect(technical.safetyRelated).toBe('on');
    expect(technical.systemName).toBe('Controller');
    expect(loadedReportAutosaveSnapshot('unknown', record)).toBeNull();
  });
});

describe('fieldless report actions preserve the edit base and all unsaved fields', () => {
  const confirmed: ReportAutosaveSnapshot = {
    id: 'own-report',
    type: 'daily',
    projectId: 'own-project',
    version: '11',
    summary: 'Owner edit',
  };
  it('blocks a stale editor even when its UI state is idle and display version is newer', () => {
    const retained = { ...confirmed, version: '10', summary: 'Worker unsaved edit' };
    expect(reportFieldlessActionReadiness(retained, confirmed, false, retained)).toBe('blocked');
    expect(retained.version).toBe('10');
    expect(confirmed.summary).toBe('Owner edit');
  });
  it('blocks a failed or offline form even if the visible fields happen to match', () => {
    expect(reportFieldlessActionReadiness(confirmed, confirmed, true, null)).toBe('blocked');
  });
  it('requires flushing differing fields against the same confirmed base', () => {
    const current = { ...confirmed, summary: 'Newest worker typing' };
    expect(reportFieldlessActionReadiness(current, confirmed, false, current)).toBe('dirty');
  });
  it('allows a complete exact own-acknowledged snapshot without adopting the older loaded version', () => {
    const acked = { ...confirmed, version: '12', summary: 'Newest worker typing' };
    expect(reportFieldlessActionReadiness(acked, acked, false, null)).toBe('ready');
    expect(confirmed.version).toBe('11');
  });
  it('blocks an unresolved different recovery copy even when the editor matches loaded truth', () => {
    expect(
      reportFieldlessActionReadiness(confirmed, confirmed, false, {
        ...confirmed,
        version: '10',
        summary: 'Unreviewed recovery text',
      }),
    ).toBe('blocked');
  });
  it('does not block an exactly redundant already-persisted recovery copy', () => {
    expect(
      reportFieldlessActionReadiness(confirmed, confirmed, false, { ...confirmed, version: '10' }),
    ).toBe('ready');
  });
  it.each([
    { ...confirmed, projectId: 'another-project' },
    { ...confirmed, id: 'another-report' },
    { ...confirmed, type: 'technical' },
    { ...confirmed, unknownField: 'Protected content' },
    { ...confirmed, version: 'malformed' },
  ])('blocks an unknown or mismatched action context: %j', (current) => {
    expect(reportFieldlessActionReadiness(current, confirmed, false, null)).toBe('blocked');
  });
});
