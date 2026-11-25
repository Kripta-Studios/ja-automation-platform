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
  'Enter downtime between 0 and 24 hours, for example 1.5.': [
    'Indica la parada entre 0 y 24 horas, por ejemplo 1,5.',
    'Informe a parada entre 0 e 24 horas, por exemplo 1,5.',
  ],
  'Not reimbursable': ['No reembolsable', 'Não reembolsável'],
  'Add the receipt with Edit before sending.': [
    'Añade el ticket con Editar antes de enviarlo.',
    'Adicione o recibo em Editar antes de enviar.',
  ],
  'Sent without a receipt. It can be added when the reviewer sends it back, or with a correction after approval.':
    [
      'Enviado sin ticket. Se puede añadir cuando el revisor lo devuelva o con una corrección después de aprobarlo.',
      'Enviado sem recibo. Ele pode ser adicionado quando o revisor devolver a despesa ou com uma correção após a aprovação.',
    ],
  'To add the receipt, create a corrected draft below.': [
    'Para añadir el ticket, crea un borrador corregido más abajo.',
    'Para adicionar o recibo, crie um rascunho corrigido abaixo.',
  ],
  '1 crew draft sent for approval.': [
    '1 borrador del equipo enviado para aprobación.',
    '1 rascunho da equipe enviado para aprovação.',
  ],
  '{n} crew drafts sent for approval.': [
    '{n} borradores del equipo enviados para aprobación.',
    '{n} rascunhos da equipe enviados para aprovação.',
  ],
  '{n} crew members': ['{n} personas del equipo', '{n} pessoas da equipe'],
  'Saved and sent {hours} h for {who}.': [
    'Guardadas y enviadas {hours} h de {who}.',
    'Salvas e enviadas {hours} h de {who}.',
  ],
  'Saved {hours} h for {who} (draft, not sent yet).': [
    'Guardadas {hours} h de {who} (borrador, aún sin enviar).',
    'Salvas {hours} h de {who} (rascunho, ainda não enviado).',
  ],
  'Open crew drafts ({n})': [
    'Borradores del equipo sin enviar ({n})',
    'Rascunhos da equipe não enviados ({n})',
  ],
  'These hours are saved but not sent for approval yet.': [
    'Estas horas están guardadas pero aún no se enviaron para aprobación.',
    'Estas horas estão salvas, mas ainda não foram enviadas para aprovação.',
  ],
  'Send selected for approval': [
    'Enviar seleccionadas para aprobación',
    'Enviar selecionadas para aprovação',
  ],
  'Crew week': ['Semana del equipo', 'Semana da equipe'],
  'Crew member': ['Persona del equipo', 'Pessoa da equipe'],
  'Draft, not sent yet': ['Borrador, aún sin enviar', 'Rascunho, ainda não enviado'],
  '* draft, not sent yet. Tap a day to log or review its hours.': [
    '* borrador, aún sin enviar. Toca un día para registrar o revisar sus horas.',
    '* rascunho, ainda não enviado. Toque em um dia para registrar ou revisar as horas.',
  ],
  'Discard this crew draft? It cannot be undone.': [
    '¿Descartar este borrador del equipo? No se puede deshacer.',
    'Descartar este rascunho da equipe? Não é possível desfazer.',
  ],
  'Crew draft discarded.': ['Borrador del equipo descartado.', 'Rascunho da equipe descartado.'],
  'Reviewer note': ['Nota del revisor', 'Observação do revisor'],
  'This report is waiting for review. Approve it or send it back in Approvals.': [
    'Este informe espera revisión. Apruébalo o devuélvelo en Aprobaciones.',
    'Este relatório aguarda revisão. Aprove ou devolva em Aprovações.',
  ],
  'PDF and print preview': ['PDF y vista previa de impresión', 'PDF e prévia de impressão'],
  // Round 3 (T58): the owner's crew delegation list folds ended/revoked ones.
  'No active crew delegations for this project.': [
    'No hay delegaciones de equipo activas en este proyecto.',
    'Não há delegações de equipe ativas neste projeto.',
  ],
  '1 ended or revoked delegation': [
    '1 delegación finalizada o revocada',
    '1 delegação encerrada ou revogada',
  ],
  '{n} ended or revoked delegations': [
    '{n} delegaciones finalizadas o revocadas',
    '{n} delegações encerradas ou revogadas',
  ],
};
