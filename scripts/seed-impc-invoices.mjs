import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const dbPath =
  process.env.JA_DATABASE_PATH || resolve(process.cwd(), 'packages/database/data/demo.db');
const db = new DatabaseSync(dbPath);

console.log(`Seeding IMPC invoices into ${dbPath}...`);

const timestamp = new Date().toISOString();

// 1. Ensure Client IMPC Gmbh exists
const clientId = 'client-impc-gmbh';
db.prepare(
  `
  INSERT INTO client (id, client_code, client_number, legal_name, display_name, status, currency, timezone, billing_email, billing_address, payment_terms_days, po_reference, created_at, updated_at, version)
  VALUES (?, 'IMPC', 'C-0020', 'IMPC Gmbh', 'IMPC Gmbh', 'active', 'USD', 'America/Chicago', 'field.operations@j-aautomation.com', '112 Birkshire Dr, Georgetown TX 78626', 30, 'BBS Mexico', ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    legal_name=excluded.legal_name,
    display_name=excluded.display_name,
    billing_email=excluded.billing_email,
    billing_address=excluded.billing_address,
    updated_at=excluded.updated_at
`,
).run(clientId, timestamp, timestamp);

// 2. Ensure Legal Entity exists
let legalEntity = db.prepare("SELECT id FROM legal_entity WHERE status='active' LIMIT 1").get();
if (!legalEntity) {
  const leId = randomUUID();
  db.prepare(
    `
    INSERT INTO legal_entity (id, code, legal_name, currency, billing_address, company_identifiers, status, created_at, updated_at, version)
    VALUES (?, 'JA-USA', 'J&A Automation LLC', 'USD', '112 Birkshire Dr, Georgetown TX 78626', 'USA division', 'active', ?, ?, 1)
  `,
  ).run(leId, timestamp, timestamp);
  legalEntity = { id: leId };
}

// 3. Find active Tax Profile
let taxProfile = db
  .prepare("SELECT id FROM tax_profile WHERE currency='USD' AND status='active' LIMIT 1")
  .get();
const taxProfileId = taxProfile?.id || 'tax-profile-zero-usd';
if (!taxProfile) {
  db.prepare(
    `
    INSERT INTO tax_profile (id, name, currency, status, version)
    VALUES (?, 'Zero Tax Profile · 0%', 'USD', 'active', 1)
  `,
  ).run(taxProfileId);
}

// 4. Projects: BBS Mexico (CP020) and Junkers DFW (CP021)
const project1Id = 'project-cp020-bbs-mexico';
db.prepare(
  `
  INSERT INTO project (id, project_number, name, client_id, po_number, status, billing_model, currency, timezone, created_at, updated_at, version)
  VALUES (?, 'CP020', 'BBS Mexico', ?, 'BBS Mexico', 'active', 'time_and_materials', 'USD', 'America/Chicago', ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET po_number=excluded.po_number, updated_at=excluded.updated_at
`,
).run(project1Id, clientId, timestamp, timestamp);

const project2Id = 'project-cp021-junkers-dfw';
db.prepare(
  `
  INSERT INTO project (id, project_number, name, client_id, po_number, status, billing_model, currency, timezone, created_at, updated_at, version)
  VALUES (?, 'CP021', 'Junkers DFW', ?, 'Junkers DFW', 'active', 'time_and_materials', 'USD', 'America/Chicago', ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET po_number=excluded.po_number, updated_at=excluded.updated_at
`,
).run(project2Id, clientId, timestamp, timestamp);

// 5. Billing Rules
const rule1Id = 'rule-cp020-labor';
db.prepare(
  `
  INSERT INTO billing_rule (id, project_id, legal_entity_id, tax_profile_id, stream_type, template_id, cadence_type, currency, enabled, effective_from, grouping_mode, created_at, updated_at, version)
  VALUES (?, ?, ?, ?, 'labor', 'labor-detailed', 'monthly', 'USD', 1, '2026-01-01', 'summary', ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
`,
).run(rule1Id, project1Id, legalEntity.id, taxProfileId, timestamp, timestamp);

const rule2Id = 'rule-cp021-expense';
db.prepare(
  `
  INSERT INTO billing_rule (id, project_id, legal_entity_id, tax_profile_id, stream_type, template_id, cadence_type, currency, enabled, effective_from, grouping_mode, created_at, updated_at, version)
  VALUES (?, ?, ?, ?, 'expense', 'expenses-detailed', 'monthly', 'USD', 1, '2026-01-01', 'summary', ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
`,
).run(rule2Id, project2Id, legalEntity.id, taxProfileId, timestamp, timestamp);

// Defaults for company info and terms
const defaultCompany = {
  name: 'J&A Automation LLC',
  division: 'USA division',
  phone: '+1 (864) 208 4684',
  address: '112 Birkshire Dr, Georgetown TX 78626',
  email: 'field.operations@j-aautomation.com',
  website: 'www.j-aautomation.com',
};

const defaultTerms = {
  bankSwiftNumber: 'WFBIUS6S',
  bankAccountNumber: '8769915615',
  bankName: 'Wells Fargo Bank',
  beneficiary: 'J&A Automation LLC',
  pastDueNotice:
    'Past Due account subject to service charge of 1.5% per month and/or maximum permitted by law',
};

// 6. Invoice 1: CP020-013 (Labor Detailed - 8 workers)
const invoice1Id = 'invoice-cp020-013';
const inv1Lines = [
  { description: 'Gabriel Hours CW31 and CW32', num: 263, den: 2, rate: 7000, subtotal: 920500 },
  { description: 'Maico Hours CW31 and CW32', num: 673, den: 5, rate: 5500, subtotal: 740300 },
  { description: 'Victor Hours CW31 and CW32', num: 259, den: 2, rate: 5500, subtotal: 712250 },
  { description: 'Andrew Hours CW31 and CW32', num: 269, den: 2, rate: 5500, subtotal: 739750 },
  { description: 'Lucas Hours CW31 and CW32', num: 653, den: 5, rate: 5500, subtotal: 718300 },
  { description: 'Luiz Hours CW31 and CW32', num: 503, den: 4, rate: 5500, subtotal: 691625 },
  { description: 'Fernando Hours CW31 and CW32', num: 108, den: 1, rate: 5500, subtotal: 594000 },
  { description: 'Alejandro Hours CW31 and CW32', num: 114, den: 1, rate: 5500, subtotal: 627000 },
];

const inv1Snapshot = {
  template: { id: 'labor-detailed', version: 1 },
  number: 'CP020-013',
  invoiceNumber: 'CP020-013',
  purchaseNo: 'BBS Mexico',
  issueDate: '8/10/2026',
  dueDate: '9/10/2026',
  currency: 'USD',
  companyInfo: defaultCompany,
  termsAndInstructions: defaultTerms,
  discountMinor: '0',
  legalEntity: {
    legalName: 'J&A Automation LLC',
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
  },
  client: {
    legalName: 'IMPC Gmbh',
    contact: { name: 'Hans Schwiedop' },
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
    billingEmail: 'field.operations@j-aautomation.com',
  },
  project: { number: 'CP020', name: 'BBS Mexico', poNumber: 'BBS Mexico' },
  calculation: { currency: 'USD', subtotalMinor: '5743725', taxMinor: '0', totalMinor: '5743725' },
  lines: inv1Lines.map((l) => ({
    description: l.description,
    quantity_numerator: l.num,
    quantity_denominator: l.den,
    qty: (l.num / l.den).toFixed(2),
    quantity: (l.num / l.den).toFixed(2),
    hours: (l.num / l.den).toFixed(2),
    unit_price_minor: l.rate.toString(),
    subtotal_minor: l.subtotal.toString(),
    amount_minor: l.subtotal.toString(),
  })),
  updatedAt: new Date().toISOString(),
};

db.prepare(
  `
  INSERT INTO invoice (id, project_id, billing_rule_id, invoice_number, stream_type, state, currency, subtotal_minor, tax_minor, total_minor, period_start, period_end, issued_at, snapshot_json, created_at, updated_at, version)
  VALUES (?, ?, ?, 'CP020-013', 'labor', 'draft', 'USD', 5743725, 0, 5743725, '2026-08-01', '2026-08-14', '2026-08-10T12:00:00.000Z', ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    invoice_number=excluded.invoice_number,
    subtotal_minor=excluded.subtotal_minor,
    total_minor=excluded.total_minor,
    snapshot_json=excluded.snapshot_json,
    updated_at=excluded.updated_at
`,
).run(invoice1Id, project1Id, rule1Id, JSON.stringify(inv1Snapshot), timestamp, timestamp);

db.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(invoice1Id);
for (const line of inv1Lines) {
  db.prepare(
    `
    INSERT INTO invoice_line (id, invoice_id, description, quantity_numerator, quantity_denominator, unit_price_minor, subtotal_minor, source_type, source_id, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'time', ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    invoice1Id,
    line.description,
    line.num,
    line.den,
    line.rate,
    line.subtotal,
    randomUUID(),
    JSON.stringify(line),
    timestamp,
  );
}

// 7. Invoice 2: CP020-014 (Josafa Hours + Expenses)
const invoice2Id = 'invoice-cp020-014';
const inv2Lines = [
  { description: 'Josafa Hours CW31 and CW32', num: 148, den: 1, rate: 7000, subtotal: 1036000 },
  { description: 'Josafa Perdiem CW31 and CW32', num: 14, den: 1, rate: 5000, subtotal: 70000 },
  {
    description: 'Flight GYN-DFW-GYN Josafa Reimbursable Expenses',
    num: 1,
    den: 1,
    rate: 97380,
    subtotal: 97380,
  },
  {
    description: 'Uber Airport Josafa Reimbursable Expenses',
    num: 1,
    den: 1,
    rate: 3631,
    subtotal: 3631,
  },
  {
    description: 'Luggage Josafa Reimbursable Expenses',
    num: 1,
    den: 1,
    rate: 7000,
    subtotal: 7000,
  },
  {
    description: 'Hotel Josafa Reimbursable Expenses',
    num: 1,
    den: 1,
    rate: 85632,
    subtotal: 85632,
  },
  {
    description: 'Car Rental DFW Josafa Reimbursable Expenses',
    num: 1,
    den: 1,
    rate: 25898,
    subtotal: 25898,
  },
  {
    description: 'Fuel Josafa Reimbursable Expenses',
    num: 1,
    den: 1,
    rate: 10790,
    subtotal: 10790,
  },
];

const inv2Snapshot = {
  template: { id: 'expenses-detailed', version: 1 },
  number: 'CP020-014',
  invoiceNumber: 'CP020-014',
  purchaseNo: 'Junkers DFW',
  issueDate: '8/10/2026',
  dueDate: '9/10/2026',
  currency: 'USD',
  companyInfo: defaultCompany,
  termsAndInstructions: defaultTerms,
  discountMinor: '0',
  legalEntity: {
    legalName: 'J&A Automation LLC',
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
  },
  client: {
    legalName: 'IMPC Gmbh',
    contact: { name: 'Hans Schwiedop' },
    billingAddress: '112 Birkshire Dr, Georgetown TX 78626',
    billingEmail: 'field.operations@j-aautomation.com',
  },
  project: { number: 'CP021', name: 'Junkers DFW', poNumber: 'Junkers DFW' },
  calculation: { currency: 'USD', subtotalMinor: '1336331', taxMinor: '0', totalMinor: '1336331' },
  lines: inv2Lines.map((l) => ({
    description: l.description,
    quantity_numerator: l.num,
    quantity_denominator: l.den,
    qty: (l.num / l.den).toFixed(2),
    quantity: (l.num / l.den).toFixed(2),
    hours: (l.num / l.den).toFixed(2),
    unit_price_minor: l.rate.toString(),
    subtotal_minor: l.subtotal.toString(),
    amount_minor: l.subtotal.toString(),
  })),
  updatedAt: new Date().toISOString(),
};

db.prepare(
  `
  INSERT INTO invoice (id, project_id, billing_rule_id, invoice_number, stream_type, state, currency, subtotal_minor, tax_minor, total_minor, period_start, period_end, issued_at, snapshot_json, created_at, updated_at, version)
  VALUES (?, ?, ?, 'CP020-014', 'expense', 'draft', 'USD', 1336331, 0, 1336331, '2026-08-01', '2026-08-14', '2026-08-10T12:00:00.000Z', ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    invoice_number=excluded.invoice_number,
    subtotal_minor=excluded.subtotal_minor,
    total_minor=excluded.total_minor,
    snapshot_json=excluded.snapshot_json,
    updated_at=excluded.updated_at
`,
).run(invoice2Id, project2Id, rule2Id, JSON.stringify(inv2Snapshot), timestamp, timestamp);

db.prepare('DELETE FROM invoice_line WHERE invoice_id=?').run(invoice2Id);
for (const line of inv2Lines) {
  db.prepare(
    `
    INSERT INTO invoice_line (id, invoice_id, description, quantity_numerator, quantity_denominator, unit_price_minor, subtotal_minor, source_type, source_id, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    invoice2Id,
    line.description,
    line.num,
    line.den,
    line.rate,
    line.subtotal,
    randomUUID(),
    JSON.stringify(line),
    timestamp,
  );
}

db.close();
console.log('Successfully seeded IMPC Gmbh client and invoices CP020-013 and CP020-014!');
