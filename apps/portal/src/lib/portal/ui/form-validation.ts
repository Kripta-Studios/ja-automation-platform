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

function fieldTitle(control: ValidationControl): string {
  const label = control.labels?.[0];
  return (
    label?.querySelector('span')?.textContent?.trim() ||
    label?.firstChild?.textContent?.trim() ||
    control.getAttribute('aria-label')?.trim() ||
    control.name
  );
}

function fieldMessage(control: ValidationControl): string {
  const title = fieldTitle(control);
  return title ? `${title}: ${errorMessage(control)}` : errorMessage(control);
}

function serverFieldMessage(control: ValidationControl, raw: string): string {
  const locale = normalizePortalLocale(control.ownerDocument.documentElement.getAttribute('lang'));
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  // Zod supplies English diagnostics even when the portal is in another
  // language. Convert its standard diagnostics to the existing field copy;
  // domain-specific keys and messages retain their own wording.
  const minimumLength = raw.match(/^Too small: expected string to have >=(\d+) characters?$/u);
  if (minimumLength) return t('Use at least {min} characters.', { min: minimumLength[1] ?? '' });
  const maximumLength = raw.match(/^Too big: expected string to have <=(\d+) characters?$/u);
  if (maximumLength)
    return t('Use no more than {max} characters.', { max: maximumLength[1] ?? '' });
  const minimumNumber = raw.match(/^Too small: expected number to be >=(-?\d+(?:\.\d+)?)$/u);
  if (minimumNumber) return t('Enter a value of at least {min}.', { min: minimumNumber[1] ?? '' });
  const maximumNumber = raw.match(/^Too big: expected number to be <=(-?\d+(?:\.\d+)?)$/u);
  if (maximumNumber)
    return t('Enter a value no greater than {max}.', { max: maximumNumber[1] ?? '' });
  if (
    /^Invalid input: expected number\b/u.test(raw) ||
    /^Invalid input: expected bigint\b/u.test(raw)
  )
    return t('Enter a valid number.');
  if (/^Invalid input: expected date\b/u.test(raw)) return t('Enter a valid date.');
  if (/^Invalid (?:email address|email)$/u.test(raw)) return t('Enter a valid email address.');
  if (/^Invalid (?:url|URL)$/u.test(raw)) return t('Enter a valid URL.');
  if (/^Invalid option:/u.test(raw)) return t('Please select an option.');
  if (/^Invalid input: expected \w+, received (?:undefined|null)$/u.test(raw))
    return t('Please complete this field.');
  if (/^Invalid string: must match pattern\b/u.test(raw)) return t('Match the requested format.');
  if (/^Invalid input:/u.test(raw)) return t('Enter a valid value.');
  return t(raw);
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
    control.removeAttribute('data-server-validation-error');
    control.removeAttribute('aria-invalid');
  }
}

function createValidationSummary(form: HTMLFormElement): HTMLElement {
  const existing = form.querySelector('[data-validation-summary]') as HTMLElement | null;
  if (existing) return existing;
  const summary = form.ownerDocument.createElement('div');
  summary.id = `${formIdentity(form)}-summary`;
  summary.setAttribute('data-ui', 'validation-summary');
  summary.setAttribute('data-validation-summary', '');
  summary.setAttribute('role', 'alert');
  summary.setAttribute('tabindex', '-1');
  form.insertBefore(summary, form.firstElementChild);
  return summary;
}

function renderSummary(
  form: HTMLFormElement,
  items: ReadonlyArray<{ control: ValidationControl; message: string }>,
): void {
  const summary = createValidationSummary(form);
  const ownerDocument = form.ownerDocument;
  const locale = normalizePortalLocale(ownerDocument.documentElement.getAttribute('lang'));
  summary.replaceChildren();
  const heading = ownerDocument.createElement('p');
  heading.textContent = translate(locale, 'Please correct the following fields: {messages}', {
    messages: items.length > 1 ? '' : (items[0]?.message ?? ''),
  }).trim();
  summary.appendChild(heading);
  if (items.length > 1) {
    const list = ownerDocument.createElement('ul');
    for (const { control, message } of items) {
      const item = ownerDocument.createElement('li');
      const link = ownerDocument.createElement('a');
      link.setAttribute('href', `#${control.id}`);
      link.textContent = message;
      item.appendChild(link);
      list.appendChild(item);
    }
    summary.appendChild(list);
  }
}

function renderInvalidState(form: HTMLFormElement, invalidControls: ValidationControl[]): void {
  const fieldControls = controls(form);
  for (const [index, control] of fieldControls.entries()) ensureId(form, control, index);
  clearPreviousErrors(form, fieldControls);
  const ownerDocument = form.ownerDocument;
  const items: { control: ValidationControl; message: string }[] = [];
  const indexes = new Map(fieldControls.map((control, index) => [control, index]));

  for (const control of invalidControls) {
    const index = indexes.get(control) ?? 0;
    const id = control.id;
    const errorId = `${formIdentity(form)}-${slug(id)}-${index + 1}-error`;
    const message = errorMessage(control);
    items.push({ control, message: fieldMessage(control) });
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

  renderSummary(form, items);
  const first = invalidControls[0];
  if (first) {
    const focus = () => {
      if (invalidControls.length > 1)
        (form.querySelector('[data-validation-summary]') as HTMLElement | null)?.focus({
          preventScroll: true,
        });
      else first.focus({ preventScroll: true });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus);
    else setTimeout(focus, 0);
  }
}

function updateReportedErrors(form: HTMLFormElement): void {
  const reportedControls = controls(form).filter((control) =>
    control.hasAttribute('data-validation-error-id'),
  );
  for (const control of reportedControls) {
    if (control.hasAttribute('data-server-validation-error')) continue;
    if (!isInvalid(control)) removeFieldError(form, control);
    else {
      const errorId = control.getAttribute('data-validation-error-id');
      const error = errorId ? form.ownerDocument.getElementById(errorId) : null;
      if (error) error.textContent = errorMessage(control);
    }
  }
  const summary = form.querySelector('[data-validation-summary]');
  if (!summary) return;
  const remaining = reportedControls.filter(
    (control) => control.hasAttribute('data-server-validation-error') || isInvalid(control),
  );
  if (!remaining.length) {
    summary.remove();
    return;
  }
  renderSummary(
    form,
    remaining.map((control) => ({
      control,
      message: control.hasAttribute('data-server-validation-error')
        ? `${fieldTitle(control)}: ${form.ownerDocument.getElementById(control.getAttribute('data-validation-error-id') ?? '')?.textContent ?? ''}`
        : fieldMessage(control),
    })),
  );
}

/** Attach server validation to the same field and summary pattern as native validation. */
export function reportFormFieldErrors(
  form: HTMLFormElement,
  fieldErrors: Readonly<Record<string, readonly string[] | string>>,
): void {
  const fieldControls = controls(form);
  for (const [index, control] of fieldControls.entries()) ensureId(form, control, index);
  clearPreviousErrors(form, fieldControls);
  const items: { control: ValidationControl; message: string }[] = [];
  for (const [index, control] of fieldControls.entries()) {
    if (control.tagName === 'INPUT' && control.getAttribute('type') === 'hidden') continue;
    const raw = fieldErrors[control.name];
    const messageKey = (typeof raw === 'string' ? raw : raw?.[0])?.trim();
    const message = messageKey ? serverFieldMessage(control, messageKey) : '';
    if (!message) continue;
    const label = fieldTitle(control);
    const errorId = `${formIdentity(form)}-${slug(control.id)}-${index + 1}-error`;
    const error = form.ownerDocument.createElement('p');
    error.id = errorId;
    error.setAttribute('data-field-error-for', control.id);
    error.setAttribute('data-validation-generated-error', '');
    error.setAttribute('role', 'alert');
    error.textContent = message;
    (control.parentElement ?? form).insertBefore(error, control.nextSibling);
    control.setAttribute('data-validation-error-id', errorId);
    control.setAttribute('data-server-validation-error', '');
    control.setAttribute('aria-invalid', 'true');
    appendToken(control, errorId);
    items.push({ control, message: label ? `${label}: ${message}` : message });
  }
  if (items.length) {
    renderSummary(form, items);
    // Do not move focus or scroll after a response: the user may already be
    // reading the result, and SvelteKit enhanced forms do not reload the page.
  } else form.querySelector('[data-validation-summary]')?.remove();
}

export function formValidation(form: HTMLFormElement): ActionResult {
  formIdentity(form);
  let invalidRenderScheduled = false;
  let handlingSubmit = false;
  let active = true;

  const onEdit = (event: Event): void => {
    const target = event.target as ValidationControl | null;
    if (target && form.contains(target) && target.hasAttribute('data-server-validation-error')) {
      removeFieldError(form, target);
      target.removeAttribute('data-server-validation-error');
    }
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
      for (const control of controls(form)) control.removeAttribute('data-server-validation-error');
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
