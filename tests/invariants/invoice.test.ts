import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '@ja/database';
import { installB5TestDeploymentIdentity } from '../fixtures/b5-test-environment.js';
describe('financial invariants', () => {
  it('blocks issued invoice mutation and all-in leakage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ja-inv-'));
    const restoreIdentity = installB5TestDeploymentIdentity();
    const { sqlite } = createDatabase(join(dir, 'app.db'));
    try {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          "INSERT INTO user(id,name,email,role,status,created_at,updated_at) VALUES('u','Worker','w@example.com','worker','active',?,?)",
        )
        .run(now, now);
      sqlite
        .prepare(
          "INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at) VALUES('c','C-0001','Client','Client','active','USD','UTC',?,?)",
        )
        .run(now, now);
      sqlite
        .prepare(
          "INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at) VALUES('p','C-0001-P-001','c','Project','UTC','USD','active','tm',?,?)",
        )
        .run(now, now);
      sqlite
        .prepare(
          "INSERT INTO invoice(id,project_id,invoice_number,stream_type,state,currency,issued_at,snapshot_json,created_at,updated_at) VALUES('i','p','JA-1','labor','issued','USD',?,'{}',?,?)",
        )
        .run(now, now, now);
      expect(() => sqlite.prepare("UPDATE invoice SET total_minor=1 WHERE id='i'").run()).toThrow(
        /immutable/,
      );
      sqlite
        .prepare(
          "INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,created_at,updated_at) VALUES('e','p','u','2026-08-18','hotel','USD',100,'all_in',?,?)",
        )
        .run(now, now);
      expect(() => sqlite.prepare("UPDATE expense SET invoice_id='i' WHERE id='e'").run()).toThrow(
        /all-in/,
      );
    } finally {
      sqlite.close();
      restoreIdentity();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
