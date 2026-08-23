  updateWorkerProfile(principal: Principal, workerId: string, input: any) { return this.workforce.updateWorkerProfile(principal, workerId, input); }
  updateBillingRule(principal: Principal, ruleId: string, input: any) { return this.finance.updateBillingRule(principal, ruleId, input); }
  archiveBillingRule(principal: Principal, ruleId: string) { return this.finance.archiveBillingRule(principal, ruleId); }
  updateLegalEntity(principal: Principal, entityId: string, input: any) { return this.finance.updateLegalEntity(principal, entityId, input); }
  deleteLegalEntity(principal: Principal, entityId: string) { return this.finance.deleteLegalEntity(principal, entityId); }
  updateTaxProfile(principal: Principal, profileId: string, input: any) { return this.finance.updateTaxProfile(principal, profileId, input); }
  archiveTaxProfile(principal: Principal, profileId: string) { return this.finance.archiveTaxProfile(principal, profileId); }
  deleteInvoice(principal: Principal, invoiceId: string) { return this.finance.deleteInvoice(principal, invoiceId); }
  deleteExpense(principal: Principal, expenseId: string) { return this.finance.deleteExpense(principal, expenseId); }
  updateSkill(principal: Principal, skillId: string, input: any) { return this.operations.updateSkill(principal, skillId, input); }
  deleteSkill(principal: Principal, skillId: string) { return this.operations.deleteSkill(principal, skillId); }
  deleteWorkerSkill(principal: Principal, workerId: string, skillId: string) { return this.operations.deleteWorkerSkill(principal, workerId, skillId); }
  updateClient(principal: Principal, clientId: string, input: any) { return this.clients.updateClient(principal, clientId, input); }
  archiveClient(principal: Principal, clientId: string) { return this.clients.archiveClient(principal, clientId); }
  updateClientContact(principal: Principal, contactId: string, input: any) { return this.clients.updateClientContact(principal, contactId, input); }
  deleteClientContact(principal: Principal, contactId: string) { return this.clients.deleteClientContact(principal, contactId); }
  updateAssignment(principal: Principal, assignmentId: string, input: any) { return this.planning.updateAssignment(principal, assignmentId, input); }
  deleteAssignment(principal: Principal, assignmentId: string) { return this.planning.deleteAssignment(principal, assignmentId); }
  updateProject(principal: Principal, projectId: string, input: any) { return this.planning.updateProject(principal, projectId, input); }
  deleteTime(principal: Principal, timeId: string) { return this.time.deleteTimeEntry(principal, timeId); }
  listAllWorkers(principal: Principal) { return this.workforce.listWorkers(principal); }
  listOwnDocuments(principal: Principal) { return this.v3.listOwnDocuments(principal); }
