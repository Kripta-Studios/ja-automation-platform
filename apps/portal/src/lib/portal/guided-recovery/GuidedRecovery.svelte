<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { beforeNavigate } from '$app/navigation';
  import { normalizePortalLocale, portalText } from '$lib/portal-i18n';
  import { localizedServerFieldMessage, validationErrorMessage } from '../ui/form-validation';
  import { requestGuidedRecovery, subscribeGuidedRecovery, type RecoveryRequest } from './events';
  import {
    editable,
    fieldTitle,
    findControl,
    recoveryFields,
    recoveryForm,
    recoverySubmitter,
    type RecoveryField,
    type RecoveryControl,
  } from './fields';

  let dialog: HTMLDialogElement;
  let request = $state<RecoveryRequest>();
  let fields = $state<RecoveryField[]>([]);
  let manualFields = $state<{ title: string; message: string }[]>([]);
  let index = $state(0);
  let validation = $state('');
  let operationLabel = $state('');
  let form: HTMLFormElement | undefined;
  let formAction = '';
  let lastForm: HTMLFormElement | undefined;
  let lastSubmitter: HTMLButtonElement | HTMLInputElement | undefined;
  let submitter: HTMLButtonElement | HTMLInputElement | undefined;
  let returnFocus: HTMLElement | undefined;
  let editor: RecoveryControl | undefined;
  let recoveryGeneration = 0;
  const locale = $derived(
    normalizePortalLocale($page.url.searchParams.get('lang') ?? $page.data.locale),
  );
  const t = (key: string) => portalText(locale, key);
  const message = $derived.by(() => {
    if (!request) return '';
    const translated = portalText(
      locale,
      request.problem.messageKey,
      Object.fromEntries(
        Object.entries(request.problem.params ?? {}).map(([key, value]) => [
          key,
          String(value ?? ''),
        ]),
      ),
    );
    return translated === request.problem.messageKey
      ? (request.problem.message ?? translated)
      : translated;
  });
  const current = $derived(fields[index]);

  async function open(next: RecoveryRequest) {
    // Never replace unfinished answers with another notice from the same response.
    if (dialog?.open) return;
    const generation = ++recoveryGeneration;
    request = next;
    form = recoveryForm(next, lastForm);
    formAction = form?.action ?? '';
    fields = recoveryFields(form, next);
    manualFields = form
      ? Object.entries(next.problem.fieldErrors).flatMap(([name, messages]) => {
          const control = findControl(form!, name, true);
          return control && !fields.some((field) => field.control === control)
            ? [{ title: fieldTitle(control), message: messages[0] ?? '' }]
            : [];
        })
      : [];
    index = 0;
    validation = '';
    submitter =
      form === lastForm && lastSubmitter?.isConnected
        ? lastSubmitter
        : recoverySubmitter(form, next);
    operationLabel = submitter?.textContent?.trim() || submitter?.value || '';
    returnFocus =
      !fields.length && next.source?.isConnected
        ? next.source
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
    await tick();
    if (!dialog.isConnected || generation !== recoveryGeneration) return;
    dialog.showModal();
    await tick();
    if (generation !== recoveryGeneration || !dialog.open) return;
    (editor ?? dialog.querySelector<HTMLElement>('button'))?.focus();
  }
  function close() {
    recoveryGeneration++;
    dialog.close();
    request = undefined;
    returnFocus?.isConnected && returnFocus.focus({ preventScroll: true });
  }
  beforeNavigate(() => {
    recoveryGeneration++;
    if (dialog?.open) dialog.close();
    request = undefined;
    fields = [];
    manualFields = [];
    form = undefined;
    lastForm = undefined;
    lastSubmitter = undefined;
    submitter = undefined;
    returnFocus = undefined;
    editor = undefined;
  });
  function mountEditor(host: HTMLElement, field: RecoveryField) {
    const clone = field.group
      ? document.createElement('select')
      : (field.control.cloneNode(true) as RecoveryControl);
    if (field.group && clone instanceof HTMLSelectElement) {
      clone.multiple = field.group[0]?.type === 'checkbox';
      clone.required =
        !clone.multiple ||
        field.group.some((control) => control.required) ||
        /required|at least one/i.test(field.message);
      if (!clone.multiple) clone.append(new Option(t('Please select an option.'), ''));
      for (const control of field.group) {
        const option = new Option(fieldTitle(control), control.value);
        option.selected = field.selected?.includes(control.value) ?? false;
        clone.append(option);
      }
    }
    clone.removeAttribute('id');
    clone.removeAttribute('name');
    clone.removeAttribute('aria-describedby');
    clone.removeAttribute('aria-invalid');
    clone.removeAttribute('data-validation-error-id');
    clone.removeAttribute('data-minor-target');
    clone.id = 'guided-recovery-field';
    clone.setCustomValidity('');
    if (!field.group) clone.value = field.value;
    if (clone instanceof HTMLInputElement) clone.checked = field.checked;
    const onEdit = () => {
      field.value = clone.value;
      field.checked = clone instanceof HTMLInputElement && clone.checked;
      if (field.group && clone instanceof HTMLSelectElement)
        field.selected = Array.from(clone.selectedOptions).map((option) => option.value);
      validation = '';
    };
    clone.addEventListener('input', onEdit);
    clone.addEventListener('change', onEdit);
    host.replaceChildren(clone);
    editor = clone;
    queueMicrotask(() => {
      if (dialog?.open) clone.focus();
    });
    return {
      destroy() {
        clone.removeEventListener('input', onEdit);
        clone.removeEventListener('change', onEdit);
        if (editor === clone) editor = undefined;
      },
    };
  }
  async function next() {
    if (editor && !editor.checkValidity()) {
      validation = validationErrorMessage(editor);
      editor.focus();
      return;
    }
    index += 1;
    validation = '';
    await tick();
    if (!current) dialog.querySelector<HTMLElement>('[data-recovery-apply]')?.focus();
  }
  async function apply() {
    if (!form?.isConnected || form.action !== formAction) {
      validation = t('The form has changed. Close this assistant and try the action again.');
      return;
    }
    const generation = recoveryGeneration;
    const target = form;
    const action = formAction;
    const originalSubmitter = submitter;
    const patches = fields.map((field) => ({ field, control: findControl(target, field.name) }));
    if (
      patches.some(
        ({ field, control }) =>
          !control || field.group?.some((el) => !el.isConnected || !editable(el)),
      )
    ) {
      validation = t('The form has changed. Close this assistant and try the action again.');
      return;
    }
    for (const { field, control } of patches) {
      if (!control) continue;
      if (field.group) {
        if (field.group[0]?.type === 'radio') {
          for (const item of field.group)
            item.checked = field.selected?.includes(item.value) ?? false;
          const selected = field.group.find((item) => item.checked);
          selected?.dispatchEvent(new Event('input', { bubbles: true }));
          selected?.dispatchEvent(new Event('change', { bubbles: true }));
          continue;
        }
        for (const item of field.group) {
          const checked = field.selected?.includes(item.value) ?? false;
          if (item.checked === checked) continue;
          item.checked = checked;
          item.dispatchEvent(new Event('input', { bubbles: true }));
          item.dispatchEvent(new Event('change', { bubbles: true }));
        }
        continue;
      }
      if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type))
        control.checked = field.checked;
      else control.value = field.value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await tick();
    if (generation !== recoveryGeneration) return;
    const button =
      originalSubmitter?.isConnected && originalSubmitter.form === target
        ? originalSubmitter
        : undefined;
    close();
    // Reuse ordinary form validation, server permissions, audit and action handlers.
    if (target.isConnected && target.action === action) target.requestSubmit(button);
  }
  onMount(() => {
    const unsubscribe = subscribeGuidedRecovery(open);
    const escape = (event: KeyboardEvent) => {
      if (dialog.open && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener('keydown', escape, true);
    let invalidQueued = false;
    let nativeControlId = 0;
    const captureSubmit = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement) || dialog.contains(target)) return;
      lastForm = target;
      const button = (event as SubmitEvent).submitter;
      lastSubmitter =
        button instanceof HTMLButtonElement || button instanceof HTMLInputElement
          ? button
          : undefined;
    };
    const captureClick = (event: Event) => {
      const button = (event.target as HTMLElement)?.closest('button, input[type="submit"]');
      if (
        (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) &&
        button.type === 'submit' &&
        button.form &&
        !dialog.contains(button)
      ) {
        lastForm = button.form;
        lastSubmitter = button;
      }
    };
    const invalid = (event: Event) => {
      const control = event.target;
      if (
        !(
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        ) ||
        dialog.contains(control) ||
        !control.form ||
        control.disabled ||
        !control.willValidate ||
        !control.getClientRects().length
      )
        return;
      event.preventDefault();
      if (invalidQueued) return;
      invalidQueued = true;
      const target = control.form;
      queueMicrotask(() => {
        invalidQueued = false;
        const errors: Record<string, string[]> = {};
        for (const el of Array.from(target.elements)) {
          if (
            (el instanceof HTMLInputElement ||
              el instanceof HTMLSelectElement ||
              el instanceof HTMLTextAreaElement) &&
            !el.disabled &&
            el.willValidate &&
            el.getClientRects().length > 0 &&
            !el.validity.valid
          ) {
            let name =
              el.name ||
              el.getAttribute('data-recovery-field')?.split(/\s+/).find(Boolean) ||
              el.id;
            if (!name) {
              name = `guided-native-control-${++nativeControlId}`;
              el.setAttribute('data-recovery-field', name);
            }
            errors[name] = [validationErrorMessage(el)];
          }
        }
        if (!Object.keys(errors).length) return;
        requestGuidedRecovery({
          form: target,
          source: control,
          problem: {
            code: 'NATIVE_VALIDATION',
            messageKey: 'problem.validation.fields',
            message: t('Please complete the missing or invalid fields to continue.'),
            params: {},
            fieldErrors: errors,
            remedies: [],
            correlationId: '',
          },
        });
      });
    };
    document.addEventListener('submit', captureSubmit, true);
    document.addEventListener('click', captureClick, true);
    document.addEventListener('invalid', invalid, true);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener('submit', captureSubmit, true);
      document.removeEventListener('click', captureClick, true);
      document.removeEventListener('invalid', invalid, true);
    };
  });
</script>

<dialog
  bind:this={dialog}
  data-ui="guided-recovery"
  aria-labelledby="guided-recovery-title"
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') event.stopPropagation();
  }}
>
  {#if request}
    <h2 id="guided-recovery-title">{t('Complete the action step by step')}</h2>
    <p>{message}</p>
    {#if current}
      <p class="progress" aria-live="polite">{index + 1} / {fields.length}</p>
      <label for="guided-recovery-field">{current.title}</label>
      <p>{localizedServerFieldMessage(locale, current.message)}</p>
      {#key index}<div class="editor" use:mountEditor={current}></div>{/key}
    {:else if fields.length}
      <p>{t('Review your answers before applying them and retrying the action.')}</p>
      <dl>
        {#each fields as field}<dt>{field.title}</dt>
          <dd>
            {field.group
              ? field.group
                  .filter((control) => field.selected?.includes(control.value))
                  .map(fieldTitle)
                  .join(', ')
              : field.control instanceof HTMLInputElement &&
                  ['checkbox', 'radio'].includes(field.control.type)
                ? field.checked
                  ? t('Yes')
                  : t('No')
                : field.control instanceof HTMLSelectElement
                  ? (Array.from(field.control.options).find(
                      (option) => option.value === field.value,
                    )?.textContent ?? field.value)
                  : field.value}
          </dd>{/each}
      </dl>
    {:else}
      <p>
        {t(
          'Review the explanation and available next step. Close this assistant to return to the form.',
        )}
      </p>
    {/if}
    {#if manualFields.length}
      <dl data-recovery-manual>
        {#each manualFields as field}<dt>{field.title}</dt>
          <dd>{localizedServerFieldMessage(locale, field.message)}</dd>{/each}
      </dl>
    {/if}
    {#if validation}<p role="alert">{validation}</p>{/if}
    {#if request.links?.length}<ul>
        {#each request.links as link}{#if link.href}<li>
              <a
                href={link.href}
                data-sveltekit-reload={link.reload ? '' : undefined}
                onclick={close}>{link.label}</a
              >
            </li>{/if}{/each}
      </ul>{/if}
    <div class="actions">
      <button type="button" onclick={close}>{t('Cancel')}</button>
      {#if index > 0}<button
          type="button"
          onclick={() => {
            index -= 1;
            validation = '';
          }}>{t('Back')}</button
        >{/if}
      {#if current}<button type="button" onclick={next}>{t('Next')}</button
        >{:else if fields.length}<button type="button" data-recovery-apply onclick={apply}
          >{t('Apply answers and retry')}{operationLabel ? `: ${operationLabel}` : ''}</button
        >{/if}
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(32rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    border: 1px solid #ccc;
    border-radius: 1rem;
    padding: 1.25rem;
    color: var(--ja-text-primary, #181716);
    background: var(--ja-surface, white);
  }
  dialog::backdrop {
    background: #0008;
  }
  h2 {
    margin-top: 0;
    font-size: 1.25rem;
  }
  p {
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  label,
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0.25rem 0 1rem;
    overflow-wrap: anywhere;
  }
  .editor :global(input),
  .editor :global(select),
  .editor :global(textarea) {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem;
    box-sizing: border-box;
  }
  .editor :global(input[type='checkbox']),
  .editor :global(input[type='radio']) {
    width: 2.75rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  button,
  a {
    min-height: 2.75rem;
  }
  button {
    padding: 0.6rem 0.9rem;
  }
  .progress {
    font-weight: 600;
  }
</style>
