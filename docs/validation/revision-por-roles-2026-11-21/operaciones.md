# Operaciones de la aplicación por área

Las acciones que siguen están registradas en el distribuidor común del portal. La cuenta, el proyecto y el estado del registro determinan qué acciones están disponibles. Los nombres técnicos permiten localizar el manejador de cada operación al mantener la aplicación. [Distribuidor de acciones](../../../apps/portal/src/routes/app/%5Bsection%5D/section-actions.ts)

| Área | Acciones registradas |
| --- | --- |
| Clientes, proyectos y asignaciones | `createClient`, `createClientContact`, `createProject`, `updateClient`, `transitionClient`, `updateProject`, `transitionProject`, `archiveClient`, `deleteClient`, `deleteProject`, `updateClientContact`, `deleteClientContact`, `updateAssignment`, `removeAssignment`, `deleteAssignment`, `createMilestone`, `submitMilestone`, `updateSchedule`, `assignWorker` |
| Cuentas, equipos y buzones | `setWorkforceProfile`, `createLocalPortalUser`, `createInvitation`, `revokeInvitation`, `reissueInvitation`, `provisionMailboxUsers`, `createMailboxAccount`, `bootstrapMailboxUsers`, `changeMailboxRole`, `deprovisionMailboxUser`, `updateMailboxPassword`, `resetUserPassword`, `destroyMailboxAccount`, `reactivateMailboxUser`, `setMailboxSignIn`, `updateUserStatus`, `updateWorkerProfile` |
| Documentos privados | `uploadPrivateDocument`, `archiveDocument`, `restoreDocument`, `deleteDocument` |
| Facturas, periodos, impuestos y cobros | `createBillingRule`, `setInvoicePlanningDates`, `updateBillingRule`, `archiveBillingRule`, `createLegalEntity`, `updateLegalEntity`, `updateIssuerDocumentSettings`, `archiveLegalEntity`, `createInvoiceNumberPolicy`, `createTaxProfile`, `updateTaxProfile`, `archiveTaxProfile`, `createDraft`, `createInvoiceAdjustment`, `approveInvoice`, `recalculateApprovedInvoice`, `deleteInvoice`, `issueInvoice`, `recordPayment`, `reversePayment`, `closePeriod`, `voidInvoice`, `restoreCreditNoteState`, `sendInvoice`, `emailInvoice`, `createAccountingPack`, `finalizeAccountingPack` |
| Finanzas | `classifyExpenseCommercially`, `setAssignmentCommercialFallback`, `setAssignmentCommercialRuleReferences`, `createAssignmentExpensePolicy`, `setProjectReimbursementDefault`, `setWorkerReimbursementOverride`, `createCanonicalLegalEntityRevision`, `assignProjectLegalEntity`, `replaceUnusedProjectIssuingAuthority`, `setExpensePlanningDates`, `createProjectCommercialPolicy`, `createCompensationRule`, `supersedeCompensationRule`, `deactivateCompensationRule`, `settleCompensation`, `recordCompensationPayment`, `reverseCompensationPayment`, `recordReimbursement`, `createClientLaborRate`, `supersedeClientLaborRate`, `deactivateClientLaborRate`, `createInternalCostRule`, `supersedeInternalCostRule`, `deactivateInternalCostRule`, `createAssignmentRateOverride` |
| Gastos y recibos | `createExpense`, `createExpenseWeek`, `createExpenseBatch`, `submitExpenseWeek`, `updateExpense`, `submitExpense`, `withdrawCrewExpenseDraft`, `deleteExpense` |
| Horas y jornadas | `createTime`, `saveTimeWeek`, `attachWeekSheet`, `createTimeBatch`, `copyTimeLayout`, `updateTime`, `submitTime`, `submitTimeWeek`, `deleteTime` |
| Informes, planificación y cambios técnicos | `autosaveReport`, `generatePeriodReports`, `createDailyReport`, `createTechnicalReport`, `createTechnicalChange`, `submitReport`, `submitTechnicalChange`, `createPlanning`, `updatePlanning`, `cancelPlanning`, `createSkill`, `setWorkerSkill`, `setAvailability`, `reviewReport`, `reviewTechnicalChange`, `reviewMilestone`, `updateSkill`, `deleteSkill`, `deleteWorkerSkill`, `deleteDraft`, `withdrawLinkedDrafts`, `createCorrectionDraft`, `withdrawCorrectionDraft` |
| Notificaciones | `markNotificationRead`, `markAllNotificationsRead` |
| Personas y datos del equipo | `fixPersonNames`, `setPersonDefaultRates` |
| Revisión y aprobaciones | `approveRecord`, `approveBatch`, `financeApprove` |
| Tarifas y compensación | `saveClientRate`, `saveWorkerPay` |

## Pantallas con rutas propias

Los siguientes puntos de entrada añaden flujos que no pasan por el distribuidor común. Las fichas por rol identifican quién puede utilizarlos.

| Pantalla | Ruta desde el portal |
| --- | --- |
| [billing/invoices/[id]](../../../apps/portal/src/routes/app/billing/invoices/%5Bid%5D/%2Bpage.svelte) | `/app/billing/invoices/[id]` |
| [clients/[id]](../../../apps/portal/src/routes/app/clients/%5Bid%5D/%2Bpage.svelte) | `/app/clients/[id]` |
| [crew](../../../apps/portal/src/routes/app/crew/%2Bpage.svelte) | `/app/crew` |
| [crew/time/[id]](../../../apps/portal/src/routes/app/crew/time/%5Bid%5D/%2Bpage.svelte) | `/app/crew/time/[id]` |
| [expenses/[id]](../../../apps/portal/src/routes/app/expenses/%5Bid%5D/%2Bpage.svelte) | `/app/expenses/[id]` |
| [finance/cash](../../../apps/portal/src/routes/app/finance/cash/%2Bpage.svelte) | `/app/finance/cash` |
| [finance/conversions](../../../apps/portal/src/routes/app/finance/conversions/%2Bpage.svelte) | `/app/finance/conversions` |
| [finance/preview](../../../apps/portal/src/routes/app/finance/preview/%2Bpage.svelte) | `/app/finance/preview` |
| [finance/subcontractors](../../../apps/portal/src/routes/app/finance/subcontractors/%2Bpage.svelte) | `/app/finance/subcontractors` |
| [help](../../../apps/portal/src/routes/app/help/%2Bpage.svelte) | `/app/help` |
| [invite/[token]](../../../apps/portal/src/routes/app/invite/%5Btoken%5D/%2Bpage.svelte) | `/app/invite/[token]` |
| [login](../../../apps/portal/src/routes/app/login/%2Bpage.svelte) | `/app/login` |
| [login/two-factor](../../../apps/portal/src/routes/app/login/two-factor/%2Bpage.svelte) | `/app/login/two-factor` |
| [manage](../../../apps/portal/src/routes/app/manage/%2Bpage.svelte) | `/app/manage` |
| [manage/worker-pay](../../../apps/portal/src/routes/app/manage/worker-pay/%2Bpage.svelte) | `/app/manage/worker-pay` |
| [mfa-enrollment](../../../apps/portal/src/routes/app/mfa-enrollment/%2Bpage.svelte) | `/app/mfa-enrollment` |
| [notifications/[id]](../../../apps/portal/src/routes/app/notifications/%5Bid%5D/%2Bpage.svelte) | `/app/notifications/[id]` |
| [projects/[id]](../../../apps/portal/src/routes/app/projects/%5Bid%5D/%2Bpage.svelte) | `/app/projects/[id]` |
| [projects/[id]/calculation](../../../apps/portal/src/routes/app/projects/%5Bid%5D/calculation/%2Bpage.svelte) | `/app/projects/[id]/calculation` |
| [projects/[id]/closeout](../../../apps/portal/src/routes/app/projects/%5Bid%5D/closeout/%2Bpage.svelte) | `/app/projects/[id]/closeout` |
| [reports/[id]](../../../apps/portal/src/routes/app/reports/%5Bid%5D/%2Bpage.svelte) | `/app/reports/[id]` |
| [reports/period/[id]](../../../apps/portal/src/routes/app/reports/period/%5Bid%5D/%2Bpage.svelte) | `/app/reports/period/[id]` |
| [reports/review](../../../apps/portal/src/routes/app/reports/review/%2Bpage.svelte) | `/app/reports/review` |
| [supplier](../../../apps/portal/src/routes/app/supplier/%2Bpage.svelte) | `/app/supplier` |
| [supplier/report](../../../apps/portal/src/routes/app/supplier/report/%2Bpage.svelte) | `/app/supplier/report` |
| [time/[id]](../../../apps/portal/src/routes/app/time/%5Bid%5D/%2Bpage.svelte) | `/app/time/[id]` |
| [workflow](../../../apps/portal/src/routes/app/workflow/%2Bpage.svelte) | `/app/workflow` |
| [workflow/capture](../../../apps/portal/src/routes/app/workflow/capture/%2Bpage.svelte) | `/app/workflow/capture` |
| [workflow/cases/[id]](../../../apps/portal/src/routes/app/workflow/cases/%5Bid%5D/%2Bpage.svelte) | `/app/workflow/cases/[id]` |
