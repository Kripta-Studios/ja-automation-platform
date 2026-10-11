import { describe, expect, it } from 'vitest';
import {
  workflowActionCopy,
  workflowCaptureConflictCopy,
  workflowCaptureValidationCopy,
} from '../../apps/portal/src/lib/portal/workflow/copy.js';

describe('digital worker action recovery copy', () => {
  it('localizes capture validation and does not echo unknown server messages', () => {
    expect(workflowCaptureValidationCopy('en', 'Expense amount must be positive')).toBe(
      'Enter an amount greater than zero.',
    );
    expect(workflowCaptureValidationCopy('es', 'Expense amount must be positive')).toBe(
      'Introduce un importe mayor que cero.',
    );
    expect(workflowCaptureValidationCopy('pt', 'Expense amount must be positive')).toBe(
      'Introduza um valor superior a zero.',
    );

    const unknown = 'private database field: billing_amount_minor';
    expect(workflowCaptureValidationCopy('es', unknown)).toBe(
      'Revisa los datos y vuelve a intentarlo. Tus entradas siguen aquí.',
    );
    expect(workflowCaptureValidationCopy('es', unknown)).not.toContain(unknown);
  });

  it('gives safe, localized recovery guidance for capture conflicts and case blockers', () => {
    expect(workflowCaptureConflictCopy('en')).toBe(
      'Review your saved records before retrying this entry.',
    );
    expect(
      workflowActionCopy('es', { messageKey: 'problem.digitalWorkers.readinessBlocked' }),
    ).toBe(
      'Resuelve los bloqueos del registro de fuentes y actualiza el caso antes de volver a intentarlo.',
    );
    expect(workflowActionCopy('pt', { messageKey: 'problem.digitalWorkers.conflict' })).toContain(
      'Atualize e reveja a versão atual.',
    );
  });

  it('keeps successful action copy unchanged', () => {
    expect(
      workflowActionCopy('en', {
        success: true,
        messageKey: 'action.digitalWorkers.caseReviewSaved',
      }),
    ).toBe('Case review recorded.');
  });
});
