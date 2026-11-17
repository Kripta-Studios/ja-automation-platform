/**
 * Copy for the Team → Mailboxes tab, mailbox choices when a person's portal
 * access changes, and server-side pagination of the People directory
 * (2026-11-17 owner round). [en-US, es-ES, pt-BR].
 */
type CopyValue = readonly [string, string, string];

const copy = {
  // Scope + paging (shared by People and Mailboxes)
  showingRange: [
    'Showing {from}–{to} of {total}',
    'Mostrando {from}–{to} de {total}',
    'Mostrando {from}–{to} de {total}',
  ],
  pageOf: ['Page {page} of {pages}', 'Página {page} de {pages}', 'Página {page} de {pages}'],
  previous: ['Previous', 'Anterior', 'Anterior'],
  next: ['Next', 'Siguiente', 'Próxima'],
  peopleScope: ['{count} people', '{count} personas', '{count} pessoas'],
  apply: ['Apply', 'Aplicar', 'Aplicar'],

  // Mailboxes tab
  mailboxesTitle: ['Company mailboxes', 'Buzones de la empresa', 'Caixas de correio da empresa'],
  mailboxesIntro: [
    'Every @j-aautomation.com mailbox and who uses it in the portal.',
    'Todos los buzones @j-aautomation.com y quién los usa en el portal.',
    'Todas as caixas @j-aautomation.com e quem as usa no portal.',
  ],
  mailboxScope: ['{count} mailboxes', '{count} buzones', '{count} caixas de correio'],
  searchMailboxes: ['Search', 'Buscar', 'Pesquisar'],
  searchMailboxesPlaceholder: ['Name or email', 'Nombre o correo', 'Nome ou e-mail'],
  show: ['Show', 'Mostrar', 'Mostrar'],
  filterAll: ['All ({count})', 'Todos ({count})', 'Todas ({count})'],
  filterActive: ['In use ({count})', 'En uso ({count})', 'Em uso ({count})'],
  filterOffboarded: [
    'Left / suspended ({count})',
    'Dados de baja / suspendidos ({count})',
    'Desligados / suspensos ({count})',
  ],
  filterUnlinked: [
    'Not in portal ({count})',
    'Sin acceso al portal ({count})',
    'Sem acesso ao portal ({count})',
  ],
  filterBlocked: [
    'Sign-in blocked ({count})',
    'Acceso bloqueado ({count})',
    'Acesso bloqueado ({count})',
  ],
  filterBlockedUnknown: [
    'Sign-in blocked (mail server unavailable)',
    'Acceso bloqueado (servidor de correo no disponible)',
    'Acesso bloqueado (servidor de e-mail indisponível)',
  ],
  stillSigningIn: [
    '{count} people who left can still sign in to Webmail.',
    '{count} personas dadas de baja aún pueden entrar al Webmail.',
    '{count} pessoas desligadas ainda conseguem entrar no Webmail.',
  ],
  stillSigningInShow: ['Show them', 'Verlas', 'Ver'],
  noMailboxes: [
    'No mailbox matches this search.',
    'Ningún buzón coincide con esta búsqueda.',
    'Nenhuma caixa corresponde a esta pesquisa.',
  ],
  degradedTitle: [
    'Mail server not reachable',
    'Servidor de correo no disponible',
    'Servidor de e-mail indisponível',
  ],
  degradedBody: [
    'Showing the mailboxes linked to portal accounts. Webmail sign-in and mailboxes that are not in the portal can’t be checked right now. Reactivating people and changing roles still work.',
    'Se muestran los buzones vinculados a cuentas del portal. El acceso al Webmail y los buzones sin cuenta en el portal no se pueden comprobar ahora. Reactivar personas y cambiar roles sigue funcionando.',
    'Mostrando as caixas vinculadas a contas do portal. O acesso ao Webmail e as caixas sem conta no portal não podem ser verificados agora. Reativar pessoas e mudar funções continua funcionando.',
  ],
  colMailbox: ['Mailbox', 'Buzón', 'Caixa de correio'],
  colPortal: ['Portal', 'Portal', 'Portal'],
  colWebmail: ['Webmail sign-in', 'Acceso al Webmail', 'Acesso ao Webmail'],
  badgeBlocked: ['Sign-in blocked', 'Acceso bloqueado', 'Acesso bloqueado'],
  badgeStillSignsIn: ['Still signs in', 'Aún puede entrar', 'Ainda consegue entrar'],
  badgeSignsIn: ['Can sign in', 'Puede entrar', 'Pode entrar'],
  badgeUnknown: ['Unknown', 'Desconocido', 'Desconhecido'],
  portalNotLinked: ['Not in portal', 'Sin acceso al portal', 'Sem acesso ao portal'],
  portalRemovedOn: [
    'Portal access removed on {date}',
    'Acceso al portal retirado el {date}',
    'Acesso ao portal removido em {date}',
  ],
  portalRemoved: ['Portal access removed', 'Acceso al portal retirado', 'Acesso ao portal removido'],
  portalSuspended: ['Portal access suspended', 'Acceso al portal suspendido', 'Acesso ao portal suspenso'],

  // Reactivate in portal (one flow: Reactivate as [role] → Save)
  reactivateTitle: ['Reactivate in portal', 'Reactivar en el portal', 'Reativar no portal'],
  reactivateHelp: [
    'This person can’t use the portal now. Choose their role to give access again.',
    'Esta persona no puede usar el portal ahora. Elige su rol para darle acceso de nuevo.',
    'Esta pessoa não pode usar o portal agora. Escolha a função para dar acesso de novo.',
  ],
  reactivateAs: ['Reactivate as', 'Reactivar como', 'Reativar como'],
  alsoUnblock: [
    'Also unblock Webmail sign-in',
    'Desbloquear también el acceso al Webmail',
    'Desbloquear também o acesso ao Webmail',
  ],
  reactivateSave: ['Reactivate', 'Reactivar', 'Reativar'],
  reactivateConfirm: [
    'Reactivate {email} in the portal as {role}?',
    '¿Reactivar {email} en el portal como {role}?',
    'Reativar {email} no portal como {role}?',
  ],
  reactivated: [
    'Portal access restored as {role}.',
    'Acceso al portal restaurado como {role}.',
    'Acesso ao portal restaurado como {role}.',
  ],
  ownerOnly: [
    'Only the Owner can reactivate portal access.',
    'Solo el propietario puede reactivar el acceso al portal.',
    'Somente o proprietário pode reativar o acesso ao portal.',
  ],

  // Webmail sign-in block
  signInTitle: ['Webmail sign-in', 'Acceso al Webmail', 'Acesso ao Webmail'],
  signInBlockedHelp: [
    'Sign-in is blocked. Mail is kept and still arrives.',
    'El acceso está bloqueado. El correo se conserva y sigue llegando.',
    'O acesso está bloqueado. Os e-mails são mantidos e continuam chegando.',
  ],
  signInOpenHelp: [
    'This mailbox can sign in to Webmail.',
    'Este buzón puede entrar al Webmail.',
    'Esta caixa pode entrar no Webmail.',
  ],
  signInOpenLeftHelp: [
    'This person left, but can still sign in to Webmail. Block it to stop sign-in; mail is kept.',
    'Esta persona se fue, pero aún puede entrar al Webmail. Bloquéalo para impedir el acceso; el correo se conserva.',
    'Esta pessoa saiu, mas ainda consegue entrar no Webmail. Bloqueie para impedir o acesso; os e-mails são mantidos.',
  ],
  signInUnknownHelp: [
    'The mail server is not reachable, so sign-in can’t be changed now. Try again later.',
    'El servidor de correo no está disponible; el acceso no se puede cambiar ahora. Inténtalo más tarde.',
    'O servidor de e-mail está indisponível; o acesso não pode ser alterado agora. Tente mais tarde.',
  ],
  blockSignIn: ['Block sign-in (keep mail)', 'Bloquear acceso (conservar correo)', 'Bloquear acesso (manter e-mails)'],
  unblockSignIn: ['Unblock sign-in', 'Desbloquear acceso', 'Desbloquear acesso'],
  blockConfirm: [
    'Block Webmail sign-in for {email}? Mail is kept.',
    '¿Bloquear el acceso al Webmail de {email}? El correo se conserva.',
    'Bloquear o acesso ao Webmail de {email}? Os e-mails são mantidos.',
  ],
  unblockConfirm: [
    'Allow {email} to sign in to Webmail again?',
    '¿Permitir que {email} vuelva a entrar al Webmail?',
    'Permitir que {email} volte a entrar no Webmail?',
  ],
  moreMailboxActions: ['More mailbox actions', 'Más acciones del buzón', 'Mais ações da caixa'],

  // Offboard / suspend choice
  mailboxChoiceLegend: ['Their mailbox {email}', 'Su buzón {email}', 'A caixa de correio {email}'],
  mailboxChoiceBlock: [
    'Block sign-in (keep mail) — recommended',
    'Bloquear acceso (conservar correo) — recomendado',
    'Bloquear acesso (manter e-mails) — recomendado',
  ],
  mailboxChoiceKeep: ['Keep active', 'Mantener activo', 'Manter ativo'],
  mailboxChoiceHelp: [
    'Blocking stops Webmail sign-in. Mail keeps arriving and nothing is deleted. You can unblock it later.',
    'Bloquear impide entrar al Webmail. El correo sigue llegando y no se borra nada. Puedes desbloquearlo después.',
    'Bloquear impede entrar no Webmail. Os e-mails continuam chegando e nada é apagado. Você pode desbloquear depois.',
  ],
  removeAccessTitle: ['Remove access', 'Retirar acceso', 'Remover acesso'],
  removeAccessConfirm: [
    'Remove this person’s access now?',
    '¿Retirar el acceso de esta persona ahora?',
    'Remover o acesso desta pessoa agora?',
  ],

  // Outcomes after a status change
  outcomeBlocked: [
    'Webmail sign-in blocked. Mail is kept.',
    'Acceso al Webmail bloqueado. El correo se conserva.',
    'Acesso ao Webmail bloqueado. Os e-mails são mantidos.',
  ],
  outcomeUnblocked: ['Webmail sign-in unblocked.', 'Acceso al Webmail desbloqueado.', 'Acesso ao Webmail desbloqueado.'],
  outcomeAlreadyBlocked: [
    'Webmail sign-in was already blocked.',
    'El acceso al Webmail ya estaba bloqueado.',
    'O acesso ao Webmail já estava bloqueado.',
  ],
  outcomeAlreadyUnblocked: [
    'Webmail sign-in was already allowed.',
    'El acceso al Webmail ya estaba permitido.',
    'O acesso ao Webmail já estava permitido.',
  ],
  outcomeKept: ['Mailbox left active.', 'Buzón mantenido activo.', 'Caixa de correio mantida ativa.'],
  outcomeUnavailable: [
    'Portal change saved, but the mail server could not be reached, so Webmail sign-in was not changed. Try again in Team → Mailboxes.',
    'Cambio en el portal guardado, pero no se pudo contactar con el servidor de correo y el acceso al Webmail no cambió. Inténtalo de nuevo en Equipo → Buzones.',
    'Alteração no portal salva, mas o servidor de e-mail não respondeu e o acesso ao Webmail não mudou. Tente de novo em Equipe → Caixas de correio.',
  ],
  outcomeRejected: [
    'Portal change saved, but the mail server refused to change Webmail sign-in. Try again in Team → Mailboxes.',
    'Cambio en el portal guardado, pero el servidor de correo rechazó cambiar el acceso al Webmail. Inténtalo de nuevo en Equipo → Buzones.',
    'Alteração no portal salva, mas o servidor de e-mail recusou mudar o acesso ao Webmail. Tente de novo em Equipe → Caixas de correio.',
  ],
  outcomeNotAllowed: [
    'Portal change saved. Only the Owner can change Webmail sign-in.',
    'Cambio en el portal guardado. Solo el propietario puede cambiar el acceso al Webmail.',
    'Alteração no portal salva. Somente o proprietário pode mudar o acesso ao Webmail.',
  ],
  openMailboxes: ['Open Mailboxes', 'Abrir buzones', 'Abrir caixas de correio'],
} satisfies Record<string, CopyValue>;

export type MailboxCopyKey = keyof typeof copy;

export function mailboxCopy(
  locale: string | undefined,
  key: MailboxCopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale?.startsWith('es') ? 1 : locale?.startsWith('pt') ? 2 : 0;
  let value: string = copy[key]?.[index] ?? copy[key]?.[0] ?? key;
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

const outcomeKeys: Record<string, MailboxCopyKey> = {
  blocked: 'outcomeBlocked',
  unblocked: 'outcomeUnblocked',
  already_blocked: 'outcomeAlreadyBlocked',
  already_unblocked: 'outcomeAlreadyUnblocked',
  kept: 'outcomeKept',
  unavailable: 'outcomeUnavailable',
  rejected: 'outcomeRejected',
  not_allowed: 'outcomeNotAllowed',
};

/** Plain sentence for a server `mailboxOutcome`; empty when nothing to say. */
export function mailboxOutcomeText(locale: string | undefined, outcome: unknown): string {
  const key = typeof outcome === 'string' ? outcomeKeys[outcome] : undefined;
  return key ? mailboxCopy(locale, key) : '';
}

/** Outcomes that mean the mailbox step did not happen and needs a retry. */
export function mailboxOutcomeNeedsRetry(outcome: unknown): boolean {
  return outcome === 'unavailable' || outcome === 'rejected';
}
