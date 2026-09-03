import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SCREENSHOTS_DIR = resolve(process.cwd(), 'docs/manuals/screenshots');
const OUT_DIR_MANUALS = resolve(process.cwd(), 'docs/manuals');
const OUT_DIR_EXAMPLES = resolve(process.cwd(), 'docs/examples');

mkdirSync(OUT_DIR_MANUALS, { recursive: true });
mkdirSync(OUT_DIR_EXAMPLES, { recursive: true });

function img(subpath: string): string {
  const filePath = resolve(SCREENSHOTS_DIR, subpath);
  try {
    const data = readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch (err) {
    console.warn(`Could not read screenshot: ${filePath}`, err);
    return '';
  }
}

const baseCss = `
  @page {
    size: A4 portrait;
    margin: 10mm 12mm 10mm 12mm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    font-size: 8.5pt;
    line-height: 1.38;
    margin: 0;
    padding: 0;
  }
  .page-break {
    page-break-after: always;
    break-after: page;
  }
  .no-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* Cover Page */
  .cover {
    min-height: 260mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20mm 14mm 16mm;
    background: linear-gradient(145deg, #092032 0%, #0d3b66 100%);
    color: #ffffff;
    page-break-after: always;
    break-after: page;
  }
  .cover-top {
    border-bottom: 2px solid rgba(255,255,255,0.2);
    padding-bottom: 8mm;
  }
  .cover-logo-text {
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: 0.15em;
    color: #38bdf8;
    text-transform: uppercase;
    margin-bottom: 3mm;
  }
  .cover-title {
    font-size: 22pt;
    font-weight: 800;
    line-height: 1.15;
    margin: 0 0 3mm;
    color: #ffffff;
  }
  .cover-subtitle {
    font-size: 10.5pt;
    color: #cbd5e1;
    font-weight: 400;
    margin: 0;
    line-height: 1.4;
  }
  .cover-badge {
    display: inline-block;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid #38bdf8;
    color: #38bdf8;
    padding: 2mm 4mm;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 4px;
    margin-top: 5mm;
  }
  .cover-meta {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8mm;
    border-top: 1px solid rgba(255,255,255,0.2);
    padding-top: 6mm;
    font-size: 8.5pt;
    color: #94a3b8;
  }
  .cover-meta strong {
    color: #ffffff;
    display: block;
    font-size: 9pt;
    margin-bottom: 1mm;
  }

  /* Headings & Structure */
  h1 {
    font-size: 13.5pt;
    font-weight: 800;
    color: #0d3b66;
    border-bottom: 2px solid #0d3b66;
    padding-bottom: 1mm;
    margin-top: 0;
    margin-bottom: 2.2mm;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  h2 {
    font-size: 10.5pt;
    font-weight: 700;
    color: #0f2d3d;
    margin-top: 3mm;
    margin-bottom: 1.5mm;
    border-left: 3px solid #0ea5e9;
    padding-left: 2.5mm;
  }
  h3 {
    font-size: 9.2pt;
    font-weight: 700;
    color: #1e293b;
    margin-top: 2.2mm;
    margin-bottom: 1mm;
  }
  p { margin: 0 0 1.8mm; }
  ul, ol { margin: 0 0 2mm; padding-left: 5mm; }
  li { margin-bottom: 0.7mm; }

  /* Callouts & Badges */
  .callout {
    background: #f1f5f9;
    border-left: 3.5px solid #0d3b66;
    padding: 2mm 3mm;
    margin: 2mm 0;
    border-radius: 0 4px 4px 0;
    font-size: 8pt;
  }
  .callout.tip {
    background: #f0fdf4;
    border-left-color: #16a34a;
  }
  .callout.warning {
    background: #fefce8;
    border-left-color: #ca8a04;
  }
  .callout.security {
    background: #fef2f2;
    border-left-color: #dc2626;
  }
  .callout strong {
    color: #0f172a;
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 0.6mm 2mm;
    border-radius: 3px;
    font-size: 6.8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    vertical-align: middle;
  }
  .badge-owner {
    background: #e0f2fe;
    color: #0369a1;
    border: 1px solid #7dd3fc;
  }
  .badge-worker {
    background: #f0fdf4;
    color: #15803d;
    border: 1px solid #86efac;
  }
  .badge-shared {
    background: #f3e8ff;
    color: #6b21a8;
    border: 1px solid #d8b4fe;
  }
  .badge-db {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
    font-size: 6.8pt;
    padding: 0.4mm 1.4mm;
    border-radius: 2px;
  }
  .badge-btn {
    display: inline-block;
    background: #0f172a;
    color: #ffffff;
    padding: 0.6mm 2mm;
    border-radius: 3px;
    font-size: 7pt;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-btn-danger {
    background: #b91c1c;
    color: #ffffff;
    padding: 0.6mm 2mm;
    border-radius: 3px;
    font-size: 7pt;
    font-weight: 600;
    white-space: nowrap;
  }

  /* Figure Containers */
  .figure {
    margin: 2mm 0 2.8mm;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .figure img {
    width: 100%;
    max-height: 68mm;
    object-fit: contain;
    display: block;
    background: #f8fafc;
  }
  .figure.document-frame {
    max-width: 120mm;
    margin: 2mm auto 2.8mm;
    border: 1px solid #94a3b8;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
  }
  .figure.document-frame img {
    max-height: 70mm;
    background: #ffffff;
  }
  .figure.excel-frame {
    border: 1px solid #107c41;
    box-shadow: 0 2px 6px rgba(16, 124, 65, 0.15);
  }
  .figure.excel-frame img {
    max-height: 70mm;
  }
  .figure.mobile-frame {
    max-width: 180px;
    margin: 1.5mm auto 2.5mm;
  }
  .figure.mobile-frame img {
    max-height: 72mm;
    width: auto;
    margin: 0 auto;
  }
  .figure-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
    margin: 2mm 0 2.8mm;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .figure-grid .figure {
    margin: 0;
  }
  .figure-grid .figure img {
    max-height: 56mm;
  }
  .figure-caption {
    padding: 1.4mm 2.5mm;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    font-size: 7.2pt;
    color: #64748b;
    font-weight: 600;
  }
  .figure-caption strong {
    color: #0f2d3d;
  }

  /* Tables */
  table.manual-table {
    width: 100%;
    border-collapse: collapse;
    margin: 2mm 0 2.8mm;
    font-size: 7.6pt;
  }
  table.manual-table th {
    background: #e2e8f0;
    color: #0f2d3d;
    text-align: left;
    padding: 1.2mm 1.8mm;
    font-weight: 700;
    border-bottom: 1.5px solid #94a3b8;
  }
  table.manual-table td {
    padding: 1.2mm 1.8mm;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }

  /* Table of Contents */
  .toc-item {
    display: flex;
    justify-content: space-between;
    padding: 1.2mm 0;
    border-bottom: 1px dashed #cbd5e1;
    font-size: 8.4pt;
  }
  .toc-title { font-weight: 600; color: #0d3b66; }
  .toc-page { color: #64748b; font-weight: 700; }
`;

function buildOwnerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>J&A Automation LLC — Platform Owner & Operations Manual</title>
  <style>${baseCss}</style>
</head>
<body>

  <!-- COVER PAGE (PAGE 1) -->
  <div class="cover">
    <div class="cover-top">
      <div class="cover-logo-text">J&amp;A Automation LLC · USA Division</div>
      <h1 class="cover-title">Enterprise Platform Administration &amp; Operations Manual</h1>
      <p class="cover-subtitle">Complete executive and operational authority for client management, project commercial architecture, master timesheets, field diagnostics, invoice lifecycles, financial intelligence, generated artifacts, and audit compliance.</p>
      <div class="cover-badge">Owner &amp; Executive Admin Privilege Level · Client Essential Release</div>
    </div>
    <div class="cover-meta">
      <div>
        <strong>System Scope &amp; Authority:</strong>
        J&A Private Operations Monolith<br/>
        Authority: Client Essential Spec &amp; Checklist (2026-08-24)<br/>
        Operating Database: Production SQLite with Exact Money
      </div>
      <div>
        <strong>Classification &amp; Governance:</strong>
        CONFIDENTIAL &amp; PROPRIETARY<br/>
        Authoritative operations guide for Owners, Directors, and Finance Administrators.<br/>
        Exhaustive reference of all buttons, inputs, dropdowns, and database mappings.
      </div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS (PAGE 2) -->
  <div class="page-break">
    <h1>Table of Contents</h1>
    <div class="toc-item"><span class="toc-title">1. Executive Overview, Architecture &amp; Role Privilege Matrix</span><span class="toc-page">Page 3</span></div>
    <div class="toc-item"><span class="toc-title">2. Secure Authentication, Passkeys &amp; Step-Up Security (CORE-01)</span><span class="toc-page">Page 4</span></div>
    <div class="toc-item"><span class="toc-title">3. Client Directory: Inputs, Contacts &amp; Deletion Lifecycle (CORE-02)</span><span class="toc-page">Page 5</span></div>
    <div class="toc-item"><span class="toc-title">4. Projects Master &amp; Commercial Billing Models (CORE-02 &amp; CORE-03)</span><span class="toc-page">Page 6</span></div>
    <div class="toc-item"><span class="toc-title">5. Decimal Hours, Budgets &amp; Project Lifecycle Controls</span><span class="toc-page">Page 7</span></div>
    <div class="toc-item"><span class="toc-title">6. Rate Cards, Overtime Policies &amp; Workforce Assignments (CORE-03 &amp; CORE-05)</span><span class="toc-page">Page 8</span></div>
    <div class="toc-item"><span class="toc-title">7. Master Time Tracking &amp; Operational Oversight (CORE-04)</span><span class="toc-page">Page 9</span></div>
    <div class="toc-item"><span class="toc-title">8. Approvals Queue: Timesheet &amp; Expense Workflows (CORE-08)</span><span class="toc-page">Page 10</span></div>
    <div class="toc-item"><span class="toc-title">9. Field Operations &amp; Generated PLC Technical Reports (CORE-07)</span><span class="toc-page">Page 11</span></div>
    <div class="toc-item"><span class="toc-title">10. Customer Sign-Off Gate &amp; Zero-Money Period Reports (CORE-07 &amp; CORE-13)</span><span class="toc-page">Page 12</span></div>
    <div class="toc-item"><span class="toc-title">11. Expenses Hub &amp; Commercial Billing Treatments (CORE-06)</span><span class="toc-page">Page 13</span></div>
    <div class="toc-item"><span class="toc-title">12. Billing Hub, Candidate Streams &amp; Generated Invoice PDFs (CORE-10 &amp; CORE-11)</span><span class="toc-page">Page 14</span></div>
    <div class="toc-item"><span class="toc-title">13. Invoice Preview, Boxed Totals &amp; Wells Fargo Remittance</span><span class="toc-page">Page 15</span></div>
    <div class="toc-item"><span class="toc-title">14. Collections Ledger, Payment Reconciliation &amp; Credit Notes (CORE-12)</span><span class="toc-page">Page 16</span></div>
    <div class="toc-item"><span class="toc-title">15. Financial Intelligence &amp; Generated Economics Excel (CORE-09)</span><span class="toc-page">Page 17</span></div>
    <div class="toc-item"><span class="toc-title">16. Monthly Accounting Close &amp; Multi-Tab Excel Workbook (CORE-13)</span><span class="toc-page">Page 18</span></div>
    <div class="toc-item"><span class="toc-title">17. Immutable System Audit Logs &amp; Forensics (CORE-15)</span><span class="toc-page">Page 19</span></div>

    <h2>Client Essential Production Invariants</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Invariant Area</th>
          <th>Contractual Mandate (Spec 2026-08-22 / 2026-08-24)</th>
          <th>Database &amp; Engine Enforcement</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Exact Money Semantics</strong></td>
          <td>Floating point math is strictly forbidden. All monetary calculations use exact integer cents.</td>
          <td>Stored as integer cents (e.g. <code>subtotal_minor</code>) and computed using deterministic <code>BigInt</code> arithmetic.</td>
        </tr>
        <tr>
          <td><strong>Worker Privacy Firewall</strong></td>
          <td>Client billing rates ($70/h, $55/h) and company margins are strictly hidden from technicians and field staff.</td>
          <td>Server-side DTO allowlists; workers only see their own internal agreed wage and settlement statements.</td>
        </tr>
        <tr>
          <td><strong>Immutable Invoices</strong></td>
          <td>Once an invoice is issued to a client, it becomes an immutable historical snapshot. Editing is blocked.</td>
          <td>Cryptographic snapshot stored in <code>invoice.snapshot_json</code>; corrections require formal Credit Notes.</td>
        </tr>
        <tr>
          <td><strong>Customer Period Reports</strong></td>
          <td>Clients only pay when signed by their representative. Reports must NEVER display monetary figures.</td>
          <td>Dedicated zero-money allowlist rendering with formal physical signature block.</td>
        </tr>
        <tr>
          <td><strong>Reference Hours vs Actual</strong></td>
          <td>Configured reference hours (10h, 12h) and minimum billable rules must NEVER fabricate actual worker hours.</td>
          <td>Actual minutes logged on site remain the immutable foundation for compensation and audit.</td>
        </tr>
        <tr>
          <td><strong>Safe Entity Deletion</strong></td>
          <td>Empty projects or clients created by mistake can be hard-deleted; entities with activity must be archived.</td>
          <td>Database guards verify zero time entries, zero expenses, and zero invoices before allowing hard deletion.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 1: OVERVIEW & ROLES (PAGE 3) -->
  <div class="page-break">
    <h1>1. Executive Overview, Architecture &amp; Role Privilege Matrix</h1>
    <p>The <strong>J&A Automation Platform</strong> is a modular monolith designed to operate J&A's complete field engineering and industrial controls business without relying on disconnected spreadsheets or manual workarounds.</p>

    <h2>Complete Navigation &amp; Section Inventory</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Section / Hub</th>
          <th>URL Route</th>
          <th>Worker Access</th>
          <th>Owner Access</th>
          <th>Operational Scope</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Dashboard / Today</strong></td>
          <td><code>/app/today</code></td>
          <td><span class="badge badge-worker">Personal Shift</span></td>
          <td><span class="badge badge-owner">Executive KPIs</span></td>
          <td>Worker logs daily shift; Owner tracks company WIP, overdue invoices, pending approvals.</td>
        </tr>
        <tr>
          <td><strong>Clients</strong></td>
          <td><code>/app/clients</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Master client directory, billing addresses, contacts, tax IDs, deletion/archival.</td>
        </tr>
        <tr>
          <td><strong>Projects</strong></td>
          <td><code>/app/projects</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Project setup, commercial billing models, decimal shift hours, milestones, team assignments.</td>
        </tr>
        <tr>
          <td><strong>Time Tracking</strong></td>
          <td><code>/app/time</code></td>
          <td><span class="badge badge-worker">Own Timesheet</span></td>
          <td><span class="badge badge-owner">Master Oversight</span></td>
          <td>Technicians log hours; Owner oversees all site personnel and edits hours with audit logging.</td>
        </tr>
        <tr>
          <td><strong>Approvals Queue</strong></td>
          <td><code>/app/approvals</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Batch approval and rejection queue for submitted weekly timesheets and field expenses.</td>
        </tr>
        <tr>
          <td><strong>Expenses</strong></td>
          <td><code>/app/expenses</code></td>
          <td><span class="badge badge-worker">Own Receipts</span></td>
          <td><span class="badge badge-owner">Company Control</span></td>
          <td>Worker uploads receipts; Owner reviews, sets reimbursable/markup/all-in status and approves.</td>
        </tr>
        <tr>
          <td><strong>Field Reports</strong></td>
          <td><code>/app/reports</code></td>
          <td><span class="badge badge-worker">Daily Logs</span></td>
          <td><span class="badge badge-owner">Client &amp; Internal</span></td>
          <td>Technicians submit shift logs; Owner generates Customer Period Reports (zero-money sign-off).</td>
        </tr>
        <tr>
          <td><strong>Billing &amp; Invoices</strong></td>
          <td><code>/app/billing</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Unbilled candidate streams, draft generation, immutable freeze, PDF/XML issue, voids, credit notes.</td>
        </tr>
        <tr>
          <td><strong>Collections Ledger</strong></td>
          <td><code>/app/ledger</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Accounts receivable aging, recording customer bank payments, wire reconciliation.</td>
        </tr>
        <tr>
          <td><strong>Finance Overview</strong></td>
          <td><code>/app/finance</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Real-time project gross margins, commercial rate cards, overtime policies, daily minimums.</td>
        </tr>
        <tr>
          <td><strong>Monthly Accounting</strong></td>
          <td><code>/app/accounting</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Financial period close locking, multi-tab Excel workbooks, executive PDF packs.</td>
        </tr>
        <tr>
          <td><strong>Audit &amp; Compliance</strong></td>
          <td><code>/app/audit</code></td>
          <td><span class="badge badge-owner">BLOCKED</span></td>
          <td><span class="badge badge-owner">Full Access</span></td>
          <td>Append-only forensic audit trails recording actor ID, IP, before/after states, and timestamps.</td>
        </tr>
        <tr>
          <td><strong>Profile &amp; Security</strong></td>
          <td><code>/app/profile</code></td>
          <td><span class="badge badge-shared">Shared</span></td>
          <td><span class="badge badge-shared">Shared</span></td>
          <td>FIDO2 Passkeys, Authenticator TOTP setup, language selection (EN/ES/PT), password resets.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 2: AUTH & ROLES (PAGE 4) -->
  <div class="page-break">
    <h1>2. Secure Authentication, Passkeys &amp; Step-Up Security (CORE-01)</h1>
    <p>The platform implements strict server-side Role-Based Access Control (RBAC) with invitation-only user provisioning, session controls, and cryptographic multi-factor authentication (MFA).</p>

    <div class="figure no-break">
      <img src="${img('owner/01_login_screen.png')}" alt="Login Screen" />
      <div class="figure-caption"><strong>Figure 2.1:</strong> Corporate Single Sign-On Portal featuring corporate webmail integration and FIDO2/WebAuthn passkey support.</div>
    </div>

    <h2>Authentication Controls, Inputs &amp; Buttons</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Interface Element</th>
          <th>Type / Tag</th>
          <th>Database Target</th>
          <th>Function &amp; Security Validation</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Email Address</strong></td>
          <td><code>&lt;input type="email"&gt;</code></td>
          <td><span class="badge-db">user.email</span></td>
          <td>Required corporate email address (max 254 chars). Normalized to lowercase.</td>
        </tr>
        <tr>
          <td><strong>Password</strong></td>
          <td><code>&lt;input type="password"&gt;</code></td>
          <td><span class="badge-db">user.password_hash</span></td>
          <td>Argon2id cryptographic hash. Minimum 8 characters; never stored in plaintext.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Sign In</span></td>
          <td>Button (POST)</td>
          <td><span class="badge-db">session</span></td>
          <td>Verifies credentials, generates secure session cookie with <code>SameSite=Lax</code> and <code>HttpOnly</code>.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Sign in with Passkey</span></td>
          <td>WebAuthn API</td>
          <td><span class="badge-db">passkey_credential</span></td>
          <td>Hardware-bound biometric login (Windows Hello, Apple TouchID/FaceID, YubiKey). Zero phishing risk.</td>
        </tr>
        <tr>
          <td><strong>MFA TOTP Code</strong></td>
          <td><code>&lt;input type="text"&gt;</code></td>
          <td><span class="badge-db">mfa_totp.secret</span></td>
          <td>6-digit RFC 6238 time-based code from Google Authenticator, 1Password, or Microsoft Authenticator.</td>
        </tr>
      </tbody>
    </table>

    <div class="callout security">
      <strong>Step-Up Security Invariant:</strong> High-privilege actions (issuing invoices, recording payments, modifying commercial rate cards, or downloading accounting close packs) enforce step-up authentication to protect against session hijacking.
    </div>
  </div>

  <!-- CHAPTER 3: CLIENT DIRECTORY (PAGE 5) -->
  <div class="page-break">
    <h1>3. Client Directory: Inputs, Contacts &amp; Deletion Lifecycle (CORE-02)</h1>
    <p>The Client Directory governs corporate accounts, billing addresses, tax numbers, and contact roles for all industrial customers (e.g., IMPC Gmbh, BMW, BBS Automation).</p>

    <h2>Client Master Data Inputs &amp; Database Columns</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Input Box / Dropdown</th>
          <th>Field Name</th>
          <th>Database Column</th>
          <th>Type &amp; Constraints</th>
          <th>Operational Definition</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Legal Name</strong></td>
          <td><code>legalName</code></td>
          <td><span class="badge-db">client.legal_name</span></td>
          <td>TEXT (2-200 chars, req)</td>
          <td>Full legal company name that appears on formal invoices and tax documents.</td>
        </tr>
        <tr>
          <td><strong>Display Name</strong></td>
          <td><code>displayName</code></td>
          <td><span class="badge-db">client.display_name</span></td>
          <td>TEXT (2-200 chars, req)</td>
          <td>Short commercial trading name used in project pickers and daily navigation.</td>
        </tr>
        <tr>
          <td><strong>Client Number</strong></td>
          <td><code>clientNumber</code></td>
          <td><span class="badge-db">client.client_number</span></td>
          <td>TEXT (e.g. CLI-001)</td>
          <td>Unique client accounting code used to prefix project numbers (e.g., CLI-001-P-001).</td>
        </tr>
        <tr>
          <td><strong>Tax ID / VAT / EIN</strong></td>
          <td><code>taxId</code></td>
          <td><span class="badge-db">client.tax_id</span></td>
          <td>TEXT (opt)</td>
          <td>Corporate tax identification number printed on official billing headers.</td>
        </tr>
        <tr>
          <td><strong>Billing Currency</strong></td>
          <td><code>currency</code></td>
          <td><span class="badge-db">client.currency</span></td>
          <td>SELECT (EUR, USD, etc.)</td>
          <td>Default currency for all client projects and invoices. Projects must match client currency.</td>
        </tr>
        <tr>
          <td><strong>Headquarters Timezone</strong></td>
          <td><code>timezone</code></td>
          <td><span class="badge-db">client.timezone</span></td>
          <td>SELECT (IANA Timezone)</td>
          <td>Timezone for calendar scheduling and period closes (e.g., <code>Europe/Madrid</code>).</td>
        </tr>
        <tr>
          <td><strong>Billing Email</strong></td>
          <td><code>billingEmail</code></td>
          <td><span class="badge-db">client.billing_email</span></td>
          <td>EMAIL (max 254 chars)</td>
          <td>Official Accounts Payable email address where invoices and payment notices are delivered.</td>
        </tr>
        <tr>
          <td><strong>Billing Address</strong></td>
          <td><code>billingAddress</code></td>
          <td><span class="badge-db">client.billing_address</span></td>
          <td>TEXT (max 5000 chars)</td>
          <td>Registered corporate address rendered on invoice PDFs under the "Bill To" section.</td>
        </tr>
        <tr>
          <td><strong>Payment Terms (Days)</strong></td>
          <td><code>paymentTermsDays</code></td>
          <td><span class="badge-db">client.payment_terms_days</span></td>
          <td>INTEGER (e.g. 30, 45, 60)</td>
          <td>Standard credit terms. Automatically sets invoice due dates upon draft generation.</td>
        </tr>
      </tbody>
    </table>

    <h2>Interactive Client Buttons &amp; Lifecycle Actions</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Button Label</th>
          <th>Action Endpoint</th>
          <th>Permission</th>
          <th>Lifecycle &amp; Database Behavior</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge-btn">+ Create Client</span></td>
          <td><code>?/createClient</code></td>
          <td>Owner / Finance</td>
          <td>Opens modal and inserts client and primary contact in <code>client</code> and <code>client_contact</code>.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Save Client</span></td>
          <td><code>?/updateClient</code></td>
          <td>Owner / Finance</td>
          <td>Updates client master data with optimistic concurrency check (<code>version</code>).</td>
        </tr>
        <tr>
          <td><span class="badge-btn">+ Add Contact</span></td>
          <td><code>?/createContact</code></td>
          <td>Owner / Finance</td>
          <td>Adds operational or accounts payable stakeholder with <code>is_billing_contact</code> and <code>is_primary</code> flags.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Archive Client</span></td>
          <td><code>?/transitionClient</code></td>
          <td>Owner / Finance</td>
          <td>Soft-archives client (<code>status = 'archived'</code>); preserves historical invoices and contracts.</td>
        </tr>
        <tr>
          <td><span class="badge-btn-danger">Delete Client</span></td>
          <td><code>?/deleteClient</code></td>
          <td>Owner Only</td>
          <td><strong>Hard Deletion:</strong> Permanently removes empty clients with 0 projects and 0 invoices. Blocked if activity exists.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 4: PROJECTS MASTER (PAGE 6) -->
  <div class="page-break">
    <h1>4. Projects Master &amp; Commercial Billing Models (CORE-02 &amp; CORE-03)</h1>
    <p>The Projects Hub serves as the operational center where customer contracts, delivery milestones, budgets, and commercial billing models are configured.</p>

    <div class="figure-grid no-break">
      <div class="figure">
        <img src="${img('owner/02_projects_hub.png')}" alt="Projects Hub" />
        <div class="figure-caption"><strong>Figure 4.1:</strong> Projects Hub displaying active customer contracts, commercial models, and assigned teams.</div>
      </div>
      <div class="figure">
        <img src="${img('owner/03_project_detail_cp020.png')}" alt="Project Detail" />
        <div class="figure-caption"><strong>Figure 4.2:</strong> Project Detail panel for CP020 BBS Mexico showing PO number, rate cards, and phases.</div>
      </div>
    </div>

    <h2>All 7 Commercial Billing Models Dropdown Explained</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Billing Model Option</th>
          <th>Database Value</th>
          <th>Commercial Definition &amp; Invoicing Logic</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Time &amp; Materials (T&amp;M)</strong></td>
          <td><code>tm</code></td>
          <td>Standard hourly billing. Billed as <code>actual hours worked &times; approved role bill rate</code> ($70/h, $55/h).</td>
        </tr>
        <tr>
          <td><strong>T&amp;M Daily Minimum</strong></td>
          <td><code>tm_daily_minimum</code></td>
          <td>Hourly billing with guaranteed minimum hours per dispatch day (e.g. minimum 8.0h guaranteed if technician arrives on site).</td>
        </tr>
        <tr>
          <td><strong>All-In Package</strong></td>
          <td><code>all_in</code></td>
          <td>Flat daily or weekly package rate covering all technician labor, local travel, and expenses without hourly itemization.</td>
        </tr>
        <tr>
          <td><strong>Capped T&amp;M</strong></td>
          <td><code>capped_tm</code></td>
          <td>Hourly billing bounded by a mandatory PO financial ceiling. System halts billing candidates if cap is exceeded.</td>
        </tr>
        <tr>
          <td><strong>Fixed Milestone</strong></td>
          <td><code>milestone</code></td>
          <td>Deliverable-based fixed fee (e.g. 50% on design sign-off, 50% on commissioning acceptance). Hours are tracked for internal margin only.</td>
        </tr>
        <tr>
          <td><strong>Hybrid</strong></td>
          <td><code>hybrid</code></td>
          <td>Blended contract with fixed milestone deliverables plus separate hourly support rates for on-site commissioning.</td>
        </tr>
        <tr>
          <td><strong>Internal / Overhead</strong></td>
          <td><code>internal</code></td>
          <td>Internal engineering, R&D, training, or shop pre-assembly. Non-billable to external clients.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 5: DECIMAL HOURS & PROJECT CONTROLS (PAGE 7) -->
  <div class="page-break">
    <h1>5. Decimal Hours, Budgets &amp; Project Lifecycle Controls</h1>
    <p>Project parameters support precise decimal hours, comprehensive budget tracking, and deterministic lifecycle states.</p>

    <h2>Project Form Inputs, Decimal Hours &amp; Database Columns</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Input Box / Dropdown</th>
          <th>Field Name</th>
          <th>Database Target</th>
          <th>Type / Range</th>
          <th>Operational Definition</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Project Name</strong></td>
          <td><code>name</code></td>
          <td><span class="badge-db">project.name</span></td>
          <td>TEXT (2-200 chars, req)</td>
          <td>Descriptive project title (e.g., <em>BBS Mexico Body Shop Commissioning</em>).</td>
        </tr>
        <tr>
          <td><strong>Cost Center Code</strong></td>
          <td><code>costCenterCode</code></td>
          <td><span class="badge-db">project.cost_center_code</span></td>
          <td>TEXT (1-120 chars, req)</td>
          <td>Required accounting identifier (e.g., <code>CP020</code>) linking all project costs to general ledger.</td>
        </tr>
        <tr>
          <td><strong>PO / Reference</strong></td>
          <td><code>poNumber</code></td>
          <td><span class="badge-db">project.po_number</span></td>
          <td>TEXT (max 200 chars)</td>
          <td>Customer purchase order reference. Automatically printed on invoices and period reports.</td>
        </tr>
        <tr>
          <td><strong>Expected Hours / Day</strong></td>
          <td><code>expectedHoursPerDay</code></td>
          <td><span class="badge-db">project.expected_minutes_per_day</span></td>
          <td>NUMBER (step 0.25, 0-24, default 10.0)</td>
          <td><strong>Reference Shift Hours:</strong> Standard working day duration (e.g. <code>10.0</code> or <code>8.5</code>). Converted to exact integer minutes in SQLite (<code>hours &times; 60</code>). Never fabricates unworked time.</td>
        </tr>
        <tr>
          <td><strong>Client Minimum Hours</strong></td>
          <td><code>clientDailyMinimumHours</code></td>
          <td><span class="badge-db">project.client_daily_minimum_minutes</span></td>
          <td>NUMBER (step 0.25, 0-24, opt)</td>
          <td><strong>Minimum Billable Hours:</strong> Minimum hours charged to client per dispatch day (e.g. <code>8.0</code>). Stored as exact integer minutes.</td>
        </tr>
        <tr>
          <td><strong>Budget Type</strong></td>
          <td><code>budgetType</code></td>
          <td><span class="badge-db">project.budget_type</span></td>
          <td>SELECT (6 options)</td>
          <td>Options: <code>none</code>, <code>revenue</code>, <code>purchase_order</code>, <code>labor</code>, <code>travel</code>, <code>combined</code>. Controls project budget threshold warnings.</td>
        </tr>
        <tr>
          <td><strong>Revenue Budget</strong></td>
          <td><code>revenueBudgetMinor</code></td>
          <td><span class="badge-db">project.revenue_budget_minor</span></td>
          <td>MONEY (cents, BigInt)</td>
          <td>Maximum projected revenue. Stored as integer cents (e.g., $50,000.00 = <code>5000000</code>).</td>
        </tr>
        <tr>
          <td><strong>Weekly Close Enabled</strong></td>
          <td><code>weeklyCloseEnabled</code></td>
          <td><span class="badge-db">project.weekly_close_enabled</span></td>
          <td>CHECKBOX (0 or 1)</td>
          <td>When checked, locks timesheets every Sunday midnight to prevent retroactive technician edits.</td>
        </tr>
        <tr>
          <td><strong>Daily Report Required</strong></td>
          <td><code>dailyReportRequired</code></td>
          <td><span class="badge-db">project.daily_report_required</span></td>
          <td>CHECKBOX (0 or 1)</td>
          <td>Enforces mandatory submission of daily field reports before weekly timesheets can be approved.</td>
        </tr>
      </tbody>
    </table>

    <h2>Project Buttons &amp; Lifecycle State Transitions</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Button Label</th>
          <th>Action Endpoint</th>
          <th>Allowed Initial State</th>
          <th>Target State &amp; Database Behavior</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge-btn">+ Create Project</span></td>
          <td><code>?/createProject</code></td>
          <td>New Modal</td>
          <td>Inserts project row, creates base <code>schedule</code> (Mon-Sat expected minutes, Sun 0), logs audit.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Save Project</span></td>
          <td><code>?/updateProject</code></td>
          <td>Any active state</td>
          <td>Updates project fields with optimistic concurrency check; validates decimal hours between 0 and 24.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Begin Close</span></td>
          <td><code>?/transitionProject</code></td>
          <td><code>active</code>, <code>paused</code></td>
          <td>Moves status to <code>closing</code>. Blocks new worker assignments while allowing final timesheets to settle.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Close Project</span></td>
          <td><code>?/transitionProject</code></td>
          <td><code>closing</code></td>
          <td>Moves status to <code>closed</code>. Records official <code>actual_end_date</code> in database.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Archive Project</span></td>
          <td><code>?/transitionProject</code></td>
          <td><code>closed</code></td>
          <td>Soft-archives project (<code>status = 'archived'</code>). Hides from operational pickers but retains full financial history.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Restore Project</span></td>
          <td><code>?/transitionProject</code></td>
          <td><code>archived</code></td>
          <td>Restores project back to <code>active</code> operational status.</td>
        </tr>
        <tr>
          <td><span class="badge-btn-danger">Delete Project</span></td>
          <td><code>?/deleteProject</code></td>
          <td><code>active</code> (draft)</td>
          <td><strong>Hard Deletion:</strong> Permanently removes empty projects with 0 hours, 0 expenses, and 0 invoices.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 6: RATE CARDS & ASSIGNMENTS (PAGE 8) -->
  <div class="page-break">
    <h1>6. Rate Cards, Overtime Policies &amp; Workforce Assignments (CORE-03 &amp; CORE-05)</h1>
    <p>The platform supports J&A's specialized commercial rules that dictate how actual floor hours translate into client invoices and internal worker compensation.</p>

    <h2>1. Standard Corporate Rate Card Matrix</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Engineering Specialization</th>
          <th>Client Billing Rate</th>
          <th>Overtime Threshold</th>
          <th>Overtime Treatment</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Lead PLC Engineer (Gabriel Santos)</strong></td>
          <td>$70.00 / hour</td>
          <td>After 10h/day or 60h/week</td>
          <td>Proportional multiplier (1.5x) when contract is Time &amp; Materials.</td>
        </tr>
        <tr>
          <td><strong>Automation Specialist (Maico Silva)</strong></td>
          <td>$55.00 / hour</td>
          <td>After 10h/day or 60h/week</td>
          <td>Proportional multiplier (1.5x) or agreed contract rate.</td>
        </tr>
        <tr>
          <td><strong>Robotics Programmer (Victor Lima)</strong></td>
          <td>$55.00 / hour</td>
          <td>After 10h/day or 60h/week</td>
          <td>Separated on billing candidate streams.</td>
        </tr>
        <tr>
          <td><strong>Commissioning Tech (Andrew Miller)</strong></td>
          <td>$55.00 / hour</td>
          <td>After 10h/day or 60h/week</td>
          <td>Separated on billing candidate streams.</td>
        </tr>
      </tbody>
    </table>

    <h2>2. Workforce Assignment Inputs &amp; Controls</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Assignment Field</th>
          <th>Database Target</th>
          <th>Type / Format</th>
          <th>Operational Definition</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Technician</strong></td>
          <td><span class="badge-db">project_member.user_id</span></td>
          <td>SELECT (Active Workers)</td>
          <td>Selects engineer to assign to the project roster.</td>
        </tr>
        <tr>
          <td><strong>Role on Project</strong></td>
          <td><span class="badge-db">project_member.role_on_project</span></td>
          <td>SELECT (Roles)</td>
          <td>Lead PLC, Robotics Programmer, Automation Specialist, Commissioning Tech.</td>
        </tr>
        <tr>
          <td><strong>Starts On / Ends On</strong></td>
          <td><span class="badge-db">project_member.starts_on</span></td>
          <td>DATE (ISO format)</td>
          <td>Assignment validity timeframe. Workers can only log hours within their active assignment window.</td>
        </tr>
        <tr>
          <td><strong>Client Bill Rate Override</strong></td>
          <td><span class="badge-db">assignment_rate_override.client_bill_rate</span></td>
          <td>MONEY (cents, opt)</td>
          <td>Optional project-specific client billing rate overriding default rate card.</td>
        </tr>
      </tbody>
    </table>

    <h2>3. Assignment Buttons</h2>
    <p><span class="badge-btn">+ Assign Worker</span>: Enrolls engineer in project team with date bounds. <span class="badge-btn-danger">End Assignment</span>: Gracefully terminates assignment, preventing future time logs while preserving historical logs.</p>
  </div>

  <!-- CHAPTER 7: MASTER TIME TRACKING (PAGE 9) -->
  <div class="page-break">
    <h1>7. Master Time Tracking &amp; Operational Oversight (CORE-04)</h1>
    <p>The Master Time Tracking interface enables executive oversight across all active personnel on site, comparing planned shifts against actual logged hours.</p>

    <div class="figure no-break">
      <img src="${img('owner/04_time_tracking.png')}" alt="Time Tracking Hub" />
      <div class="figure-caption"><strong>Figure 7.1:</strong> Master Time Tracking calendar showing weekly logs (CW31/CW32) for all field workers across all projects.</div>
    </div>

    <h2>Master Time Tracking Controls &amp; Input Fields</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Input / Selector</th>
          <th>Database Target</th>
          <th>Options / Format</th>
          <th>Operational Meaning</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Work Date</strong></td>
          <td><span class="badge-db">time_entry.work_date</span></td>
          <td>DATE (YYYY-MM-DD)</td>
          <td>Day shift was performed on the factory floor.</td>
        </tr>
        <tr>
          <td><strong>Project Picker</strong></td>
          <td><span class="badge-db">time_entry.project_id</span></td>
          <td>SELECT (Active Projects)</td>
          <td>Project against which labor is recorded. Owners can log/edit for any active project.</td>
        </tr>
        <tr>
          <td><strong>Actual Hours</strong></td>
          <td><span class="badge-db">time_entry.duration_minutes</span></td>
          <td>NUMBER (step 0.25, decimal)</td>
          <td>Exact hours worked on site. Stored in SQLite as exact integer minutes (<code>hours &times; 60</code>).</td>
        </tr>
        <tr>
          <td><strong>Work Category</strong></td>
          <td><span class="badge-db">time_entry.category</span></td>
          <td>SELECT (4 categories)</td>
          <td>Options: <code>regular</code> (standard work), <code>overtime</code> (excess hours), <code>travel</code> (transit), <code>standby</code> (plant delay).</td>
        </tr>
        <tr>
          <td><strong>Task Description</strong></td>
          <td><span class="badge-db">time_entry.description</span></td>
          <td>TEXT (max 5000 chars)</td>
          <td>Detailed engineering summary (e.g. <em>"Line 1 Safety circuit integration and interlock testing"</em>).</td>
        </tr>
      </tbody>
    </table>

    <h2>Time Tracking Action Buttons</h2>
    <p><span class="badge-btn">Save Entry</span>: Saves time entry as draft. <span class="badge-btn">Submit Week</span>: Submits weekly sheet for approval. <span class="badge-btn">Copy Prior Week</span>: Clones prior week project rows with 0.0h. <span class="badge-btn-danger">Delete Entry</span>: Removes draft entry.</p>
  </div>

  <!-- CHAPTER 8: APPROVALS QUEUE (PAGE 10) -->
  <div class="page-break">
    <h1>8. Approvals Queue: Timesheet &amp; Expense Workflows (CORE-08)</h1>
    <p>The Approvals Hub functions as the quality control firewall between technician logs and client-facing billing candidate pools.</p>

    <div class="figure no-break">
      <img src="${img('owner/05_approvals_queue.png')}" alt="Approvals Queue" />
      <div class="figure-caption"><strong>Figure 8.1:</strong> Approvals Queue allowing single-click and batch verification of hours, daily reports, and expense receipts.</div>
    </div>

    <h2>Timesheet &amp; Expense Lifecycle States</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>State Badge</th>
          <th>Database Status</th>
          <th>Worker Permitted Actions</th>
          <th>Owner / PM Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>Draft</code></td>
          <td><code>draft</code></td>
          <td>Edit hours, change notes, delete entry.</td>
          <td>View only.</td>
        </tr>
        <tr>
          <td><code>Submitted</code></td>
          <td><code>submitted</code></td>
          <td>Locked. Cannot edit or delete.</td>
          <td>Approve entry or Reject with required feedback reason.</td>
        </tr>
        <tr>
          <td><code>Approved</code></td>
          <td><code>approved</code></td>
          <td>Locked. Displayed on compensation statement.</td>
          <td>Queued into unbilled candidate streams for invoice generation.</td>
        </tr>
        <tr>
          <td><code>Rejected</code></td>
          <td><code>rejected</code></td>
          <td>Unlocked with rejection notes; worker can revise.</td>
          <td>Awaiting revised re-submission.</td>
        </tr>
      </tbody>
    </table>

    <h2>Approvals Buttons &amp; Action Endpoints</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Button Label</th>
          <th>Action Endpoint</th>
          <th>Required Inputs</th>
          <th>Database Effect</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge-btn">Approve Week</span></td>
          <td><code>?/approveTimeWeek</code></td>
          <td><code>projectId</code>, <code>userId</code>, <code>weekEnding</code></td>
          <td>Transitions all entries from <code>submitted</code> $\to$ <code>approved</code>. Unlocks billing candidate streams.</td>
        </tr>
        <tr>
          <td><span class="badge-btn-danger">Reject Week</span></td>
          <td><code>?/rejectTimeWeek</code></td>
          <td><code>reason</code> (TEXT, mandatory)</td>
          <td>Sets status $\to$ <code>rejected</code>, logs rejection reason in <code>time_entry.rejection_reason</code>, notifies worker.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Approve Expense</span></td>
          <td><code>?/approveExpense</code></td>
          <td><code>expenseId</code>, <code>billingTreatment</code></td>
          <td>Clears expense for settlement payout and adds to billable expense stream if reimbursable.</td>
        </tr>
        <tr>
          <td><span class="badge-btn-danger">Reject Expense</span></td>
          <td><code>?/rejectExpense</code></td>
          <td><code>reason</code> (TEXT, mandatory)</td>
          <td>Rejects expense item, requiring worker to re-upload clear receipt or fix amount.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 9: FIELD OPERATIONS & PLC REPORTS (PAGE 11) -->
  <div class="page-break">
    <h1>9. Field Operations &amp; Generated PLC Technical Reports (CORE-07)</h1>
    <p>J&A Automation field services combine daily operational shift records with deep technical PLC program change logs.</p>

    <div class="figure no-break">
      <img src="${img('owner/06_daily_field_reports.png')}" alt="Field Reports Hub" />
      <div class="figure-caption"><strong>Figure 9.1:</strong> Daily Field Reports Hub showing shifts, machines worked, safety checks, and customer sign-off readiness.</div>
    </div>

    <h2>Generated Technical PLC Diagnostics PDF</h2>
    <p>When engineers execute programming or safety modifications on customer equipment (e.g. Siemens S7-1500 or Rockwell GuardLogix), the platform compiles an official diagnostic artifact:</p>

    <div class="figure document-frame no-break">
      <img src="${img('artifacts/pdf_technical_plc_report.png')}" alt="Generated PLC Report PDF" />
      <div class="figure-caption"><strong>Figure 9.2:</strong> Official Generated Technical PLC Report (PDF) detailing system ID, Siemens CPU 1517F-3, root cause diagnosis, safety SIL3 test results, and backup hash.</div>
    </div>

    <h2>Technical Report Form Inputs &amp; Database Mappings</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Report Input</th>
          <th>Database Target</th>
          <th>Format</th>
          <th>Operational Scope</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Equipment / Station</strong></td>
          <td><span class="badge-db">technical_report.equipment_name</span></td>
          <td>TEXT</td>
          <td>Machine name or production line station (e.g., <em>Station 040 Welder</em>).</td>
        </tr>
        <tr>
          <td><strong>Controller / Hardware</strong></td>
          <td><span class="badge-db">technical_report.controller_model</span></td>
          <td>TEXT</td>
          <td>PLC CPU model (e.g., <em>Siemens CPU 1517F-3 PN/DP</em>, <em>AB ControlLogix 5580</em>).</td>
        </tr>
        <tr>
          <td><strong>Root Cause Diagnosis</strong></td>
          <td><span class="badge-db">technical_report.root_cause</span></td>
          <td>TEXT</td>
          <td>Engineering explanation of the defect, timing fault, or sensor malfunction.</td>
        </tr>
        <tr>
          <td><strong>Safety SIL3 Check</strong></td>
          <td><span class="badge-db">technical_report.safety_check</span></td>
          <td>BOOLEAN</td>
          <td>Confirms that safety interlocks, light curtains, and E-stops were tested and validated.</td>
        </tr>
        <tr>
          <td><strong>Program Backup File</strong></td>
          <td><span class="badge-db">technical_report.backup_hash</span></td>
          <td>FILE UPLOAD</td>
          <td>Stores PLC project archive (.zap18, .acd) with SHA-256 integrity checksum.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 10: CUSTOMER SIGN-OFF GATE (PAGE 12) -->
  <div class="page-break">
    <h1>10. Customer Sign-Off Gate &amp; Zero-Money Period Reports (CORE-07 &amp; CORE-13)</h1>
    <p>A central contractual requirement of J&A Automation operations is the <strong>Customer Sign-off Gate</strong>: *"solo pagan si tiene la firma, no puede tener valores de dinero ni del contratado ni del trabajador, eso hay que generar para la firma del cliente"*.</p>

    <h2>Customer Sign-off Report vs. Internal Financial Report</h2>
    <p>The platform generates two distinct period reports from the exact same source hours:</p>

    <div class="figure-grid no-break">
      <div class="figure document-frame">
        <img src="${img('artifacts/pdf_customer_period_report.png')}" alt="Customer Period Report" />
        <div class="figure-caption"><strong>Figure 10.1:</strong> Customer Period Report (PDF) with strict zero-money filter and formal physical signature block.</div>
      </div>
      <div class="figure document-frame">
        <img src="${img('artifacts/pdf_internal_period_report.png')}" alt="Internal Admin Report" />
        <div class="figure-caption"><strong>Figure 10.2:</strong> Internal Financial Period Report (PDF) showing worker rates, direct costs, and billing totals.</div>
      </div>
    </div>

    <h2>Customer vs. Internal Report Comparison Matrix</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Report Feature</th>
          <th>Customer Period Report (Client Sign-Off)</th>
          <th>Internal Financial Period Report (Owner Admin)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Monetary Figures ($ / €)</strong></td>
          <td><span class="badge badge-worker">STRICTLY STRIPPED (Zero Money)</span></td>
          <td><span class="badge badge-owner">FULL DISCLOSURE (Rates, Costs, Margins)</span></td>
        </tr>
        <tr>
          <td><strong>Worker Internal Pay</strong></td>
          <td>Hidden (Privacy firewall enforced)</td>
          <td>Visible ($40/h rate, total worker compensation)</td>
        </tr>
        <tr>
          <td><strong>Client Billing Rates</strong></td>
          <td>Hidden (Zero commercial rates)</td>
          <td>Visible ($70/h billing rate, total billable amount)</td>
        </tr>
        <tr>
          <td><strong>Signature Block</strong></td>
          <td><strong>Formal physical sign-off box</strong> for Plant Representative</td>
          <td>Internal sign-off / accounting audit approval</td>
        </tr>
        <tr>
          <td><strong>Pre-Billing Invoicing Gate</strong></td>
          <td><strong>Mandatory prerequisite</strong> for final invoice issuance</td>
          <td>Used for internal profit reconciliation</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 11: EXPENSES HUB (PAGE 13) -->
  <div class="page-break">
    <h1>11. Expenses Hub &amp; Commercial Billing Treatments (CORE-06)</h1>
    <p>The Expenses Hub manages all site travel, flights, lodging, rental cars, and hardware purchases incurred during commissioning.</p>

    <div class="figure no-break">
      <img src="${img('owner/07_expenses_management.png')}" alt="Expenses Hub" />
      <div class="figure-caption"><strong>Figure 11.1:</strong> Expense Management panel showing receipt attachments, currency conversions, and billability classification.</div>
    </div>

    <h2>Expense Input Fields, Categories &amp; Database Columns</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Input Box / Dropdown</th>
          <th>Field Name</th>
          <th>Database Target</th>
          <th>Available Options / Rules</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Incurred On</strong></td>
          <td><code>incurredOn</code></td>
          <td><span class="badge-db">expense.incurred_on</span></td>
          <td>DATE (YYYY-MM-DD, req) - Transaction date matching the physical receipt.</td>
        </tr>
        <tr>
          <td><strong>Project</strong></td>
          <td><code>projectId</code></td>
          <td><span class="badge-db">expense.project_id</span></td>
          <td>SELECT (Active Projects) - Assigns cost to project cost center.</td>
        </tr>
        <tr>
          <td><strong>Expense Category</strong></td>
          <td><code>category</code></td>
          <td><span class="badge-db">expense.category</span></td>
          <td>SELECT: <code>lodging</code> (hotel), <code>meals</code> (food/per diem), <code>travel_transit</code> (flights, trains, rental cars), <code>mileage</code> (vehicle usage), <code>materials_tools</code> (site parts), <code>other</code>.</td>
        </tr>
        <tr>
          <td><strong>Amount</strong></td>
          <td><code>amount</code></td>
          <td><span class="badge-db">expense.amount_minor</span></td>
          <td>NUMBER (decimal, 2 places). Converted and stored as exact integer cents.</td>
        </tr>
        <tr>
          <td><strong>Currency</strong></td>
          <td><code>currency</code></td>
          <td><span class="badge-db">expense.currency</span></td>
          <td>SELECT: <code>USD</code>, <code>EUR</code>, <code>MXN</code>, <code>CAD</code>. Converted to project currency using verified exchange rates.</td>
        </tr>
        <tr>
          <td><strong>Merchant / Vendor</strong></td>
          <td><code>merchant</code></td>
          <td><span class="badge-db">expense.merchant</span></td>
          <td>TEXT (e.g., <em>Marriott Spartanburg</em>, <em>Hertz DFW</em>, <em>Delta Air Lines</em>).</td>
        </tr>
        <tr>
          <td><strong>Receipt File</strong></td>
          <td><code>receiptFile</code></td>
          <td><span class="badge-db">expense.receipt_storage_key</span></td>
          <td>FILE UPLOAD (PDF, PNG, JPEG, WebP, max 50 MB). Encrypted in private artifact storage.</td>
        </tr>
        <tr>
          <td><strong>Billing Treatment</strong></td>
          <td><code>billingTreatment</code></td>
          <td><span class="badge-db">expense.billing_treatment</span></td>
          <td>SELECT (Owner Only): <code>reimbursable_at_cost</code> (1:1 client billing), <code>reimbursable_with_markup</code>, <code>all_in_included</code> (absorbed in project fee), <code>non_billable</code>.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 12: BILLING HUB & INVOICE PDFS (PAGE 14) -->
  <div class="page-break">
    <h1>12. Billing Hub, Candidate Streams &amp; Generated Invoice PDFs (CORE-10 &amp; CORE-11)</h1>
    <p>The Billing Hub orchestrates invoice generation from approved hours and expenses across all active project streams.</p>

    <div class="figure no-break">
      <img src="${img('owner/08_billing_hub.png')}" alt="Billing Hub" />
      <div class="figure-caption"><strong>Figure 12.1:</strong> Billing Hub showing invoice statuses (Draft, Issued, Paid), service periods, and generation actions.</div>
    </div>

    <h2>Generated Labor vs. Expenses Invoice Artifacts</h2>
    <p>Labor and Expenses generate distinct official PDF documents with independent tax profiles and accounting numbers:</p>

    <div class="figure-grid no-break">
      <div class="figure document-frame">
        <img src="${img('artifacts/pdf_invoice_labor.png')}" alt="Labor Invoice PDF" />
        <div class="figure-caption"><strong>Figure 12.2:</strong> Generated Labor Invoice (CP020-013) with 4-column layout, boxed totals ($57,437.25), and wire terms.</div>
      </div>
      <div class="figure document-frame">
        <img src="${img('artifacts/pdf_invoice_expenses.png')}" alt="Expenses Invoice PDF" />
        <div class="figure-caption"><strong>Figure 12.3:</strong> Generated Expenses Invoice (CP020-014) itemizing Marriott, Hertz, American Airlines, and fuel ($2,197.00).</div>
      </div>
    </div>

    <h2>Three Independent Candidate Streams (Duplicate Billing Prevention)</h2>
    <ul>
      <li><strong>Labor Candidate Stream:</strong> Approved timesheet hours grouped by technician and role rate card.</li>
      <li><strong>Expenses Candidate Stream:</strong> Approved reimbursable expenses with receipt attachments.</li>
      <li><strong>Milestones Candidate Stream:</strong> Completed project milestones ready for commercial billing.</li>
    </ul>
  </div>

  <!-- CHAPTER 13: INVOICE PREVIEW & REMITTANCE (PAGE 15) -->
  <div class="page-break">
    <h1>13. Invoice Preview, Boxed Totals &amp; Wells Fargo Remittance</h1>
    <p>Every invoice generated by the system presents a standardized, publication-grade corporate layout with draft customizations:</p>

    <div class="figure-grid no-break">
      <div class="figure">
        <img src="${img('owner/09_invoice_preview.png')}" alt="Web Invoice Preview" />
        <div class="figure-caption"><strong>Figure 13.1:</strong> Web Invoice Preview showing 4 columns, boxed totals, and Wells Fargo wire instructions.</div>
      </div>
      <div class="figure">
        <img src="${img('owner/10_invoice_edit_draft.png')}" alt="Invoice Edit Accordion" />
        <div class="figure-caption"><strong>Figure 13.2:</strong> Draft Customization Accordion allowing direct editing of Purchase No., discounts, and banking details.</div>
      </div>
    </div>

    <h2>Invoice Draft Inputs &amp; Actions</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Button / Field</th>
          <th>Target</th>
          <th>Behavior &amp; Purpose</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge-btn">Generate Draft Invoice</span></td>
          <td><code>?/generateInvoiceDraft</code></td>
          <td>Collects unbilled candidate stream rows into an editable draft invoice.</td>
        </tr>
        <tr>
          <td><strong>Purchase No. (PO Number)</strong></td>
          <td><span class="badge-db">invoice.po_number</span></td>
          <td>Editable customer PO reference displayed prominently on the invoice header.</td>
        </tr>
        <tr>
          <td><strong>Banking Details</strong></td>
          <td><span class="badge-db">invoice.banking_details</span></td>
          <td>Remittance info: Wells Fargo Bank, Swift: <code>WFBIUS6S</code>, Account: <code>8769915615</code>.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Finalize &amp; Issue</span></td>
          <td><code>?/issueInvoice</code></td>
          <td><strong>Cryptographic Freeze:</strong> Permanently locks source timesheets/expenses, stores immutable snapshot in <code>invoice.snapshot_json</code>, and generates official PDF/XML.</td>
        </tr>
        <tr>
          <td><span class="badge-btn-danger">Void Invoice</span></td>
          <td><code>?/voidInvoice</code></td>
          <td>Cancels draft or unpaid invoice with mandatory audit justification reason.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 14: COLLECTIONS LEDGER (PAGE 16) -->
  <div class="page-break">
    <h1>14. Collections Ledger, Payment Reconciliation &amp; Credit Notes (CORE-12)</h1>
    <p>The Collections Ledger tracks accounts receivable aging, client wire transfers, cash reconciliation, and formal credit adjustments.</p>

    <div class="figure no-break">
      <img src="${img('owner/12_collections_ledger.png')}" alt="Collections Ledger" />
      <div class="figure-caption"><strong>Figure 14.1:</strong> Collections Ledger web interface showing issued invoices, payments collected, and outstanding balances.</div>
    </div>

    <h2>Generated Collections Ledger Excel Workbook (<code>.xlsx</code>)</h2>
    <div class="figure excel-frame no-break">
      <img src="${img('artifacts/excel_collections_ledger.png')}" alt="Collections Ledger Excel" />
      <div class="figure-caption"><strong>Figure 14.2:</strong> Generated Invoice Collections Ledger (Invoice_Collection_Ledger.xlsx) reconciling $59,634.25 collected from IMPC Gmbh via Wells Fargo wire transfers with aging balances.</div>
    </div>

    <h2>Record Payment Form Inputs &amp; Credit Notes</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Input Field / Button</th>
          <th>Database Target</th>
          <th>Type / Options</th>
          <th>Operational Function</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Payment Date</strong></td>
          <td><span class="badge-db">payment.payment_date</span></td>
          <td>DATE (YYYY-MM-DD)</td>
          <td>Date wire transfer or funds settled in corporate bank account.</td>
        </tr>
        <tr>
          <td><strong>Amount Received</strong></td>
          <td><span class="badge-db">payment.amount_minor</span></td>
          <td>MONEY (cents, BigInt)</td>
          <td>Received amount. Updates invoice paid balance; transitions invoice to <code>partially_paid</code> or <code>paid</code>.</td>
        </tr>
        <tr>
          <td><strong>Payment Method</strong></td>
          <td><span class="badge-db">payment.payment_method</span></td>
          <td>SELECT</td>
          <td>Options: <code>bank_transfer_wire</code>, <code>ach</code>, <code>check</code>, <code>credit_card</code>.</td>
        </tr>
        <tr>
          <td><strong>Bank Reference / Trace</strong></td>
          <td><span class="badge-db">payment.reference</span></td>
          <td>TEXT</td>
          <td>Bank transaction reference, Fedwire tracking number, or check number.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">+ Create Credit Note</span></td>
          <td><code>?/createCreditNote</code></td>
          <td>Owner / Finance</td>
          <td>Issues a formal credit adjustment memo against an issued invoice without mutating historical truth.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 15: FINANCIAL INTELLIGENCE (PAGE 17) -->
  <div class="page-break">
    <h1>15. Financial Intelligence &amp; Generated Economics Excel (CORE-09)</h1>
    <p>The Finance Hub gives executive leadership real-time visibility into project economic viability, gross margins, and labor realization rates.</p>

    <div class="figure no-break">
      <img src="${img('owner/11_finance_profitability.png')}" alt="Finance Hub" />
      <div class="figure-caption"><strong>Figure 15.1:</strong> Financial Intelligence dashboard displaying Candidate Subtotals, Internal Costs, Contribution Margins, and BPS.</div>
    </div>

    <h2>Generated Project Economics Excel Workbook (<code>.xlsx</code>)</h2>
    <div class="figure excel-frame no-break">
      <img src="${img('artifacts/excel_project_economics.png')}" alt="Project Economics Excel" />
      <div class="figure-caption"><strong>Figure 15.2:</strong> Generated Project Economics Workbook (Project_Finance_Economic_Review_CP020.xlsx) showing candidate revenue ($57,437.25), worker compensation ($35,745.00), and 37.77% net contribution margin.</div>
    </div>

    <h2>Key Profitability Metrics Explained:</h2>
    <ul>
      <li><strong>Direct Contribution Margin:</strong> <code>Revenue &minus; Direct Labor Costs &minus; Direct Travel Expenses</code>.</li>
      <li><strong>Basis Points (BPS):</strong> Margin percentage expressed in financial basis points (e.g., 37.77% = <code>3,777 BPS</code>).</li>
      <li><strong>Realization Rate:</strong> Effective net revenue earned per technician hour on site.</li>
    </ul>
  </div>

  <!-- CHAPTER 16: MONTHLY ACCOUNTING CLOSE (PAGE 18) -->
  <div class="page-break">
    <h1>16. Monthly Accounting Close &amp; Multi-Tab Excel Workbook (CORE-13)</h1>
    <p>At the close of each calendar month, administrators generate the official <strong>Accounting Pack</strong> to lock the financial period and reconcile revenue, labor costs, and vendor disbursements.</p>

    <div class="figure-grid no-break">
      <div class="figure document-frame">
        <img src="${img('artifacts/pdf_accounting_pack.png')}" alt="Accounting Pack PDF" />
        <div class="figure-caption"><strong>Figure 16.1:</strong> Executive Accounting Pack (PDF) showing 1,156.45 h worker hours, $41,873.25 labor costs, and travel receipts.</div>
      </div>
      <div class="figure excel-frame">
        <img src="${img('artifacts/excel_accounting_pack.png')}" alt="Accounting Pack Excel" />
        <div class="figure-caption"><strong>Figure 16.2:</strong> Multi-Tab Accounting Workbook (.xlsx) with Totals, Invoices, Worker Costs, Expenses, and Collections.</div>
      </div>
    </div>

    <h2>Accounting Close Buttons &amp; Period Locking</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Button Label</th>
          <th>Action Endpoint</th>
          <th>Operational Effect</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge-btn">Close Accounting Period</span></td>
          <td><code>?/closeAccountingPeriod</code></td>
          <td><strong>Hard Freeze:</strong> Locks month; prevents creation or modification of timesheets, expenses, or invoices in the period.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Generate Accounting Pack</span></td>
          <td><code>?/generateAccountingPack</code></td>
          <td>Compiles authoritative multi-sheet Excel workbook and executive PDF summary pack.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 17: AUDIT LOGS (PAGE 19) -->
  <div class="page-break">
    <h1>17. Immutable System Audit Logs &amp; Forensics (CORE-15)</h1>
    <p>The platform maintains an append-only audit trail recording every state change, user authentication, invoice generation, payment recording, and entity deletion.</p>

    <div class="figure no-break">
      <img src="${img('owner/14_audit_compliance.png')}" alt="Audit Log" />
      <div class="figure-caption"><strong>Figure 17.1:</strong> System Audit Log recording immutable actor IDs, timestamps, IP addresses, and state changes.</div>
    </div>

    <h2>Audit Trail Table Schema &amp; Fields</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Audit Field</th>
          <th>Database Column</th>
          <th>Audit Verification Function</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Timestamp</strong></td>
          <td><span class="badge-db">audit_event.created_at</span></td>
          <td>ISO-8601 UTC timestamp recorded at transaction commit time.</td>
        </tr>
        <tr>
          <td><strong>Actor ID</strong></td>
          <td><span class="badge-db">audit_event.user_id</span></td>
          <td>User ID and corporate email of the principal who executed the action.</td>
        </tr>
        <tr>
          <td><strong>Action Type</strong></td>
          <td><span class="badge-db">audit_event.action</span></td>
          <td>Strictly validated against <code>audit_action_registry</code> (e.g., <code>lifecycle.transition</code>, <code>invoice.issued</code>).</td>
        </tr>
        <tr>
          <td><strong>Entity Target</strong></td>
          <td><span class="badge-db">audit_event.entity_type / entity_id</span></td>
          <td>Target table and row identifier (e.g. <code>project</code>, <code>invoice</code>, <code>client</code>).</td>
        </tr>
        <tr>
          <td><strong>State Transition</strong></td>
          <td><span class="badge-db">audit_event.payload</span></td>
          <td>JSON payload capturing <code>fromState</code>, <code>toState</code>, modified fields, and mandatory user justification notes.</td>
        </tr>
      </tbody>
    </table>
  </div>

</body>
</html>`;
}

function buildWorkerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>J&A Automation LLC — Field Technician & Engineering Operations Guide</title>
  <style>${baseCss}</style>
</head>
<body>

  <!-- COVER PAGE (PAGE 1) -->
  <div class="cover">
    <div class="cover-top">
      <div class="cover-logo-text">J&amp;A Automation LLC · Field Engineering</div>
      <h1 class="cover-title">Field Technician &amp; Engineering Operations Guide</h1>
      <p class="cover-subtitle">Complete daily guide for industrial controls engineers, robot programmers, and field technicians. Learn how to log daily hours with decimal precision, file shift progress reports, upload reimbursable expense receipts, and track your biweekly compensation payouts.</p>
      <div class="cover-badge">Field Personnel &amp; Engineering Role · Client Essential Release</div>
    </div>
    <div class="cover-meta">
      <div>
        <strong>System Information:</strong>
        J&A Employee Operations Portal<br/>
        Field Version: 2026.09<br/>
        Mobile PWA &amp; Industrial Tablet Compatible
      </div>
      <div>
        <strong>Guaranteed Worker Privacy:</strong>
        Worker compensation privacy strictly enforced.<br/>
        Client billing rates, company profit margins, and other workers' rates are completely hidden.
      </div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS (PAGE 2) -->
  <div class="page-break">
    <h1>Table of Contents</h1>
    <div class="toc-item"><span class="toc-title">1. Introduction, Daily Responsibilities &amp; Worker Privacy Firewall</span><span class="toc-page">Page 3</span></div>
    <div class="toc-item"><span class="toc-title">2. Daily Workflow, Navigation &amp; Mobile PWA Access</span><span class="toc-page">Page 4</span></div>
    <div class="toc-item"><span class="toc-title">3. Daily Time Logging with Decimal Hours &amp; Standby Rules (CORE-04)</span><span class="toc-page">Page 5</span></div>
    <div class="toc-item"><span class="toc-title">4. Weekly Timesheet Lifecycle: Draft, Submit &amp; Approval States</span><span class="toc-page">Page 6</span></div>
    <div class="toc-item"><span class="toc-title">5. Submitting Daily Field Reports &amp; Generated Report PDF (CORE-07)</span><span class="toc-page">Page 7</span></div>
    <div class="toc-item"><span class="toc-title">6. Logging Reimbursable Expenses &amp; Uploading Receipts (CORE-06)</span><span class="toc-page">Page 8</span></div>
    <div class="toc-item"><span class="toc-title">7. My Pay: Tracking Compensation &amp; Generated Statement PDF/CSV (CORE-05)</span><span class="toc-page">Page 9</span></div>
    <div class="toc-item"><span class="toc-title">8. Documents Hub, Safety Resources &amp; Technical Drawings</span><span class="toc-page">Page 10</span></div>
    <div class="toc-item"><span class="toc-title">9. Account Security: Biometric Passkeys, MFA &amp; Language Settings</span><span class="toc-page">Page 11</span></div>

    <h2>Field Worker Operational Rules Checklist</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Operational Area</th>
          <th>Standard Requirement</th>
          <th>How to Follow in the Portal</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Standard Shift</strong></td>
          <td>10 hours per day, Monday through Saturday (60 hours/week standard).</td>
          <td>Log actual shift duration with decimal precision (e.g. <code>10.0</code>, <code>8.5</code>) in <em>Time</em>.</td>
        </tr>
        <tr>
          <td><strong>Standby Hours</strong></td>
          <td>When waiting for plant parts, line clearing, or customer authorization.</td>
          <td>Select category <em>Standby</em> and describe the idle cause in notes.</td>
        </tr>
        <tr>
          <td><strong>Shift Reports</strong></td>
          <td>Mandatory daily report for plant handover and safety records.</td>
          <td>Submit a <em>Field Report</em> before leaving the factory site.</td>
        </tr>
        <tr>
          <td><strong>Travel Expenses</strong></td>
          <td>Receipt photo required for all travel expenses (hotel, fuel, flights).</td>
          <td>Attach receipt image in <em>Expenses</em> and verify amount and currency.</td>
        </tr>
        <tr>
          <td><strong>Compensation Statements</strong></td>
          <td>Personal statements for earnings and tax records.</td>
          <td>Access <em>My Pay</em> to view settlements and download statement PDF/CSV.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 1: INTRO & PRIVACY (PAGE 3) -->
  <div class="page-break">
    <h1>1. Introduction, Daily Responsibilities &amp; Worker Privacy Firewall</h1>
    <p>Welcome to the <strong>J&A Automation Field Operations Portal</strong>. As an industrial controls engineer, robotics specialist, or electrical commissioning technician, your work on the plant floor drives our company's reputation and success.</p>
    <p>This portal provides you with an intuitive, mobile-ready tool to record your working hours, submit daily shift progress, attach travel expense receipts, and track your biweekly compensation payouts.</p>

    <div class="callout tip">
      <strong>The Worker Privacy Firewall (CORE-01 &amp; CORE-05):</strong> The J&A platform enforces strict separation of internal technician compensation from client billing. You will only ever see your own agreed compensation rate and earnings. Company profit margins, client billing rates ($70/h, $55/h), client invoices, and other workers' compensation are completely inaccessible to your user account.
    </div>

    <h2>Your Daily Responsibilities on Site</h2>
    <ol>
      <li><strong>Time Logging:</strong> Record your actual worked hours and standby hours at the end of every shift with decimal precision.</li>
      <li><strong>Daily Field Report:</strong> Summarize work completed, machine status, problems encountered, and safety checks before leaving the plant.</li>
      <li><strong>Receipt Uploads:</strong> Submit clear photos of receipts for hotel, fuel, flights, or car rentals as soon as they are incurred.</li>
      <li><strong>Settlement Verification:</strong> Review approved compensation, hours breakdown, and payout dates in <em>My Pay</em>.</li>
    </ol>
  </div>

  <!-- CHAPTER 2: WORKFLOW & MOBILE (PAGE 4) -->
  <div class="page-break">
    <h1>2. Daily Workflow, Navigation &amp; Mobile PWA Access</h1>
    <p>When you sign into the platform, the <strong>Today Dashboard</strong> immediately presents your planned shift, active project assignment, and quick action shortcuts.</p>

    <div class="figure no-break">
      <img src="${img('worker/01_worker_home.png')}" alt="Worker Today Dashboard" />
      <div class="figure-caption"><strong>Figure 2.1:</strong> Worker Today Dashboard showing planned hours (10h), active project assignments, and quick actions.</div>
    </div>

    <h2>Mobile Field Use (Progressive Web App)</h2>
    <p>The portal is fully optimized for mobile devices and industrial tablets, allowing you to enter hours and file reports directly from the plant floor:</p>

    <div class="figure mobile-frame no-break">
      <img src="${img('worker/08_worker_mobile_view.png')}" alt="Worker Mobile View" />
      <div class="figure-caption"><strong>Figure 2.2:</strong> Compact mobile responsive layout optimized for one-thumb field entries.</div>
    </div>

    <h2>Worker Navigation Menu Breakdown</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Navigation Item</th>
          <th>Icon</th>
          <th>URL Route</th>
          <th>What You Can Do</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Today</strong></td>
          <td>⌂</td>
          <td><code>/app/today</code></td>
          <td>Shift overview, current project assignments, quick action buttons.</td>
        </tr>
        <tr>
          <td><strong>Time</strong></td>
          <td>◷</td>
          <td><code>/app/time</code></td>
          <td>Log daily shift hours, submit weekly timesheets, copy prior week.</td>
        </tr>
        <tr>
          <td><strong>Expenses</strong></td>
          <td>◇</td>
          <td><code>/app/expenses</code></td>
          <td>Submit out-of-pocket expenses and upload receipt photos/PDFs.</td>
        </tr>
        <tr>
          <td><strong>Reports</strong></td>
          <td>▤</td>
          <td><code>/app/reports</code></td>
          <td>File daily field reports, log PLC program changes and plant blockers.</td>
        </tr>
        <tr>
          <td><strong>My Pay</strong></td>
          <td>$</td>
          <td><code>/app/pay</code></td>
          <td>View approved gross pay, hourly rate, settlement dates, and download PDF stubs.</td>
        </tr>
        <tr>
          <td><strong>Profile</strong></td>
          <td>◎</td>
          <td><code>/app/profile</code></td>
          <td>Manage account, register biometric passkeys, change language.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 3: TIME LOGGING (PAGE 5) -->
  <div class="page-break">
    <h1>3. Daily Time Logging with Decimal Hours &amp; Standby Rules (CORE-04)</h1>
    <p>Accurate time entry ensures your hours are promptly approved by Project Managers and processed for biweekly settlement without delays.</p>

    <div class="figure no-break">
      <img src="${img('worker/02_time_logging.png')}" alt="Time Logging Form" />
      <div class="figure-caption"><strong>Figure 3.1:</strong> Time Tracking interface showing daily shift entry, project picker, and weekly calendar breakdown.</div>
    </div>

    <h2>Time Logging Form: Every Input Box Explained</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Field Label</th>
          <th>Input Type</th>
          <th>Database Target</th>
          <th>How to Fill Out &amp; Validation Rules</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Work Date</strong></td>
          <td><code>&lt;input type="date"&gt;</code></td>
          <td><span class="badge-db">time_entry.work_date</span></td>
          <td>Date on which the shift was performed. Must be within your active assignment dates.</td>
        </tr>
        <tr>
          <td><strong>Project</strong></td>
          <td><code>&lt;select&gt;</code></td>
          <td><span class="badge-db">time_entry.project_id</span></td>
          <td>Dropdown listing only the active projects you are currently assigned to (e.g. <code>CP020 · BBS Mexico</code>).</td>
        </tr>
        <tr>
          <td><strong>Hours Worked</strong></td>
          <td><code>&lt;input type="number"&gt;</code></td>
          <td><span class="badge-db">time_entry.duration_minutes</span></td>
          <td><strong>Decimal Hours:</strong> Enter exact shift duration (e.g. <code>10.0</code>, <code>8.5</code>, <code>7.25</code>). Converted to exact minutes in SQLite (<code>hours &times; 60</code>).</td>
        </tr>
        <tr>
          <td><strong>Work Category</strong></td>
          <td><code>&lt;select&gt;</code></td>
          <td><span class="badge-db">time_entry.category</span></td>
          <td>Dropdown with 4 options: <code>regular</code>, <code>overtime</code>, <code>travel</code>, <code>standby</code>.</td>
        </tr>
        <tr>
          <td><strong>Task Description</strong></td>
          <td><code>&lt;textarea&gt;</code></td>
          <td><span class="badge-db">time_entry.description</span></td>
          <td>Detailed task description (e.g., <em>"PLC debugging on Station 20 turntable interlocks"</em>).</td>
        </tr>
      </tbody>
    </table>

    <h2>Work Category Dropdown Options Explained</h2>
    <ul>
      <li><strong>Regular Commissioning (<code>regular</code>):</strong> Standard on-site engineering, robot programming, PLC coding, and electrical debugging.</li>
      <li><strong>Overtime (<code>overtime</code>):</strong> Extended site work exceeding 10 hours in a single day or 60 hours in a single workweek.</li>
      <li><strong>Travel Time (<code>travel</code>):</strong> Transit time flying or driving to the customer plant site.</li>
      <li><strong>Standby / Idle Time (<code>standby</code>):</strong> On-site waiting time due to customer line stoppages, missing machine parts, or safety halts. Must describe the reason in notes.</li>
    </ul>
  </div>

  <!-- CHAPTER 4: TIMESHEET LIFECYCLE (PAGE 6) -->
  <div class="page-break">
    <h1>4. Weekly Timesheet Lifecycle: Draft, Submit &amp; Approval States</h1>
    <p>Timesheets follow a deterministic lifecycle designed to protect your hours and ensure prompt approvals by Project Managers.</p>

    <h2>Timesheet Status Indicators &amp; Meaning</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Status Badge</th>
          <th>What It Means</th>
          <th>Can You Edit It?</th>
          <th>Next Step</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge badge-shared">Draft</span></td>
          <td>Entry is saved locally in your portal.</td>
          <td><strong>Yes</strong> (Full edit/delete).</td>
          <td>Complete shift hours for the week and click <em>Submit Week for Approval</em>.</td>
        </tr>
        <tr>
          <td><span class="badge badge-owner">Submitted</span></td>
          <td>Locked for editing. Sent to Project Manager for review.</td>
          <td><strong>No</strong> (Locked).</td>
          <td>Awaiting Project Manager review and approval.</td>
        </tr>
        <tr>
          <td><span class="badge badge-worker">Approved</span></td>
          <td>Validated by PM. Officially queued for biweekly settlement.</td>
          <td><strong>No</strong> (Permanent).</td>
          <td>Visible in <em>My Pay</em> dashboard for upcoming direct deposit payout.</td>
        </tr>
        <tr>
          <td><span class="badge-btn-danger">Rejected</span></td>
          <td>PM requested corrections. Rejection note explains reason.</td>
          <td><strong>Yes</strong> (Unlocked for fix).</td>
          <td>Read PM note, correct the hours/description, and re-submit.</td>
        </tr>
      </tbody>
    </table>

    <h2>All Buttons in Time Section Explained</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Button Label</th>
          <th>Action</th>
          <th>When to Use It</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge-btn">Save Draft Entry</span></td>
          <td>Saves daily row.</td>
          <td>Click at the end of each shift to store hours without submitting yet.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Submit Week for Approval</span></td>
          <td>Locks timesheet.</td>
          <td>Click at the end of Saturday (or last day worked) to send entire week to PM.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Copy Prior Week</span></td>
          <td>Clones layout.</td>
          <td>Click on Monday to copy the project rows from last week with <code>0.0h</code>, saving typing.</td>
        </tr>
        <tr>
          <td><span class="badge-btn-danger">Delete Draft</span></td>
          <td>Removes row.</td>
          <td>Click to discard an erroneous draft entry before submission.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- CHAPTER 5: FIELD REPORTS (PAGE 7) -->
  <div class="page-break">
    <h1>5. Submitting Daily Field Reports &amp; Generated Report PDF (CORE-07)</h1>
    <p>Customer plant managers and J&A leadership rely on your daily report for shift handovers, machine issue tracking, and safety compliance.</p>

    <div class="figure-grid no-break">
      <div class="figure">
        <img src="${img('worker/03_field_report_submission.png')}" alt="Field Reports Web Form" />
        <div class="figure-caption"><strong>Figure 5.1:</strong> Field Reports web form for entering tasks, blockers, and safety observations.</div>
      </div>
      <div class="figure document-frame">
        <img src="${img('artifacts/pdf_daily_field_report.png')}" alt="Generated Field Report PDF" />
        <div class="figure-caption"><strong>Figure 5.2:</strong> Generated Daily Field Report (PDF) compiled by the system for plant handover records.</div>
      </div>
    </div>

    <h2>Field Report Input Fields &amp; Database Columns</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Field Label</th>
          <th>Input Type</th>
          <th>Database Column</th>
          <th>Operational Guidelines</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Report Date</strong></td>
          <td><code>&lt;input type="date"&gt;</code></td>
          <td><span class="badge-db">daily_report.report_date</span></td>
          <td>Date of the shift being reported.</td>
        </tr>
        <tr>
          <td><strong>Project</strong></td>
          <td><code>&lt;select&gt;</code></td>
          <td><span class="badge-db">daily_report.project_id</span></td>
          <td>Customer project where field service was performed.</td>
        </tr>
        <tr>
          <td><strong>Shift Summary</strong></td>
          <td><code>&lt;textarea&gt;</code></td>
          <td><span class="badge-db">daily_report.summary</span></td>
          <td>Describe stations, robots, and software logic worked on today.</td>
        </tr>
        <tr>
          <td><strong>Roadblocks &amp; Blockers</strong></td>
          <td><code>&lt;textarea&gt;</code></td>
          <td><span class="badge-db">daily_report.blockers</span></td>
          <td>Document missing customer parts, mechanical delays, or tooling faults.</td>
        </tr>
        <tr>
          <td><strong>Safety Observations</strong></td>
          <td><code>&lt;textarea&gt;</code></td>
          <td><span class="badge-db">daily_report.safety_notes</span></td>
          <td>Note any safety gate bypasses, LOTO procedures, or electrical hazard checks.</td>
        </tr>
        <tr>
          <td><strong>Next Day Plan</strong></td>
          <td><code>&lt;textarea&gt;</code></td>
          <td><span class="badge-db">daily_report.next_day_plan</span></td>
          <td>Handover instructions for tomorrow's shift or the incoming engineering team.</td>
        </tr>
      </tbody>
    </table>

    <p><span class="badge-btn">Submit Daily Report</span>: Compiles and submits official report. <span class="badge-btn">Download PDF</span>: Downloads official formatted shift report.</p>
  </div>

  <!-- CHAPTER 6: EXPENSES (PAGE 8) -->
  <div class="page-break">
    <h1>6. Logging Reimbursable Expenses &amp; Uploading Receipts (CORE-06)</h1>
    <p>If you pay out of pocket for travel, fuel, lodging, or emergency job site hardware, submit them in the <strong>Expenses</strong> section for 100% reimbursement in your next settlement.</p>

    <div class="figure no-break">
      <img src="${img('worker/04_expense_submission.png')}" alt="Expenses Submission" />
      <div class="figure-caption"><strong>Figure 6.1:</strong> Expense Submission form with receipt upload, vendor selection, and reimbursable checkbox.</div>
    </div>

    <h2>Expense Input Fields &amp; Categories Explained</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Input Box / Dropdown</th>
          <th>Field Name</th>
          <th>Database Target</th>
          <th>Options &amp; Instructions</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Spent On (Date)</strong></td>
          <td><code>incurredOn</code></td>
          <td><span class="badge-db">expense.incurred_on</span></td>
          <td>Date printed on the physical or digital receipt.</td>
        </tr>
        <tr>
          <td><strong>Project</strong></td>
          <td><code>projectId</code></td>
          <td><span class="badge-db">expense.project_id</span></td>
          <td>Project for which the expense was incurred.</td>
        </tr>
        <tr>
          <td><strong>Category</strong></td>
          <td><code>category</code></td>
          <td><span class="badge-db">expense.category</span></td>
          <td>Dropdown: <code>lodging</code> (hotel), <code>meals</code> (food/per diem), <code>travel_transit</code> (flights, car rentals, gas), <code>mileage</code>, <code>materials_tools</code> (emergency cables/tools), <code>other</code>.</td>
        </tr>
        <tr>
          <td><strong>Amount</strong></td>
          <td><code>amount</code></td>
          <td><span class="badge-db">expense.amount_minor</span></td>
          <td>Exact total amount paid on receipt (decimal, e.g. <code>142.50</code>).</td>
        </tr>
        <tr>
          <td><strong>Currency</strong></td>
          <td><code>currency</code></td>
          <td><span class="badge-db">expense.currency</span></td>
          <td>Select transaction currency: <code>USD</code>, <code>EUR</code>, <code>MXN</code>, <code>CAD</code>.</td>
        </tr>
        <tr>
          <td><strong>Merchant / Store</strong></td>
          <td><code>merchant</code></td>
          <td><span class="badge-db">expense.merchant</span></td>
          <td>Vendor name (e.g. <em>Chevron Gas</em>, <em>Hertz Car Rental</em>, <em>Home Depot</em>).</td>
        </tr>
        <tr>
          <td><strong>Attach Receipt File</strong></td>
          <td><code>receiptFile</code></td>
          <td><span class="badge-db">expense.receipt_storage_key</span></td>
          <td>Upload photo (JPG, PNG) or PDF invoice. Must be legible showing date and amount.</td>
        </tr>
      </tbody>
    </table>

    <p><span class="badge-btn">Save Expense Draft</span>: Stores draft locally. <span class="badge-btn">Submit Expense</span>: Submits for reimbursement approval. <span class="badge-btn-danger">Delete Draft</span>: Discards unsubmitted draft.</p>
  </div>

  <!-- CHAPTER 7: COMPENSATION (PAGE 9) -->
  <div class="page-break">
    <h1>7. My Pay: Tracking Compensation &amp; Generated Statement PDF/CSV (CORE-05)</h1>
    <p>The <strong>My Pay</strong> dashboard provides 100% transparency into your earnings, approved hours, and scheduled payout dates.</p>

    <div class="figure no-break">
      <img src="${img('worker/05_compensation_statement.png')}" alt="Compensation Dashboard" />
      <div class="figure-caption"><strong>Figure 7.1:</strong> Worker Pay panel showing Approved Compensation ($5,260.00), Approved Reimbursements, and Settlement payout history.</div>
    </div>

    <h2>Generated Official Statement (PDF) &amp; Personal Excel Export (CSV)</h2>
    <div class="figure-grid no-break">
      <div class="figure document-frame">
        <img src="${img('artifacts/pdf_worker_statement.png')}" alt="Worker Statement PDF" />
        <div class="figure-caption"><strong>Figure 7.2:</strong> Generated Worker Compensation Statement (PDF) showing 131.50 hours, $40.00/h rate, and $5,260.00 payout.</div>
      </div>
      <div class="figure excel-frame">
        <img src="${img('artifacts/excel_worker_statement.png')}" alt="Worker Statement Excel CSV" />
        <div class="figure-caption"><strong>Figure 7.3:</strong> Exported Personal Compensation Spreadsheet (Worker_Statement_Gabriel_Santos.csv) for tax records.</div>
      </div>
    </div>

    <h2>Understanding Your Compensation Dashboard</h2>
    <ul>
      <li><strong>Approved Hours:</strong> Total hours validated by PM for the current pay period (e.g. <code>131.50 h</code>).</li>
      <li><strong>Hourly Rate:</strong> Your agreed internal compensation wage (e.g. <code>$40.00 / h</code>). Private to you.</li>
      <li><strong>Gross Labor Earnings:</strong> <code>Approved Hours &times; Hourly Rate</code> ($5,260.00).</li>
      <li><strong>Expense Reimbursements:</strong> Approved travel receipts added 100% to your payout without tax withholding.</li>
      <li><strong>Payout Schedule:</strong> Direct ACH bank transfer date.</li>
    </ul>

    <p><span class="badge-btn">Download Statement PDF</span>: Official J&A pay stub artifact. <span class="badge-btn">Export CSV</span>: Spreadsheet export for tax accounting.</p>
  </div>

  <!-- CHAPTER 8: DOCUMENTS & SAFETY (PAGE 10) -->
  <div class="page-break">
    <h1>8. Documents Hub, Safety Resources &amp; Technical Drawings</h1>
    <p>The Documents Hub provides instant access to plant electrical schematics, PLC program backups, and factory safety protocols.</p>

    <div class="figure no-break">
      <img src="${img('worker/06_documents_hub.png')}" alt="Documents Hub" />
      <div class="figure-caption"><strong>Figure 8.1:</strong> Documents Hub showing electrical schematics, robot safety manuals, and customer onboarding guides.</div>
    </div>

    <h2>Key Document Categories for Field Engineers</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Typical Contents</th>
          <th>Allowed Formats</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Electrical Schematics</strong></td>
          <td>EPLAN schematics, I/O rack distributions, 24V power distribution.</td>
          <td>PDF, DWG</td>
        </tr>
        <tr>
          <td><strong>PLC &amp; Robot Backups</strong></td>
          <td>TIA Portal .zap18 archives, Rockwell .acd projects, Fanuc backup files.</td>
          <td>ZIP, ZAP, ACD</td>
        </tr>
        <tr>
          <td><strong>Plant Safety Protocols</strong></td>
          <td>Customer LOTO (Lockout/Tagout) rules, emergency evacuation, arc flash PPE.</td>
          <td>PDF</td>
        </tr>
      </tbody>
    </table>

    <div class="callout tip">
      <strong>Offline Storage:</strong> Download required schematics before traveling to customer plants with poor mobile reception.
    </div>
  </div>

  <!-- CHAPTER 9: SECURITY & PROFILE (PAGE 11) -->
  <div class="page-break">
    <h1>9. Account Security: Biometric Passkeys, MFA &amp; Language Settings</h1>
    <p>Protecting your account and logging into the field portal quickly is seamless with modern biometric passkeys and language personalization.</p>

    <div class="figure no-break">
      <img src="${img('worker/07_worker_profile.png')}" alt="Worker Profile" />
      <div class="figure-caption"><strong>Figure 9.1:</strong> Worker Profile settings panel showing passkey registration, MFA authenticator setup, and language picker.</div>
    </div>

    <h2>Profile Settings Inputs &amp; Security Controls</h2>
    <table class="manual-table">
      <thead>
        <tr>
          <th>Setting / Input</th>
          <th>Type</th>
          <th>Options &amp; Instructions</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Interface Language</strong></td>
          <td><code>&lt;select&gt;</code></td>
          <td>Select your preferred language: <strong>English</strong>, <strong>Español</strong> (Spanish), or <strong>Português</strong> (Portuguese). All forms and badges translate instantly.</td>
        </tr>
        <tr>
          <td><strong>Password Change</strong></td>
          <td>Password inputs</td>
          <td>Enter current password, new password (min 8 chars), and confirmation.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Register Passkey</span></td>
          <td>WebAuthn Button</td>
          <td>Enrolls your device biometric hardware (TouchID, FaceID, Windows Hello). Allows single-touch instant login.</td>
        </tr>
        <tr>
          <td><span class="badge-btn">Setup Authenticator App</span></td>
          <td>MFA Modal</td>
          <td>Scans QR code with Google Authenticator or 1Password to activate 6-digit backup codes.</td>
        </tr>
      </tbody>
    </table>

    <div class="callout security">
      <strong>Lost Phone / Device Support:</strong> If you lose your phone on site, contact <code>field.operations@j-aautomation.com</code> immediately to reset your authentication session.
    </div>
  </div>

</body>
</html>`;
}

async function generateManuals() {
  console.log(
    'Launching browser to render vector-grade PDFs with embedded artifact screenshots...',
  );
  const browser = await chromium.launch({ headless: true });

  // Generate Owner Manual
  console.log('Building Owner User Guide...');
  const ownerPage = await browser.newPage();
  await ownerPage.setContent(buildOwnerHtml(), { waitUntil: 'networkidle' });
  const ownerPdfBuffer = await ownerPage.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size:7pt; color:#94a3b8; width:100%; text-align:right; padding-right:12mm;">J&A Automation LLC · Enterprise Platform Manual</div>',
    footerTemplate:
      '<div style="font-size:7pt; color:#94a3b8; width:100%; display:flex; justify-content:space-between; padding:0 12mm;"><span>CONFIDENTIAL & PROPRIETARY · OWNER USE ONLY</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
  });

  writeFileSync(resolve(OUT_DIR_MANUALS, 'Owner_User_Guide.pdf'), ownerPdfBuffer);
  writeFileSync(resolve(OUT_DIR_EXAMPLES, 'Owner_User_Guide.pdf'), ownerPdfBuffer);
  console.log(
    `✓ Generated: Owner_User_Guide.pdf (${ownerPdfBuffer.length.toLocaleString()} bytes)`,
  );

  // Generate Worker Manual
  console.log('Building Worker User Guide...');
  const workerPage = await browser.newPage();
  await workerPage.setContent(buildWorkerHtml(), { waitUntil: 'networkidle' });
  const workerPdfBuffer = await workerPage.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size:7pt; color:#94a3b8; width:100%; text-align:right; padding-right:12mm;">J&A Automation LLC · Field Engineering Guide</div>',
    footerTemplate:
      '<div style="font-size:7pt; color:#94a3b8; width:100%; display:flex; justify-content:space-between; padding:0 12mm;"><span>CONFIDENTIAL · FIELD PERSONNEL USE ONLY</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
  });

  writeFileSync(resolve(OUT_DIR_MANUALS, 'Worker_User_Guide.pdf'), workerPdfBuffer);
  writeFileSync(resolve(OUT_DIR_EXAMPLES, 'Worker_User_Guide.pdf'), workerPdfBuffer);
  console.log(
    `✓ Generated: Worker_User_Guide.pdf (${workerPdfBuffer.length.toLocaleString()} bytes)`,
  );

  await browser.close();
  console.log(
    '\nBoth manuals successfully generated and saved to docs/manuals/ and docs/examples/!',
  );
}

export { buildOwnerHtml, buildWorkerHtml, generateManuals };

// If executed directly:
if (process.argv[1] && process.argv[1].includes('generate-user-manuals')) {
  generateManuals().catch((err) => {
    console.error('Fatal error generating manuals:', err);
    process.exit(1);
  });
}
