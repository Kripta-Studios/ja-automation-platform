/**
 * Copy for ending, deleting and re-dating assignments from the project Team
 * tab and the person page (owner request 2026-11-25). [en-US, es-ES, pt-BR].
 */
type CopyValue = readonly [string, string, string];

const copy = {
  lastDay: ['Last day', 'Último día', 'Último dia'],
  lastDayHelp: [
    'Today or an earlier day. They cannot log anything here after it.',
    'Hoy o un día anterior. Después no podrá registrar nada aquí.',
    'Hoje ou um dia anterior. Depois disso não poderá registrar nada aqui.',
  ],
  reasonOptional: ['Reason (optional)', 'Motivo (opcional)', 'Motivo (opcional)'],
  notStarted: [
    'This assignment has not started yet, so it is cancelled.',
    'Esta asignación aún no ha empezado, así que se cancela.',
    'Esta atribuição ainda não começou, então será cancelada.',
  ],
  checking: ['Checking recorded work…', 'Revisando el trabajo registrado…', 'Verificando o trabalho registrado…'],
  nothingLater: [
    'No unapproved hours after this day.',
    'No hay horas sin aprobar después de este día.',
    'Não há horas sem aprovação depois deste dia.',
  ],
  laterOne: [
    '1 unapproved hour entry after this day will be resolved: an unsent draft is discarded, a pending entry is rejected with the reason.',
    'Se resolverá 1 registro de horas sin aprobar posterior a este día: un borrador sin enviar se descarta y uno pendiente se rechaza con el motivo.',
    '1 registro de horas sem aprovação após este dia será resolvido: um rascunho não enviado é descartado e um pendente é rejeitado com o motivo.',
  ],
  laterMany: [
    '{count} unapproved hour entries after this day will be resolved: unsent drafts are discarded, pending entries are rejected with the reason.',
    'Se resolverán {count} registros de horas sin aprobar posteriores a este día: los borradores sin enviar se descartan y los pendientes se rechazan con el motivo.',
    '{count} registros de horas sem aprovação após este dia serão resolvidos: rascunhos não enviados são descartados e os pendentes são rejeitados com o motivo.',
  ],
  blocked: [
    'Approved or invoiced hours, expenses or reports exist after this day. Choose a later last day.',
    'Hay horas, gastos o informes aprobados o facturados después de este día. Elige un último día posterior.',
    'Há horas, despesas ou relatórios aprovados ou faturados depois deste dia. Escolha um último dia posterior.',
  ],
  confirmEnd: ['End assignment', 'Terminar asignación', 'Encerrar atribuição'],
  confirmEndCount: ['End {count} assignments', 'Terminar {count} asignaciones', 'Encerrar {count} atribuições'],
  deleteMistake: ['Delete (added by mistake)', 'Eliminar (añadido por error)', 'Excluir (adicionado por engano)'],
  deleteMistakeHelp: [
    'Nothing was recorded on this assignment. Delete it if it was added by mistake; the change stays in the history log.',
    'No hay nada registrado en esta asignación. Elimínala si se añadió por error; el cambio queda en el historial.',
    'Nada foi registrado nesta atribuição. Exclua se foi adicionada por engano; a alteração fica no histórico.',
  ],
  hasRecords: [
    'Hours, expenses or reports are recorded on this assignment, so it cannot be deleted. End it instead.',
    'Hay horas, gastos o informes en esta asignación, así que no se puede eliminar. Termínala.',
    'Há horas, despesas ou relatórios nesta atribuição, por isso não pode ser excluída. Encerre-a.',
  ],
  mistakeReason: ['Added by mistake', 'Añadido por error', 'Adicionado por engano'],
  deleted: ['{name}: assignment deleted', '{name}: asignación eliminada', '{name}: atribuição excluída'],
  ended: ['{name}: assignment ended', '{name}: asignación terminada', '{name}: atribuição encerrada'],
  endedResolved: [
    '{name}: assignment ended. Drafts discarded: {discarded}. Pending entries rejected: {rejected}.',
    '{name}: asignación terminada. Borradores descartados: {discarded}. Registros pendientes rechazados: {rejected}.',
    '{name}: atribuição encerrada. Rascunhos descartados: {discarded}. Registros pendentes rejeitados: {rejected}.',
  ],
  // bulk
  select: ['Select {name}', 'Seleccionar a {name}', 'Selecionar {name}'],
  selectAll: ['Select all', 'Seleccionar todo', 'Selecionar tudo'],
  removeSelected: ['Remove selected ({count})', 'Quitar seleccionados ({count})', 'Remover selecionados ({count})'],
  bulkTitle: ['End {count} assignments', 'Terminar {count} asignaciones', 'Encerrar {count} atribuições'],
  bulkHelp: [
    'The same last day and reason are used for everyone. They keep their recorded hours and expenses.',
    'Se usa el mismo último día y motivo para todos. Conservan sus horas y gastos registrados.',
    'O mesmo último dia e motivo valem para todos. As horas e despesas registradas ficam.',
  ],
  bulkDone: ['{done} of {total} removed.', '{done} de {total} quitados.', '{done} de {total} removidos.'],
  bulkFailed: ['Not removed: {list}', 'No quitados: {list}', 'Não removidos: {list}'],
  bulkSupplierSkipped: [
    'Supplier staff can only be ended by the owner.',
    'Solo el propietario puede terminar al personal del proveedor.',
    'Somente o proprietário pode encerrar a equipe do fornecedor.',
  ],
  // dates
  changeDates: ['Change dates', 'Cambiar fechas', 'Alterar datas'],
  changeDatesTitle: ['Dates for {name}', 'Fechas de {name}', 'Datas de {name}'],
  firstDay: ['First day', 'Primer día', 'Primeiro dia'],
  lastDayOptional: ['Last day (empty = open)', 'Último día (vacío = abierta)', 'Último dia (vazio = aberta)'],
  reopens: [
    'This re-opens the assignment: they can log hours again.',
    'Esto vuelve a abrir la asignación: podrá registrar horas de nuevo.',
    'Isto reabre a atribuição: poderá registrar horas de novo.',
  ],
  outsideOne: [
    '1 unapproved hour entry falls outside the new dates and will be resolved (draft discarded, pending rejected).',
    '1 registro de horas sin aprobar queda fuera de las nuevas fechas y se resolverá (borrador descartado, pendiente rechazado).',
    '1 registro de horas sem aprovação fica fora das novas datas e será resolvido (rascunho descartado, pendente rejeitado).',
  ],
  outsideMany: [
    '{count} unapproved hour entries fall outside the new dates and will be resolved (drafts discarded, pending rejected).',
    '{count} registros de horas sin aprobar quedan fuera de las nuevas fechas y se resolverán (borradores descartados, pendientes rechazados).',
    '{count} registros de horas sem aprovação ficam fora das novas datas e serão resolvidos (rascunhos descartados, pendentes rejeitados).',
  ],
  outsideBlocked: [
    'Approved or invoiced hours, expenses or reports fall outside these dates. They are never changed, so keep dates that cover them.',
    'Hay horas, gastos o informes aprobados o facturados fuera de estas fechas. No se modifican nunca, así que mantén fechas que los cubran.',
    'Há horas, despesas ou relatórios aprovados ou faturados fora destas datas. Eles nunca são alterados, então mantenha datas que os cubram.',
  ],
  overlap: [
    'Overlaps their other assignment on this project ({starts} → {ends}).',
    'Se solapa con su otra asignación en este proyecto ({starts} → {ends}).',
    'Sobrepõe a outra atribuição no mesmo projeto ({starts} → {ends}).',
  ],
  overlapFix: [
    'Also move the other one to {starts} → {ends}',
    'Mover también la otra a {starts} → {ends}',
    'Mover também a outra para {starts} → {ends}',
  ],
  open: ['open', 'abierta', 'aberta'],
  saveDates: ['Save dates', 'Guardar fechas', 'Salvar datas'],
  datesSaved: ['{name}: dates saved', '{name}: fechas guardadas', '{name}: datas salvas'],
  cancel: ['Cancel', 'Cancelar', 'Cancelar'],
  working: ['Saving…', 'Guardando…', 'Salvando…'],
  upcoming: ['Upcoming', 'Próximas', 'Próximas'],
  current: ['Current', 'Actuales', 'Atuais'],
  past: ['Ended', 'Terminadas', 'Encerradas'],
  reopen: ['Change dates / re-open', 'Cambiar fechas / reabrir', 'Alterar datas / reabrir'],
} satisfies Record<string, CopyValue>;

export type AssignmentEditCopyKey = keyof typeof copy;

export function assignmentText(
  locale: string | undefined,
  key: AssignmentEditCopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale?.startsWith('es') ? 1 : locale?.startsWith('pt') ? 2 : 0;
  let value: string = copy[key]?.[index] ?? copy[key]?.[0] ?? key;
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
