import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { listProjectSettlementWorkers } from '../../apps/portal/src/lib/server/finance-settlement-workers';

describe('Finance settlement worker choices', () => {
  it('lists only active labor people with an active assignment to the selected project, retaining historical periods', () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE user (id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
        CREATE TABLE project_member (
          id TEXT PRIMARY KEY,project_id TEXT NOT NULL,user_id TEXT NOT NULL,
          starts_on TEXT NOT NULL,ends_on TEXT,status TEXT NOT NULL
        );
        INSERT INTO user VALUES
          ('current','Current Worker','worker','active'),
          ('past','Past Manager','project_manager','active'),
          ('future','Future Worker','worker','active'),
          ('other','Other Project Worker','worker','active'),
          ('removed','Removed Worker','worker','active'),
          ('offboarded','Offboarded Worker','worker','inactive'),
          ('finance','Finance User','finance_admin','active');
        INSERT INTO project_member VALUES
          ('a1','selected','current','2026-01-01',NULL,'active'),
          ('a2','selected','current','2025-01-01','2025-12-31','active'),
          ('a3','selected','past','2025-02-01','2025-07-31','active'),
          ('a4','selected','future','2026-12-01',NULL,'active'),
          ('a5','unrelated','other','2026-01-01',NULL,'active'),
          ('a6','selected','removed','2026-01-01',NULL,'inactive'),
          ('a7','selected','offboarded','2026-01-01',NULL,'active'),
          ('a8','selected','finance','2026-01-01',NULL,'active');
      `);

      expect(listProjectSettlementWorkers(sqlite, 'selected', '2026-09-25')).toEqual([
        {
          id: 'current',
          name: 'Current Worker',
          assignmentRelation: 'Current project assignment',
          assignmentWindows: ['2026-01-01/', '2025-01-01/2025-12-31'],
        },
        {
          id: 'future',
          name: 'Future Worker',
          assignmentRelation: 'Upcoming project assignment',
          assignmentWindows: ['2026-12-01/'],
        },
        {
          id: 'past',
          name: 'Past Manager',
          assignmentRelation: 'Past project assignment',
          assignmentWindows: ['2025-02-01/2025-07-31'],
        },
      ]);
      expect(listProjectSettlementWorkers(sqlite, 'unrelated', '2026-09-25')).toEqual([
        {
          id: 'other',
          name: 'Other Project Worker',
          assignmentRelation: 'Current project assignment',
          assignmentWindows: ['2026-01-01/'],
        },
      ]);
      expect(listProjectSettlementWorkers(sqlite, '', '2026-09-25')).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
