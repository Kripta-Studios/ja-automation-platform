import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const detail = read('apps/portal/src/routes/app/projects/[id]/+page.svelte');

describe('standalone project detail action feedback', () => {
  it('wires successful and failed action results to the accessible toast primitive', () => {
    expect(detail).toContain('import { ResponsiveSheet, ToastRegion, type ToastItem }');
    expect(detail).toContain(
      'const actionFeedback = $derived(standaloneActionMessage(locale, form));',
    );
    expect(detail).toContain("actionResult?.success === true ? 'success' : 'error'");
    expect(detail).toMatch(/variant:\s*actionResult\?\.success === true \? 'success' : 'danger'/);
    expect(detail).toContain("title: actionResult?.success === true ? t('Success') : t('Error')");
    expect(detail).toContain('<ToastRegion');
    expect(detail).toContain('toasts={actionToasts}');
    expect(detail).toContain('ondismiss={dismissActionToast}');
  });

  it('retains an accessible inline fallback without announcing both surfaces at once', () => {
    expect(detail).toContain('data-project-action-message');
    expect(detail).toContain('role="status"');
    expect(detail).toContain('aria-live="polite"');
    expect(detail).toContain('{#if actionFeedback && !actionToastVisible}');
    expect(detail).toContain('mounted && actionFeedbackKey');
    expect(detail).toContain('dismissedActionToastKey !== actionFeedbackKey');
  });
});
