export type NotificationLocale = 'en' | 'es' | 'pt';

export type NotificationCopy = Readonly<{
  subject: string;
  body: string;
}>;

type CopyPair = Readonly<{
  subject: string;
  body: string;
}>;

const copy: Readonly<Record<string, Readonly<Record<NotificationLocale, CopyPair>>>> = {
  missing_time: {
    en: {
      subject: 'Missing time entry reminder',
      body: 'Submit time for this project/date. Sign in to the J&A Automation portal to review the current record.',
    },
    es: {
      subject: 'Recordatorio de horas pendientes',
      body: 'Registra las horas de este proyecto/fecha. Entra en el portal de J&A Automation para revisar el registro actual.',
    },
    pt: {
      subject: 'Lembrete de registo de horas em falta',
      body: 'Registe as horas deste projeto/data. Entre no portal J&A Automation para rever o registo atual.',
    },
  },
  approval_requested_time: {
    en: {
      subject: 'Time approval requested',
      body: 'Review the submitted time record in the J&A Automation portal.',
    },
    es: {
      subject: 'Solicitud de aprobación de horas',
      body: 'Revisa el registro de horas enviado en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Pedido de aprovação de horas',
      body: 'Reveja o registo de horas enviado no portal J&A Automation.',
    },
  },
  approval_returned_time: {
    en: {
      subject: 'Time record returned',
      body: 'Review the reason and submit the corrected time record in the J&A Automation portal.',
    },
    es: {
      subject: 'Registro de horas devuelto',
      body: 'Revisa el motivo y envía el registro de horas corregido en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Registo de horas devolvido',
      body: 'Reveja o motivo e envie o registo de horas corrigido no portal J&A Automation.',
    },
  },
  approval_requested_expense: {
    en: {
      subject: 'Expense approval requested',
      body: 'Review the submitted expense record in the J&A Automation portal.',
    },
    es: {
      subject: 'Solicitud de aprobación de gasto',
      body: 'Revisa el gasto enviado en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Pedido de aprovação de despesa',
      body: 'Reveja a despesa enviada no portal J&A Automation.',
    },
  },
  approval_returned_expense: {
    en: {
      subject: 'Expense record returned',
      body: 'Review the reason and submit the corrected expense record in the J&A Automation portal.',
    },
    es: {
      subject: 'Gasto devuelto',
      body: 'Revisa el motivo y envía el gasto corregido en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Despesa devolvida',
      body: 'Reveja o motivo e envie a despesa corrigida no portal J&A Automation.',
    },
  },
  approval_requested_daily: {
    en: {
      subject: 'Daily report approval requested',
      body: 'Review the submitted daily report in the J&A Automation portal.',
    },
    es: {
      subject: 'Solicitud de aprobación de informe diario',
      body: 'Revisa el informe diario enviado en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Pedido de aprovação de relatório diário',
      body: 'Reveja o relatório diário enviado no portal J&A Automation.',
    },
  },
  approval_returned_daily: {
    en: {
      subject: 'Daily report returned',
      body: 'Review the reason and submit the corrected daily report in the J&A Automation portal.',
    },
    es: {
      subject: 'Informe diario devuelto',
      body: 'Revisa el motivo y envía el informe diario corregido en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Relatório diário devolvido',
      body: 'Reveja o motivo e envie o relatório diário corrigido no portal J&A Automation.',
    },
  },
  approval_requested_technical: {
    en: {
      subject: 'Technical report approval requested',
      body: 'Review the submitted technical report in the J&A Automation portal.',
    },
    es: {
      subject: 'Solicitud de aprobación de informe técnico',
      body: 'Revisa el informe técnico enviado en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Pedido de aprovação de relatório técnico',
      body: 'Reveja o relatório técnico enviado no portal J&A Automation.',
    },
  },
  approval_returned_technical: {
    en: {
      subject: 'Technical report returned',
      body: 'Review the reason and submit the corrected technical report in the J&A Automation portal.',
    },
    es: {
      subject: 'Informe técnico devuelto',
      body: 'Revisa el motivo y envía el informe técnico corregido en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Relatório técnico devolvido',
      body: 'Reveja o motivo e envie o relatório técnico corrigido no portal J&A Automation.',
    },
  },
  period_ready: {
    en: {
      subject: 'Billing period ready',
      body: 'A billing period is ready for review in the J&A Automation portal.',
    },
    es: {
      subject: 'Periodo de facturación listo',
      body: 'Un periodo de facturación está listo para revisar en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Período de faturação pronto',
      body: 'Um período de faturação está pronto para revisão no portal J&A Automation.',
    },
  },
  period_blocked: {
    en: {
      subject: 'Billing period blocked',
      body: 'A billing period is blocked and needs review in the J&A Automation portal.',
    },
    es: {
      subject: 'Periodo de facturación bloqueado',
      body: 'Un periodo de facturación está bloqueado y necesita revisión en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Período de faturação bloqueado',
      body: 'Um período de faturação está bloqueado e precisa de revisão no portal J&A Automation.',
    },
  },
  signature_outstanding: {
    en: {
      subject: 'Customer signature outstanding',
      body: 'Customer sign-off is still outstanding for a period report. Review it in the J&A Automation portal.',
    },
    es: {
      subject: 'Firma del cliente pendiente',
      body: 'La aprobación del cliente sigue pendiente para un informe de periodo. Revísalo en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Assinatura do cliente pendente',
      body: 'A aprovação do cliente continua pendente para um relatório de período. Reveja-o no portal J&A Automation.',
    },
  },
  invoice_overdue: {
    en: {
      subject: 'Invoice overdue',
      body: 'An invoice is overdue. Review the current record in the J&A Automation portal.',
    },
    es: {
      subject: 'Factura vencida',
      body: 'Una factura está vencida. Revisa el registro actual en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Fatura vencida',
      body: 'Uma fatura está vencida. Reveja o registo atual no portal J&A Automation.',
    },
  },
  missing_receipt: {
    en: {
      subject: 'Receipt missing',
      body: 'Add the required receipt to the expense record in the J&A Automation portal.',
    },
    es: {
      subject: 'Falta el recibo',
      body: 'Añade el recibo requerido al gasto en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Recibo em falta',
      body: 'Adicione o recibo necessário ao registo da despesa no portal J&A Automation.',
    },
  },
  budget_exception: {
    en: {
      subject: 'Project budget exception',
      body: 'A project budget threshold needs review in the J&A Automation portal.',
    },
    es: {
      subject: 'Excepción de presupuesto del proyecto',
      body: 'Un umbral de presupuesto del proyecto necesita revisión en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Exceção de orçamento do projeto',
      body: 'Um limite do orçamento do projeto precisa de revisão no portal J&A Automation.',
    },
  },
  cap_exception: {
    en: {
      subject: 'Project cap exception',
      body: 'A project or purchase-order cap needs review in the J&A Automation portal.',
    },
    es: {
      subject: 'Excepción del límite del proyecto',
      body: 'Un límite del proyecto o de la orden de compra necesita revisión en el portal de J&A Automation.',
    },
    pt: {
      subject: 'Exceção do limite do projeto',
      body: 'Um limite do projeto ou da ordem de compra precisa de revisão no portal J&A Automation.',
    },
  },
  settlement_status_changed: {
    en: {
      subject: 'Worker settlement status changed',
      body: 'Your worker settlement status changed. Review your current pay record in the J&A Automation portal.',
    },
    es: {
      subject: 'Cambió el estado de tu liquidación',
      body: 'Cambió el estado de tu liquidación. Revisa tu registro de pagos actual en el portal de J&A Automation.',
    },
    pt: {
      subject: 'O estado da sua liquidação mudou',
      body: 'O estado da sua liquidação mudou. Reveja o seu registo de pagamentos no portal J&A Automation.',
    },
  },
  worker_payment_status: {
    en: {
      subject: 'Worker payment status changed',
      body: 'Your worker payment status changed. Review the current expense record in the J&A Automation portal.',
    },
    es: {
      subject: 'Cambió el estado de tu pago',
      body: 'Cambió el estado de tu pago. Revisa el gasto actual en el portal de J&A Automation.',
    },
    pt: {
      subject: 'O estado do seu pagamento mudou',
      body: 'O estado do seu pagamento mudou. Reveja o registo da despesa no portal J&A Automation.',
    },
  },
  assignment_published: {
    en: {
      subject: 'Project assignment updated',
      body: 'Your project assignment was updated. Sign in to the J&A Automation portal to review it.',
    },
    es: {
      subject: 'Asignación de proyecto actualizada',
      body: 'Tu asignación de proyecto se actualizó. Entra en el portal de J&A Automation para revisarla.',
    },
    pt: {
      subject: 'Atribuição ao projeto atualizada',
      body: 'A sua atribuição ao projeto foi atualizada. Entre no portal J&A Automation para a rever.',
    },
  },
  report_submitted: {
    en: {
      subject: 'Report awaiting review',
      body: 'A report is awaiting review. Sign in to the J&A Automation portal to review the current record.',
    },
    es: {
      subject: 'Informe pendiente de revisión',
      body: 'Un informe está pendiente de revisión. Entra en el portal de J&A Automation para revisar el registro actual.',
    },
    pt: {
      subject: 'Relatório a aguardar revisão',
      body: 'Um relatório aguarda revisão. Entre no portal J&A Automation para rever o registo atual.',
    },
  },
  report_approved: {
    en: {
      subject: 'Report approved',
      body: 'A report was approved. Sign in to the J&A Automation portal to review the current record.',
    },
    es: {
      subject: 'Informe aprobado',
      body: 'Se aprobó un informe. Entra en el portal de J&A Automation para revisar el registro actual.',
    },
    pt: {
      subject: 'Relatório aprovado',
      body: 'Um relatório foi aprovado. Entre no portal J&A Automation para rever o registo atual.',
    },
  },
  report_needs_changes: {
    en: {
      subject: 'Report returned for changes',
      body: 'A report was returned for changes. Sign in to the J&A Automation portal to review the reason.',
    },
    es: {
      subject: 'Informe devuelto para cambios',
      body: 'Se devolvió un informe para cambios. Entra en el portal de J&A Automation para revisar el motivo.',
    },
    pt: {
      subject: 'Relatório devolvido para alterações',
      body: 'Um relatório foi devolvido para alterações. Entre no portal J&A Automation para rever o motivo.',
    },
  },
};

const fallback: Readonly<Record<NotificationLocale, CopyPair>> = {
  en: {
    subject: 'J&A Automation notification',
    body: 'Sign in to the J&A Automation portal to review the current record.',
  },
  es: {
    subject: 'Notificación de J&A Automation',
    body: 'Entra en el portal de J&A Automation para revisar el registro actual.',
  },
  pt: {
    subject: 'Notificação da J&A Automation',
    body: 'Entre no portal J&A Automation para rever o registo atual.',
  },
};

export function normalizeNotificationLocale(value: unknown): NotificationLocale {
  return value === 'es' || value === 'pt' ? value : 'en';
}

export function notificationCopy(
  kind: string,
  locale: NotificationLocale | unknown = 'en',
): NotificationCopy {
  const normalizedLocale = normalizeNotificationLocale(locale);
  const localized = copy[kind]?.[normalizedLocale];
  return localized ?? fallback[normalizedLocale];
}
