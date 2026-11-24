/**
 * Human labels for audit events (QA round 2, A3). The audit register stores
 * stable machine codes (`project.update`, `time.finance_review`, …) from the
 * reviewed audit_action_registry; people read "Project updated" /
 * "Actualización de proyecto" / "Atualização de projeto". The raw code stays
 * visible in the event detail for auditors.
 *
 * Tuples are en-US, es-ES, pt-BR. ES/PT use the "<action> de <thing>"
 * nominal form so no grammatical gender agreement is needed.
 */
import type { PortalLocale } from '../portal-i18n';

type Tuple = readonly [string, string, string];

const localeIndex = (locale: PortalLocale): 0 | 1 | 2 =>
  locale === 'es' ? 1 : locale === 'pt' ? 2 : 0;

/** Record kinds, keyed by entity_type and by action prefix. */
const NOUNS: Record<string, Tuple> = {
  accounting_pack: ['Accounting pack', 'paquete contable', 'pacote contábil'],
  accounting_pack_run: ['Accounting pack', 'paquete contable', 'pacote contábil'],
  accounting_pack_legacy_run_bridge: ['Accounting pack link', 'enlace de paquete contable', 'vínculo de pacote contábil'],
  accounting_pack_revision_snapshot: ['Accounting pack version', 'versión de paquete contable', 'versão de pacote contábil'],
  artifact: ['File', 'archivo', 'arquivo'],
  assignment: ['Project member', 'miembro del proyecto', 'membro do projeto'],
  assignment_expense_policy: ['Expense rule', 'regla de gastos', 'regra de despesas'],
  assignment_rate_override: ['Personal rate', 'tarifa personal', 'tarifa pessoal'],
  billing_period: ['Billing period', 'periodo de facturación', 'período de faturamento'],
  billing_rule: ['Billing rule', 'regla de facturación', 'regra de faturamento'],
  canonical_legal_entity: ['Issuing company', 'empresa emisora', 'empresa emissora'],
  client: ['Client', 'cliente', 'cliente'],
  client_contact: ['Client contact', 'contacto del cliente', 'contato do cliente'],
  client_labor_rate: ['Client rate', 'tarifa del cliente', 'tarifa do cliente'],
  client_rate: ['Client rate', 'tarifa del cliente', 'tarifa do cliente'],
  compensation: ['Worker pay', 'pago al trabajador', 'pagamento ao trabalhador'],
  'compensation.payment': ['Worker payment', 'pago al trabajador', 'pagamento ao trabalhador'],
  compensation_rule: ['Pay rate', 'tarifa de pago', 'tarifa de pagamento'],
  compensation_settlement: ['Pay settlement', 'liquidación de pago', 'acerto de pagamento'],
  correction: ['Correction', 'corrección', 'correção'],
  crew: ['Crew access', 'acceso de cuadrilla', 'acesso de equipe'],
  crew_leader_grant: ['Crew access', 'acceso de cuadrilla', 'acesso de equipe'],
  crew_shared_expense_allocation_group: ['Shared receipt', 'recibo compartido', 'recibo compartilhado'],
  currency_conversion: ['Currency conversion', 'conversión de moneda', 'conversão de moeda'],
  customer_conformity: ['Client acceptance', 'conformidad del cliente', 'aceite do cliente'],
  customer_conformity_evidence_attachment: ['Acceptance evidence', 'evidencia de conformidad', 'evidência de aceite'],
  customer_conformity_invalidation: ['Client acceptance', 'conformidad del cliente', 'aceite do cliente'],
  daily_report: ['Daily report', 'informe diario', 'relatório diário'],
  'report.daily': ['Daily report', 'informe diario', 'relatório diário'],
  'report.technical': ['Technical report', 'informe técnico', 'relatório técnico'],
  report: ['Report', 'informe', 'relatório'],
  digital_work: ['Digital work', 'trabajo digital', 'trabalho digital'],
  digital_work_case: ['Digital work case', 'caso de trabajo digital', 'caso de trabalho digital'],
  digital_work_case_review: ['Digital work review', 'revisión de trabajo digital', 'revisão de trabalho digital'],
  digital_work_case_revision: ['Digital work version', 'versión de trabajo digital', 'versão de trabalho digital'],
  digital_work_item: ['Digital work item', 'elemento de trabajo digital', 'item de trabalho digital'],
  document: ['Document', 'documento', 'documento'],
  exchange_rate: ['Exchange rate', 'tipo de cambio', 'taxa de câmbio'],
  expense: ['Expense', 'gasto', 'despesa'],
  internal_cost: ['Internal cost', 'coste interno', 'custo interno'],
  internal_cost_rule: ['Internal cost', 'coste interno', 'custo interno'],
  invitation: ['Invitation', 'invitación', 'convite'],
  invoice: ['Invoice', 'factura', 'fatura'],
  'invoice.adjustment': ['Invoice adjustment', 'ajuste de factura', 'ajuste de fatura'],
  invoice_line_override: ['Invoice line', 'línea de factura', 'linha de fatura'],
  invoice_number_policy: ['Invoice numbering', 'numeración de facturas', 'numeração de faturas'],
  invoice_policy: ['Invoice numbering', 'numeración de facturas', 'numeração de faturas'],
  issuer_document_settings: ['Issuer document settings', 'ajustes de documentos del emisor', 'configurações de documentos do emissor'],
  job_run: ['Background job', 'tarea automática', 'tarefa automática'],
  service_job: ['Background job', 'tarea automática', 'tarefa automática'],
  legal_entity: ['Issuing company', 'empresa emisora', 'empresa emissora'],
  legal_entity_revision: ['Issuing company version', 'versión de empresa emisora', 'versão de empresa emissora'],
  legal_entity_revision_bridge: ['Issuing company link', 'enlace de empresa emisora', 'vínculo de empresa emissora'],
  lifecycle: ['Status', 'estado', 'status'],
  mail_identity: ['Mailbox', 'buzón', 'caixa de e-mail'],
  mailbox: ['Mailbox', 'buzón', 'caixa de e-mail'],
  milestone: ['Milestone', 'hito', 'marco'],
  offline: ['Offline data', 'datos sin conexión', 'dados offline'],
  'owner.catalog': ['Catalog item', 'elemento del catálogo', 'item do catálogo'],
  'owner.record': ['Record', 'registro', 'registro'],
  passkey: ['Passkey', 'llave de acceso', 'chave de acesso'],
  payment: ['Payment', 'cobro', 'recebimento'],
  period_followup: ['Period follow-up', 'seguimiento del periodo', 'acompanhamento do período'],
  period_report: ['Period report', 'informe del periodo', 'relatório do período'],
  period_report_followup_event: ['Period follow-up', 'seguimiento del periodo', 'acompanhamento do período'],
  planning: ['Planning', 'planificación', 'planejamento'],
  planning_assignment: ['Planning', 'planificación', 'planejamento'],
  project: ['Project', 'proyecto', 'projeto'],
  project_billing_setup: ['Project billing', 'facturación del proyecto', 'faturamento do projeto'],
  project_billing_setup_revision: ['Project billing', 'facturación del proyecto', 'faturamento do projeto'],
  project_billing_setup_template: ['Billing template', 'plantilla de facturación', 'modelo de faturamento'],
  project_billing_template: ['Billing template', 'plantilla de facturación', 'modelo de faturamento'],
  project_closeout: ['Project closeout', 'cierre del proyecto', 'encerramento do projeto'],
  project_closeout_artifact: ['Closeout file', 'archivo de cierre', 'arquivo de encerramento'],
  project_closeout_revision: ['Closeout version', 'versión de cierre', 'versão de encerramento'],
  project_commercial_policy: ['Commercial rule', 'regla comercial', 'regra comercial'],
  project_legal_entity: ['Issuing company', 'empresa emisora', 'empresa emissora'],
  project_legal_entity_assignment: ['Issuing company', 'empresa emisora', 'empresa emissora'],
  project_legal_entity_assignment_replacement: ['Issuing company', 'empresa emisora', 'empresa emissora'],
  project_member: ['Project member', 'miembro del proyecto', 'membro do projeto'],
  project_milestone: ['Milestone', 'hito', 'marco'],
  receipt: ['Receipt', 'recibo', 'recibo'],
  record: ['Draft', 'borrador', 'rascunho'],
  schedule: ['Schedule', 'calendario', 'agenda'],
  security: ['Sign-in security', 'seguridad de acceso', 'segurança de acesso'],
  'security.mfa': ['Two-step sign-in', 'verificación en dos pasos', 'verificação em duas etapas'],
  'security.passkey': ['Passkey', 'llave de acceso', 'chave de acesso'],
  skill: ['Skill', 'habilidad', 'habilidade'],
  supplier: ['Supplier', 'proveedor', 'fornecedor'],
  'supplier.assignment': ['Supplier assignment', 'asignación de proveedor', 'alocação de fornecedor'],
  'supplier.profile': ['Supplier profile', 'perfil de proveedor', 'perfil de fornecedor'],
  'supplier.technician': ['Supplier technician', 'técnico del proveedor', 'técnico do fornecedor'],
  supplier_project_grant: ['Supplier access', 'acceso de proveedor', 'acesso de fornecedor'],
  supplier_user_profile: ['Supplier profile', 'perfil de proveedor', 'perfil de fornecedor'],
  tax_profile: ['Tax profile', 'perfil fiscal', 'perfil fiscal'],
  technical_change: ['Technical change', 'cambio técnico', 'mudança técnica'],
  technical_report: ['Technical report', 'informe técnico', 'relatório técnico'],
  time: ['Hours', 'horas', 'horas'],
  time_entry: ['Hours', 'horas', 'horas'],
  upload: ['Upload', 'carga de archivo', 'envio de arquivo'],
  upload_reservation: ['Upload', 'carga de archivo', 'envio de arquivo'],
  user: ['User', 'usuario', 'usuário'],
  'user.status': ['User status', 'estado del usuario', 'status do usuário'],
  worker: ['Worker', 'trabajador', 'trabalhador'],
  worker_availability: ['Availability', 'disponibilidad', 'disponibilidade'],
  worker_skill: ['Worker skill', 'habilidad del trabajador', 'habilidade do trabalhador'],
};

/** Verbs: en-US past participle, es-ES / pt-BR action noun. */
const VERBS: Record<string, Tuple> = {
  access: ['opened', 'Acceso a', 'Acesso a'],
  accept: ['accepted', 'Aceptación de', 'Aceitação de'],
  add: ['added', 'Alta de', 'Inclusão de'],
  allocate_shared_receipt: ['split across crew', 'Reparto de', 'Rateio de'],
  approve: ['approved', 'Aprobación de', 'Aprovação de'],
  approve_on_behalf: ['approved on behalf of the client', 'Aprobación en nombre del cliente de', 'Aprovação em nome do cliente de'],
  approved: ['approved', 'Aprobación de', 'Aprovação de'],
  archive: ['archived', 'Archivo de', 'Arquivamento de'],
  assign: ['assigned', 'Asignación de', 'Atribuição de'],
  attachment_link: ['attachment linked', 'Adjunto vinculado a', 'Anexo vinculado a'],
  attachment_supersede: ['attachment replaced', 'Adjunto sustituido en', 'Anexo substituído em'],
  bootstrap: ['set up', 'Configuración inicial de', 'Configuração inicial de'],
  cancel: ['cancelled', 'Cancelación de', 'Cancelamento de'],
  case_open: ['case opened', 'Apertura de caso de', 'Abertura de caso de'],
  case_reconcile: ['case reconciled', 'Conciliación de caso de', 'Conciliação de caso de'],
  case_review: ['case reviewed', 'Revisión de caso de', 'Revisão de caso de'],
  claim: ['picked up', 'Inicio de', 'Início de'],
  classify: ['classified for billing', 'Clasificación para facturar de', 'Classificação para faturar de'],
  cleanup: ['cleaned up', 'Limpieza de', 'Limpeza de'],
  client_publication_confirm: ['published to the client', 'Publicación al cliente de', 'Publicação ao cliente de'],
  close: ['closed', 'Cierre de', 'Fechamento de'],
  commercial_fallback_update: ['default commercial rules changed', 'Cambio de reglas comerciales por defecto de', 'Alteração de regras comerciais padrão de'],
  commercial_rules_update: ['commercial rules changed', 'Cambio de reglas comerciales de', 'Alteração de regras comerciais de'],
  commit: ['saved', 'Guardado de', 'Gravação de'],
  configure: ['configured', 'Configuración de', 'Configuração de'],
  confirm: ['confirmed', 'Confirmación de', 'Confirmação de'],
  copy_layout: ['copied from another week', 'Copia de semana de', 'Cópia de semana de'],
  correct_from_invoice: ['corrected from an invoice', 'Corrección desde factura de', 'Correção a partir da fatura de'],
  create: ['created', 'Creación de', 'Criação de'],
  create_offline: ['created offline', 'Creación sin conexión de', 'Criação offline de'],
  credit_note_overdue_repair: ['credit note repaired', 'Reparación de nota de crédito de', 'Reparo de nota de crédito de'],
  deactivate: ['deactivated', 'Desactivación de', 'Desativação de'],
  delete: ['deleted', 'Eliminación de', 'Exclusão de'],
  delete_draft: ['draft deleted', 'Eliminación de borrador de', 'Exclusão de rascunho de'],
  destroy: ['removed', 'Eliminación de', 'Remoção de'],
  disable: ['turned off', 'Desactivación de', 'Desativação de'],
  download: ['downloaded', 'Descarga de', 'Download de'],
  draft_create: ['draft created', 'Creación de borrador de', 'Criação de rascunho de'],
  draft_details_update: ['draft details changed', 'Cambio en borrador de', 'Alteração no rascunho de'],
  draft_prepare: ['draft prepared', 'Preparación de borrador de', 'Preparação de rascunho de'],
  enable: ['turned on', 'Activación de', 'Ativação de'],
  evidence_attach: ['evidence attached', 'Evidencia adjunta a', 'Evidência anexada a'],
  expense_policy_create: ['expense rule set', 'Regla de gastos para', 'Regra de despesas para'],
  expire: ['expired', 'Vencimiento de', 'Expiração de'],
  export: ['exported', 'Exportación de', 'Exportação de'],
  export_failed: ['export failed', 'Fallo de exportación de', 'Falha de exportação de'],
  export_retry: ['export retried', 'Reintento de exportación de', 'Nova tentativa de exportação de'],
  fail: ['failed', 'Fallo de', 'Falha de'],
  finalize: ['finalized', 'Finalización de', 'Finalização de'],
  finance_approve: ['approved by finance', 'Aprobación financiera de', 'Aprovação financeira de'],
  finance_review: ['reviewed by finance', 'Revisión financiera de', 'Revisão financeira de'],
  grant: ['access given', 'Concesión de', 'Concessão de'],
  invalidate: ['invalidated', 'Invalidación de', 'Invalidação de'],
  issue: ['issued', 'Emisión de', 'Emissão de'],
  item_save: ['item saved', 'Guardado de elemento de', 'Gravação de item de'],
  item_update: ['item changed', 'Cambio de elemento de', 'Alteração de item de'],
  login: ['used to sign in', 'Inicio de sesión con', 'Login com'],
  needs_changes: ['sent back for changes', 'Devolución para cambios de', 'Devolução para ajustes de'],
  password_reset: ['password reset', 'Restablecimiento de contraseña de', 'Redefinição de senha de'],
  password_update: ['password changed', 'Cambio de contraseña de', 'Alteração de senha de'],
  pdf_ready: ['PDF ready', 'PDF listo de', 'PDF pronto de'],
  planning_update: ['payment plan changed', 'Cambio de plan de pago de', 'Alteração de plano de pagamento de'],
  po_update: ['PO changed', 'Cambio de OC de', 'Alteração de PO de'],
  portal_offboard: ['removed from the portal', 'Baja en el portal de', 'Desligamento do portal de'],
  prepare: ['prepared', 'Preparación de', 'Preparação de'],
  provision: ['provisioned', 'Alta de', 'Provisionamento de'],
  reactivate: ['reactivated', 'Reactivación de', 'Reativação de'],
  record: ['recorded', 'Registro de', 'Registro de'],
  recovery_login: ['recovery code used', 'Uso de código de recuperación en', 'Uso de código de recuperação em'],
  refresh: ['refreshed', 'Actualización automática de', 'Atualização automática de'],
  register: ['registered', 'Registro de', 'Cadastro de'],
  reimburse: ['reimbursed', 'Reembolso de', 'Reembolso de'],
  rejected: ['rejected', 'Rechazo de', 'Rejeição de'],
  reopen: ['reopened', 'Reapertura de', 'Reabertura de'],
  replace_same_day: ['replaced (same day)', 'Sustitución en el mismo día de', 'Substituição no mesmo dia de'],
  replace_unused: ['replaced', 'Sustitución de', 'Substituição de'],
  replacement_link: ['replacement linked', 'Vínculo de sustitución de', 'Vínculo de substituição de'],
  report_deleted: ['deleted', 'Eliminación de', 'Exclusão de'],
  report_modified: ['changed', 'Modificación de', 'Modificação de'],
  reserve: ['started', 'Inicio de', 'Início de'],
  restore: ['restored', 'Restauración de', 'Restauração de'],
  reverse: ['reversed', 'Reversión de', 'Estorno de'],
  revoke: ['access removed', 'Retirada de', 'Revogação de'],
  role_change: ['role changed', 'Cambio de rol de', 'Alteração de função de'],
  save: ['saved', 'Guardado de', 'Gravação de'],
  scan: ['scanned', 'Escaneo de', 'Verificação de'],
  send: ['sent', 'Envío de', 'Envio de'],
  sessions_revoke: ['signed out everywhere', 'Cierre de sesiones de', 'Encerramento de sessões de'],
  set: ['set', 'Configuración de', 'Definição de'],
  settle: ['settled', 'Liquidación de', 'Acerto de'],
  setup_started: ['setup started', 'Inicio de configuración de', 'Início de configuração de'],
  sign_in_block: ['sign-in blocked', 'Bloqueo de acceso de', 'Bloqueio de acesso de'],
  sign_in_unblock: ['sign-in unblocked', 'Desbloqueo de acceso de', 'Desbloqueio de acesso de'],
  start: ['started', 'Inicio de', 'Início de'],
  status: ['status changed', 'Cambio de estado de', 'Alteração de status de'],
  submit: ['submitted', 'Envío de', 'Envio de'],
  succeed: ['finished', 'Finalización de', 'Conclusão de'],
  supersede: ['replaced by a newer version', 'Sustitución por nueva versión de', 'Substituição por nova versão de'],
  sync: ['synced', 'Sincronización de', 'Sincronização de'],
  tax_profile_change: ['tax profile changed', 'Cambio de perfil fiscal de', 'Alteração de perfil fiscal de'],
  transition: ['changed', 'Cambio de', 'Alteração de'],
  update: ['updated', 'Actualización de', 'Atualização de'],
  upload_cancelled: ['upload cancelled', 'Carga cancelada de', 'Envio cancelado de'],
  upload_cleanup: ['upload cleaned up', 'Limpieza de carga de', 'Limpeza de envio de'],
  upload_finalized: ['uploaded', 'Carga de', 'Envio de'],
  void: ['voided', 'Anulación de', 'Anulação de'],
  withdraw: ['withdrawn', 'Retirada de', 'Retirada de'],
};

/** Whole-action phrases that read better than the composed form. */
const SPECIAL: Record<string, Tuple> = {
  'lifecycle.transition': ['Status changed', 'Cambio de estado', 'Alteração de status'],
  'security.mfa.login': ['Signed in with two-step code', 'Inicio de sesión con código de dos pasos', 'Login com código de duas etapas'],
  'security.mfa.login (totp)': ['Signed in with two-step code', 'Inicio de sesión con código de dos pasos', 'Login com código de duas etapas'],
  'security.passkey.login': ['Signed in with passkey', 'Inicio de sesión con llave de acceso', 'Login com chave de acesso'],
  'record.delete_draft': ['Draft deleted', 'Eliminación de borrador', 'Exclusão de rascunho'],
  'owner.record.delete': ['Record deleted', 'Eliminación de registro', 'Exclusão de registro'],
  'owner.record.reopen': ['Record reopened', 'Reapertura de registro', 'Reabertura de registro'],
  'offline.sync': ['Offline changes synced', 'Sincronización de cambios sin conexión', 'Sincronização de alterações offline'],
  'supplier.grant': ['Supplier given project access', 'Acceso concedido a proveedor', 'Acesso concedido ao fornecedor'],
  'supplier.revoke': ['Supplier project access removed', 'Acceso retirado a proveedor', 'Acesso retirado do fornecedor'],
  'crew.grant': ['Crew access given', 'Acceso de cuadrilla concedido', 'Acesso de equipe concedido'],
  'crew.revoke': ['Crew access removed', 'Acceso de cuadrilla retirado', 'Acesso de equipe retirado'],
  'time.create': ['Hours recorded', 'Registro de horas', 'Registro de horas'],
  'expense.create': ['Expense recorded', 'Registro de gasto', 'Registro de despesa'],
  'user.bootstrap': ['First administrator set up', 'Configuración del primer administrador', 'Configuração do primeiro administrador'],
  'user.create': ['Person added', 'Alta de persona', 'Cadastro de pessoa'],
  'user.password_reset': ['Portal password reset by the owner', 'Restablecimiento de contraseña del portal por el propietario', 'Redefinição de senha do portal pelo proprietário'],
  'user.password_change': ['Portal password changed', 'Cambio de contraseña del portal', 'Alteração de senha do portal'],
};

/**
 * T17: the reviewed audit registry is closed (a new stored code needs a
 * migration), and two stored codes describe more than their name says:
 * `supplier.technician.add` is also written when the owner adds an internal
 * person (no supplier profile), and a portal password reset/change is written
 * as `mailbox.sessions_revoke` with a `reason`. Read the event by what the
 * details say happened; the stored code stays visible in Technical details.
 */
export function auditDisplayAction(action: string, details: unknown): string {
  let parsed: unknown = details;
  if (typeof details === 'string') {
    try {
      parsed = JSON.parse(details);
    } catch {
      return action;
    }
  }
  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  if (action === 'supplier.technician.add' && 'supplierProfile' in record && !record.supplierProfile)
    return 'user.create';
  if (action === 'mailbox.sessions_revoke') {
    if (record.reason === 'owner_password_reset') return 'user.password_reset';
    if (record.reason === 'self_service_password_change') return 'user.password_change';
  }
  return action;
}

function lowerFirst(value: string): string {
  return value ? value.charAt(0).toLocaleLowerCase() + value.slice(1) : value;
}

/** Split `a.b.c` into the longest known noun prefix and the verb remainder. */
function split(action: string): { noun?: Tuple; verb?: Tuple } {
  const parts = action.split('.');
  for (let cut = parts.length - 1; cut >= 1; cut -= 1) {
    const noun = NOUNS[parts.slice(0, cut).join('.')];
    const verb = VERBS[parts.slice(cut).join('_')];
    if (noun && verb) return { noun, verb };
  }
  return {};
}

/** Human label for an audit action code; unknown codes fall back to readable words. */
export function auditActionText(action: string, locale: PortalLocale): string {
  const index = localeIndex(locale);
  const special = SPECIAL[action];
  if (special) return special[index];
  const { noun, verb } = split(action);
  if (noun && verb) {
    if (index === 0) return `${noun[0]} ${verb[0]}`;
    return `${verb[index]} ${lowerFirst(noun[index])}`;
  }
  return action.replaceAll('_', ' ').replaceAll('.', ' · ');
}

/** Human label for an audit entity type (record kind). */
export function auditEntityTypeText(type: string, locale: PortalLocale): string {
  const noun = NOUNS[type];
  if (!noun) return type.replaceAll('_', ' ');
  const text = noun[localeIndex(locale)];
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
