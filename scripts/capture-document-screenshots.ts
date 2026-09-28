import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ARTIFACTS_IMG_DIR = resolve(process.cwd(), 'docs/manuals/screenshots/artifacts');
const EXAMPLES_DIR = resolve(process.cwd(), 'docs/examples');

mkdirSync(ARTIFACTS_IMG_DIR, { recursive: true });

function convertPdfPage(pdfName: string, outName: string, page = 1) {
  const pdfPath = resolve(EXAMPLES_DIR, pdfName);
  const outPrefix = resolve(ARTIFACTS_IMG_DIR, `temp_${outName}`);
  console.log(`Converting PDF ${pdfName} page ${page} -> ${outName}...`);
  execSync(`pdftoppm -png -r 150 -f ${page} -l ${page} "${pdfPath}" "${outPrefix}"`);

  // Find generated file, usually temp_outName-1.png or temp_outName-01.png
  const generated =
    resolve(ARTIFACTS_IMG_DIR, `temp_${outName}-${page}.png`) ||
    resolve(ARTIFACTS_IMG_DIR, `temp_${outName}-0${page}.png`);
  const target = resolve(ARTIFACTS_IMG_DIR, outName);
  if (existsSync(generated)) {
    copyFileSync(generated, target);
  } else {
    // fallback check
    const genAlt = resolve(
      ARTIFACTS_IMG_DIR,
      `temp_${outName}-${String(page).padStart(2, '0')}.png`,
    );
    if (existsSync(genAlt)) {
      copyFileSync(genAlt, target);
    }
  }
  // cleanup temp files
  try {
    execSync(`rm -f "${ARTIFACTS_IMG_DIR}/temp_${outName}*"`);
  } catch {
    // Best-effort cleanup: the generated artifact is already available.
  }
  console.log(`✓ Created: ${outName}`);
}

function getExcelHtml(
  title: string,
  tabs: string[],
  activeTab: string,
  headers: string[],
  rows: (string | number)[][],
  summaryRow?: (string | number)[],
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #f3f3f3;
      color: #242424;
    }
    .window {
      width: 1280px;
      height: 720px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      border: 1px solid #107c41;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      overflow: hidden;
    }
    .title-bar {
      background: #107c41;
      color: #ffffff;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 13px;
      font-weight: 500;
    }
    .title-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .excel-icon {
      background: #ffffff;
      color: #107c41;
      font-weight: 800;
      font-size: 14px;
      width: 22px;
      height: 22px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ribbon {
      background: #f8f9fa;
      border-bottom: 1px solid #e1dfdd;
      padding: 6px 16px;
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: #323130;
    }
    .ribbon-tab.active {
      font-weight: 600;
      color: #107c41;
      border-bottom: 2px solid #107c41;
      padding-bottom: 4px;
    }
    .formula-bar {
      height: 30px;
      background: #ffffff;
      border-bottom: 1px solid #e1dfdd;
      display: flex;
      align-items: center;
      padding: 0 12px;
      font-size: 12px;
      gap: 8px;
    }
    .cell-name {
      font-weight: 600;
      color: #605e5c;
      width: 45px;
      border-right: 1px solid #e1dfdd;
    }
    .fx {
      color: #a19f9d;
      font-style: italic;
      font-weight: bold;
    }
    .formula-content {
      font-family: Consolas, monospace;
      color: #201f1e;
    }
    .grid-container {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #ffffff;
    }
    table.excel-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th.col-header {
      background: #f3f2f1;
      border: 1px solid #d2d0ce;
      color: #605e5c;
      font-weight: 500;
      text-align: center;
      padding: 4px;
      width: 35px;
    }
    th.data-header {
      background: #0b5c30;
      color: #ffffff;
      border: 1px solid #084323;
      padding: 8px 10px;
      font-weight: 600;
      text-align: left;
    }
    td.row-header {
      background: #f3f2f1;
      border: 1px solid #d2d0ce;
      color: #605e5c;
      font-weight: 500;
      text-align: center;
      padding: 4px;
      width: 35px;
    }
    td.cell {
      border: 1px solid #e1dfdd;
      padding: 6px 10px;
      color: #201f1e;
    }
    td.cell.num {
      text-align: right;
      font-family: Consolas, monospace;
    }
    td.cell.bold {
      font-weight: 700;
    }
    tr:nth-child(even) td.cell {
      background: #f9fbf9;
    }
    tr.summary-row td.cell {
      background: #e8f5e9;
      font-weight: 700;
      border-top: 2px solid #107c41;
      border-bottom: 2px solid #107c41;
    }
    .sheet-bar {
      height: 32px;
      background: #f3f2f1;
      border-top: 1px solid #d2d0ce;
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 4px;
      font-size: 12px;
    }
    .tab {
      padding: 4px 14px;
      background: #e1dfdd;
      color: #605e5c;
      border-radius: 3px 3px 0 0;
      border-top: 2px solid transparent;
      cursor: pointer;
    }
    .tab.active {
      background: #ffffff;
      color: #107c41;
      font-weight: 600;
      border-top: 2px solid #107c41;
    }
  </style>
</head>
<body>
  <div class="window">
    <div class="title-bar">
      <div class="title-left">
        <div class="excel-icon">X</div>
        <span>AutoSave On · <strong>${title}</strong> — Excel</span>
      </div>
      <div>J&A Automation LLC · Financial Operations</div>
    </div>
    <div class="ribbon">
      <span class="ribbon-tab">File</span>
      <span class="ribbon-tab active">Home</span>
      <span class="ribbon-tab">Insert</span>
      <span class="ribbon-tab">Page Layout</span>
      <span class="ribbon-tab">Formulas</span>
      <span class="ribbon-tab">Data</span>
      <span class="ribbon-tab">Review</span>
      <span class="ribbon-tab">View</span>
    </div>
    <div class="formula-bar">
      <div class="cell-name">A1</div>
      <div class="fx">fx</div>
      <div class="formula-content">${headers[0]}</div>
    </div>
    <div class="grid-container">
      <table class="excel-table">
        <thead>
          <tr>
            <th class="col-header"></th>
            ${headers.map((_, i) => `<th class="col-header">${String.fromCharCode(65 + i)}</th>`).join('')}
          </tr>
          <tr>
            <th class="row-header">1</th>
            ${headers.map((h) => `<th class="data-header">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, rIdx) => `
            <tr>
              <td class="row-header">${rIdx + 2}</td>
              ${r
                .map((c) => {
                  const isNum =
                    typeof c === 'number' ||
                    (typeof c === 'string' &&
                      (c.startsWith('$') ||
                        c.endsWith('%') ||
                        c.endsWith('h') ||
                        !isNaN(Number(c))));
                  return `<td class="cell ${isNum ? 'num' : ''}">${c}</td>`;
                })
                .join('')}
            </tr>
          `,
            )
            .join('')}
          ${
            summaryRow
              ? `
            <tr class="summary-row">
              <td class="row-header">${rows.length + 2}</td>
              ${summaryRow
                .map((c) => {
                  const isNum =
                    typeof c === 'number' ||
                    (typeof c === 'string' &&
                      (c.startsWith('$') ||
                        c.endsWith('%') ||
                        c.endsWith('h') ||
                        !isNaN(Number(c))));
                  return `<td class="cell ${isNum ? 'num' : ''} bold">${c}</td>`;
                })
                .join('')}
            </tr>
          `
              : ''
          }
        </tbody>
      </table>
    </div>
    <div class="sheet-bar">
      ${tabs.map((t) => `<div class="tab ${t === activeTab ? 'active' : ''}">${t}</div>`).join('')}
    </div>
  </div>
</body>
</html>`;
}

async function captureAll() {
  console.log('--- STEP 1: CONVERTING PDF ARTIFACTS TO PNG ---');
  convertPdfPage('Invoice_CP020-013_Labor_Detailed_EN.pdf', 'pdf_invoice_labor.png');
  convertPdfPage('Invoice_CP020-014_Expenses_Detailed_EN.pdf', 'pdf_invoice_expenses.png');
  convertPdfPage('Period_Report_Customer_Signoff_EN.pdf', 'pdf_customer_period_report.png');
  convertPdfPage('Period_Report_Internal_Admin_EN.pdf', 'pdf_internal_period_report.png');
  convertPdfPage('Accounting_Pack_Monthly_2026-08_EN.pdf', 'pdf_accounting_pack.png');
  convertPdfPage('Technical_PLC_Report_Line2_Siemens_EN.pdf', 'pdf_technical_plc_report.png');
  convertPdfPage('Daily_Field_Report_BBS_Mexico_EN.pdf', 'pdf_daily_field_report.png');
  convertPdfPage('Worker_Statement_Gabriel_Santos_EN.pdf', 'pdf_worker_statement.png');

  console.log('\n--- STEP 2: RENDERING EXCEL SPREADSHEETS VIA PLAYWRIGHT ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // 1. Accounting Pack Multi-Tab Workbook
  const accPackHtml = getExcelHtml(
    'Accounting_Pack_Monthly_2026-08.xlsx',
    ['Totals', 'Invoice Register', 'Worker Costs', 'Expense Register', 'Collections'],
    'Totals',
    [
      'Metric Category',
      'August 2026 Total',
      'Direct Cost / Payout',
      'Net Contribution',
      'Margin BPS / %',
    ],
    [
      [
        'Labor Invoiced (CP020-013)',
        '$57,437.25',
        '$35,745.00 (Compensation)',
        '$21,692.25',
        '37.76%',
      ],
      [
        'Expenses Invoiced (CP020-014)',
        '$2,197.00',
        '$2,197.00 (Reimbursements)',
        '$0.00',
        '0.00%',
      ],
      ['Fixed Milestones Billed', '$0.00', '$0.00', '$0.00', '0.00%'],
      ['Approved Unbilled WIP', '$14,280.00', '$8,850.00 (Accrued Cost)', '$5,430.00', '38.02%'],
      [
        'Collections Received (Wells Fargo)',
        '$59,634.25',
        '$37,942.00 (Disbursed)',
        '$21,692.25',
        '36.37%',
      ],
    ],
    ['Total Project Operating Result', '$73,914.25', '$46,792.00', '$27,122.25', '36.69%'],
  );
  await page.setContent(accPackHtml);
  await page.screenshot({ path: resolve(ARTIFACTS_IMG_DIR, 'excel_accounting_pack.png') });
  console.log('✓ Created: excel_accounting_pack.png');

  // 2. Collections Ledger Workbook
  const collectionsHtml = getExcelHtml(
    'Invoice_Collection_Ledger.xlsx',
    ['Collections Ledger', 'Aging Summary'],
    'Collections Ledger',
    [
      'Invoice #',
      'Client',
      'Project',
      'Issue Date',
      'Invoiced Amt',
      'Collected Amt',
      'Outstanding',
      'Status',
    ],
    [
      [
        'CP020-013',
        'IMPC Gmbh',
        'CP020 · BBS Mexico',
        '2026-08-16',
        '$57,437.25',
        '$57,437.25',
        '$0.00',
        'PAID · FULL',
      ],
      [
        'CP020-014',
        'IMPC Gmbh',
        'CP020 · BBS Mexico',
        '2026-08-16',
        '$2,197.00',
        '$2,197.00',
        '$0.00',
        'PAID · FULL',
      ],
      [
        'CP021-001',
        'Junkers Inc',
        'CP021 · DFW Line 3',
        '2026-08-25',
        '$18,500.00',
        '$10,000.00',
        '$8,500.00',
        'PARTIAL',
      ],
      [
        'CP021-002',
        'Junkers Inc',
        'CP021 · DFW Line 3',
        '2026-08-30',
        '$12,400.00',
        '$0.00',
        '$12,400.00',
        'PENDING',
      ],
    ],
    [
      'Total Portfolio Balance',
      '2 Clients',
      '2 Projects',
      'August 2026',
      '$90,534.25',
      '$69,634.25',
      '$20,900.00',
      '76.9% Rec.',
    ],
  );
  await page.setContent(collectionsHtml);
  await page.screenshot({ path: resolve(ARTIFACTS_IMG_DIR, 'excel_collections_ledger.png') });
  console.log('✓ Created: excel_collections_ledger.png');

  // 3. Project Economics Review
  const econHtml = getExcelHtml(
    'Project_Finance_Economic_Review_CP020.xlsx',
    ['Contribution Analysis', 'Direct Hours', 'Cost Drilldown'],
    'Contribution Analysis',
    ['Cost / Revenue Layer', 'Approved Units', 'Unit Basis', 'Subtotal (USD)', 'Contribution %'],
    [
      ['Candidate Labor Revenue', '1,008.45 hrs', '$56.96 avg/h', '$57,437.25', '100.00%'],
      ['Internal Worker Compensation', '1,008.45 hrs', '$35.45 avg/h', '($35,745.00)', '-62.23%'],
      ['Gross Labor Contribution Margin', '1,008.45 hrs', '$21.51 avg/h', '$21,692.25', '37.77%'],
      ['Reimbursable Travel Expenses', '4 vouchers', 'Pass-through', '$2,197.00', '0.00%'],
      ['Reimbursable Cost Incurred', '4 vouchers', 'At Cost', '($2,197.00)', '0.00%'],
    ],
    ['Net Project Direct Contribution', '1,008.45 hrs', 'CP020 BBS Mexico', '$21,692.25', '37.77%'],
  );
  await page.setContent(econHtml);
  await page.screenshot({ path: resolve(ARTIFACTS_IMG_DIR, 'excel_project_economics.png') });
  console.log('✓ Created: excel_project_economics.png');

  // 4. Worker Statement Spreadsheet (for Worker Guide)
  const workerStmtHtml = getExcelHtml(
    'Worker_Statement_Gabriel_Santos.csv',
    ['Compensation Statement', 'Weekly Breakdown'],
    'Compensation Statement',
    [
      'Work Date / Shift',
      'Project Code',
      'Category',
      'Hours',
      'Agreed Rate',
      'Gross Compensation',
      'Status',
    ],
    [
      [
        '2026-08-01',
        'CP020 BBS Mexico',
        'PLC Commissioning',
        '10.00 h',
        '$40.00/h',
        '$400.00',
        'Approved',
      ],
      [
        '2026-08-02',
        'CP020 BBS Mexico',
        'PLC Commissioning',
        '10.00 h',
        '$40.00/h',
        '$400.00',
        'Approved',
      ],
      [
        '2026-08-03',
        'CP020 BBS Mexico',
        'Standby / Parts Delay',
        '10.00 h',
        '$40.00/h',
        '$400.00',
        'Approved',
      ],
      [
        '2026-08-04',
        'CP020 BBS Mexico',
        'Safety Circuit Validation',
        '11.50 h',
        '$40.00/h',
        '$460.00',
        'Approved',
      ],
      [
        '2026-08-05',
        'CP020 BBS Mexico',
        'Robotics Interlocks',
        '10.00 h',
        '$40.00/h',
        '$400.00',
        'Approved',
      ],
      [
        '2026-08-06',
        'CP020 BBS Mexico',
        'Line Handover',
        '10.00 h',
        '$40.00/h',
        '$400.00',
        'Approved',
      ],
      [
        'CW31/32 Total',
        'CP020 BBS Mexico',
        'Period Settlement',
        '131.50 h',
        '$40.00/h',
        '$5,260.00',
        'PAID',
      ],
    ],
    [
      'Settlement Payout Total',
      'Gabriel Santos',
      'ACH Direct Deposit',
      '131.50 h',
      'August 15',
      '$5,260.00',
      'PAID',
    ],
  );
  await page.setContent(workerStmtHtml);
  await page.screenshot({ path: resolve(ARTIFACTS_IMG_DIR, 'excel_worker_statement.png') });
  console.log('✓ Created: excel_worker_statement.png');

  await browser.close();
  console.log(
    '\nAll PDF and Excel screenshots successfully captured into docs/manuals/screenshots/artifacts/!',
  );
}

captureAll().catch((err) => {
  console.error('Error capturing document screenshots:', err);
  process.exit(1);
});
