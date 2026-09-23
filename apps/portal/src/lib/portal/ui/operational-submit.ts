import type { SubmitFunction } from '@sveltejs/kit';
import { tick } from 'svelte';
import type { PortalLocale } from '../../portal-i18n';
import { standaloneActionMessage } from '../../../routes/app/standalone-locale';
import formValidation from './form-validation';

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

function applyFieldErrors(
  form: HTMLFormElement,
  data: Record<string, unknown> | undefined,
  translate: (value: string) => string,
): void {
  for (const control of serverErrorControls(form)) {
    control.setCustomValidity('');
    control.removeAttribute('data-operational-server-error');
  }
  const fields = data?.fields;
  if (!fields || typeof fields !== 'object') return;
  for (const [field, errors] of Object.entries(fields)) {
    if (!Array.isArray(errors) || !errors.length) continue;
    const control = form.elements.namedItem(field === 'amountMinor' ? 'amount' : field);
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    ) {
      control.setCustomValidity(translate('Review this field.'));
      control.setAttribute('data-operational-server-error', '');
    }
  }
  if (serverErrorControls(form).length) form.reportValidity();
}

type OperationalSubmitOptions = {
  locale: () => PortalLocale;
  translate: (value: string) => string;
  setSaving: (value: boolean) => void;
  setError: (value: string) => void;
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
      ?.focus();
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
          options.setError(genericError());
          await focusError(formElement);
          return;
        }
        if (result.type === 'failure') {
          restoreControls();
          options.setError(
            standaloneActionMessage(options.locale(), result.data) || genericError(),
          );
          applyFieldErrors(formElement, result.data, options.translate);
          await focusError(formElement);
          return;
        }
        if (result.type === 'success') savedForm = formElement;
        await update({ reset: false });
        if (result.type === 'success') options.onSuccess();
      } catch {
        restoreControls();
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
