// A warning can reveal the very business concept that a role must not learn.
// Inspect all prose fields and captions before creating any distributable artifact.
const businessEconomics = /\b(?:margins?|contribution|profit|profitability|internal\s+(?:(?:hourly|labor|loaded)\s+)?costs?|loaded\s+(?:labor\s+)?costs?|company\s+(?:direct\s+)?costs?|project\s+cost(?:ing)?)\b/i;
const operationalDisclosure = /\b(?:(?:client|customer)\s+(?:(?:charge|billing|hourly|daily|weekly)\s+)?(?:prices?|rates?)|(?:other\s+workers?|another\s+worker|colleagues?|another\s+person)[’']?s?\s+(?:pay|compensation|wages?))\b/i;
const commercialProcess = /\b(?:commercial|billability|customer\s+billing|payment\s+reversal)\b/i;
const financialComparison = /\b(?:economic data|customer expense recovery is a different|independently of the customer invoice cadence|does not set worker pay)\b/i;
const sensitiveFigures = new Set([
  'worker-first-shift-full-save-draft.png',
  'worker-first-shift-submitted.png',
  'worker-single-expense-full-save.png',
  'worker-normal-returned.png',
  'worker-normal-correction-draft.png',
  '05-worker1-actual-six-hours-form.png',
  '12-worker1-source-approved.png',
  '16-worker-phone-time.png',
  '17-worker-tablet-time.png',
  '20-worker-settlement-correction-blocked.png',
  'chief-expense-context-full-save.png',
  'chief-receipt-allocation-saved2.png',
  'chief-normal-correction-draft.png',
  '04-chief-own-eight-hours-form.png',
  '11-chief-tablet.png',
  '14-pm-own-time-form.png',
  'pm02-correction-approved-source.png',
  'pm02-reject-reason-action.png',
  'pm02-needs-changes-action.png',
  '16-pm-expenses-register.png',
  '34-pm-project-overview-landscape.png',
  'et03-full-save-draft.png',
  'et03-draft-saved-result.png',
  '01-external-own-time.png',
  'et02-approved-time-needs-note.png',
  's06-external-weekly-success-actual-states.png',
  's06-external-weekly-ordinary-correction-before.png',
  's06-coordinator-two-eligible-drafts.png',
  's06-coordinator-source-states-after.png',
  'sc05-own-expense-complete-receipt-form.png',
  'chief-wrong-correction-withdrawn.png',
  'worker-wrong-correction-withdrawn.png',

  '01-finance-Oct20-actual-sources.png', '01-auditor-Oct20-actual-sources.png',
  '29-finance-current-project-economics.png', '30-finance-current-cash.png',
  '33-finance-future-november-terms-input.png', '35-finance-future-terms-saved.png',
  '02-finance-fresh-review-before.png', '05-finance-expense-classification-input.png',
  '07-auditor-credit-receipt-reversal-reconciliation.png', '20-finance-accounting-review.png',
  '31-finance-clean-ready-review.png', '08-finance-new-stream-filled.png',
  'pm06-actual-sensitivity-upload-form.png',
]);

export function assertManualPrivacy(role, chapters) {
  if (role === 'owner') return;
  const operational = !['finance', 'auditor'].includes(role);
  function visit(value, path) {
    if (typeof value === 'string') {
      // Finance may enter this exact permitted field from Owner-approved inputs.
      const economicsText = role === 'finance' ? value.replaceAll('Internal hourly cost (USD)', '') : value;
      if (businessEconomics.test(economicsText) || financialComparison.test(value) || (operational && (operationalDisclosure.test(value) || commercialProcess.test(value))))
        throw new Error(`Owner-only disclosure in ${role}: ${path}`);
    } else if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${path}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (key === 'src') {
          if (sensitiveFigures.has(String(item).split('/').at(-1)))
            throw new Error(`Owner-only screenshot in ${role}: ${item}`);
        } else visit(item, `${path}.${key}`);
      }
    }
  }
  visit(chapters, 'chapters');
}
