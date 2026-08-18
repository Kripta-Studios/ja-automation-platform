import type { MoneyJson } from '@ja/money';
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
export function invoiceHtml(snapshot: {
  number: string;
  legalEntity: string;
  client: string;
  total: MoneyJson;
}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial;color:#17191b}h1{border-bottom:4px solid #d71920;padding-bottom:16px}dl{display:grid;grid-template-columns:150px 1fr}strong{font-size:22px}</style></head><body><h1>Invoice ${escape(snapshot.number)}</h1><dl><dt>From</dt><dd>${escape(snapshot.legalEntity)}</dd><dt>Bill to</dt><dd>${escape(snapshot.client)}</dd><dt>Total</dt><dd><strong>${escape(snapshot.total.currency)} ${escape(snapshot.total.minorUnits)}</strong></dd></dl></body></html>`;
}
