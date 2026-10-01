import { tick } from 'svelte';

type GuardState = {
  baseline: string;
  interacted: boolean;
  submitting: boolean;
  initialDirty: boolean;
};
const guards = new WeakMap<HTMLFormElement, GuardState>();

function snapshot(form: HTMLFormElement): string {
  return JSON.stringify(
    Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]), select, textarea',
      ),
    ).map((control) => {
      if (control instanceof HTMLInputElement && control.type === 'file')
        return [
          control.name,
          Array.from(control.files ?? []).map((file) => [file.name, file.size, file.lastModified]),
        ];
      if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type))
        return [control.name, control.checked];
      if (control instanceof HTMLSelectElement && control.multiple)
        return [control.name, Array.from(control.selectedOptions).map((option) => option.value)];
      return [control.name, control.value];
    }),
  );
}

export function hasUnsavedFormChanges(form: HTMLFormElement | null | undefined): boolean {
  if (!form?.isConnected) return false;
  const state = guards.get(form);
  return Boolean(
    state &&
    !state.submitting &&
    (state.initialDirty || (state.interacted && state.baseline !== snapshot(form))),
  );
}

export function confirmDirtyForms(root: HTMLElement | null | undefined, message: string): boolean {
  if (!root) return true;
  const forms =
    root instanceof HTMLFormElement ? [root] : Array.from(root.querySelectorAll('form'));
  return !forms.some(hasUnsavedFormChanges) || window.confirm(message);
}

/** Native submissions may leave; validation failures and unsaved navigation remain protected. */
export function dirtyFormGuard(
  form: HTMLFormElement,
  options: { initialDirty?: boolean } = {},
): { update: (options: { initialDirty?: boolean }) => void; destroy: () => void } {
  const state: GuardState = {
    baseline: snapshot(form),
    interacted: false,
    submitting: false,
    initialDirty: options.initialDirty === true,
  };
  guards.set(form, state);
  let disposed = false;
  void tick().then(() => {
    if (!disposed && !state.interacted) state.baseline = snapshot(form);
  });
  const edited = (): void => {
    state.interacted = true;
    state.submitting = false;
  };
  const submitted = (event: SubmitEvent): void => {
    if (event.defaultPrevented) return;
    state.submitting = true;
    queueMicrotask(() => {
      if (event.defaultPrevented) state.submitting = false;
    });
  };
  const unload = (event: BeforeUnloadEvent): void => {
    if (hasUnsavedFormChanges(form)) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  form.addEventListener('input', edited);
  form.addEventListener('change', edited);
  form.addEventListener('submit', submitted);
  window.addEventListener('beforeunload', unload);
  return {
    update: (options) => {
      state.initialDirty = options.initialDirty === true;
    },
    destroy: () => {
      disposed = true;
      guards.delete(form);
      form.removeEventListener('input', edited);
      form.removeEventListener('change', edited);
      form.removeEventListener('submit', submitted);
      window.removeEventListener('beforeunload', unload);
    },
  };
}
