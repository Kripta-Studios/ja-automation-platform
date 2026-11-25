import { describe, expect, it } from 'vitest';
import {
  auditActionText,
  auditCreditNoteView,
  auditEntityTypeText,
} from '../../apps/portal/src/lib/portal/audit-action-labels';
import {
  documentKindText,
  documentSensitivityText,
  humanFileSize,
} from '../../apps/portal/src/lib/portal/document-labels';
import { isSystemAccount } from '../../apps/portal/src/lib/portal/system-accounts';

describe('audit log human labels (A3)', () => {
  it('renders registry codes as plain words in en/es/pt', () => {
    expect(auditActionText('project.update', 'en')).toBe('Project updated');
    expect(auditActionText('project.update', 'es')).toBe('Actualización de proyecto');
    expect(auditActionText('project.update', 'pt')).toBe('Atualização de projeto');
    expect(auditActionText('time.finance_review', 'en')).toBe('Hours reviewed by finance');
    expect(auditActionText('time.finance_review', 'es')).toBe('Revisión financiera de horas');
    expect(auditActionText('user.status.update', 'en')).toBe('User status updated');
    expect(auditActionText('invoice.adjustment.create', 'pt')).toBe('Criação de ajuste de fatura');
    expect(auditActionText('security.mfa.login', 'en')).toBe('Signed in with two-step code');
  });
  it('never shows a raw dotted code, even for unknown actions', () => {
    expect(auditActionText('brand_new.thing_happened', 'en')).not.toMatch(/[._]/u);
  });
  it('labels record kinds', () => {
    expect(auditEntityTypeText('time_entry', 'es')).toBe('Horas');
    expect(auditEntityTypeText('project_member', 'en')).toBe('Project member');
  });
  it('names a credit note as a credit note, not an invoice (D15)', () => {
    const view = auditCreditNoteView('invoice.issue', 'invoice', 'CN-123-2026-000001');
    expect(auditActionText(view.action, 'en')).toBe('Credit note issued');
    expect(auditEntityTypeText(view.entityType, 'en')).toBe('Credit note');
    expect(auditCreditNoteView('invoice.issue', 'invoice', '123-2026-000001')).toEqual({
      action: 'invoice.issue',
      entityType: 'invoice',
    });
  });
});

describe('documents register labels (A7)', () => {
  it('localizes kinds, sensitivity and sizes', () => {
    expect(documentKindText('receipt', 'es')).toBe('Recibo');
    expect(documentSensitivityText('internal', 'pt')).toBe('Interno');
    expect(humanFileSize(51962, 'en')).toBe('50 KB');
    expect(humanFileSize(512, 'en')).toBe('512 B');
    expect(humanFileSize(2_621_440, 'es')).toBe('2,5 MB');
  });
});

describe('system accounts are not people (P3/F6)', () => {
  it('detects shared mailboxes and service senders', () => {
    for (const email of ['adm@j-aautomation.com', 'finance@j-aautomation.com', 'legal@j-aautomation.com', 'no-reply@j-aautomation.com'])
      expect(isSystemAccount({ email })).toBe(true);
    expect(isSystemAccount({ name: 'System administrator', email: 'admin@j-aautomation.com' })).toBe(true);
    expect(isSystemAccount({ name: 'J&A Automation Portal', email: 'x@y.z' })).toBe(true);
    expect(isSystemAccount({ name: 'gabriel.lamoglia', email: 'gabriel.lamoglia@j-aautomation.com' })).toBe(false);
  });
});
