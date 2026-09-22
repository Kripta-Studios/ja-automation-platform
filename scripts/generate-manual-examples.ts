import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import {
  accountingPackArtifactBuilders,
  dailyReportPdf,
  expenseRegisterExport,
  invoiceCollectionLedgerCsv,
  invoiceCollectionLedgerXlsx,
  invoicePdf,
  periodReportPdf,
  projectFinanceXlsx,
  technicalReportPdf,
  workerStatementCsv,
  workerStatementPdf,
  type ReportLocale,
} from '@ja/reporting';
import type { InvoiceTemplateId } from '../packages/invoice-templates/src/index.ts';
import {
  exampleAccountingPack,
  exampleCustomerPeriod,
  exampleDailyReport,
  exampleExpenses,
  exampleIdentity,
  exampleInternalPeriod,
  exampleInvoiceSnapshot,
  exampleLedgerRows,
  exampleLocales,
  examplePeriod,
  exampleProjectFinance,
  exampleSupplierRows,
  exampleTechnicalReport,
  exampleWorkerStatement,
  fixtureReconciliation,
} from './manual-example-fixtures.ts';

type ArtifactFormat = 'pdf' | 'xlsx' | 'csv' | 'json';
type ManifestEntry = Readonly<{
  id: string;
  family: string;
  format: ArtifactFormat;
  locale: ReportLocale | null;
  file: string;
  renderer: string;
  source: string;
  description: string;
  hash: string;
  bytes: number;
}>;

type CollectionsModule = Readonly<{
  collectionsWorkbenchCsv: (
    rows: readonly Readonly<Record<string, unknown>>[],
    asOf: string,
    report: 'customers' | 'forecast' | 'priorities',
  ) => Uint8Array;
}>;

type SupplierCsvModule = Readonly<{
  supplierCsv: (rows: unknown[][]) => string;
}>;

type SupplierCopyModule = Readonly<{
  supplierCopy: Record<ReportLocale, Record<string, string>>;
  supplierCategoryLabel: (locale: ReportLocale, category: string) => string;
  supplierStateLabel: (locale: ReportLocale, state: string) => string;
}>;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutput = resolve(repoRoot, 'docs/manuals/examples');

function parseArguments(argv: readonly string[]): { output: string; skipPdf: boolean } {
  let output = defaultOutput;
  let skipPdf = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--skip-pdf') {
      skipPdf = true;
      continue;
    }
    if (argument === '--output') {
      const value = argv[index + 1];
      if (!value) throw new Error('--output requires a directory');
      output = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { output, skipPdf };
}

function isWithin(parent: string, target: string): boolean {
  const path = relative(parent, target);
  return path === '' || (!path.startsWith('..') && !path.startsWith('/'));
}

function safeOutputDirectory(requested: string): string {
  const target = resolve(requested);
  if (!isWithin(defaultOutput, target) && !isWithin('/tmp', target))
    throw new Error('Output must stay under docs/manuals/examples or /tmp');
  mkdirSync(target, { recursive: true });
  const realTarget = realpathSync(target);
  const realDefaultParent = realpathSync(resolve(repoRoot, 'docs/manuals'));
  if (
    !isWithin(resolve(realDefaultParent, 'examples'), realTarget) &&
    !isWithin('/tmp', realTarget)
  )
    throw new Error('Output directory resolves outside the allowed roots');
  if (!lstatSync(realTarget).isDirectory())
    throw new Error('Output destination must be a directory');
  return realTarget;
}

function bytes(value: Uint8Array | string): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

async function portalModules(): Promise<{
  server: ViteDevServer;
  collections: CollectionsModule;
  supplierCsv: SupplierCsvModule;
  supplierCopy: SupplierCopyModule;
}> {
  const portalRoot = resolve(repoRoot, 'apps/portal');
  const server = await createServer({
    // The exporter only needs server-side TypeScript modules. Loading the full
    // SvelteKit Vite config makes this standalone script depend on a generated
    // .svelte-kit directory and can override `root` based on the caller's cwd.
    configFile: false,
    root: portalRoot,
    resolve: {
      alias: {
        $lib: resolve(portalRoot, 'src/lib'),
      },
    },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const [collections, supplierCsv, supplierCopy] = await Promise.all([
      server.ssrLoadModule('/src/lib/server/collections-workbench-export.ts'),
      server.ssrLoadModule('/src/lib/server/supplier-csv.ts'),
      server.ssrLoadModule('/src/routes/app/supplier/copy.ts'),
    ]);
    return {
      server,
      collections: collections as CollectionsModule,
      supplierCsv: supplierCsv as SupplierCsvModule,
      supplierCopy: supplierCopy as SupplierCopyModule,
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

const invoiceTemplates = [
  'labor-detailed',
  'labor-summary',
  'expenses-detailed',
  'fixed-milestone',
  'credit-adjustment',
] as const satisfies readonly InvoiceTemplateId[];

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const output = safeOutputDirectory(options.output);
  const manifest: ManifestEntry[] = [];
  const seen = new Set<string>();
  const save = (
    metadata: Omit<ManifestEntry, 'hash' | 'bytes'>,
    content: Uint8Array | string,
  ): void => {
    if (seen.has(metadata.file) || seen.has(metadata.id))
      throw new Error(`Duplicate artifact identity: ${metadata.id} / ${metadata.file}`);
    const artifact = bytes(content);
    writeFileSync(resolve(output, metadata.file), artifact);
    manifest.push({
      ...metadata,
      hash: createHash('sha256').update(artifact).digest('hex'),
      bytes: artifact.byteLength,
    });
    seen.add(metadata.file);
    seen.add(metadata.id);
  };

  if (!options.skipPdf) {
    for (const template of invoiceTemplates) {
      for (const locale of exampleLocales) {
        save(
          {
            id: `invoice-${template}-${locale}`,
            family: 'Invoice',
            format: 'pdf',
            locale,
            file: `invoice-${template}-${locale}.pdf`,
            renderer: '@ja/reporting invoicePdf',
            source: '@ja/invoice-templates registered template',
            description: `${template} invoice; synthetic EXAMPLE and NOT PAYABLE data.`,
          },
          invoicePdf(exampleInvoiceSnapshot(template, locale)),
        );
      }
    }
    for (const locale of exampleLocales) {
      save(
        {
          id: `period-customer-${locale}`,
          family: 'Customer period report',
          format: 'pdf',
          locale,
          file: `period-report-customer-${locale}.pdf`,
          renderer: '@ja/reporting periodReportPdf',
          source: 'customer-safe immutable period snapshot fixture',
          description: 'Customer-facing approved activities and signature report.',
        },
        periodReportPdf({ ...exampleCustomerPeriod, locale }),
      );
      save(
        {
          id: `period-internal-${locale}`,
          family: 'Internal period report',
          format: 'pdf',
          locale,
          file: `period-report-internal-${locale}.pdf`,
          renderer: '@ja/reporting periodReportPdf',
          source: 'internal immutable period snapshot fixture',
          description: 'Internal period report with reconciled financial summary.',
        },
        periodReportPdf({ ...exampleInternalPeriod, locale }),
      );
      save(
        {
          id: `daily-report-${locale}`,
          family: 'Daily field report',
          format: 'pdf',
          locale,
          file: `daily-field-report-${locale}.pdf`,
          renderer: '@ja/reporting dailyReportPdf',
          source: 'daily report source-record fixture',
          description: 'Approved synthetic daily field report.',
        },
        dailyReportPdf({ ...exampleDailyReport, locale }),
      );
      save(
        {
          id: `technical-report-${locale}`,
          family: 'Technical / PLC report',
          format: 'pdf',
          locale,
          file: `technical-plc-report-${locale}.pdf`,
          renderer: '@ja/reporting technicalReportPdf',
          source: 'technical report source-record fixture',
          description: 'Approved synthetic technical change and validation report.',
        },
        technicalReportPdf({ ...exampleTechnicalReport, locale }),
      );
    }
  }

  for (const locale of exampleLocales) {
    const statement = exampleWorkerStatement(locale);
    if (!options.skipPdf)
      save(
        {
          id: `worker-statement-pdf-${locale}`,
          family: 'Worker statement',
          format: 'pdf',
          locale,
          file: `worker-statement-${locale}.pdf`,
          renderer: '@ja/reporting workerStatementPdf',
          source: 'worker-safe statement snapshot fixture',
          description: 'Own activity, compensation, settlement and reimbursement statement.',
        },
        workerStatementPdf(statement),
      );
    save(
      {
        id: `worker-statement-csv-${locale}`,
        family: 'Worker statement',
        format: 'csv',
        locale,
        file: `worker-statement-${locale}.csv`,
        renderer: '@ja/reporting workerStatementCsv',
        source: 'worker-safe statement snapshot fixture',
        description: 'Machine-readable localized worker statement.',
      },
      workerStatementCsv(statement),
    );
  }

  for (const builder of accountingPackArtifactBuilders({
    ...exampleAccountingPack,
    locale: 'en',
  })) {
    if (builder.type === 'pdf' && options.skipPdf) continue;
    save(
      {
        id: `accounting-pack-${builder.type}-${builder.type === 'pdf' ? 'en' : 'canonical'}`,
        family: 'Accounting pack',
        format: builder.extension as ArtifactFormat,
        locale: builder.type === 'pdf' ? 'en' : null,
        file: `accounting-pack-${builder.type}${builder.type === 'pdf' ? '-en' : ''}.${builder.extension}`,
        renderer: `@ja/reporting accountingPackArtifactBuilders:${builder.type}`,
        source: 'reconciled accounting pack snapshot fixture',
        description: `Canonical ${builder.type} accounting-pack artifact.`,
      },
      builder.build(),
    );
  }
  if (!options.skipPdf) {
    for (const locale of ['es', 'pt'] as const) {
      const localizedPdf = accountingPackArtifactBuilders({
        ...exampleAccountingPack,
        locale,
      }).find((builder) => builder.type === 'pdf');
      if (!localizedPdf) throw new Error(`Accounting PDF builder missing locale ${locale}`);
      save(
        {
          id: `accounting-pack-pdf-${locale}`,
          family: 'Accounting pack',
          format: 'pdf',
          locale,
          file: `accounting-pack-pdf-${locale}.pdf`,
          renderer: '@ja/reporting accountingPackPdf',
          source: 'reconciled accounting pack snapshot fixture',
          description: 'Localized accounting-pack PDF.',
        },
        localizedPdf.build(),
      );
    }
  }

  for (const locale of exampleLocales)
    save(
      {
        id: `project-finance-${locale}`,
        family: 'Project finance review',
        format: 'xlsx',
        locale,
        file: `project-finance-${locale}.xlsx`,
        renderer: '@ja/reporting projectFinanceXlsx',
        source: 'project finance projection fixture',
        description: 'Localized project economic review workbook.',
      },
      projectFinanceXlsx({ ...exampleProjectFinance, locale }),
    );

  save(
    {
      id: 'collection-ledger-csv',
      family: 'Invoice collection ledger',
      format: 'csv',
      locale: null,
      file: 'invoice-collection-ledger.csv',
      renderer: '@ja/reporting invoiceCollectionLedgerCsv',
      source: 'reconciled collection ledger fixture',
      description: 'Invoice balances, payments, credits and outstanding amounts.',
    },
    invoiceCollectionLedgerCsv(exampleLedgerRows),
  );
  save(
    {
      id: 'collection-ledger-xlsx',
      family: 'Invoice collection ledger',
      format: 'xlsx',
      locale: null,
      file: 'invoice-collection-ledger.xlsx',
      renderer: '@ja/reporting invoiceCollectionLedgerXlsx',
      source: 'reconciled collection ledger fixture',
      description: 'Collection ledger workbook with payments and reversals sheets.',
    },
    invoiceCollectionLedgerXlsx(exampleLedgerRows),
  );

  for (const format of ['pdf', 'xlsx', 'csv'] as const) {
    if (format === 'pdf' && options.skipPdf) continue;
    save(
      {
        id: `expense-register-${format}`,
        family: 'Expense register',
        format,
        locale: null,
        file: `expense-register.${format}`,
        renderer: '@ja/reporting expenseRegisterExport',
        source: 'authorized expense-register projection fixture',
        description: 'Filtered expense register with exact currency totals.',
      },
      expenseRegisterExport(
        exampleExpenses,
        format,
        `${examplePeriod.start} — ${examplePeriod.end}`,
      ),
    );
  }

  const portal = await portalModules();
  try {
    for (const report of ['customers', 'forecast', 'priorities'] as const)
      save(
        {
          id: `collections-${report}-csv`,
          family: 'Collections workbench',
          format: 'csv',
          locale: null,
          file: `collections-${report}.csv`,
          renderer: '$lib/server/collections-workbench-export collectionsWorkbenchCsv',
          source: 'reconciled collection ledger fixture',
          description: `Canonical ${report} collections workbench view.`,
        },
        portal.collections.collectionsWorkbenchCsv(
          exampleLedgerRows as readonly Readonly<Record<string, unknown>>[],
          '2026-11-15',
          report,
        ),
      );

    for (const locale of exampleLocales) {
      const copy = portal.supplierCopy.supplierCopy[locale];
      if (!copy) throw new Error(`Supplier copy missing locale ${locale}`);
      const csvRows: unknown[][] = [
        [
          copy.project,
          copy.worker,
          copy.date,
          copy.category,
          copy.startTime,
          copy.endTime,
          copy.breakMinutes,
          copy.minutes,
          copy.summary,
          copy.state,
          copy.recordedBy,
        ],
        ...exampleSupplierRows.map((row) => [
          row.project,
          row.worker,
          row.date,
          portal.supplierCopy.supplierCategoryLabel(locale, row.category),
          row.startTime,
          row.endTime,
          row.breakMinutes,
          row.minutes,
          row.summary,
          portal.supplierCopy.supplierStateLabel(locale, row.state),
          row.recordedBy,
        ]),
      ];
      save(
        {
          id: `supplier-operational-${locale}`,
          family: 'Supplier operational report',
          format: 'csv',
          locale,
          file: `supplier-operational-report-${locale}.csv`,
          renderer: '$lib/server/supplier-csv supplierCsv',
          source: '$routes/app/supplier localized operational-report projection fixture',
          description: 'Localized operational-only supplier time report with actual intervals.',
        },
        portal.supplierCsv.supplierCsv(csvRows),
      );
    }
  } finally {
    await portal.server.close();
  }

  const expected = options.skipPdf ? 20 : 54;
  if (manifest.length !== expected)
    throw new Error(
      `Artifact coverage mismatch: expected ${expected}, generated ${manifest.length}`,
    );
  const manifestBody = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    synthetic: true,
    warning: 'EXAMPLE / NOT PAYABLE — fictional documentation fixtures only',
    project: exampleIdentity.project.number,
    period: examplePeriod,
    reconciliation: fixtureReconciliation,
    artifacts: manifest.sort((left, right) => left.id.localeCompare(right.id)),
  };
  writeFileSync(
    resolve(output, 'manifest-base.json'),
    `${JSON.stringify(manifestBody, null, 2)}\n`,
    'utf8',
  );
  console.log(`Generated ${manifest.length} canonical examples in ${output}`);
}

await main();
