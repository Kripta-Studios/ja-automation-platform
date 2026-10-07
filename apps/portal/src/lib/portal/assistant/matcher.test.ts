import { describe, expect, it } from 'vitest';
import { searchAssistantTasks } from './matcher';

const owner = { role: 'owner_admin', canonicalOwner: true };
const ids = (query: string, context = owner) =>
  searchAssistantTasks(query, context, 'en').matches.map((match) => match.task.id);

describe('deterministic multilingual task matching', () => {
  it('recognizes the requested typo without a model or API', () => {
    expect(ids('I wannt create a new project')[0]).toBe('project-create');
    expect(ids('create a new projct')[0]).toBe('project-create');
  });
  it.each([
    ['Quiero crear un proyecto nuevo', 'project-create'],
    ['Quero criar um novo projeto', 'project-create'],
    ['registrar un gasto', 'expense-create'],
    ['registar uma despesa', 'expense-create'],
    ['crear informe técnico PLC', 'report-technical'],
    ['criar relatório diário', 'report-daily'],
    ['create an invoice', 'invoice-create'],
    ['quero registrar horas no projeto', 'time-create'],
    ['quero lançar uma despesa no projeto', 'expense-create'],
    ['I wannt record hours on the project', 'time-create'],
    ['log timee', 'time-create'],
    ['quiero registrar horas en el proyecto', 'time-create'],
  ])('matches %s to %s across portal locales', (query, task) => {
    for (const locale of ['en', 'es', 'pt'] as const)
      expect(searchAssistantTasks(query, owner, locale).matches[0]?.task.id).toBe(task);
  });
  it.each(['invoice', 'report', 'pay'])('offers choices for ambiguous %s', (query) => {
    expect(ids(query).length).toBeGreaterThan(1);
  });
  it.each([
    '',
    'x',
    'hello',
    'purple elephant',
    'create a pizza',
    'do not create a project',
    "don't create invoice",
    'no crear proyecto',
    'não criar projeto',
    'nunca criar projeto',
  ])('avoids accidental launches for %s', (query) => {
    expect(ids(query)).toEqual([]);
  });
  it.each(['worker', 'project_manager'])(
    'does not search hidden financial controls for %s',
    (role) => {
      const context = { role, canonicalOwner: false };
      expect(ids('create invoice', context)).toEqual([]);
      expect(ids('configure tax profiles', context)).toEqual([]);
      expect(ids('create mailbox', context)).toEqual([]);
    },
  );
  it.each(['en', 'es', 'pt'] as const)('preserves negation across the %s locale', (locale) => {
    for (const query of [
      'no crear proyecto',
      'no quiero registrar horas',
      'não quero registrar horas no projeto',
      'nao lancar despesa no projeto',
      'do not log time on the project',
      'no create project',
    ])
      expect(searchAssistantTasks(query, owner, locale).kind).toBe('unsupported');
  });
  it('recognizes Portuguese prepositions without widening supplier permissions', () => {
    const supplier = { role: 'worker', workforceProfile: 'external_technician' };
    expect(
      searchAssistantTasks('quero registrar horas no projeto', supplier, 'pt').matches[0]?.task.id,
    ).toBe('time-create');
    expect(
      searchAssistantTasks('quero criar uma fatura no projeto', supplier, 'pt').matches,
    ).toEqual([]);
  });
  it('gates suppliers and canonical owners before searching', () => {
    expect(ids('invoice', { role: 'worker', canonicalOwner: false })).toEqual([]);
    expect(
      searchAssistantTasks('pay', { role: 'worker', workforceProfile: 'external_technician' }, 'en')
        .matches,
    ).toEqual([]);
    expect(ids('create mailbox', { role: 'owner_admin', canonicalOwner: false })).toEqual([]);
    expect(ids('create mailbox')[0]).toBe('mailbox-create');
  });
  it('finds personal security without requiring administrative mailbox access', () => {
    expect(ids('change my password', { role: 'worker', canonicalOwner: false })[0]).toBe(
      'profile-security',
    );
    expect(ids('enable MFA', { role: 'auditor_read_only', canonicalOwner: false })[0]).toBe(
      'profile-security',
    );
    expect(ids('invite a worker')[0]).toBe('team-invite');
  });
  it('keeps ranked scores bounded and results deterministic', () => {
    const result = searchAssistantTasks('create project', owner, 'en');
    expect(result.kind).toBe('matches');
    expect(result).toEqual(searchAssistantTasks('create project', owner, 'en'));
    expect(result.matches.every((match) => match.score >= 0 && match.score <= 1)).toBe(true);
  });
});
