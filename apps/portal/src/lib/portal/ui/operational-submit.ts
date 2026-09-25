import type { SubmitFunction } from '@sveltejs/kit';
import { tick } from 'svelte';
import type { PortalLocale } from '../../portal-i18n';
import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
import type { ProblemData } from '../../problem/contract';
import formValidation from './form-validation';
import { reportFormFieldErrors } from './form-validation';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function serverErrorControls(form: HTMLFormElement): Control[] {
  return Array.from(form.querySelectorAll<Control>('[data-operational-server-error]'));
}

/** Server messages remain localized; changing a field clears its previous server verdict. */
export function operationalFieldValidation(form: HTMLFormElement): { destroy: () => void } {
  const clearChangedField = (event: Event): void => {
    const control = event.target as Control | null;
    if (control?.hasAttribute('data-operational-server-error')) {
      control.setCustomValidity('');
      control.removeAttribute('data-operational-server-error');
    }
  };
  form.addEventListener('input', clearChangedField, true);
  form.addEventListener('change', clearChangedField, true);
  const validation = formValidation(form);
  return {
    destroy: () => {
      form.removeEventListener('input', clearChangedField, true);
      form.removeEventListener('change', clearChangedField, true);
      validation.destroy();
    },
  };
}

function applyFieldErrors(form: HTMLFormElement, data: Record<string, unknown> | undefined): void {
  for (const control of serverErrorControls(form)) {
    control.setCustomValidity('');
    control.removeAttribute('data-operational-server-error');
  }
  const raw = data?.fieldErrors ?? data?.fields;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    reportFormFieldErrors(form, {});
    return;
  }
  const fields = Object.fromEntries(
    Object.entries(raw).map(([field, errors]) => [
      field === 'amountMinor'
        ? 'amount'
        : field === 'minutes'
          ? form.querySelector('[name="durationHours"]')
            ? 'durationHours'
            : 'endTime'
          : field === 'breakMinutes'
            ? 'breakHours'
            : field,
      errors,
    ]),
  ) as Record<string, readonly string[] | string>;
  reportFormFieldErrors(form, fields);
}

function problemFromResult(data: Record<string, unknown> | undefined): ProblemData | null {
  if (!data || typeof data.code !== 'string' || typeof data.messageKey !== 'string') return null;
  return data as ProblemData;
}

type OperationalSubmitOptions = {
  locale: () => PortalLocale;
  translate: (value: string) => string;
  setSaving: (value: boolean) => void;
  setError: (value: string) => void;
  setProblem?: (problem: ProblemData | null) => void;
  onSuccess: () => void;
  offlineHandled: () => boolean;
};

/** Keep the live form (including File inputs) mounted until an explicit successful response. */
export function createOperationalSubmit(options: OperationalSubmitOptions): SubmitFunction {
  let pending = false;
  let savedForm: HTMLFormElement | null = null;
  const genericError = (): string =>
    options.translate('We could not confirm the save. Check the register before submitting again.');
  const refreshError = (): string =>
    options.translate(
      'Your changes were saved, but the register could not be refreshed. Close this form and refresh the page.',
    );
  const focusError = async (form: HTMLFormElement): Promise<void> => {
    await tick();
    form
      .closest('[data-ui="responsive-sheet"]')
      ?.querySelector<HTMLElement>('[data-operational-form-error]')
      ?.focus({ preventScroll: true });
  };

  return ({ formElement, cancel }) => {
    if (savedForm === formElement) {
      cancel();
      options.setError(refreshError());
      void focusError(formElement);
      return;
    }
    if (pending) {
      cancel();
      return;
    }
    if (!navigator.onLine) {
      cancel();
      if (!options.offlineHandled()) {
        options.setError(
          options.translate('Reconnect to save changes. Your entries are still here.'),
        );
        void focusError(formElement);
      }
      return;
    }
    pending = true;
    options.setSaving(true);
    options.setError('');
    options.setProblem?.(null);
    // enhance has already captured FormData. Freeze the visible values until this request
    // completes so a successful save cannot discard text entered after its snapshot.
    const controls = Array.from(formElement.querySelectorAll<Control>('input, select, textarea'));
    const previousDisabled = controls.map((control) => control.disabled);
    const restoreControls = (): void => {
      controls.forEach((control, index) => {
        control.disabled = previousDisabled[index]!;
      });
    };
    controls.forEach((control) => {
      control.disabled = true;
    });
    return async ({ result, update }) => {
      try {
        if (result.type === 'error') {
          restoreControls();
          options.setProblem?.(null);
          options.setError(genericError());
          await focusError(formElement);
          return;
        }
        if (result.type === 'failure') {
          restoreControls();
          options.setProblem?.(problemFromResult(result.data));
          const message = standaloneActionMessage(options.locale(), result.data) || genericError();
          const values = result.data?.values;
          const receiptNeedsReattach =
            values && typeof values === 'object' && 'receiptNeedsReattach' in values
              ? values.receiptNeedsReattach === true
              : false;
          options.setError(
            receiptNeedsReattach
              ? `${message} ${options.translate('Reattach the receipt before saving again.')}`
              : message,
          );
          applyFieldErrors(formElement, result.data);
          await focusError(formElement);
          return;
        }
        if (result.type === 'success') {
          savedForm = formElement;
          options.setProblem?.(null);
        }
        await update({ reset: false });
        if (result.type === 'success') options.onSuccess();
      } catch {
        restoreControls();
        options.setProblem?.(null);
        options.setError(savedForm === formElement ? refreshError() : genericError());
        await focusError(formElement);
      } finally {
        restoreControls();
        pending = false;
        options.setSaving(false);
      }
    };
  };
}
