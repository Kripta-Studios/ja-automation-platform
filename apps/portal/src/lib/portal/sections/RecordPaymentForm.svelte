<script lang="ts">
  import { billingFixText } from '../billing-fix-copy';
  /**
   * One-step "Record payment": amount (defaults to the balance), date (today),
   * method and an optional reference. Posts to the existing audited recordPayment
   * action; the per-form idempotency key makes a double submit a no-op.
   */
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { untrack } from 'svelte';
  import { moneyText, type MoneyCopyKey } from '../money-copy';
  import { inputTextToMinor, minorToInputText } from '../payment-money';

  let {
    invoiceId,
    currency,
    outstandingMinor,
    action,
    locale = 'en',
    money,
    oncancel,
    ondone,
  }: {
    invoiceId: string;
    currency: string;
    outstandingMinor: string;
    action: string;
    locale?: string;
    money: (minor: unknown, currency?: string) => string;
    oncancel?: () => void;
    ondone?: (message: string) => void;
  } = $props();

  const t = (key: MoneyCopyKey, params: Record<string, string | number> = {}) =>
    moneyText(locale, key, params);
  const methods = ['bank_transfer', 'check', 'card', 'cash', 'other'] as const;
  const methodEnglish: Record<(typeof methods)[number], string> = {
    bank_transfer: 'Bank transfer',
    check: 'Cheque',
    card: 'Card',
    cash: 'Cash',
    other: 'Other',
  };
  /** Plain amount text in the invoice currency's own decimals (JPY has none). */
  const toDecimal = (minor: string) => minorToInputText(minor, currency);
  /** Exact parse of a typed amount into minor units (comma or dot decimals). */
  const toMinor = (text: string): bigint | null =>
    inputTextToMinor(text.trim().replace(/\s/gu, ''), currency);
  const localToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  };

  let amount = $state(untrack(() => toDecimal(outstandingMinor)));
  let receivedOn = $state(localToday());
  let method = $state<(typeof methods)[number]>('bank_transfer');
  let reference = $state('');
  let busy = $state(false);
  let problem = $state('');
  let idempotencyKey = $state(
    `pay-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`,
  );

  const entered = $derived(toMinor(amount));
  const balance = $derived(BigInt(outstandingMinor));
  const after = $derived(entered === null ? null : balance - entered);
  const amountProblem = $derived(
    entered === null || entered <= 0n
      ? t('amountInvalid')
      : entered > balance
        ? t('paymentTooMuch', { amount: money(outstandingMinor, currency) })
        : '',
  );

  const submit: SubmitFunction = ({ formData, cancel }) => {
    if (amountProblem || entered === null) {
      problem = amountProblem;
      cancel();
      return;
    }
    // T64 (audit 2026-11-22): a payment is permanent evidence; confirm the amount first.
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        billingFixText(locale, 'confirmRecordPayment', { amount: money(entered.toString(), currency) }),
      )
    ) {
      cancel();
      return;
    }
    problem = '';
    busy = true;
    formData.set('amount', toDecimal(entered.toString()));
    const ref = reference.trim();
    formData.set('reference', ref ? `${methodEnglish[method]} · ${ref}` : methodEnglish[method]);
    const newBalance = money((balance - entered).toString(), currency);
    return async ({ result, update }) => {
      busy = false;
      const data = (result.type === 'success' || result.type === 'failure' ? result.data : null) as
        | { messageKey?: string; message?: string }
        | null;
      if (result.type === 'success') {
        const message =
          data?.messageKey === 'action.billing.paymentAlreadyRecorded'
            ? t('paymentDuplicate')
            : t('paymentSaved', { amount: newBalance });
        idempotencyKey = `pay-${crypto.randomUUID()}`;
        await update({ reset: false, invalidateAll: true });
        ondone?.(message);
      } else {
        problem = t('paymentFailed', {
          reason: String(data?.message ?? (result.type === 'error' ? result.error?.message : '') ?? ''),
        });
      }
    };
  };
</script>

<form
  method="POST"
  {action}
  class="pay-form"
  use:enhance={submit}
  data-record-payment={invoiceId}
  novalidate
>
  <input type="hidden" name="invoiceId" value={invoiceId} />
  <input type="hidden" name="currency" value={currency} />
  <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
  <div class="pay-form__fields">
    <label
      >{t('amount')} ({currency})
      <input
        name="amount"
        inputmode="decimal"
        autocomplete="off"
        bind:value={amount}
        aria-invalid={Boolean(problem && amountProblem)}
        data-payment-amount
      /></label
    >
    <label
      >{t('receivedOn')}
      <input type="date" name="receivedOn" bind:value={receivedOn} max={localToday()} required /></label
    >
    <label
      >{t('method')}
      <select bind:value={method} data-payment-method>
        {#each methods as option (option)}<option value={option}>{t(option)}</option>{/each}
      </select></label
    >
    <label
      >{t('reference')}
      <input
        name="referenceText"
        bind:value={reference}
        placeholder={t('referenceHint')}
        maxlength="160"
        autocomplete="off"
        data-payment-reference
      /></label
    >
  </div>
  <p class="pay-form__after" aria-live="polite" data-payment-after>
    {#if after !== null && after === 0n}
      {t('paidInFull')}
    {:else if after !== null && after > 0n}
      {t('newBalance', { amount: money(after.toString(), currency) })}
    {/if}
  </p>
  {#if problem}<p class="pay-form__error" role="alert">{problem}</p>{/if}
  <div class="pay-form__actions">
    {#if oncancel}<button type="button" class="secondary-button" onclick={oncancel}
        >{t('cancel')}</button
      >{/if}
    <button type="submit" class="primary-button" disabled={busy} data-payment-save
      >{busy ? t('saving') : t('save')}</button
    >
  </div>
</form>

<style>
  .pay-form {
    display: grid;
    gap: 0.6rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--ja-line, #d9dee5);
    border-radius: 12px;
    background: var(--ja-paper, #f7f8fa);
  }
  .pay-form__fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.6rem;
  }
  .pay-form label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .pay-form input,
  .pay-form select {
    min-height: 44px;
    border: 1px solid var(--ja-control-border, #b8c0cc);
    border-radius: 8px;
    padding: 0 0.7rem;
    font: inherit;
    background: var(--ja-white, #fff);
    min-width: 0;
  }
  .pay-form__after {
    margin: 0;
    font-weight: 600;
    min-height: 1.2em;
  }
  .pay-form__error {
    margin: 0;
    color: #b42318;
    font-weight: 600;
  }
  .pay-form__actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  @media (max-width: 760px) {
    .pay-form__actions > * {
      flex: 1;
    }
  }
</style>
