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
          starts_on TEXT NOT NULL,ends_on TEXT,status TEXT NOT NULL,
          assignment_role TEXT NOT NULL DEFAULT 'worker'
        );
        CREATE TABLE supplier_user_profile (user_id TEXT PRIMARY KEY,profile TEXT NOT NULL);
        INSERT INTO user VALUES
          ('current','Current Worker','worker','active'),
          ('past','Past Manager','project_manager','active'),
          ('future','Future Worker','worker','active'),
          ('other','Other Project Worker','worker','active'),
          ('removed','Removed Worker','worker','active'),
          ('offboarded','Offboarded Worker','worker','inactive'),
          ('finance','Finance User','finance_admin','active');
        INSERT INTO project_member(id,project_id,user_id,starts_on,ends_on,status) VALUES
          ('a1','selected','current','2026-01-01',NULL,'active'),
          ('a2','selected','current','2025-01-01','2025-12-31','active'),
          ('a3','selected','past','2025-02-01','2025-07-31','active'),
          ('a4','selected','future','2026-12-01',NULL,'active'),
          ('a5','unrelated','other','2026-01-01',NULL,'active'),
          ('a6','selected','removed','2026-01-01',NULL,'inactive'),
          ('a7','selected','offboarded','2026-01-01',NULL,'active'),
          ('a8','selected','finance','2026-01-01',NULL,'active');
        -- Round 2 (D3): PM-only and coordinator assignments and supplier staff are never paid here.
        INSERT INTO user VALUES
          ('pmonly','Project Manager Only','project_manager','active'),
          ('coord','Supplier Coordinator','worker','active'),
          ('tech','External Technician','worker','active');
        INSERT INTO project_member VALUES
          ('a9','selected','pmonly','2026-01-01',NULL,'active','project_manager'),
          ('a10','selected','coord','2026-01-01',NULL,'active','supplier_coordinator'),
          ('a11','selected','tech','2026-01-01',NULL,'active','worker');
        INSERT INTO supplier_user_profile VALUES('coord','supplier_coordinator'),('tech','external_technician');
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
