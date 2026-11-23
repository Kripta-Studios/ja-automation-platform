/**
 * ES / PT-BR values for literals added by the 2026-11-22 role audit fixes
 * (group G2: time capture, corrections, expenses, approvals, crew, reports).
 * Kept apart from the large override table so each fix group adds keys
 * without touching shared lines.
 */
export const auditG2LiteralOverrides: Record<string, readonly [string, string]> = {
  'End time must differ from the start time, with a break shorter than the shift.': [
    'La hora de fin debe ser distinta de la de inicio y la pausa más corta que el turno.',
    'O horário de término deve ser diferente do início e o intervalo menor que o turno.',
  ],
  "Use the project's local time. An end time earlier than the start ends the next day.": [
    'Usa la hora local del proyecto. Una hora de fin anterior al inicio termina al día siguiente.',
    'Use o horário local do projeto. Um término antes do início termina no dia seguinte.',
  ],
  'Ends the next day': ['Termina al día siguiente', 'Termina no dia seguinte'],
};
