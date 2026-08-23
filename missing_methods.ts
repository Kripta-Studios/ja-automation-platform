  updateWorkerProfile(principal: Principal, workerId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.email) {
        this.sqlite.prepare('UPDATE worker SET email = ? WHERE id = ?').run(input.email, workerId);
      }
      if (input.displayName) {
        this.sqlite.prepare('UPDATE worker SET display_name = ? WHERE id = ?').run(input.displayName, workerId);
      }
      this.audit(principal, 'UPDATE', 'worker', workerId, input);
    });
  }

  updateBillingRule(principal: Principal, ruleId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.name) this.sqlite.prepare('UPDATE billing_rule SET name = ? WHERE id = ?').run(input.name, ruleId);
      if (input.baseRateMinor) this.sqlite.prepare('UPDATE billing_rule SET base_rate_minor = ? WHERE id = ?').run(input.baseRateMinor, ruleId);
      this.audit(principal, 'UPDATE', 'billing_rule', ruleId, input);
    });
  }

  archiveBillingRule(principal: Principal, ruleId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('UPDATE billing_rule SET is_active = 0 WHERE id = ?').run(ruleId);
      this.audit(principal, 'ARCHIVE', 'billing_rule', ruleId, {});
    });
  }

  updateLegalEntity(principal: Principal, entityId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.name) this.sqlite.prepare('UPDATE legal_entity SET name = ? WHERE id = ?').run(input.name, entityId);
      if (input.code) this.sqlite.prepare('UPDATE legal_entity SET code = ? WHERE id = ?').run(input.code, entityId);
      if (input.currency) this.sqlite.prepare('UPDATE legal_entity SET currency = ? WHERE id = ?').run(input.currency, entityId);
      this.audit(principal, 'UPDATE', 'legal_entity', entityId, input);
    });
  }

  deleteLegalEntity(principal: Principal, entityId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM legal_entity WHERE id = ?').run(entityId);
      this.audit(principal, 'DELETE', 'legal_entity', entityId, {});
    });
  }

  updateTaxProfile(principal: Principal, profileId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.name) this.sqlite.prepare('UPDATE tax_profile SET name = ? WHERE id = ?').run(input.name, profileId);
      if (input.ratePercent) this.sqlite.prepare('UPDATE tax_profile SET rate_percent = ? WHERE id = ?').run(input.ratePercent, profileId);
      this.audit(principal, 'UPDATE', 'tax_profile', profileId, input);
    });
  }

  archiveTaxProfile(principal: Principal, profileId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('UPDATE tax_profile SET is_active = 0 WHERE id = ?').run(profileId);
      this.audit(principal, 'ARCHIVE', 'tax_profile', profileId, {});
    });
  }

  deleteInvoice(principal: Principal, invoiceId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM invoice WHERE id = ?').run(invoiceId);
      this.audit(principal, 'DELETE', 'invoice', invoiceId, {});
    });
  }

  deleteExpense(principal: Principal, expenseId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM expense WHERE id = ?').run(expenseId);
      this.audit(principal, 'DELETE', 'expense', expenseId, {});
    });
  }

  updateSkill(principal: Principal, skillId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.name) this.sqlite.prepare('UPDATE skill SET name = ? WHERE id = ?').run(input.name, skillId);
      if (input.category) this.sqlite.prepare('UPDATE skill SET category = ? WHERE id = ?').run(input.category, skillId);
      this.audit(principal, 'UPDATE', 'skill', skillId, input);
    });
  }

  deleteSkill(principal: Principal, skillId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM skill WHERE id = ?').run(skillId);
      this.audit(principal, 'DELETE', 'skill', skillId, {});
    });
  }

  deleteWorkerSkill(principal: Principal, workerId: string, skillId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM worker_skill WHERE worker_id = ? AND skill_id = ?').run(workerId, skillId);
      this.audit(principal, 'DELETE', 'worker_skill', workerId + ':' + skillId, {});
    });
  }

  updateClient(principal: Principal, clientId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.legalName) this.sqlite.prepare('UPDATE client SET legal_name = ? WHERE id = ?').run(input.legalName, clientId);
      if (input.displayName) this.sqlite.prepare('UPDATE client SET display_name = ? WHERE id = ?').run(input.displayName, clientId);
      this.audit(principal, 'UPDATE', 'client', clientId, input);
    });
  }

  archiveClient(principal: Principal, clientId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('UPDATE client SET status = ? WHERE id = ?').run('archived', clientId);
      this.audit(principal, 'ARCHIVE', 'client', clientId, {});
    });
  }

  updateClientContact(principal: Principal, contactId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.name) this.sqlite.prepare('UPDATE client_contact SET name = ? WHERE id = ?').run(input.name, contactId);
      if (input.email) this.sqlite.prepare('UPDATE client_contact SET email = ? WHERE id = ?').run(input.email, contactId);
      this.audit(principal, 'UPDATE', 'client_contact', contactId, input);
    });
  }

  deleteClientContact(principal: Principal, contactId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM client_contact WHERE id = ?').run(contactId);
      this.audit(principal, 'DELETE', 'client_contact', contactId, {});
    });
  }

  updateAssignment(principal: Principal, assignmentId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.plannedMinutes !== undefined) this.sqlite.prepare('UPDATE assignment SET planned_minutes = ? WHERE id = ?').run(input.plannedMinutes, assignmentId);
      if (input.startsOn) this.sqlite.prepare('UPDATE assignment SET starts_on = ? WHERE id = ?').run(input.startsOn, assignmentId);
      if (input.endsOn) this.sqlite.prepare('UPDATE assignment SET ends_on = ? WHERE id = ?').run(input.endsOn, assignmentId);
      this.audit(principal, 'UPDATE', 'assignment', assignmentId, input);
    });
  }

  deleteAssignment(principal: Principal, assignmentId: string): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM assignment WHERE id = ?').run(assignmentId);
      this.audit(principal, 'DELETE', 'assignment', assignmentId, {});
    });
  }

  deleteTime(principal: Principal, timeId: string): void {
    this.assertReadable(principal);
    this.transaction(() => {
      this.sqlite.prepare('DELETE FROM time_entry WHERE id = ?').run(timeId);
      this.audit(principal, 'DELETE', 'time_entry', timeId, {});
    });
  }

  updateProject(principal: Principal, projectId: string, input: any): void {
    this.assertStepUp(principal);
    this.transaction(() => {
      if (input.name) this.sqlite.prepare('UPDATE project SET name = ? WHERE id = ?').run(input.name, projectId);
      this.audit(principal, 'UPDATE', 'project', projectId, input);
    });
  }

  listAllWorkers(principal: Principal): any[] {
    this.assertReadable(principal);
    return this.sqlite.prepare('SELECT * FROM worker').all() as any[];
  }

  listOwnDocuments(principal: Principal): any[] {
    this.assertReadable(principal);
    return this.sqlite.prepare('SELECT * FROM artifact WHERE created_by = ?').all(principal.id) as any[];
  }

