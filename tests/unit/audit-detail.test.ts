import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { auditDetailLines } from '../../apps/portal/src/lib/portal/audit-detail';
import {
  auditActionText,
  auditDisplayAction,
} from '../../apps/portal/src/lib/portal/audit-action-labels';
import { auditSubjects } from '../../apps/portal/src/lib/server/audit-subjects';

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

  it('formats minor-unit money with its currency and the rate change as old → new (T17)', () => {
    expect(
      auditDetailLines('{"amountMinor":"148500","currency":"USD"}', 'en').lines,
    ).toEqual([
      { label: 'Amount', value: '$1,485.00' },
      { label: 'Currency', value: 'USD' },
    ]);
    const change = auditDetailLines(
      JSON.stringify({
        currency: 'USD',
        before: { rateMinor: '5500' },
        after: { rateMinor: '5600' },
        rateBasis: 'hourly',
        effectiveFrom: '2026-12-01',
      }),
      'en',
    );
    expect(change.kind).toBe('changes');
    expect(change.lines).toContainEqual({ label: 'Rate', before: '$55.00', value: '$56.00' });
    expect(change.lines).toContainEqual({ label: 'Rate basis', value: 'per hour' });
    // Without a currency the raw integer stays (never guessed).
    expect(auditDetailLines('{"amountMinor":"40000"}', 'en').lines[0]!.value).toBe('40000');
  });
});

describe('audit events read by what happened (T17)', () => {
  it('names an internal person creation and an owner portal password reset correctly', () => {
    expect(
      auditActionText(
        auditDisplayAction('supplier.technician.add', '{"role":"worker","supplierProfile":null}'),
        'en',
      ),
    ).toBe('Person added');
    expect(
      auditDisplayAction(
        'supplier.technician.add',
        '{"role":"worker","supplierProfile":"external_technician"}',
      ),
    ).toBe('supplier.technician.add');
    expect(
      auditActionText(
        auditDisplayAction('mailbox.sessions_revoke', '{"reason":"owner_password_reset"}'),
        'es',
      ),
    ).toBe('Restablecimiento de contraseña del portal por el propietario');
    expect(
      auditActionText(
        auditDisplayAction('mailbox.sessions_revoke', '{"reason":"self_service_password_change"}'),
        'pt',
      ),
    ).toBe('Alteração de senha do portal');
    expect(auditDisplayAction('mailbox.sessions_revoke', '{"reason":"other"}')).toBe(
      'mailbox.sessions_revoke',
    );
  });

  it('resolves whose record and the pay-rate values for one page of rows', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT);
      CREATE TABLE project(id TEXT PRIMARY KEY,project_number TEXT,name TEXT);
      CREATE TABLE client(id TEXT PRIMARY KEY,display_name TEXT);
      CREATE TABLE project_member(id TEXT PRIMARY KEY,user_id TEXT,project_id TEXT);
      CREATE TABLE time_entry(id TEXT PRIMARY KEY,worker_id TEXT,project_id TEXT,work_date TEXT);
      CREATE TABLE expense(id TEXT PRIMARY KEY,worker_id TEXT,project_id TEXT,spent_on TEXT,currency TEXT);
      CREATE TABLE invoice(id TEXT PRIMARY KEY,invoice_number TEXT);
      CREATE TABLE audit_event(id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,occurred_at TEXT,details_json TEXT);
      CREATE TABLE compensation_rule(id TEXT PRIMARY KEY,worker_id TEXT,project_id TEXT,currency TEXT,rate_minor INTEGER,
        rate_basis TEXT,effective_from TEXT,effective_to TEXT,created_at TEXT);
      INSERT INTO user VALUES('w1','Gabriel Lamoglia','gabriel@example.test'),('u2','Aud Throwaway','aud@example.test');
      INSERT INTO project VALUES('p1','C-0020-P-001','BBS Mexico');
      INSERT INTO compensation_rule VALUES
        ('r1','w1','p1','USD',5500,'hourly','2026-11-01',NULL,'2026-11-01T00:00:00Z'),
        ('r2','w1','p1','USD',5600,'hourly','2026-12-01',NULL,'2026-11-22T20:25:24Z');
      INSERT INTO time_entry VALUES('t1','w1','p1','2026-11-16');
      INSERT INTO expense VALUES('e1','w1','p1','2026-11-17','USD');
    `);
    const result = auditSubjects(db, [
      {
        id: 'a1',
        action: 'compensation_rule.create',
        entity_type: 'compensation_rule',
        entity_id: 'r2',
        details_json: '{"workerId":"w1","projectId":"p1","ruleType":"Hourly"}',
      },
      {
        id: 'a2',
        action: 'mailbox.sessions_revoke',
        entity_type: 'user',
        entity_id: 'u2',
        details_json: '{"reason":"owner_password_reset"}',
      },
      { id: 'a3', action: 'time.approved', entity_type: 'time_entry', entity_id: 't1', details_json: '{}' },
      {
        id: 'a4',
        action: 'expense.create',
        entity_type: 'expense',
        entity_id: 'e1',
        details_json: '{"amountMinor":"3550"}',
      },
    ]);
    expect(result.get('a1')!.subject_label).toBe('Gabriel Lamoglia · C-0020-P-001');
    const lines = auditDetailLines(result.get('a1')!.display_details, 'en').lines;
    expect(lines).toContainEqual({ label: 'Rate', before: '$55.00', value: '$56.00' });
    expect(lines).toContainEqual({ label: 'Person', value: 'Gabriel Lamoglia' });
    expect(lines).toContainEqual({ label: 'Project', value: 'C-0020-P-001 · BBS Mexico' });
    expect(lines).toContainEqual({ label: 'Effective from', value: '2026-12-01' });
    expect(result.get('a2')!.subject_label).toBe('Aud Throwaway');
    expect(result.get('a3')!.subject_label).toBe('Gabriel Lamoglia · C-0020-P-001 · 2026-11-16');
    // An expense amount recorded without currency reads as money, not "3550".
    expect(auditDetailLines(result.get('a4')!.display_details, 'en').lines).toContainEqual({
      label: 'Amount',
      value: '$35.50',
    });
    db.close();
  });
});
