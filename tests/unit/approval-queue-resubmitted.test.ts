import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { resubmissionReader } from '../../apps/portal/src/lib/server/approval-queue';

// T27 (round 3): the PM queue marks a record that comes back after a send-back (or that
// corrects an approved record), with the earlier note and the hours it replaced.
let db: DatabaseSync;
const keys = (id: string) => [id, 'p1', 'w1'] as const;
const row = (id: string, type = 'time', approval_state = 'submitted') => ({
  id,
  type,
  approval_state,
  project_id: 'p1',
  worker_id: 'w1',
});

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE time_entry(id TEXT PRIMARY KEY, project_id TEXT, worker_id TEXT, minutes INTEGER, approval_state TEXT);
    CREATE TABLE expense(id TEXT PRIMARY KEY, project_id TEXT, worker_id TEXT, approval_state TEXT, amount_minor INTEGER);
    CREATE TABLE approval_event(entity_type TEXT, entity_id TEXT, to_state TEXT, reason TEXT, occurred_at TEXT);
    CREATE TABLE record_correction_link(record_type TEXT, original_id TEXT, correction_id TEXT, reason TEXT);
    INSERT INTO time_entry VALUES
      ('t-orig','p1','w1',360,'rejected'), ('t-fix','p1','w1',420,'submitted'),
      ('t-appr','p1','w1',330,'approved'), ('t-corr','p1','w1',300,'submitted'),
      ('t-inplace','p1','w1',480,'submitted'), ('t-plain','p1','w1',480,'submitted'),
      ('t-other','p2','w9',100,'rejected'), ('t-foreign','p1','w1',60,'submitted');
    INSERT INTO approval_event VALUES
      ('time','t-orig','needs_changes','It was 7:00 h','2026-11-24T10:00:00Z'),
      ('time','t-inplace','needs_changes','Wrong category','2026-11-24T11:00:00Z');
    INSERT INTO record_correction_link VALUES
      ('time_entry','t-orig','t-fix','Fixed the hours'),
      ('time_entry','t-appr','t-corr','Lunch break was missing'),
      ('time_entry','t-other','t-foreign','x');
    INSERT INTO expense VALUES ('e-orig','p1','w1','rejected',1000), ('e-fix','p1','w1','submitted',900);
    INSERT INTO approval_event VALUES ('expense','e-orig','needs_changes','Receipt missing','2026-11-24T09:00:00Z');
    INSERT INTO record_correction_link VALUES ('expense','e-orig','e-fix','Added the receipt');
  `);
});

describe('approval queue resubmission marker (T27)', () => {
  it('marks a correction after a send-back with the earlier note, reason and hours', () => {
    expect(resubmissionReader(db)(row('t-fix'), keys('t-fix'))).toEqual({
      resubmitted: 'after_send_back',
      previous_review_note: 'It was 7:00 h',
      correction_reason: 'Fixed the hours',
      previous_minutes: 360,
    });
  });

  it('marks a correction of an approved entry', () => {
    expect(resubmissionReader(db)(row('t-corr'), keys('t-corr'))).toMatchObject({
      resubmitted: 'correction_of_approved',
      previous_minutes: 330,
      correction_reason: 'Lunch break was missing',
    });
  });

  it('marks a record fixed in place after a send-back', () => {
    expect(resubmissionReader(db)(row('t-inplace'), keys('t-inplace'))).toEqual({
      resubmitted: 'after_send_back',
      previous_review_note: 'Wrong category',
    });
  });

  it('marks expenses without reading any amount', () => {
    const marker = resubmissionReader(db)(row('e-fix', 'expense'), keys('e-fix'));
    expect(marker).toEqual({
      resubmitted: 'after_send_back',
      previous_review_note: 'Receipt missing',
      correction_reason: 'Added the receipt',
    });
  });

  it('leaves out the automatic English reason the timesheet stores without a typed reason', () => {
    db.exec(`INSERT INTO time_entry VALUES ('t-auto','p1','w1',480,'submitted');
      INSERT INTO record_correction_link VALUES ('time_entry','t-orig','t-auto','Hours corrected after reviewer request');`);
    expect(resubmissionReader(db)(row('t-auto'), keys('t-auto'))).toEqual({
      resubmitted: 'after_send_back',
      previous_review_note: 'It was 7:00 h',
      previous_minutes: 360,
    });
  });

  it('leaves first submissions, other states and foreign originals unmarked', () => {
    const read = resubmissionReader(db);
    expect(read(row('t-plain'), keys('t-plain'))).toEqual({});
    expect(read(row('t-fix', 'time', 'needs_changes'), keys('t-fix'))).toEqual({});
    expect(read(row('t-foreign'), keys('t-foreign'))).toEqual({});
  });
});
