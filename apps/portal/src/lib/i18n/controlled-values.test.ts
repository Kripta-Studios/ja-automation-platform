import { describe, expect, it } from 'vitest';
import { translateControlledValue } from './controlled-values';

describe('portal controlled-value translations', () => {
  it.each([
    ['role', 'owner', 'Propietario', 'Proprietário'],
    ['status', 'approved', 'Aprobado', 'Aprovado'],
    ['category', 'travel', 'Viaje', 'Viagem'],
    ['recordType', 'daily_field_report', 'Informe de campo diario', 'Relatório de campo diário'],
    ['availability', 'available', 'Disponible', 'Disponível'],
    ['billingStream', 'time_materials', 'Tiempo y materiales', 'Tempo e materiais'],
    ['artifactState', 'queued', 'En cola', 'Na fila'],
    ['timeCategory', 'commissioning', 'Puesta en marcha', 'Comissionamento'],
    ['timeCategory', 'overtime', 'Horas extra', 'Hora extra'],
    ['timeCategory', 'standby', 'Disponibilidad / espera', 'Plantão / espera'],
    ['timeCategory', 'weekend_holiday', 'Fin de semana / festivo', 'Fim de semana / feriado'],
    ['timeCategory', 'remote_support', 'Asistencia remota', 'Suporte remoto'],
    ['timeCategory', 'training', 'formación', 'treinamento'],
    ['timeCategory', 'internal', 'Interno', 'Interno'],
    ['expenseCategory', 'hotel', 'Alojamiento (hotel)', 'Hospedagem (hotel)'],
    ['expenseCategory', 'rental_car', 'Coche de alquiler', 'Carro alugado'],
    ['expenseCategory', 'fuel', 'Combustible', 'Combustível'],
    ['expenseCategory', 'tolls', 'Peajes', 'Pedágios'],
    ['expenseCategory', 'airfare', 'billete de avión', 'passagem aérea'],
    ['expenseCategory', 'tools', 'Herramientas / consumibles', 'Ferramentas / consumíveis'],
    ['expenseCategory', 'shipping', 'Envío', 'Envio'],
    ['expenseCategory', 'visa_permit', 'Visado / permiso', 'Visto / autorização'],
    ['status', 'billable', 'Facturable', 'Faturável'],
    ['status', 'non_billable', 'No facturable', 'Não faturável'],
    ['status', 'internal', 'Interno', 'Interno'],
    ['billingStream', 'all_in', 'Todo incluido', 'Tudo incluído'],
    ['billingStream', 'reimbursable_at_cost', 'Reembolsable al coste', 'Reembolsável pelo custo'],
    [
      'billingStream',
      'allowance_per_diem',
      'Dietas / asignación diaria',
      'Ajuda de custo / diária',
    ],
    ['billingStream', 'tm_daily_minimum', 'Diario', 'Diário'],
    ['recordType', 'technical_report', 'Informe técnico', 'Relatório técnico'],
  ] as const)('%s/%s has localized labels', (domain, value, es, pt) => {
    expect(translateControlledValue('es', domain, value)).toBe(es);
    expect(translateControlledValue('pt', domain, value)).toBe(pt);
  });

  it('preserves unknown codes instead of translating user data', () => {
    expect(translateControlledValue('es', 'status', 'customer-defined-code')).toBe(
      'customer-defined-code',
    );
  });

  it('covers the persisted detail codes added by the standalone views', () => {
    const cases = [
      ['status', 'internal'],
      ['billingStream', 'non_billable'],
      ['billingStream', 'every_14_days'],
      ['billingStream', 'semi_monthly'],
      ['billingStream', 'custom'],
      ['billingStream', 'internal_non_billable'],
      ['billingStream', 'informational'],
      ['billingStream', 'adjustment'],
      ['recordType', 'period_summary'],
      ['recordType', 'time'],
      ['role', 'company_card'],
      ['role', 'company_direct'],
      ['role', 'third_party'],
    ] as const;
    for (const [domain, value] of cases) {
      expect(translateControlledValue('es', domain, value)).not.toBe(value);
      expect(translateControlledValue('pt', domain, value)).not.toBe(value);
    }
  });
});
