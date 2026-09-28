import { afterEach, describe, expect, it } from 'vitest';
import {
  closeB5LifecycleSecurityFixture,
  createB5LifecycleSecurityFixture,
  type B5LifecycleSecurityFixture,
} from '../fixtures/b5-lifecycle-security-fixture.js';

const fixtures: B5LifecycleSecurityFixture[] = [];

afterEach(() => {
  for (const value of fixtures.splice(0)) closeB5LifecycleSecurityFixture(value);
});

function fixture(): B5LifecycleSecurityFixture {
  const value = createB5LifecycleSecurityFixture();
  fixtures.push(value);
  return value;
}

describe('scoped offline mutation ledger', () => {
  it('creates one Worker time draft and replays the exact result without a second record or legacy write', () => {
    const value = fixture();
    const mutation = {
      mutationId: '0198be45-cd9c-7ab4-9a5a-a6c00000a001',
      entityType: 'time',
      entityId: '0198be45-cd9c-7ab4-9a5a-a6c00000a002',
      baseVersion: 0,
      payload: {
        projectId: value.project.id,
        workDate: '2026-08-20',
        category: 'regular',
        minutes: 45,
        summary: 'Offline scoped draft',
      },
      attachments: [] as string[],
    };

    expect(value.v3.syncMutation(value.worker, mutation)).toEqual({
      outcome: 'accepted',
      version: 1,
    });
    expect(value.v3.syncMutation(value.worker, mutation)).toEqual({
      outcome: 'accepted',
      version: 1,
    });
    expect(
      value.sqlite
        .prepare('SELECT worker_id,minutes,version FROM time_entry WHERE id=?')
        .get(mutation.entityId),
    ).toEqual({ worker_id: value.worker.userId, minutes: 45, version: 1 });
    expect(
      value.sqlite
        .prepare(
          `SELECT tenant_id,deployment_id,user_id,entity_type,state,length(payload_sha256) payload_hash_length,
                  length(result_sha256) result_hash_length
             FROM offline_mutation_scoped WHERE mutation_id=?`,
        )
        .get(mutation.mutationId),
    ).toMatchObject({
      user_id: value.worker.userId,
      entity_type: 'time_entry',
      state: 'accepted',
      payload_hash_length: 64,
      result_hash_length: 64,
    });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM offline_mutation WHERE mutation_id=?')
        .get(mutation.mutationId),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM offline_mutation_scoped WHERE mutation_id=?')
        .get(mutation.mutationId),
    ).toEqual({ count: 1 });
    expect(
      value.v3.syncMutation(value.worker, {
        ...mutation,
        payload: { ...mutation.payload, minutes: 90 },
      }),
    ).toMatchObject({
      outcome: 'conflict',
      code: 'OFFLINE_MUTATION_IDENTITY_CONFLICT',
      fields: ['mutationId'],
    });
    expect(
      value.v3.syncMutation(value.worker, {
        ...mutation,
        attachments: ['0198be45-cd9c-7ab4-9a5a-a6c00000a008'],
      }),
    ).toMatchObject({
      outcome: 'conflict',
      code: 'OFFLINE_MUTATION_IDENTITY_CONFLICT',
      fields: ['mutationId'],
    });
    expect(
      value.sqlite
        .prepare('SELECT minutes,version FROM time_entry WHERE id=?')
        .get(mutation.entityId),
    ).toEqual({ minutes: 45, version: 1 });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM offline_mutation_scoped WHERE mutation_id=?')
        .get(mutation.mutationId),
    ).toEqual({ count: 1 });
    expect(() =>
      value.sqlite
        .prepare(
          'INSERT INTO offline_mutation(mutation_id,user_id,entity_type,entity_id,base_version,payload_json,attachment_ids_json,state,result_json,created_at,processed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          'legacy-guard-check',
          value.worker.userId,
          'time',
          mutation.entityId,
          0,
          '{}',
          '[]',
          'accepted',
          '{}',
          '2026-08-20',
          '2026-08-20',
        ),
    ).toThrow(/legacy offline read only/);
  });

  it('allows the same mutation ID for another assigned user without sharing results', () => {
    const value = fixture();
    const sharedMutationId = '0198be45-cd9c-7ab4-9a5a-a6c00000a003';
    const payload = {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 15,
      summary: 'Separate worker request',
    };
    expect(
      value.v3.syncMutation(value.worker, {
        mutationId: sharedMutationId,
        entityType: 'time',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c00000a004',
        baseVersion: 0,
        payload,
        attachments: [],
      }),
    ).toEqual({ outcome: 'accepted', version: 1 });
    expect(
      value.v3.syncMutation(value.manager, {
        mutationId: sharedMutationId,
        entityType: 'time',
        entityId: '0198be45-cd9c-7ab4-9a5a-a6c00000a005',
        baseVersion: 0,
        payload,
        attachments: [],
      }),
    ).toEqual({ outcome: 'accepted', version: 1 });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM offline_mutation_scoped WHERE mutation_id=?')
        .get(sharedMutationId),
    ).toEqual({ count: 2 });
  });

  it('retains an owned committed receipt on exact expense replay', () => {
    const value = fixture();
    const receipt = value.repository.registerReceipt(value.worker, {
      projectId: value.project.id,
      sha256: 'd'.repeat(64),
      mediaType: 'image/png',
      byteLength: 128,
      storageKey: 'receipts/offline-scoped-replay.png',
      originalFilename: 'offline-scoped-replay.png',
    });
    const mutation = {
      mutationId: '0198be45-cd9c-7ab4-9a5a-a6c00000a009',
      entityType: 'expense',
      entityId: '0198be45-cd9c-7ab4-9a5a-a6c00000a010',
      baseVersion: 0,
      payload: {
        projectId: value.project.id,
        spentOn: '2026-08-20',
        category: 'meals',
        description: 'Offline meal with receipt',
        currency: 'EUR',
        amountMinor: '1250',
        whoPaid: 'worker',
        receiptRequired: true,
        receiptDocumentId: receipt.id,
      },
      attachments: [receipt.id],
    };
    expect(value.v3.syncMutation(value.worker, mutation)).toEqual({
      outcome: 'accepted',
      version: 1,
    });
    expect(value.v3.syncMutation(value.worker, mutation)).toEqual({
      outcome: 'accepted',
      version: 1,
    });
    expect(
      value.sqlite
        .prepare('SELECT receipt_document_id,version FROM expense WHERE id=?')
        .get(mutation.entityId),
    ).toEqual({ receipt_document_id: receipt.id, version: 1 });
    expect(
      value.sqlite
        .prepare('SELECT attachment_ids_json FROM offline_mutation_scoped WHERE mutation_id=?')
        .get(mutation.mutationId),
    ).toEqual({ attachment_ids_json: JSON.stringify([receipt.id]) });
  });

  it('rolls back a new draft if the scoped ledger cannot record its outcome', () => {
    const value = fixture();
    const mutationId = '0198be45-cd9c-7ab4-9a5a-a6c00000a011';
    const entityId = '0198be45-cd9c-7ab4-9a5a-a6c00000a012';
    value.sqlite.exec(`
      CREATE TRIGGER test_offline_scoped_ledger_failure
      BEFORE INSERT ON offline_mutation_scoped
      WHEN NEW.mutation_id='${mutationId}'
      BEGIN SELECT RAISE(ABORT,'scoped ledger test failure'); END;
    `);
    expect(() =>
      value.v3.syncMutation(value.worker, {
        mutationId,
        entityType: 'time',
        entityId,
        baseVersion: 0,
        payload: {
          projectId: value.project.id,
          workDate: '2026-08-20',
          category: 'regular',
          minutes: 30,
          summary: 'Must roll back',
        },
        attachments: [],
      }),
    ).toThrow(/scoped ledger test failure/);
    expect(
      value.sqlite.prepare('SELECT count(*) count FROM time_entry WHERE id=?').get(entityId),
    ).toEqual({ count: 0 });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM offline_mutation_scoped WHERE mutation_id=?')
        .get(mutationId),
    ).toEqual({ count: 0 });
  });

  it.each([
    {
      entityType: 'daily_report',
      payload: (projectId: string) => ({
        projectId,
        workDate: '2026-08-20',
        summary: 'Offline daily report',
        tasksCompleted: 'Inspection completed',
      }),
    },
    {
      entityType: 'technical_report',
      payload: (projectId: string) => ({
        projectId,
        reportDate: '2026-08-20',
        systemName: 'PLC',
        changeSummary: 'Offline technical report',
      }),
    },
    {
      entityType: 'expense',
      payload: (projectId: string) => ({
        projectId,
        spentOn: '2026-08-20',
        category: 'meals',
        description: 'Offline meal expense',
        currency: 'EUR',
        amountMinor: '1250',
        whoPaid: 'worker',
        receiptRequired: false,
      }),
    },
  ])('persists $entityType through the current scoped schema', ({ entityType, payload }) => {
    const value = fixture();
    const mutation = {
      mutationId: '0198be45-cd9c-7ab4-9a5a-a6c00000a006',
      entityType,
      entityId: '0198be45-cd9c-7ab4-9a5a-a6c00000a007',
      baseVersion: 0,
      payload: payload(value.project.id),
      attachments: [],
    };
    expect(value.v3.syncMutation(value.worker, mutation)).toEqual({
      outcome: 'accepted',
      version: 1,
    });
    expect(value.v3.syncMutation(value.worker, mutation)).toEqual({
      outcome: 'accepted',
      version: 1,
    });
    expect(
      value.sqlite
        .prepare('SELECT entity_type,state FROM offline_mutation_scoped WHERE mutation_id=?')
        .get(mutation.mutationId),
    ).toEqual({ entity_type: entityType, state: 'accepted' });
    expect(
      value.sqlite
        .prepare('SELECT count(*) count FROM offline_mutation WHERE mutation_id=?')
        .get(mutation.mutationId),
    ).toEqual({ count: 0 });
  });
});
