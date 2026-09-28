/**
 * Packages the deterministic synthetic canonical-renderer reader matrix.
 *
 * Routed application journeys remain separate acceptance evidence. The guard
 * rejects production-like paths and unexpected file types before copying the
 * selected synthetic reader evidence into the handback tree.
 *
 * Example (after a disposable E2E/artifact run):
 *   JA_ARTIFACT_SOURCE_DIR=/tmp/ja-e2e-artifacts-<token> \
 *   JA_ARTIFACT_CANDIDATE_SHA=<sha> \
 *   node --experimental-strip-types scripts/generate-client-ready-artifacts.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const root = process.cwd();
const source = process.env.JA_ARTIFACT_SOURCE_DIR?.trim();
const candidate = process.env.JA_ARTIFACT_CANDIDATE_SHA?.trim();
const destination = resolve(root, 'docs/evidence/client-ready-20260906/artifacts');
const allowed = new Map([
  ['customer-report.pdf', 'customer_report_pdf'],
  ['worker-report.pdf', 'worker_report_pdf'],
  ['finance-report.pdf', 'finance_report_pdf'],
  ['invoice-labor.pdf', 'labor_invoice_pdf'],
  ['invoice-expenses.pdf', 'expense_invoice_pdf'],
  ['credit.pdf', 'credit_note_pdf'],
  ['accounting-pack.pdf', 'accounting_pack_pdf'],
  ['accounting-pack.xlsx', 'accounting_pack_xlsx'],
  ['accounting-pack.csv', 'accounting_pack_csv'],
] as const);
const matrixLocales = ['en', 'es', 'pt'] as const;
const matrixDatasets = ['empty', 'ordinary', 'long'] as const;
const matrixFiles = new Map([
  ['customer-report.pdf', 'customer_report_pdf'],
  ['finance-report.pdf', 'finance_report_pdf'],
  ['worker-report.pdf', 'worker_report_pdf'],
  ['worker-report.csv', 'worker_report_csv'],
  ['invoice-labor.pdf', 'labor_invoice_pdf'],
  ['invoice-expenses.pdf', 'expense_invoice_pdf'],
  ['credit.pdf', 'credit_note_pdf'],
  ['accounting-pack-pdf.pdf', 'accounting_pack_pdf'],
  ['accounting-pack-xlsx.xlsx', 'accounting_pack_xlsx'],
  ['accounting-pack-invoice_csv.csv', 'accounting_pack_invoice_csv'],
  ['accounting-pack-expense_csv.csv', 'accounting_pack_expense_csv'],
  ['accounting-pack-json.json', 'accounting_pack_json'],
  ['project-finance.xlsx', 'project_finance_xlsx'],
] as const);

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSafeSource(value: string): string {
  const absolute = resolve(value);
  // Evidence artifacts are sourced from an ephemeral, isolated test run. Do
  // not make a convenient copy operation capable of reading deployed storage.
  if (!absolute.startsWith(`${resolve('/tmp')}${sep}`))
    throw new Error('JA_ARTIFACT_SOURCE_DIR must be an isolated /tmp directory.');
  if (!existsSync(absolute) || !statSync(absolute).isDirectory())
    throw new Error('JA_ARTIFACT_SOURCE_DIR must name an existing directory.');
  return absolute;
}

function expectedBytes(file: string, bytes: Buffer): void {
  if (bytes.length === 0) throw new Error(`${file} is empty.`);
  if (file.endsWith('.pdf') && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new Error(`${file} is not a PDF artifact.`);
  if (file.endsWith('.xlsx') && !(bytes[0] === 0x50 && bytes[1] === 0x4b))
    throw new Error(`${file} is not an XLSX zip artifact.`);
  if (file.endsWith('.csv') && bytes.includes(0)) throw new Error(`${file} contains a NUL byte.`);
}

function main(): void {
  if (!source || !candidate)
    throw new Error('JA_ARTIFACT_SOURCE_DIR and JA_ARTIFACT_CANDIDATE_SHA are required.');
  if (!/^[0-9a-f]{40}$/iu.test(candidate))
    throw new Error('JA_ARTIFACT_CANDIDATE_SHA must be a Git SHA.');
  const sourceDir = assertSafeSource(source);
  const observed = new Set(readdirSync(sourceDir));
  const missing = [...allowed.keys()].filter((file) => !observed.has(file));
  if (missing.length)
    throw new Error(`Canonical artifact output is incomplete: ${missing.join(', ')}`);
  mkdirSync(destination, { recursive: true });
  const records: Record<string, unknown>[] = [...allowed].map(([file, type]) => {
    const input = resolve(sourceDir, file);
    if (relative(sourceDir, input).startsWith('..'))
      throw new Error('Artifact path escaped source directory.');
    const bytes = readFileSync(input);
    expectedBytes(file, bytes);
    const output = resolve(destination, file);
    writeFileSync(output, bytes, { flag: 'w' });
    return {
      type,
      file: `docs/evidence/client-ready-20260906/artifacts/${file}`,
      size: bytes.length,
      sha256: sha256(bytes),
      source: 'synthetic_canonical_renderer_reference',
      candidateSha: candidate,
      readerCheck: file.endsWith('.pdf')
        ? 'pending_pdfinfo_pdftotext_render'
        : file.endsWith('.xlsx')
          ? 'pending_external_xlsx_reader'
          : 'pending_csv_parser',
    };
  });
  for (const locale of matrixLocales) {
    for (const dataset of matrixDatasets) {
      const matrixSource = resolve(sourceDir, 'matrix', locale, dataset);
      if (!existsSync(matrixSource) || !statSync(matrixSource).isDirectory())
        throw new Error(`Artifact matrix directory is missing: ${locale}/${dataset}`);
      const observedMatrix = new Set(readdirSync(matrixSource));
      const missingMatrix = [...matrixFiles.keys()].filter((file) => !observedMatrix.has(file));
      if (missingMatrix.length)
        throw new Error(
          `Artifact matrix is incomplete for ${locale}/${dataset}: ${missingMatrix.join(', ')}`,
        );
      const matrixDestination = resolve(destination, 'matrix', locale, dataset);
      mkdirSync(matrixDestination, { recursive: true });
      for (const [file, type] of matrixFiles) {
        const input = resolve(matrixSource, file);
        if (relative(matrixSource, input).startsWith('..'))
          throw new Error('Artifact matrix path escaped source directory.');
        const bytes = readFileSync(input);
        expectedBytes(file, bytes);
        const output = resolve(matrixDestination, file);
        writeFileSync(output, bytes, { flag: 'w' });
        records.push({
          type,
          locale,
          dataset,
          file: `docs/evidence/client-ready-20260906/artifacts/matrix/${locale}/${dataset}/${file}`,
          size: bytes.length,
          sha256: sha256(bytes),
          source: 'synthetic_canonical_renderer_reference',
          candidateSha: candidate,
          readerCheck: file.endsWith('.pdf')
            ? 'pending_pdfinfo_pdftotext_render'
            : file.endsWith('.xlsx')
              ? 'pending_external_xlsx_reader'
              : file.endsWith('.csv')
                ? 'pending_csv_parser'
                : 'pending_json_parser',
        });
      }
    }
  }
  writeFileSync(
    resolve(destination, 'ARTIFACT_GENERATION.json'),
    `${JSON.stringify({ candidateSha: candidate, generatedAt: new Date().toISOString(), records }, null, 2)}\n`,
  );
  console.log(JSON.stringify(records, null, 2));
}

if (process.argv[1]?.includes('generate-client-ready-artifacts')) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
