import { describe, expect, it } from 'vitest';
import { localizedCsv, localizedDecimal } from '../../apps/portal/src/lib/server/localized-csv';
import { localizedExpenseCsv } from '../../apps/portal/src/lib/server/expense-csv';
import { supplierCsv, supplierLocalizedHours } from '../../apps/portal/src/lib/server/supplier-csv';

describe('localized CSV exports (audit T49)', () => {
  it('uses comma/point in English and semicolon/comma in ES and PT, with a BOM', () => {
    const rows = [
      ['Name', 'Hours'],
      ['João', '8.5'],
    ];
    expect(localizedCsv(rows, 'en', new Set([1]))).toBe('﻿Name,Hours\r\nJoão,8.5\r\n');
    expect(localizedCsv(rows, 'pt', new Set([1]))).toBe('﻿Name;Hours\r\nJoão;8,5\r\n');
    expect(localizedDecimal('-12.30', 'es')).toBe('-12,30');
    expect(localizedDecimal('Week 1.2 notes', 'es')).toBe('Week 1.2 notes');
  });

  it('keeps the formula guard and quotes cells containing the separator', () => {
    const csv = localizedCsv([['a'], ['=SUM(A1)'], ['x;y']], 'es');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"x;y"');
  });

  it('exports expenses with translated headers, words and display names', () => {
    const csv = localizedExpenseCsv(
      [
        {
          spent_on: '2026-11-17',
          client_name: 'IMPC',
          project_number: 'C-0020-P-001',
          project_name: 'BBS Mexico',
          worker_name: 'gabriel.lamoglia',
          vendor: 'Oxxo',
          category: 'meals',
          description: 'Dinner',
          currency: 'USD',
          amount_minor: '3550',
          who_paid: 'worker',
          approval_state: 'submitted',
        },
      ],
      'pt',
    );
    const [header, line] = csv.replace('﻿', '').trim().split('\r\n');
    expect(header).toContain('Data;Cliente;Projeto;Colaborador');
    expect(line).toContain('Gabriel Lamoglia');
    expect(line).toContain('35,50');
    expect(line).not.toContain('gabriel.lamoglia');
    expect(line).not.toMatch(/;meals;|;submitted/u);
  });

  it('localizes supplier report hours and separator', () => {
    expect(supplierLocalizedHours(75, 'es')).toBe('1,25');
    expect(supplierCsv([['a', 'b']], 'pt')).toBe('﻿"a";"b"\r\n');
    expect(supplierCsv([['a', 'b']])).toBe('﻿"a","b"\r\n');
  });
});
