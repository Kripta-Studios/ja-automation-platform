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

describe('time interval operational listings', () => {
  it('returns canonical intervals to the worker and authorized owner without leaking finance fields', () => {
    const value = fixture();
    const entry = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 210,
      summary: 'Interval listing regression',
    });
    value.repository.updateTimeEntry(value.worker, {
      id: entry.id,
      version: entry.version,
      minutes: 210,
      startTime: '08:15',
      endTime: '12:00',
      breakMinutes: 15,
    });

    const expectedInterval = {
      id: entry.id,
      minutes: 210,
      start_time: '08:15',
      end_time: '12:00',
      break_minutes: 15,
    };
    const workerRow = value.repository
      .listTimeForScope(value.worker)
      .find((row) => row.id === entry.id);
    const ownerRow = value.repository
      .listTimeForScope(value.owner)
      .find((row) => row.id === entry.id);

    expect(workerRow).toMatchObject(expectedInterval);
    expect(ownerRow).toMatchObject(expectedInterval);
    expect(workerRow).not.toHaveProperty('invoice_id');
    expect(workerRow).not.toHaveProperty('client_rate_minor');
    expect(workerRow).not.toHaveProperty('compensation_amount_minor');
    expect(workerRow).not.toHaveProperty('internal_cost_minor');
    expect(workerRow).not.toHaveProperty('billing_status');
  });

  it('preserves intervals in own-history and own-week projections', () => {
    const value = fixture();
    const entry = value.repository.createTimeEntry(value.worker, {
      projectId: value.project.id,
      workDate: '2026-08-20',
      category: 'regular',
      minutes: 210,
      summary: 'Own interval listing regression',
    });
    value.repository.updateTimeEntry(value.worker, {
      id: entry.id,
      version: entry.version,
      minutes: 210,
      startTime: '08:15',
      endTime: '12:00',
      breakMinutes: 15,
    });
    const expectedInterval = {
      id: entry.id,
      start_time: '08:15',
      end_time: '12:00',
      break_minutes: 15,
    };

    expect(value.repository.listOwnTime(value.worker)).toEqual(
      expect.arrayContaining([expect.objectContaining(expectedInterval)]),
    );
    expect(value.repository.listOwnTimeWeek(value.worker, '2026-08-17').rows).toEqual(
      expect.arrayContaining([expect.objectContaining(expectedInterval)]),
    );
  });
});
