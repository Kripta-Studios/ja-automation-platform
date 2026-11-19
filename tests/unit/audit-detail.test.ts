import { describe, expect, it } from 'vitest';
import { auditDetailLines } from '../../apps/portal/src/lib/portal/audit-detail';

describe('audit event detail (Z2: human field-level diff)', () => {
  it('lists changed fields as old → new with labels, plus other values', () => {
    const detail = auditDetailLines(
      JSON.stringify({
        before: { poReference: 'BBS Mexico', billingEmail: 'field@j-aautomation.com', name: 'Same' },
        after: { poReference: null, billingEmail: 'sven@impc.example', name: 'Same' },
        reason: 'Data correction',
      }),
      'en',
    );
    expect(detail.kind).toBe('changes');
    expect(detail.lines).toEqual([
      { label: 'PO reference', before: 'BBS Mexico', value: '(empty)' },
      { label: 'Billing email', before: 'field@j-aautomation.com', value: 'sven@impc.example' },
      { label: 'Reason', value: 'Data correction' },
    ]);
  });

  it('labels fields in Spanish and Portuguese and humanizes unknown keys', () => {
    const es = auditDetailLines('{"before":{"status":"active"},"after":{"status":"closing"}}', 'es');
    expect(es.lines[0]).toEqual({ label: 'Estado', before: 'active', value: 'closing' });
    const pt = auditDetailLines('{"canReview":true,"someNewField":1}', 'pt');
    expect(pt.kind).toBe('values');
    expect(pt.lines).toEqual([
      { label: 'Pode revisar', value: 'Sim' },
      { label: 'Some new field', value: '1' },
    ]);
  });

  it('flattens a saved-state object and bounds very long payloads', () => {
    const fields = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field${i}`, 'x'.repeat(500)]));
    const detail = auditDetailLines(JSON.stringify({ fields }), 'en');
    expect(detail.lines).toHaveLength(30);
    expect(detail.hidden).toBe(10);
    expect(detail.lines[0]!.value.length).toBeLessThanOrEqual(240);
  });

  it('returns nothing for empty or invalid details (raw JSON stays under Technical details)', () => {
    expect(auditDetailLines('{}', 'en').kind).toBe('none');
    expect(auditDetailLines('not json', 'en').kind).toBe('none');
    expect(auditDetailLines(null, 'en').kind).toBe('none');
  });
});
