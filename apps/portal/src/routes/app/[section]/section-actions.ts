import type { Actions } from './$types';
import { approvalActions } from '$lib/server/actions/approval-actions';
import { accessActions } from '$lib/server/actions/access-actions';
import { billingActions } from '$lib/server/actions/billing-actions';
import { documentActions } from '$lib/server/actions/document-actions';
import { expenseActions } from '$lib/server/actions/expense-actions';
import { financeActions } from '$lib/server/actions/finance-actions';
import { notificationActions } from '$lib/server/actions/notification-actions';
import { projectActions } from '$lib/server/actions/project-actions';
import { reportActions } from '$lib/server/actions/operations-actions';
import { timeActions } from '$lib/server/actions/time-actions';

export const sectionActions: Actions = {
  generatePeriodReports: reportActions.generatePeriodReports,
  createDailyReport: reportActions.createDailyReport,
  createTechnicalReport: reportActions.createTechnicalReport,
  createTechnicalChange: reportActions.createTechnicalChange,
  submitReport: reportActions.submitReport,
  submitTechnicalChange: reportActions.submitTechnicalChange,
  createPlanning: reportActions.createPlanning,
  createSkill: reportActions.createSkill,
  setWorkerSkill: reportActions.setWorkerSkill,
  setAvailability: reportActions.setAvailability,
  reviewReport: reportActions.reviewReport,
  reviewTechnicalChange: reportActions.reviewTechnicalChange,
  reviewMilestone: reportActions.reviewMilestone,
  createBillingRule: billingActions.createBillingRule,
  createLegalEntity: billingActions.createLegalEntity,
  createInvoiceNumberPolicy: billingActions.createInvoiceNumberPolicy,
  createTaxProfile: billingActions.createTaxProfile,
  createDraft: billingActions.createDraft,
  createInvoiceAdjustment: billingActions.createInvoiceAdjustment,
  approveInvoice: billingActions.approveInvoice,
  issueInvoice: billingActions.issueInvoice,
  recordPayment: billingActions.recordPayment,
  closePeriod: billingActions.closePeriod,
  voidInvoice: billingActions.voidInvoice,
  sendInvoice: billingActions.sendInvoice,
  createAccountingPack: billingActions.createAccountingPack,
  finalizeAccountingPack: billingActions.finalizeAccountingPack,
  runJobs: billingActions.runJobs,
  createClient: projectActions.createClient,
  createClientContact: projectActions.createClientContact,
  createProject: projectActions.createProject,
  createMilestone: projectActions.createMilestone,
  submitMilestone: projectActions.submitMilestone,
  updateSchedule: projectActions.updateSchedule,
  assignWorker: projectActions.assignWorker,
  createInvitation: accessActions.createInvitation,
  updateUserStatus: accessActions.updateUserStatus,
  createTime: timeActions.createTime,
  copyTimeLayout: timeActions.copyTimeLayout,
  updateTime: timeActions.updateTime,
  submitTime: timeActions.submitTime,
  createExpense: expenseActions.createExpense,
  uploadPrivateDocument: documentActions.uploadPrivateDocument,
  submitExpense: expenseActions.submitExpense,
  approveRecord: approvalActions.approveRecord,
  financeApprove: approvalActions.financeApprove,
  createCompensationRule: financeActions.createCompensationRule,
  settleCompensation: financeActions.settleCompensation,
  recordReimbursement: financeActions.recordReimbursement,
  createClientLaborRate: financeActions.createClientLaborRate,
  createInternalCostRule: financeActions.createInternalCostRule,
  createAssignmentRateOverride: financeActions.createAssignmentRateOverride,
  markNotificationRead: notificationActions.markNotificationRead,
};
