// A warning can reveal the very business concept that a role must not learn.
// Inspect all prose fields and captions before creating any distributable artifact.
const businessEconomics = /\b(?:margins?|contribution|profit|profitability|internal\s+(?:(?:hourly|labor|loaded)\s+)?costs?|loaded\s+(?:labor\s+)?costs?|company\s+(?:direct\s+)?costs?|project\s+cost(?:ing)?)\b/i;
const operationalDisclosure = /\b(?:(?:client|customer)\s+(?:(?:charge|billing|hourly|daily|weekly)\s+)?(?:prices?|rates?)|(?:other\s+workers?|another\s+worker|colleagues?|another\s+person)[’']?s?\s+(?:pay|compensation|wages?))\b/i;
const financialComparison = /\b(?:economic data|customer expense recovery is a different|independently of the customer invoice cadence|does not set worker pay)\b/i;
const sensitiveFigures = new Set([
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
      if (businessEconomics.test(value) || financialComparison.test(value) || (operational && operationalDisclosure.test(value)))
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
