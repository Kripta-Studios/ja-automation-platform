import { normalizePortalLocale, translate } from '../../i18n/catalog';

type ValidationControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type ActionResult = { destroy: () => void };

const controlSelector = 'input, select, textarea';
const formKeys = new WeakMap<HTMLFormElement, string>();
let nextFormKey = 0;

function controls(form: HTMLFormElement): ValidationControl[] {
  return Array.from(form.querySelectorAll(controlSelector)) as ValidationControl[];
}

function isInvalid(control: ValidationControl): boolean {
  if ('willValidate' in control && control.willValidate === false) return false;
  if ('validity' in control && control.validity && !control.validity.valid) return true;
  return control.matches(':invalid');
}

function errorMessage(control: ValidationControl): string {
  const locale = normalizePortalLocale(control.ownerDocument.documentElement.getAttribute('lang'));
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const validity = control.validity;
  // Application-defined validation already uses the selected portal language.
  if (validity.customError && control.validationMessage?.trim())
    return control.validationMessage.trim();
  const type = control.getAttribute('type');
  if (validity.valueMissing) {
    if (type === 'checkbox') return t('Please check this box.');
    if (type === 'radio' || control.tagName === 'SELECT') return t('Please select an option.');
    return t('Please complete this field.');
  }
  if (validity.typeMismatch) {
    if (type === 'email') return t('Enter a valid email address.');
    if (type === 'url') return t('Enter a valid URL.');
  }
  if (validity.badInput) {
    if (type === 'time') return t('Enter a valid time.');
    if (['date', 'datetime-local', 'month', 'week'].includes(type ?? ''))
      return t('Enter a valid date.');
    return t('Enter a valid number.');
  }
  if (validity.patternMismatch)
    return t(control.getAttribute('data-pattern-message') || 'Match the requested format.');
  if (validity.tooShort)
    return t('Use at least {min} characters.', { min: control.getAttribute('minlength') ?? '' });
  if (validity.tooLong)
    return t('Use no more than {max} characters.', {
      max: control.getAttribute('maxlength') ?? '',
    });
  if (validity.rangeUnderflow)
    return t('Enter a value of at least {min}.', { min: control.getAttribute('min') ?? '' });
  if (validity.rangeOverflow)
    return t('Enter a value no greater than {max}.', { max: control.getAttribute('max') ?? '' });
  if (validity.stepMismatch) return t('Enter a value matching the required step.');
  return t('Enter a valid value.');
}

function fieldMessage(control: ValidationControl): string {
  const label = control.labels?.[0];
  const title =
    label?.querySelector('span')?.textContent?.trim() ||
    label?.firstChild?.textContent?.trim() ||
    control.getAttribute('aria-label')?.trim() ||
    control.name;
  return title ? `${title}: ${errorMessage(control)}` : errorMessage(control);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'form'
  );
}

function formIdentity(form: HTMLFormElement): string {
  const existing = formKeys.get(form);
  if (existing) return existing;
  const explicit =
    form.getAttribute('id') ||
    form.getAttribute('data-validation-id') ||
    form.getAttribute('action') ||
    'form';
  const identity = `validation-${slug(explicit)}-${++nextFormKey}`;
  formKeys.set(form, identity);
  form.setAttribute('data-validation-instance', identity);
  return identity;
}

function ensureId(form: HTMLFormElement, control: ValidationControl, index: number): string {
  if (control.id) return control.id;
  const base = control.name?.trim() || `field-${index + 1}`;
  const baseId = `validation-${slug(base)}`;
  let id = baseId;
  let suffix = 2;
  while (form.ownerDocument.getElementById(id) || form.querySelector(`#${selectorValue(id)}`)) {
    id = `validation-${suffix}-${slug(base)}`;
    suffix += 1;
  }
  control.id = id;
  return id;
}

function tokens(value: string | null): string[] {
  return value?.split(/\s+/).filter(Boolean) ?? [];
}

function selectorValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function appendToken(control: ValidationControl, token: string): void {
  const values = tokens(control.getAttribute('aria-describedby'));
  if (!values.includes(token)) {
    control.setAttribute('aria-describedby', [...values, token].join(' '));
  }
}

function removeToken(control: ValidationControl, token: string): void {
  const values = tokens(control.getAttribute('aria-describedby')).filter(
    (value) => value !== token,
  );
  if (values.length) control.setAttribute('aria-describedby', values.join(' '));
  else control.removeAttribute('aria-describedby');
}

function removeFieldError(form: HTMLFormElement, control: ValidationControl): void {
  const errorId = control.getAttribute('data-validation-error-id');
  if (!errorId) return;
  const error =
    form.ownerDocument.getElementById(errorId) ??
    form.querySelector(`[data-field-error-for="${selectorValue(control.id)}"]`);
  error?.remove();
  removeToken(control, errorId);
  control.removeAttribute('data-validation-error-id');
  control.removeAttribute('aria-invalid');
}

function clearPreviousErrors(form: HTMLFormElement, fieldControls: ValidationControl[]): void {
  for (const error of form.querySelectorAll('[data-validation-generated-error]')) error.remove();
  for (const control of fieldControls) {
    const errorId = control.getAttribute('data-validation-error-id');
    if (errorId) removeToken(control, errorId);
    control.removeAttribute('data-validation-error-id');
    control.removeAttribute('aria-invalid');
  }
}

function createValidationSummary(form: HTMLFormElement): HTMLElement {
  const existing = form.querySelector('[data-validation-summary]') as HTMLElement | null;
  if (existing) return existing;
  const summary = form.ownerDocument.createElement('div');
  summary.id = `${formIdentity(form)}-summary`;
  summary.setAttribute('data-validation-summary', '');
  summary.setAttribute('role', 'alert');
  summary.setAttribute('tabindex', '-1');
  form.insertBefore(summary, form.firstElementChild);
  return summary;
}

function renderInvalidState(form: HTMLFormElement, invalidControls: ValidationControl[]): void {
  const fieldControls = controls(form);
  for (const [index, control] of fieldControls.entries()) ensureId(form, control, index);
  clearPreviousErrors(form, fieldControls);
  const summary = createValidationSummary(form);
  const ownerDocument = form.ownerDocument;
  const messages: string[] = [];
  const indexes = new Map(fieldControls.map((control, index) => [control, index]));

  for (const control of invalidControls) {
    const index = indexes.get(control) ?? 0;
    const id = control.id;
    const errorId = `${formIdentity(form)}-${slug(id)}-${index + 1}-error`;
    const message = errorMessage(control);
    messages.push(fieldMessage(control));
    const error = ownerDocument.createElement('p');
    error.id = errorId;
    error.setAttribute('data-field-error-for', id);
    error.setAttribute('data-validation-generated-error', '');
    error.setAttribute('role', 'alert');
    error.textContent = message;
    const host = control.parentElement ?? form;
    host.insertBefore(error, control.nextSibling);
    control.setAttribute('data-validation-error-id', errorId);
    control.setAttribute('aria-invalid', 'true');
    appendToken(control, errorId);
  }

  summary.textContent = translate(
    normalizePortalLocale(ownerDocument.documentElement.getAttribute('lang')),
    'Please correct the following fields: {messages}',
    { messages: messages.join(' ') },
  );
  const first = invalidControls[0];
  if (first) {
    const focus = () => first.focus();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus);
    else setTimeout(focus, 0);
  }
}

function updateReportedErrors(form: HTMLFormElement): void {
  const reportedControls = controls(form).filter((control) =>
    control.hasAttribute('data-validation-error-id'),
  );
  for (const control of reportedControls) {
    if (!isInvalid(control)) removeFieldError(form, control);
    else {
      const errorId = control.getAttribute('data-validation-error-id');
      const error = errorId ? form.ownerDocument.getElementById(errorId) : null;
      if (error) error.textContent = errorMessage(control);
    }
  }
  const summary = form.querySelector('[data-validation-summary]');
  if (!summary) return;
  const remaining = reportedControls.filter((control) => isInvalid(control));
  if (!remaining.length) {
    summary.remove();
    return;
  }
  summary.textContent = translate(
    normalizePortalLocale(form.ownerDocument.documentElement.getAttribute('lang')),
    'Please correct the following fields: {messages}',
    { messages: remaining.map(fieldMessage).join(' ') },
  );
}

export function formValidation(form: HTMLFormElement): ActionResult {
  formIdentity(form);
  let invalidRenderScheduled = false;
  let handlingSubmit = false;
  let active = true;

  const onEdit = (): void => {
    // Delegation also covers conditional controls such as a legacy time entry's interval.
    updateReportedErrors(form);
    // Reactive cross-field validity can settle after the input event (end time / break).
    queueMicrotask(() => {
      if (active) updateReportedErrors(form);
    });
  };
  const onReset = (event: Event): void => {
    queueMicrotask(() => {
      if (!active || event.defaultPrevented) return;
      clearPreviousErrors(form, controls(form));
      form.querySelector('[data-validation-summary]')?.remove();
    });
  };

  const onInvalid = (event: Event): void => {
    event.preventDefault();
    if (handlingSubmit || invalidRenderScheduled) return;
    invalidRenderScheduled = true;
    const invalidControls = controls(form).filter(isInvalid);
    if (invalidControls.length) renderInvalidState(form, invalidControls);
    const release = () => {
      invalidRenderScheduled = false;
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(release);
    else Promise.resolve().then(release);
  };

  const onSubmit = (event: Event): void => {
    handlingSubmit = true;
    const valid = form.checkValidity();
    handlingSubmit = false;
    if (valid) {
      clearPreviousErrors(form, controls(form));
      form.querySelector('[data-validation-summary]')?.remove();
      return;
    }
    event.preventDefault();
    renderInvalidState(form, controls(form).filter(isInvalid));
  };

  form.addEventListener('invalid', onInvalid, true);
  form.addEventListener('submit', onSubmit);
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('reset', onReset);

  const destroy = (): void => {
    active = false;
    form.removeEventListener('invalid', onInvalid, true);
    form.removeEventListener('submit', onSubmit);
    form.removeEventListener('input', onEdit);
    form.removeEventListener('change', onEdit);
    form.removeEventListener('reset', onReset);
  };
  return { destroy };
}

export const enhanceFormValidation = formValidation;
export const attachFormValidation = formValidation;
export default formValidation;
