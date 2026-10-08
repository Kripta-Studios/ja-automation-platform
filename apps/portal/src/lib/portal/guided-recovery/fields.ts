import type { RecoveryRequest } from './events';
export type RecoveryControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export type RecoveryField = {
  name: string;
  title: string;
  message: string;
  control: RecoveryControl;
  value: string;
  checked: boolean;
  group?: HTMLInputElement[];
  selected?: string[];
};

export function editable(control: RecoveryControl): boolean {
  return (
    !control.disabled &&
    !control.hasAttribute('data-recovery-secret') &&
    !['current-password', 'new-password', 'one-time-code'].includes(
      control.getAttribute('autocomplete') ?? '',
    ) &&
    !('readOnly' in control && control.readOnly) &&
    !['hidden', 'password', 'file', 'submit', 'button', 'reset'].includes(
      control.getAttribute('type') ?? '',
    ) &&
    control.getClientRects().length > 0 &&
    getComputedStyle(control).visibility !== 'hidden'
  );
}
export function fieldTitle(control: RecoveryControl): string {
  const label = control.labels?.[0];
  return (
    label?.querySelector('span')?.textContent?.trim() ||
    label?.firstChild?.textContent?.trim() ||
    control.getAttribute('aria-label')?.trim() ||
    control.name ||
    control.id
  );
}
export function findControl(
  form: HTMLFormElement,
  name: string,
  allowManual = false,
): RecoveryControl | undefined {
  const controls = [
    ...Array.from(form.elements),
    ...Array.from(document.querySelectorAll('[data-recovery-form]')).filter(
      (el) =>
        form.id && (el.getAttribute('data-recovery-form') ?? '').split(/\s+/).includes(form.id),
    ),
  ].filter(
    (el): el is RecoveryControl =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement,
  );
  const exact = controls.find(
    (el) =>
      (el.name === name ||
        el.id === name ||
        (el.getAttribute('data-recovery-field') ?? '').split(/\s+/).includes(name)) &&
      (editable(el) ||
        (allowManual &&
          !el.disabled &&
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== 'hidden')),
  );
  if (exact) return exact;
  const aliases: Record<string, string[]> = {
    minutes: ['durationHours', 'endTime'],
    breakMinutes: ['breakHours'],
    amountMinor: ['amount'],
    hourlyRateMinor: ['hourlyRate'],
  };
  const money = controls.find(
    (el) =>
      editable(el) &&
      (el.getAttribute('data-minor-target') === name ||
        el.closest('[data-field]')?.getAttribute('data-field') === name),
  );
  return money ?? controls.find((el) => aliases[name]?.includes(el.name) && editable(el));
}
export function recoveryForm(
  request: RecoveryRequest,
  lastForm?: HTMLFormElement,
): HTMLFormElement | undefined {
  const nearby = request.form ?? request.source?.closest('form') ?? undefined;
  if (nearby?.isConnected) return nearby;
  const action = request.problem.actionName;
  const candidates = Array.from(document.forms).filter((form) => {
    if (action && !new URL(form.action).search.split(/[?&]/).some((part) => part === `/${action}`))
      return false;
    const values = request.problem.values;
    for (const key of [
      'clientId',
      'contactId',
      'projectId',
      'workerId',
      'entryId',
      'reportId',
      'expenseId',
      'userId',
      'portalUserId',
      'assignmentId',
      'id',
    ]) {
      if (values?.[key] === undefined) continue;
      const field = form.elements.namedItem(key);
      if (field instanceof HTMLInputElement && field.value !== String(values[key])) return false;
    }
    return Object.keys(request.problem.fieldErrors).some((name) => findControl(form, name));
  });
  if (lastForm?.isConnected && (!action || candidates.includes(lastForm))) return lastForm;
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function recoveryFields(
  form: HTMLFormElement | undefined,
  request: RecoveryRequest,
): RecoveryField[] {
  if (!form) return [];
  const result: RecoveryField[] = [];
  for (const [name, messages] of Object.entries(request.problem.fieldErrors)) {
    const control = findControl(form, name);
    if (!control || result.some((field) => field.control === control)) continue;
    const group =
      control instanceof HTMLInputElement
        ? Array.from(form.elements).filter(
            (el): el is HTMLInputElement =>
              el instanceof HTMLInputElement &&
              el.type === control.type &&
              ['checkbox', 'radio'].includes(el.type) &&
              (control.name
                ? el.name === control.name
                : !el.name &&
                  (el.getAttribute('data-recovery-field') ?? '').split(/\s+/).includes(name)) &&
              editable(el),
          )
        : [];
    result.push({
      name,
      title: fieldTitle(control),
      message: messages[0] ?? '',
      control,
      value: control.value,
      checked: control instanceof HTMLInputElement && control.checked,
      ...(group.length > 1
        ? { group, selected: group.filter((el) => el.checked).map((el) => el.value) }
        : {}),
    });
  }
  return result;
}

/** Retained public action values disambiguate submit buttons after a native reload. */
export function recoverySubmitter(
  form: HTMLFormElement | undefined,
  request: RecoveryRequest,
): HTMLButtonElement | HTMLInputElement | undefined {
  if (!form) return undefined;
  const buttons = Array.from(form.elements).filter(
    (el): el is HTMLButtonElement | HTMLInputElement =>
      (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) &&
      el.type === 'submit' &&
      !el.disabled,
  );
  const retained = buttons.filter(
    (button) =>
      button.name &&
      request.problem.values?.[button.name] !== undefined &&
      String(request.problem.values[button.name]) === button.value,
  );
  if (retained.length === 1) return retained[0];
  return buttons.length === 1 ? buttons[0] : undefined;
}
