# J&A Automation — Unified Website, Field Operations, Project Finance & Billing Specification V3

**Status:** build-ready product, UX, data, security and deployment specification  
**Prepared:** 2026-08-18  
**Replaces:** the previous website V2, private portal V1 and VPS/.NET/PostgreSQL deployment assumptions where they conflict with this document  
**Primary design goal:** a modern, portable, low-operations TypeScript application that can be developed entirely on Windows, used comfortably on phone/iPad/desktop, and deployed to the existing Ubuntu VPS without PostgreSQL, .NET, Azure, Redis, Kubernetes or microservices.

> **Agent mandate:** treat this document as the product and architecture authority. Preserve factual company/project content from the existing J&A website and prior approved website specification, but implement the internal application and deployment using the lightweight architecture defined here. Do not invent labor-law, payroll, tax, accounting, statutory invoice, safety-certification or legal requirements. Tax and billing rules must be configurable and approved by J&A/accounting before production use.

---

# 0. Executive decisions

## 0.1 One lightweight technology family

Use a TypeScript-first monorepo:

- **Svelte 5 / SvelteKit** for both public website and private portal;
- **TypeScript strict mode** everywhere;
- **Node.js 24 LTS** for server runtime;
- **pnpm workspaces** for the monorepo;
- **Tailwind CSS 4** for layout/design tokens;
- **Bits UI / open-code Svelte primitives** where accessible primitives are useful;
- **Drizzle ORM + Drizzle Kit**;
- **SQLite through Node's built-in `node:sqlite` driver**;
- **Zod** for boundary/input validation;
- **Playwright** for E2E and server-side PDF rendering;
- **Vitest** for unit/integration tests where appropriate.

Do **not** use:

- ASP.NET/.NET;
- PostgreSQL for V1;
- Entity Framework;
- Azure App Service;
- Azure Database;
- Azure Blob Storage;
- Redis;
- a separate REST microservice;
- GraphQL;
- Kubernetes;
- a message broker;
- a CMS;
- a separate mobile native app.

PostgreSQL and .NET are not technically obsolete; they are simply unnecessary operational weight for the expected scale and deployment model of this product.

## 0.2 Public website

The public marketing website remains a premium multilingual industrial website.

Canonical future destination:

```text
https://www.j-aautomation.com/
```

Until domain/DNS access is restored, production must work at:

```text
https://gex-dashboard.hopto.org/j-aautomation/
```

Languages:

```text
/en
/pt
/es
```

The public site is **pre-rendered/static** and served directly by Caddy. It does not need a permanent Node process.

## 0.3 Private portal

Future preferred origin:

```text
https://app.j-aautomation.com/
```

Current VPS-compatible route:

```text
https://gex-dashboard.hopto.org/j-aautomation/app/
```

The portal is one SvelteKit Node server on:

```text
127.0.0.1:5100
```

It contains:

- authenticated UI;
- server routes/form actions;
- authorization;
- project/business logic;
- SQLite access;
- document metadata;
- invoice/report generation;
- scheduler/outbox processing;
- public website inquiry endpoints in a strictly separated public API namespace.

## 0.4 Database

Use one local SQLite database:

```text
/var/lib/jaautomation/data/jaautomation.sqlite
```

Development default:

```text
./var/dev/jaautomation.dev.sqlite
```

Production database requirements:

```text
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

Use `STRICT` tables where practical.

Never put the production database on NFS/SMB/network storage.

## 0.5 Private documents

Store documents in the VPS filesystem, outside Git:

```text
/var/lib/jaautomation/files/
├── receipts/
├── reports/
├── invoices/
├── technical/
├── plc-backups/
├── exports/
└── temp/
```

The database stores metadata, ownership, project scope, hash, MIME type and lifecycle state.

No file is directly public.

## 0.6 Core business model

Every project must support independently configurable:

- worker assignments;
- expected schedule;
- actual time;
- worker compensation;
- client bill rates;
- minimum-day / standby rules;
- travel/expense rules;
- project budget / PO cap;
- billing cadence;
- labor invoice stream;
- expense invoice stream;
- tax profiles;
- technical/PLC reporting;
- approval workflow;
- automatic period close;
- project profitability.

## 0.7 10-hour Monday–Saturday rule

Default planning template:

```text
Monday     10h
Tuesday    10h
Wednesday  10h
Thursday   10h
Friday     10h
Saturday   10h
Sunday      0h
Expected   60h/week
```

This is a **configurable project/commercial/work-planning rule**, not an assumed labor-law rule.

The system must never fabricate hours.

Workers always report actual time.

Client minimum billing and worker guaranteed compensation are **separate rule engines**.

## 0.8 Separate labor and expense invoices

A project has independent billing streams:

```text
LABOR
EXPENSES
FIXED / MILESTONE
OTHER
```

Each stream may have its own:

- invoice cadence;
- tax profile;
- invoice template;
- invoice recipient;
- grouping;
- payment terms;
- currency;
- PO/reference;
- numbering series if accounting requires it.

Default when labor and expenses have different tax treatment:

```text
one Labor invoice
+
one Expense invoice
```

for the same billing period.

Do not hard-code any country's tax rate or statutory interpretation.

## 0.9 Billing periods

Supported billing cadence:

```text
Weekly
Every 14 days
Semi-monthly: 1–15 and 16–end of month
Monthly
Custom date range
Milestone
Manual only
```

The UI must call **Every 14 days** and **Semi-monthly** different things. Never label both only as “biweekly/quincenal.”

## 0.10 Automatic generation

The system automatically:

- checks period readiness;
- reminds workers/managers about missing records;
- closes approved source records into a billing batch;
- generates customer report package;
- generates internal financial report;
- generates invoice draft(s);
- generates worker statements.

Default safety policy:

```text
AUTO-GENERATE DRAFT = yes, configurable
AUTO-ISSUE INVOICE = no
AUTO-SEND INVOICE = no
```

A future per-project auto-issue option may exist, but it is disabled globally by default.

---

# 1. Why this architecture

The previous portal architecture separated React, ASP.NET Core, PostgreSQL, a background worker, cloud object storage and cloud identity. That is appropriate for a larger enterprise platform, but it is more infrastructure than J&A requires for this deployment.

The new design optimizes for:

1. **portability** — identical TypeScript code on Windows and Linux;
2. **low operational overhead** — one application runtime and one database file;
3. **simple backups** — database snapshot + private file tree;
4. **fast iteration** — no local database server or .NET SDK required;
5. **mobile usability** — responsive PWA instead of separate iOS/Android codebases;
6. **auditability** — immutable financial snapshots and append-only audit history;
7. **future migration** — domain code must not depend on SQLite-specific shortcuts that prevent a later PostgreSQL migration.

The system remains a **modular monolith**. “Simple” must not mean “one giant route file.”

---

# 2. Target system topology

```text
                         INTERNET
                            │
                            │ HTTPS
                            ▼
                Existing native Caddy
                gex-dashboard.hopto.org
                            │
         ┌──────────────────┼────────────────────────┐
         │                  │                        │
         ▼                  ▼                        ▼
existing NexIA       /j-aautomation/*       /j-aautomation/app/*
applications          static Svelte site          reverse proxy
                         from disk                   │
                                                   ▼
                                           127.0.0.1:5100
                                           SvelteKit Node
                                                   │
                      ┌────────────────────────────┼────────────────────┐
                      ▼                            ▼                    ▼
                 SQLite file                private files        external adapters
                 local disk                 local disk           mail / optional AI
```

Additional public website form API:

```text
/j-aautomation/api/public/inquiry
/j-aautomation/api/public/support
```

These routes may be proxied to the same Node process but must be in an explicit unauthenticated public namespace with dedicated rate limiting and schemas.

The private API must remain under:

```text
/j-aautomation/app/api/*
```

---

# 3. Repository layout

Use one repository root:

```text
/home/NexIA/J-Aautomation
```

Recommended monorepo:

```text
J-Aautomation/
├── apps/
│   ├── site/
│   │   ├── src/
│   │   ├── static/
│   │   ├── svelte.config.js
│   │   └── vite.config.ts
│   │
│   └── portal/
│       ├── src/
│       │   ├── routes/
│       │   ├── lib/
│       │   │   ├── server/
│       │   │   │   ├── auth/
│       │   │   │   ├── db/
│       │   │   │   ├── permissions/
│       │   │   │   ├── modules/
│       │   │   │   ├── jobs/
│       │   │   │   ├── documents/
│       │   │   │   └── integrations/
│       │   │   └── ui/
│       │   └── service-worker.ts
│       ├── svelte.config.js
│       └── vite.config.ts
│
├── packages/
│   ├── domain/
│   ├── database/
│   ├── schemas/
│   ├── money/
│   ├── billing-engine/
│   ├── reporting/
│   ├── invoice-templates/
│   ├── i18n/
│   └── ui-tokens/
│
├── content/
│   ├── company/
│   ├── projects/
│   └── locales/
│
├── migrations/
├── deployment/
│   ├── Dockerfile.portal
│   ├── compose.production.yml
│   ├── caddy/
│   ├── systemd/
│   └── scripts/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BILLING_RULES.md
│   ├── DEPLOYMENT_VPS.md
│   ├── BACKUP_RESTORE.md
│   ├── SECURITY.md
│   ├── INCIDENT_RESPONSE.md
│   └── OPERATIONS.md
│
├── tests/
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

Rules:

- package boundaries are real;
- business calculations do not live inside Svelte components;
- UI components do not query SQLite directly;
- routes call application/domain services;
- migrations are committed;
- production secrets never live in Git.

---

# 4. Public website — product specification

## 4.1 Positioning

Keep the existing approved positioning:

**Industrial Automation & Controls Engineering**

The site must immediately communicate:

- industrial automation competence;
- PLC/HMI/SCADA;
- robotics;
- electrical/controls engineering;
- commissioning/startup;
- troubleshooting;
- remote support;
- multi-industry and international project experience.

Primary CTA:

**Talk to an Engineer**

Secondary high-intent CTA:

**Request Technical Support**

## 4.2 Audience

Priority:

1. automotive OEMs;
2. automotive Tier suppliers;
3. food and beverage;
4. cosmetics/packaging;
5. energy/process;
6. system integrators;
7. plants requiring support/modernization;
8. machine builders/OEMs;
9. general industrial manufacturing.

## 4.3 Public routes

```text
/[locale]
/[locale]/capabilities
/[locale]/capabilities/[slug]
/[locale]/industries
/[locale]/industries/[slug]
/[locale]/projects
/[locale]/projects/[slug]
/[locale]/solutions/aquarex
/[locale]/about
/[locale]/careers
/[locale]/contact
/[locale]/privacy
/[locale]/terms
```

`locale`:

```text
en
pt
es
```

## 4.4 Header

Desktop:

```text
Logo
Capabilities
Industries
Projects
Aquarex
About
Careers
EN / PT / ES
Employee Portal
[Talk to an Engineer]
```

`Request Technical Support` is visible in contextual sections/contact and footer without overcrowding the main desktop header.

Mobile:

- logo;
- large accessible menu button;
- full-height navigation drawer;
- locale switcher;
- Employee Portal;
- primary CTA;
- technical support CTA;
- phone/email.

## 4.5 Homepage composition

Maintain the premium industrial visual rhythm from the previous website work:

```text
Hero
Proof strip
Industrial engineering intro
Capabilities
Industries
Selected Project Experience
Client experience
Technology ecosystem
Delivery process
Remote support
Team capability
Aquarex
Careers
Contact CTA
Footer
```

Visual direction:

- white/off-white surfaces;
- graphite/near-black sections;
- J&A red accent;
- industrial photography;
- squared/modest-radius geometry;
- crisp typography;
- technical line/grid motifs;
- restrained motion.

Avoid:

- glassmorphism as primary design;
- purple/cyan AI gradients;
- giant rounded SaaS cards;
- fake dashboards;
- 3D robot gimmicks;
- autoplay video;
- cursor followers;
- heavy scroll effects.

## 4.6 Hero

Keep the approved three-sector slow crossfade:

1. automotive/robotics;
2. food/beverage;
3. energy/process.

One stable headline and CTA hierarchy.

Respect `prefers-reduced-motion`.

Only the first image is critical/LCP media.

## 4.7 Projects

Use the historical public archive honestly.

Do not fabricate 2020–2026 projects.

Call the section:

**Selected Project Experience**

not “Latest Projects.”

Project filters:

- industry;
- client;
- technology;
- capability;
- country/region where known.

Filter state must be URL-shareable.

## 4.8 Employee Portal entry

Add:

```text
Employee Portal
Portal da Equipe
Portal del Equipo
```

Current target:

```text
/j-aautomation/app/
```

Future target:

```text
https://app.j-aautomation.com/
```

Do not render a login form on the public homepage.

## 4.9 Public contact forms

Public forms:

### Project inquiry

Fields:

- name;
- company;
- email;
- phone optional;
- country/site;
- industry;
- project type;
- technology/platform optional;
- message;
- preferred contact method.

### Technical support

Fields:

- name;
- company;
- email;
- phone;
- site;
- affected system/platform;
- urgency;
- short issue description;
- file attachment optional only if secure upload flow is enabled.

Security:

- server-side Zod validation;
- honeypot;
- IP/request throttling;
- payload-size limits;
- MIME allowlist;
- optional Turnstile only if spam justifies it;
- no public API keys;
- no raw messages in analytics.

## 4.10 Website performance

Targets:

- responsive from 360px upward;
- LCP target < 2.5s representative mobile;
- INP target < 200ms;
- CLS < 0.10;
- Lighthouse Performance 90+;
- Accessibility 95+;
- SEO 95+.

Static rendering should make the marketing site especially lightweight.

## 4.11 SEO

Required:

- localized URLs;
- canonical links;
- `hreflang`;
- sitemap;
- robots;
- Open Graph;
- semantic headings;
- structured project text;
- Organization/Service structured data where truthful;
- no fake ratings/reviews;
- no invented address/certifications.

---

# 5. Portal UX principles

The portal should feel like:

> an industrial field-operations + project-accounting tool made specifically for J&A

not a generic HR platform.

## 5.1 Worker mobile first

A worker should be able to complete the end-of-day workflow in roughly one minute:

1. select project;
2. enter actual hours;
3. split hours by category if needed;
4. add a short work summary;
5. add PLC/technical changes if relevant;
6. photograph receipts;
7. review estimated pay impact;
8. save or submit.

## 5.2 Responsive targets

Explicitly QA:

```text
360×800
390×844
430×932
768×1024
1024×768
1280×800
1440×900
1920×1080
```

iPad should use a two-pane layout where useful.

Desktop should use dense, readable tables rather than oversized mobile cards.

## 5.3 Worker navigation

Bottom navigation on phone:

```text
Today
Time
Reports
Expenses
Projects
```

Secondary menu:

```text
My Pay
Documents
Notifications
Profile
```

## 5.4 Admin navigation

Desktop sidebar:

```text
Dashboard
Projects
Clients
Team
Planning
Time
Reports
PLC / Technical
Expenses
Approvals
Billing
Invoices
Finance
Documents
Notifications
Settings
Audit
```

## 5.5 Global search

Admin global search / command palette:

Search by:

- client name;
- client number;
- project name;
- project number;
- worker;
- invoice number;
- PO;
- report;
- receipt/expense ID.

Workers only receive results they are authorized to see.

---

# 6. Roles and visibility

Core roles:

```text
OwnerAdmin
FinanceAdmin
ProjectManager
Worker
AuditorReadOnly
```

Optional later:

```text
TechnicalLead
```

## 6.1 OwnerAdmin

Can:

- see all clients/projects;
- see client rates;
- see worker compensation rules;
- see internal loaded cost;
- see margins;
- configure billing/tax profiles;
- manage users/roles;
- issue/void invoices;
- see audit log;
- configure automation.

## 6.2 FinanceAdmin

Can:

- manage client billing;
- manage worker compensation/internal costs if granted;
- approve finance-impacting records;
- generate/issue invoices according to permission;
- record payments;
- see project/client/company finance.

Cannot grant itself OwnerAdmin.

## 6.3 ProjectManager

Can on assigned projects:

- review time;
- review reports;
- review PLC reports;
- review expenses;
- manage assignments/planning if permitted;
- see operational budget/burn if explicitly allowed.

By default cannot see:

- worker pay for other workers;
- internal loaded worker cost;
- company-wide margins.

## 6.4 Worker

Can:

- view own assignments;
- submit own time;
- submit own reports;
- submit own PLC/technical reports;
- submit own expenses;
- see own approvals;
- see own project schedule;
- see own compensation estimate if enabled;
- see own reimbursements.

Cannot see:

- another worker's pay;
- another worker's records;
- customer billing rates;
- project margin;
- company profit;
- other clients' finance.

## 6.5 Worker compensation visibility

This V3 intentionally differs from the old portal spec.

A worker may see **their own** compensation estimate.

The app must distinguish:

```text
Worker Compensation Rate
Internal Loaded Cost
Client Bill Rate
```

These are three different concepts.

Only the first may be shown to the worker.

---

# 7. Client and project numbering

Never use a guessable sequential number as the authorization key.

Every record gets an internal opaque ID, preferably UUIDv7 or another sortable UUID.

In addition, generate human-readable business codes.

## 7.1 Client number

Example:

```text
C-0001
C-0002
C-0042
```

Fields:

```text
id
client_number
legal_name
display_name
status
default_currency
default_timezone
billing_contact
billing_email
billing_address
default_payment_terms
default_labor_tax_profile_id
default_expense_tax_profile_id
notes
created_at
updated_at
```

## 7.2 Project number

Per-client sequence:

```text
C-0042-P-001
C-0042-P-002
C-0042-P-003
```

Optional short display alias:

```text
BMW-SC-2026-003
```

The formal stable project code remains the generated project number.

## 7.3 Project fields

```text
id
project_number
project_alias optional
client_id
name
description
site_name
country
timezone
currency
status
project_manager_id
start_date
planned_end_date
actual_end_date
po_number
contract_number
billing_model
budget_type
revenue_budget_minor
po_cap_minor
labor_budget_minutes
travel_budget_minor
other_cost_budget_minor
expected_schedule_id
default_billing_cadence
weekly_close_enabled
technical_reporting_required
daily_report_required
notes
created_at
updated_at
```

Project statuses:

```text
Draft
Planned
Active
Paused
Closing
Closed
Archived
```

---

# 8. Worker/project assignments

Assignment fields:

```text
id
project_id
worker_id
role_on_project
start_date
end_date
planned_minutes
expected_minutes_per_day override
workday_mask override
worker_compensation_rule_id
internal_cost_rule_id
client_bill_rule_id
standby_rule_id
travel_policy_id
can_submit_technical_report
can_review
status
```

Planning must allow:

- date ranges;
- partial allocation;
- assignment conflicts;
- planned hours;
- expected revenue/cost;
- worker availability.

---

# 9. Work schedules and the 10h rule

## 9.1 Default template

```json
{
  "name": "J&A Field Standard",
  "weekStartsOn": "Monday",
  "expectedMinutesPerDay": 600,
  "workdays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  "sundayDefault": "off"
}
```

## 9.2 Actual time is sacred

Never auto-create 600 worked minutes.

Worker enters actual duration.

Under/over expected:

- warn;
- show difference;
- optionally require note;
- allow legitimate exceptions;
- route to approval.

## 9.3 Time categories

Minimum:

```text
Regular site work
Commissioning / startup
Overtime
Weekend / holiday
Travel
Standby / waiting
Remote support
Training
Internal / non-billable
```

Do not assume one category maps to the same client billing and worker compensation rule.

## 9.4 Separate daily minimums

There are two independent switches:

```text
Client Billing Daily Minimum
Worker Compensation Daily Guarantee
```

Example project:

```text
Expected day: 10h
Client minimum: 10h Mon–Sat
Worker guarantee: 10h Mon–Sat
```

Another valid project:

```text
Expected day: 10h
Client minimum: 10h
Worker compensation: actual approved hours
```

Another:

```text
Expected day: 10h
Client billing: actual hours only
Worker guarantee: 10h
```

Do not couple them.

## 9.5 Standby/waiting example

Worker:

```text
Regular site work    3h
Standby / waiting    7h
Total actual        10h
```

The billing engine then applies the project's client rule.

If the worker was available only 4h and released early:

```text
Actual logged: 4h
Client daily minimum: possibly 10h if contract says so
Worker compensated: determined independently
```

The invoice audit view must show the transformation from actual to billable.

---

# 10. Time entry

Store time in integer minutes.

Fields:

```text
id
worker_id
project_id
work_date
project_timezone
start_time optional
end_time optional
break_minutes optional
raw_duration_minutes
time_category
activity_summary
site optional
submitted_at
approval_status
approved_by
approved_at
billing_lock_id optional
compensation_lock_id optional
created_at
updated_at
version
```

Workflow:

```text
Draft
→ Submitted
→ Approved / Needs changes / Rejected
→ Locked
→ Invoiced and/or Included in compensation statement
```

After invoice lock:

- source row cannot be silently edited;
- correction uses adjustment entry.

---

# 11. Weekly and period timesheets

Worker view:

```text
Mon    10.0h   Approved
Tue    10.0h   Approved
Wed     9.5h   Needs note
Thu    11.0h   Submitted
Fri    10.0h   Draft
Sat    10.0h   Draft
Sun     0.0h   —
-----------------------
Actual 60.5h
Expected 60.0h
Difference +0.5h
```

Also show:

- regular;
- standby;
- travel;
- overtime;
- billability status if appropriate;
- compensation estimate.

“Copy previous week” may copy:

- project;
- task/activity labels;
- category layout.

It must **not copy time values by default**.

---

# 12. Worker compensation and “How much will I receive?”

This is a first-class V3 feature.

## 12.1 Worker compensation rule

Supported:

```text
Hourly
Daily
Fixed per billing/pay period
Fixed project amount
Custom approved adjustment
```

Fields:

```text
id
worker_id
currency
rule_type
rate_minor
daily_guarantee_minutes optional
overtime_rule optional
weekend_rule optional
travel_rule optional
standby_rule optional
effective_from
effective_to
worker_visible
```

## 12.2 Internal loaded cost

Separate admin-only record:

```text
worker_id
internal_cost_rate_minor
effective_from
effective_to
cost_method
notes
```

This may represent a broader company cost and is not necessarily equal to worker pay.

## 12.3 Worker “My Pay” page

Show:

```text
Current project(s)
Current compensation period
Approved hours
Submitted/pending hours
Guaranteed hours if applicable
Estimated approved earnings
Estimated pending earnings
Approved reimbursable expenses
Pending reimbursements
Planned remaining hours
Projected period total
```

Use label:

**Estimated project compensation**

and explanatory copy:

> Estimate based on the compensation rules currently configured and the hours/records shown. It is not a payroll tax calculation or final payslip unless J&A later integrates a payroll system.

Never show:

- client rate;
- margin;
- internal loaded cost;
- revenue attributed.

## 12.4 Worker budget

For each assignment optionally show:

```text
Planned hours
Hours completed
Hours remaining
Planned compensation
Approved compensation
Forecast compensation
```

This gives the worker a clear answer to “what is my budget / what am I expected to receive?” without exposing company profitability.

---

# 13. Daily Project Report

Each worker can create a structured daily report.

Fields:

```text
project
worker
date
site / shift
summary
tasks completed
problems found
corrective actions
client decisions / requests
downtime
standby reason
blockers
open items
next-day plan
safety-related change yes/no
customer contact optional
attachments
linked time entries
status
```

Workflow:

```text
Draft
Submitted
Reviewed
Needs changes
Approved
Included in period report
```

Generated reports can cover:

- one worker;
- selected workers;
- all workers;
- one day;
- week;
- billing period;
- custom date range.

---

# 14. PLC / Technical Report

This is a major product differentiator.

## 14.1 System identification

Fields:

```text
Project
Plant/site
Area/line
Station/machine
System type
PLC platform
PLC family/model
HMI/SCADA
Robot platform
Drive/motion system
Network/protocol
Software/tool version
Program/project reference
```

## 14.2 Technical change

Each change:

```text
component / tag / station
issue / original behavior
root cause if known
change made
reason
safety impact flag
production impact
test/validation performed
result
open risk
rollback information
author
timestamp
attachments
linked backup
```

## 14.3 Safety-related flag

If safety impact = yes:

- prominent status;
- PM/technical lead review required;
- validation description required;
- AI cannot approve it;
- the application must not claim functional-safety certification.

## 14.4 PLC backup register

Metadata:

```text
project
system
artifact type
filename
size
SHA-256
uploaded by
uploaded at
software/version metadata
description
supersedes artifact optional
approved status
```

Examples:

- Siemens archives;
- Rockwell projects;
- HMI backups;
- robot backups;
- parameter exports;
- logs;
- zipped engineering projects.

All are private customer IP.

## 14.5 Technical period report

Generated summary:

```text
systems worked on
changes made
tests performed
downtime/issues
unresolved items
safety-impacting changes
backups generated
next steps
```

Customer-facing and internal templates must be separate.

Internal can include artifact IDs/hashes and private notes.

---

# 15. Expenses and receipts

## 15.1 Categories

```text
Hotel
Rental car
Fuel
Tolls
Parking
Airfare
Train / bus / taxi / rideshare
Meals
Per diem
Project materials
Tools / consumables
Shipping
Phone / data
Visa / permit
Other approved project expense
```

## 15.2 Expense fields

```text
id
worker_id
project_id
expense_date
vendor
category
description
currency
amount_minor
tax_amount_minor optional
payment_method
who_paid
receipt_required
receipt_document_id optional
client_billing_treatment
markup_rule_id optional
fx_rate_snapshot optional
project_currency_amount_minor optional
reimbursement_status
approval_status
submitted_at
approved_at
billing_lock_id optional
```

## 15.3 Who paid

```text
Worker personal funds
J&A company card
J&A direct/company account
Client paid directly
Third party
```

## 15.4 Client treatment

```text
Reimbursable at cost
Reimbursable + markup
Included in all-in / fixed price
Non-billable internal cost
Paid directly by client
Fixed allowance / per diem
Informational only
```

## 15.5 All-in project

Actual hotel/car/etc. still get recorded.

They:

- increase project cost;
- reduce contribution margin;
- consume travel budget;
- do not become invoice lines unless explicit exception.

## 15.6 Reimbursable project

If client pays hotel/car separately:

- record actual expense;
- attach receipt if required;
- approve;
- apply configured markup if any;
- add to **Expense billing stream**;
- keep worker reimbursement status separate from customer billing status.

## 15.7 Mobile receipt UX

One-tap:

```text
[Camera]
[Photo library]
[Files]
```

Immediately after capture:

- show image;
- choose project;
- choose category;
- enter amount/currency;
- who paid;
- client treatment if user has permission;
- submit.

Optional OCR:

- can suggest merchant/date/amount/currency;
- suggestions require human confirmation;
- OCR never decides billability;
- duplicate detection should warn, not auto-delete.

---

# 16. Project commercial models

Supported:

```text
Hourly / Time & Materials
T&M with daily minimum
All-in fixed price
Capped T&M
Fixed milestone
Hybrid
Internal / non-billable
```

## 16.1 T&M

Candidate customer amount:

```text
approved billable labor
+ approved billable expenses
+ configured markups
+ approved adjustments
```

## 16.2 All-in

Customer invoice is based on:

- fixed amount;
- milestone;
- agreed schedule.

Internal project cost still includes:

- labor;
- hotel;
- rental car;
- airfare;
- expenses;
- other direct cost.

## 16.3 Capped T&M

Track:

```text
PO/contract cap
invoiced amount
approved unbilled WIP
remaining cap
forecast at completion
```

Alerts default:

```text
70%
85%
95%
100%
```

Configurable.

## 16.4 Hybrid

Example:

```text
Commissioning fee: fixed
Hours > threshold: hourly
Hotel: all-in
Rental car: reimbursable
Flights: reimbursable
```

No client-specific source-code branch should be required.

Configuration drives behavior.

---

# 17. Billing streams

Each project may have multiple streams.

Example:

```text
Project C-0042-P-003
├── LABOR
│   ├── cadence: Every 14 days
│   ├── tax: Labor-US-Profile-A
│   └── template: Labor Detailed
│
├── EXPENSES
│   ├── cadence: Monthly
│   ├── tax: Expense-US-Profile-B
│   └── template: Expense Detailed
│
└── MILESTONE
    ├── cadence: Manual/Milestone
    └── template: Fixed Fee
```

Fields:

```text
id
project_id
stream_type
enabled
cadence_type
anchor_date
semi_monthly_rule
tax_profile_id
template_id
currency
billing_contact_id
payment_terms_id
po_number_override
grouping_mode
auto_generate_draft
auto_issue
auto_send
effective_from
effective_to
```

`auto_issue` and `auto_send` default false.

---

# 18. Billing periods

## 18.1 Weekly

Config:

```text
week starts: Monday
period end: Sunday or project-defined
source workday policy: Mon–Sat by default
```

## 18.2 Every 14 days

Uses an explicit anchor date.

Example:

```text
Anchor: 2026-08-03
Period 1: Aug 3–16
Period 2: Aug 17–30
...
```

## 18.3 Semi-monthly

Default:

```text
1–15
16–last day
```

Configurable if accounting uses different cutoffs.

## 18.4 Monthly

Calendar month by default.

Optional project-specific cut-off.

## 18.5 Custom

Owner/Finance selects range.

## 18.6 Milestone

A milestone becomes billable only after authorized approval.

---

# 19. Tax profiles

The application is a calculation engine, not tax advice.

Never encode “Brazil invoice tax” or “US labor tax” as a universal rule.

## 19.1 TaxProfile

```text
id
name
legal_entity_id
jurisdiction_label
description
effective_from
effective_to
status
```

## 19.2 Tax component

A profile can contain ordered components:

```text
label
rate_bps
calculation_type
display_mode
basis
rounding_rule
```

Possible `calculation_type`:

```text
Additive
Withholding
Informational
Custom-approved
```

Do not expose a custom expression language in V1.

Complex jurisdiction-specific logic should be implemented only after accountant-approved examples/tests.

## 19.3 Different tax for hours and expenses

Default architecture:

```text
Labor stream   -> Labor tax profile
Expense stream -> Expense tax profile
```

If the tax profiles differ, create separate invoice documents by default.

A combined invoice with line-specific tax is an optional accounting-approved configuration, not the default.

---

# 20. Money and calculation rules

Do not use JavaScript floating-point arithmetic for final money.

Store monetary values as integer minor units.

Examples:

```text
USD $1.00 -> 100
BRL R$1.00 -> 100
EUR €1.00 -> 100
```

Currency metadata carries exponent.

Rates:

- store minor units per hour/day;
- time is integer minutes;
- calculate using integer/BigInt operations;
- define rounding at explicit calculation boundaries.

Tax rates use basis points or another exact integer representation.

Every calculation must be reproducible from stored inputs.

---

# 21. Customer invoice workflow

States:

```text
Draft
Needs review
Ready
Approved
Issued
Sent
Partially paid
Paid
Overdue
Void
Credited / Adjusted
```

## 21.1 Draft builder

Inputs:

```text
Project
Billing stream
Period
Workers:
  one
  selected
  all
Include source classes
Grouping
Template
Legal entity
Currency
```

## 21.2 Labor grouping

```text
By worker
By worker + day
By day
By role
By time category
By rate category
One summarized labor line
One summarized project line
Client-specific template
```

Client configuration controls whether worker names appear.

## 21.3 Expense grouping

```text
Each expense
By category
By day
By worker
One reimbursable-expense summary
```

Each invoice line must be traceable internally to source expense IDs.

## 21.4 Invoice issue

Final invoice number is allocated only when issued.

Drafts use internal draft IDs.

On issue:

1. re-check authorization;
2. re-check source records;
3. start transaction;
4. allocate unique number;
5. snapshot all input data;
6. lock included source rows;
7. calculate final totals;
8. mark invoice Issued;
9. commit;
10. enqueue PDF generation and notifications.

Issued invoice is immutable.

Corrections use:

- void;
- credit;
- adjustment;
- replacement document according to configured business/accounting process.

Never silently edit an issued invoice.

---

# 22. Invoice numbering

Internal ID:

```text
UUIDv7
```

Human invoice number configurable by legal entity.

Example only:

```text
JA-US-2026-000123
JA-BR-2026-000057
```

Optional separate approved series:

```text
LAB
EXP
```

Do not force separate legal numbering series merely because the application uses separate billing streams.

The numbering rule must be accountant-approved before production.

---

# 23. Invoice templates

Templates are versioned source-controlled HTML/CSS templates plus safe configurable company/client data.

Do not let admins paste arbitrary executable HTML/JS.

Core templates:

```text
Labor — Detailed
Labor — Summary
Expenses — Detailed
Fixed / Milestone
Credit / Adjustment
```

## 23.1 Header

```text
J&A logo
Issuing legal entity
Configured billing address
Configured tax/company identifiers
Billing contact

INVOICE
Invoice #
Issue date
Due date
Currency
```

## 23.2 Bill-to

```text
Client legal name
Billing address
AP contact

Client number
Project number + project name
PO / Contract
Service period
Site optional
```

## 23.3 Labor example

```text
Description                         Qty       Rate       Amount
Controls Engineer — A               60.0 h    $xx.xx     $x,xxx
Controls Engineer — B               55.5 h    $xx.xx     $x,xxx
Standby / guaranteed availability   10.0 h    $xx.xx     $x,xxx
```

or summarized:

```text
Industrial automation engineering services
Period Aug 03–16                    115.5 h              $x,xxx
```

## 23.4 Expense invoice example

```text
Description                         Reference            Amount
Hotel Aug 03–09                     Receipt E-00291      $x,xxx
Rental vehicle Aug 03–16            Receipt E-00302      $x,xxx
Tolls                               Expense group        $  xxx
```

Internal reconciliation can link to receipts.

Customer PDF should not expose private internal notes.

## 23.5 Totals

```text
Subtotal
Tax component(s)
Withholding/informational component(s) if configured
Authorized adjustments
TOTAL
```

## 23.6 Immutable snapshot

Every issued document stores:

```text
template_id
template_version
legal_entity_snapshot
client_billing_snapshot
project_snapshot
tax_profile_snapshot
source_data_snapshot
calculation_snapshot
generated_at
PDF_SHA256
```

A future template change cannot change an old invoice.

---

# 24. Automatic period close

Use SQLite-backed durable jobs/outbox, not Redis/Hangfire.

Tables:

```text
scheduled_jobs
job_runs
outbox_events
```

Job idempotency key:

```text
billing-close:{streamId}:{periodStart}:{periodEnd}:{policyVersion}
```

Retrying must not duplicate:

- reports;
- invoice drafts;
- invoice numbers;
- notifications.

## 24.1 Readiness

A period can be:

```text
Ready
Incomplete
Blocked
Already closed
```

Readiness checks:

- missing worker time;
- unsubmitted reports;
- pending time approvals;
- missing required PLC report;
- pending expense approval;
- missing receipt;
- missing client rate;
- missing worker compensation/internal cost;
- missing tax profile;
- missing PO;
- budget/cap exception;
- duplicate source lock.

## 24.2 Generated package

Per project/period:

1. Project Period Summary;
2. Worker statements;
3. Consolidated work report;
4. PLC/Technical report;
5. Expense report;
6. Internal financial report;
7. Labor invoice draft if enabled;
8. Expense invoice draft if enabled;
9. Milestone invoice draft if triggered.

## 24.3 Incomplete periods

Still allow management preview.

Mark:

```text
INCOMPLETE
```

List exact blockers.

Do not issue automatically.

---

# 25. Approvals

## 25.1 Standard flow

```text
Worker submits
→ Project Manager / Technical reviewer
→ Finance review when money/billability is affected
→ Locked
```

Owner override requires reason and audit event.

## 25.2 Separate approvals

Possible targets:

- time;
- report;
- PLC report;
- expense;
- billing batch;
- invoice draft;
- milestone;
- rate change;
- tax-profile change.

## 25.3 Exceptions

Surface separately:

- daily hours below/above expectation;
- standby without reason;
- Sunday work;
- unusual overtime;
- missing receipt;
- duplicate receipt warning;
- high expense;
- safety-related PLC change;
- missing backup after configured change type;
- project budget threshold;
- missing rate.

Bulk approval is allowed only while exceptions remain visible.

---

# 26. Project financial model

Use **Contribution Margin** by default, not “Net Profit.”

The app does not automatically know:

- corporate overhead;
- income tax;
- depreciation;
- financing;
- all payroll burden;
- allocations.

Core formula:

```text
Contribution Margin
= Recognized Project Revenue
- Direct Project Cost
```

Direct cost:

```text
Worker internal loaded cost
+ hotel
+ rental car
+ flights
+ other travel
+ approved project expenses
+ other direct project costs
```

## 26.1 Finance views

By:

```text
Project
Client
Worker
Week
Billing period
Month
Quarter
Year
Legal entity
Country/site
Service category
Invoice
```

## 26.2 Project KPIs

```text
Revenue budget / PO
Invoiced revenue
Approved unbilled WIP
Unapproved WIP
Collected cash
Accounts receivable
Direct labor cost
Travel cost
Other direct cost
Contribution margin
Margin %
Budget consumed %
Hours consumed %
Travel budget consumed %
Forecast at completion
Expected final margin
```

## 26.3 Worker profitability

Admin/Finance only:

```text
approved hours
billable hours
revenue attributed
internal loaded labor cost
travel cost attributed
contribution margin
margin %
```

For fixed-price projects, worker revenue attribution must be explicitly configured or omitted.

---

# 27. Forecasting and budget control

This is a new essential V3 feature.

For every active project calculate:

```text
Actual to date
Approved unbilled
Planned remaining
Estimate to complete (ETC)
Estimate at completion (EAC)
Budget variance forecast
Expected margin at completion
```

Planning data comes from:

- worker assignments;
- planned hours;
- worker cost rules;
- client rates;
- expected travel;
- fixed milestones;
- remaining PO.

Alerts:

```text
PO 70/85/95/100%
Labor hours budget
Travel budget
Negative projected margin
Invoice overdue
Missing rate
Unstaffed future assignment
Worker over-allocation
```

---

# 28. Admin dashboard

Top cards:

```text
Active projects
Workers assigned today
Missing time
Missing reports
Pending PLC reviews
Pending expenses
Approved unbilled WIP
Invoice drafts ready
Invoices overdue
Receivables
Contribution margin MTD
Projected month revenue
```

Project table:

```text
Project #
Client
Project
PM
Workers
Status
This-period hours
Missing items
Unbilled
PO used %
Travel budget %
Current margin %
Forecast margin %
Next billing date
Health
```

Clicking any KPI must drill into source records.

---

# 29. Worker Today dashboard

Example:

```text
Good morning, Alex

CURRENT ASSIGNMENT
C-0042-P-003
BMW — Body Shop Controls

Today expected        10h
Logged today          7h 30m
Remaining vs plan     2h 30m

This week             47h / 60h
Approved              30h
Pending               17h
Estimated earnings    $____
Pending expenses      $____

[Log time]
[Daily report]
[PLC / technical]
[Add receipt]
```

Pending panel:

```text
Tue expense needs receipt
Wed report needs changes
Today has 3h standby — reason required
```

Do not show margin/client rate.

---

# 30. Planning / staffing calendar

Admin/PM calendar:

Views:

```text
Week
2 weeks
Month
Project
Worker
Site
```

Show:

- project assignment;
- travel days;
- expected hours;
- over-allocation;
- unassigned role;
- skills needed;
- location/site.

No passive GPS tracking.

---

# 31. Skills matrix

Worker skill tags:

```text
Siemens TIA
Siemens S7
WinCC
Rockwell / Allen-Bradley
FactoryTalk
Mitsubishi
Omron
Beckhoff
Ignition
FANUC
KUKA
ABB
Yaskawa
EPLAN
AutoCAD Electrical
Commissioning
Safety experience
Process
Automotive
Food & Beverage
```

Admin uses this for staffing.

Do not turn skills into an opaque “performance score.”

---

# 32. Invoice aging and payment tracking

Invoice payment states:

```text
Unpaid
Partially paid
Paid
Overdue
Disputed optional
```

Payment record:

```text
invoice_id
received_date
amount_minor
currency
method/reference optional
note
recorded_by
created_at
```

Support partial payments.

Dashboard aging buckets configurable, e.g.:

```text
Current
1–30
31–60
61–90
90+
```

These are management buckets, not legal classifications.

---

# 33. Notifications

V1 channels:

```text
In-app
Email
```

Later:

```text
Microsoft Teams
```

Events:

- assignment created/changed;
- missing time reminder;
- report needs changes;
- PLC review required;
- receipt missing;
- expense rejected;
- approval required;
- period ready;
- period blocked;
- invoice draft ready;
- invoice issued;
- invoice overdue;
- payment recorded;
- PO threshold reached;
- budget forecast warning;
- security/admin change.

Email must not contain worker pay or margin details by default.

---

# 34. Offline / PWA behavior

The portal is installable as a PWA.

Service worker scope must remain exactly the portal base:

```text
/j-aautomation/app/
```

It must never control:

```text
/
/nexia
/evocon
/altare
```

## 34.1 Offline worker capabilities

Allow offline:

- view recently synced assigned projects;
- create/edit time draft;
- create daily report draft;
- create technical report draft;
- queue receipt/photo;
- see sync queue.

Use IndexedDB for offline drafts.

## 34.2 Do not offline-cache

Do not persist offline by default:

- company financial dashboard;
- worker rates for other workers;
- customer bill-rate tables;
- full audit log;
- company exports;
- bank/payment settings.

## 34.3 Conflict handling

Each mutable row has a version.

Sync conflict:

- never silently overwrite;
- show “server changed since your offline edit”;
- compare versions;
- user/reviewer resolves.

## 34.4 Sync UX

Always show:

```text
Synced
Saving
Offline — saved on this device
3 items waiting to sync
Sync failed — retry
```

Receipt uploads must show progress.

---

# 35. Documents

Document metadata:

```text
id
project_id optional
worker_id optional
type
original_filename
stored_filename
mime_type
size_bytes
sha256
storage_path
uploaded_by
created_at
sensitivity
status
```

Sensitivity:

```text
Public
Internal
Finance
Technical confidential
Customer confidential
```

Uploads:

- MIME/type allowlist;
- extension/type consistency check;
- size limits;
- filename normalization;
- virus/malware scanning adapter if available;
- private storage;
- authorization on every download;
- download audit for sensitive files.

Never trust file path from browser.

---

# 36. Authentication

Do not implement custom authentication cryptography.

Recommended:

**Better Auth** integrated server-side with SvelteKit.

Capabilities:

- invite-only accounts;
- secure cookie sessions;
- passkeys where supported;
- TOTP/2FA;
- backup recovery codes;
- admin role integration.

## 36.1 No public registration

Admin invites users.

Statuses:

```text
Invited
Active
Suspended
Offboarded
Archived
```

## 36.2 Session

Cookie:

- Secure;
- HttpOnly;
- host-only;
- SameSite=Lax unless a framework flow requires temporary correlation cookies;
- current path scope `/j-aautomation/app`;
- future subdomain path `/`.

Never store auth tokens in:

- localStorage;
- sessionStorage;
- IndexedDB;
- URL.

Offline worker drafts may use IndexedDB, but not bearer tokens.

## 36.3 MFA

Owner/Admin:

- require phishing-resistant/passkey method where practical;
- otherwise strong 2FA.

Workers:

- MFA required for production;
- passkey preferred.

## 36.4 Step-up authentication

Require fresh auth before:

- changing admin permissions;
- changing worker pay;
- changing internal cost;
- changing client rate;
- changing tax profiles;
- changing bank/payment details;
- issuing/voiding invoice;
- bulk finance export;
- changing invoice numbering.

---

# 37. Authorization

Frontend hiding is not security.

Every server operation checks:

1. authenticated user;
2. permission;
3. project assignment/scope;
4. record ownership;
5. financial visibility;
6. record lifecycle state.

Never accept `worker_id`, `project_id` or `invoice_id` merely because the browser supplied it.

Worker A guessing Worker B's UUID must still be denied.

---

# 38. Audit log

Append-only audit events for:

- login/security changes;
- user invite/suspend/offboard;
- role/permission change;
- assignment change;
- time submit/approve/reject/adjust;
- worker compensation change;
- internal cost change;
- client rate change;
- tax profile change;
- expense approval;
- document download for sensitive files;
- billing batch close;
- invoice issue/send/void/credit;
- payment record;
- bank instructions change;
- data export.

Fields:

```text
id
occurred_at
actor_user_id
action
entity_type
entity_id
project_id optional
before_json redacted
after_json redacted
reason optional
ip_hash/metadata optional
correlation_id
```

Never log:

- passwords;
- auth tokens;
- full bank credentials;
- secret keys;
- raw receipt image bytes.

---

# 39. SQLite schema modules

Logical modules:

```text
Identity
Clients
Projects
Workforce
Assignments
Planning
Time
Reports
Technical
Expenses
Compensation
Billing
Invoices
Finance
Documents
Approvals
Notifications
Jobs
Audit
```

Suggested core tables:

```text
users
sessions
auth_accounts
roles
user_roles

legal_entities
clients
client_contacts
projects
project_assignments
project_milestones
schedule_templates

worker_profiles
worker_skills
worker_compensation_rules
worker_internal_cost_rules
client_bill_rate_rules

time_entries
timesheet_submissions
daily_reports
technical_reports
technical_changes
technical_artifacts

expenses
expense_receipts
travel_policies

tax_profiles
tax_components
billing_streams
billing_periods
billing_batches
billing_source_locks

invoice_drafts
invoices
invoice_lines
invoice_source_links
invoice_snapshots
invoice_payments
invoice_adjustments

documents
approvals
notifications

scheduled_jobs
job_runs
outbox_events
audit_events
```

Every project-owned table must index `project_id`.

Every time-series table must index relevant date/status fields.

---

# 40. SQLite concurrency rules

SQLite is acceptable for this application under a **single-primary application instance** because expected writes are short transactional records, not high-frequency telemetry.

Rules:

- WAL mode;
- keep write transactions short;
- no HTTP/API call while holding a DB transaction;
- no PDF rendering while holding a transaction;
- no external AI request while holding a transaction;
- use unique constraints for invoice sequences/idempotency;
- use retry for `SQLITE_BUSY` only around safe bounded transactions;
- test concurrency.

Do not run multiple independent portal containers writing the same SQLite file.

---

# 41. When to migrate to PostgreSQL later

Do not migrate because “PostgreSQL is more professional.”

Migrate only when a measurable requirement appears, for example:

- multiple active application replicas;
- high availability/failover requirement;
- sustained write contention;
- external systems need concurrent direct DB writes;
- much larger user/customer scale;
- managed-cloud architecture becomes a business requirement;
- complex analytics workload begins affecting operational writes.

Keep repository/domain boundaries clean enough that migration is possible without rewriting UI/business rules.

---

# 42. Background jobs without Redis

One durable scheduler process can live inside the portal container, or use a dedicated CLI invoked by systemd timer.

Preferred initial production design:

```text
Portal HTTP process
+
systemd timer every 5 minutes:
pnpm --filter portal jobs:run-due
```

or one supervised worker process in the same container image.

Job state is stored in SQLite.

Important jobs:

- reminders;
- period readiness;
- billing draft generation;
- report generation;
- invoice PDF generation retries;
- overdue status;
- notification email;
- cleanup of expired temp files.

All financial jobs require idempotency.

---

# 43. PDF generation

Use HTML/CSS templates rendered server-side with Playwright/Chromium.

Why:

- invoice design matches browser CSS;
- multilingual fonts/layout;
- headers/footers/page numbers;
- same templates are previewable in browser.

PDF generation happens **after** the financial issue transaction.

If PDF generation fails:

- invoice remains Issued;
- job retries;
- admin sees “PDF generation failed”;
- invoice is not duplicated.

---

# 44. AI / Copilot

AI is optional and subordinate to source records.

Possible useful functions:

- summarize daily reports into period narrative;
- suggest receipt fields;
- classify technical topics;
- flag anomalies for human review;
- draft customer-facing report prose;
- search approved non-sensitive project documentation.

Never allow AI to:

- approve time;
- approve expenses;
- choose tax;
- decide billability;
- issue invoice;
- change bank details;
- approve safety logic;
- silently change PLC report facts.

PLC source/backups must not be sent to external models by default.

Groq/API keys remain server-side only.

---

# 45. Modern UI system

## 45.1 Brand

Use:

- official J&A logo;
- J&A red;
- graphite;
- white/off-white;
- steel gray;
- restrained green/amber/red status colors;
- mono typography only for technical IDs/values.

Suggested typography:

- modern humanist sans for UI;
- monospace for project IDs, PLC tags, invoice codes.

## 45.2 Portal visual style

Desktop:

- 240–272px sidebar;
- compact top bar;
- max information density without crowding;
- sticky table headers;
- resizable/filterable admin tables where useful;
- detail drawer for quick review;
- full detail page for complex record.

Phone:

- bottom navigation;
- sticky primary action;
- 44px+ tap targets;
- no horizontal table scroll for worker workflows;
- cards only where they improve scanning.

iPad:

- split list/detail layouts;
- sidebar collapses;
- touch-friendly filters.

## 45.3 Statuses

Never use color alone.

Common:

```text
Draft
Submitted
Needs changes
Approved
Locked
Invoiced
Paid
Rejected
Archived
Incomplete
Blocked
```

## 45.4 Dark mode

Optional.

If implemented:

- user preference;
- no information difference;
- invoice/report PDFs remain controlled print templates.

---

# 46. Research-informed essential features

The following product patterns are intentionally included because modern time/project/field tools repeatedly converge on them:

## 46.1 Approval + locking

Approved time/expenses become locked and auditable before invoicing.

## 46.2 Multiple approval periods

Weekly, semi-monthly and monthly approvals are common; J&A extends this with every-14-days and custom/milestone billing.

## 46.3 Budget utilization and profitability

Project planning should connect:

```text
planned/logged hours
× cost rates
× bill rates
+ expenses
vs budget
```

and forecast margin before the project is finished.

## 46.4 Mobile receipt capture

Camera-first receipt input with structured expense data.

## 46.5 Offline field work

Workers may be in plants with poor/no connectivity; time/report/photo drafts need offline support.

## 46.6 Scheduled reports

Period reports should be automatically assembled rather than manually rebuilt from messages/spreadsheets.

## 46.7 Resource planning

Who is assigned where, for how long, with which skill, and whether the assignment is over budget.

## 46.8 Auditability

Every finance KPI should drill back to approved source time/expense data.

---

# 47. Features deliberately not in V1

Do not turn the project into an ERP.

Not V1:

- payroll withholding calculation;
- employee benefits;
- statutory tax filing;
- automatic NFS-e filing without a provider;
- bank payment execution;
- credit-card storage;
- full general ledger;
- full CRM;
- inventory/warehouse;
- GPS employee surveillance;
- screenshots/activity surveillance;
- employee productivity score;
- customer portal;
- internal chat;
- native iOS/Android apps;
- autonomous AI approval;
- automatic invoice sending by default.

Design adapters for future integrations without building them now.

---

# 48. Windows development

Developer machine requirements:

```text
Git
Node.js 24 LTS
pnpm
```

Optional:

```text
Docker Desktop
```

No local PostgreSQL.

No .NET SDK.

No Azure account.

Recommended commands:

```bash
pnpm install
pnpm dev
```

Development data:

```text
./var/dev/jaautomation.dev.sqlite
./var/dev/files/
```

Both gitignored.

Synthetic seed data only.

Do not copy production receipts, pay rates or customer confidential PLC artifacts onto laptops for UI development.

---

# 49. Environments

```text
development
test
production
```

Optional staging later.

Each environment gets independent:

- database file;
- file root;
- auth secret;
- mail config;
- invoice sequence;
- Groq/AI key;
- legal-entity config.

Test/staging invoice PDFs:

```text
TEST — NOT AN INVOICE
```

Production numbering never runs in development.

---

# 50. Production VPS baseline

Treat current server facts as authoritative:

```text
Host: options-greek-plotting-vm1
OS: Ubuntu 24.04-class
Public host: gex-dashboard.hopto.org
Repo: /home/NexIA/J-Aautomation
Server-management docs: /home/NexIA/Servidor
Native Caddy already installed
Docker already installed
Docker Compose already installed
```

Do not replace the existing Caddy or Docker installation.

Do not merge J&A into:

```text
/home/NexIA/Servidor/nexia_servidor.py
```

Do not reuse its authentication/session model.

---

# 51. New production filesystem

```text
/home/NexIA/J-Aautomation/     code/repository

/etc/jaautomation/
└── jaautomation.env

/var/lib/jaautomation/
├── data/
│   └── jaautomation.sqlite
├── files/
│   ├── receipts/
│   ├── reports/
│   ├── invoices/
│   ├── technical/
│   ├── plc-backups/
│   ├── exports/
│   └── temp/
└── runtime/

/var/www/jaautomation/
└── site/

/var/backups/jaautomation/
├── sqlite/
├── files/
└── manifests/
```

Permissions must prevent other unprivileged services from reading finance files.

---

# 52. Production containers

Simplify old Compose topology.

V3 requires only:

```text
ja-portal
```

Optional separate worker using same image only if needed later:

```text
ja-worker
```

No PostgreSQL container.

No website container.

The public website is static files.

Portal:

```text
127.0.0.1:5100 -> container 3000
```

Use non-root container user.

Bind mount only the required J&A data paths.

Never mount Docker socket.

---

# 53. Caddy routing

Caddy remains the single Internet-facing reverse proxy.

Routing precedence:

1. J&A private portal;
2. J&A public form API;
3. J&A public static website;
4. all existing GEX/NexIA routes unchanged.

Conceptually:

```text
/j-aautomation/app/*       -> 127.0.0.1:5100
/j-aautomation/api/public/*-> 127.0.0.1:5100
/j-aautomation/*           -> /var/www/jaautomation/site
```

The implementation agent must inspect the real Caddyfile and use the least invasive valid snippet.

Before reload:

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
caddy validate --config /etc/caddy/Caddyfile
```

Reload only if validation passes.

Existing routes must still work.

---

# 54. Base-path portability

Both site and portal must support configurable base path.

Current:

```text
JA_PUBLIC_BASE_PATH=/j-aautomation
JA_PORTAL_BASE_PATH=/j-aautomation/app
```

Future domain:

```text
JA_PUBLIC_BASE_PATH=
JA_PORTAL_BASE_PATH=
```

Moving from GEX subpaths to:

```text
www.j-aautomation.com
app.j-aautomation.com
```

must require configuration/rebuild/deploy, **not a source-code rewrite**.

No hard-coded absolute GEX URLs inside components.

---

# 55. Production secrets

File:

```text
/etc/jaautomation/jaautomation.env
```

Mode:

```text
0600
```

Example names:

```dotenv
NODE_ENV=production
JA_PUBLIC_ORIGIN=https://gex-dashboard.hopto.org
JA_PUBLIC_BASE_PATH=/j-aautomation
JA_PORTAL_BASE_PATH=/j-aautomation/app

JA_DB_PATH=/var/lib/jaautomation/data/jaautomation.sqlite
JA_FILES_ROOT=/var/lib/jaautomation/files

BETTER_AUTH_SECRET=
JA_AUTH_COOKIE_NAME=ja_session

JA_EMAIL_PROVIDER=
JA_EMAIL_API_KEY=
JA_EMAIL_FROM=

GROQ_API=

JA_DEFAULT_TIMEZONE=
JA_BACKUP_RETENTION_DAYS=30
```

No secret gets a `PUBLIC_` prefix.

---

# 56. SQLite backup

Do not copy a live WAL database naively.

Use:

- SQLite Online Backup API; or
- `VACUUM INTO` controlled snapshot.

Daily:

1. create consistent SQLite snapshot;
2. hash snapshot;
3. archive new/changed private files;
4. create manifest;
5. verify;
6. rotate retention.

Recommended:

- at least 30 days hot local snapshots;
- encrypted off-VPS copy for real financial/technical production use;
- periodic restore drill.

Weekly:

```text
PRAGMA integrity_check;
```

against a safe snapshot or controlled maintenance workflow.

Backup success without restore testing is not sufficient.

---

# 57. Systemd

Keep the current operational convention under:

```text
/home/NexIA/Servidor
```

Recommended source copies:

```text
jaautomation.service
jaautomation-jobs.service
jaautomation-jobs.timer
jaautomation-backup.service
jaautomation-backup.timer
```

Live:

```text
/etc/systemd/system/
```

`jaautomation.service` starts the Compose portal.

A timer can run due jobs and backup.

Do not create a database service.

Do not create a website Node service.

---

# 58. Deployment flow

From repository:

1. validate Git state;
2. run tests;
3. build static site;
4. build portal container;
5. snapshot current DB/files;
6. apply reviewed migrations;
7. copy static build to versioned web directory;
8. atomically switch site symlink/directory;
9. restart/recreate portal;
10. health check;
11. smoke test public/portal;
12. verify existing VPS apps;
13. retain rollback release.

Do not run global:

```bash
docker system prune -a
docker volume prune
```

on the shared VPS.

---

# 59. Database migrations

Drizzle schema is source of truth.

Workflow:

```text
schema change
→ generate migration
→ review SQL
→ backup
→ apply migration
→ run verification
```

Never run unreviewed destructive migration automatically on application startup.

For table rebuild migrations:

- test with realistic copy;
- verify row counts;
- verify foreign keys;
- verify invoice snapshots;
- keep rollback backup.

---

# 60. API/server design

Prefer SvelteKit server actions for UI mutations where natural.

Use explicit JSON endpoints for:

- offline sync;
- upload;
- public inquiry;
- asynchronous job status;
- export/download where needed.

Do not build a parallel generic API layer just because one existed in the old spec.

Namespaces:

```text
/api/public/*             unauthenticated limited
/app/api/sync/*           authenticated
/app/api/uploads/*        authenticated
/app/api/documents/*      authenticated
/app/api/exports/*        authenticated
```

All request schemas validated server-side.

---

# 61. Health endpoints

Private localhost/container health:

```text
/health/live
/health/ready
```

Ready checks:

- process;
- DB open/query;
- writable required directories;
- migration version compatible.

Do not expose:

- secrets;
- DB path if unnecessary;
- user counts;
- invoice totals;
- Groq key status details.

---

# 62. Testing strategy

## 62.1 Billing unit tests

Mandatory:

- hourly;
- 10h expected warning;
- client daily minimum;
- worker guarantee divergence;
- standby;
- travel;
- overtime;
- Saturday rules;
- all-in expense excluded;
- reimbursable included;
- expense markup;
- fixed price;
- capped T&M;
- hybrid;
- weekly;
- every 14 days;
- semi-monthly;
- monthly;
- leap year/month end;
- labor/expense separate tax profiles;
- rounding;
- partial payments;
- margin;
- adjustment.

## 62.2 Invariants

```text
Issued invoice number is unique
Issued invoice snapshot is immutable
One source record cannot be billed twice normally
All-in expense cannot enter expense invoice unless explicit exception
Worker never receives other worker pay data
Worker never receives client rate/margin
Billing batch retry creates no duplicate draft
Money totals reconcile exactly
```

## 62.3 Authorization tests

- Worker A requests Worker B data -> denied.
- Worker requests finance endpoint -> denied.
- PM requests unrelated project -> denied.
- Finance cannot self-grant Owner.
- suspended user -> session denied.
- invoice edit after issue -> denied.
- sensitive document outside project -> denied.

## 62.4 Offline tests

- create time offline;
- refresh app;
- reconnect;
- sync once;
- conflict version;
- receipt upload retry;
- duplicate client request does not create duplicate time.

## 62.5 Responsive/a11y

Test desktop, iPad and 360/390/430 phone widths.

Keyboard:

- navigation;
- dialogs;
- tables;
- forms;
- invoice preview.

No horizontal overflow on worker phone screens.

---

# 63. Security headers

Portal should use strict:

- CSP;
- `frame-ancestors`;
- HSTS when appropriate at host/domain level;
- nosniff;
- Referrer-Policy;
- Permissions-Policy;
- no third-party analytics inside authenticated portal.

Public website can use a more permissive but still restrictive CSP for contact/integrations.

---

# 64. Data retention

Do not hard-delete historical finance records referenced by invoices.

User offboarding preserves:

- time;
- reports;
- expenses;
- approvals;
- invoice links;
- audit.

Configurable retention is required for:

- temp uploads;
- login/security logs;
- raw rejected uploads;
- backups.

Legal/accounting retention periods must be confirmed externally before production policy is finalized.

---

# 65. Project closeout

One-click closeout package:

```text
Project summary
Final period reports
Technical/PLC summary
Latest backup register
Expense summary
Invoice register
Payment status
Internal financial summary
Open items
Document manifest + hashes
```

Project then becomes read-mostly.

Reopening requires authorized reason/audit.

---

# 66. Reports catalog

The product must generate:

## Worker-facing

- weekly/period time statement;
- own compensation estimate;
- own reimbursement statement.

## Project operations

- daily report;
- weekly report;
- custom period report;
- consolidated multi-worker report;
- staffing/assignment report.

## Technical

- PLC/automation change report;
- technical period summary;
- backup register;
- unresolved issues report.

## Finance

- project P&L-style contribution report;
- client profitability;
- worker profitability;
- budget vs actual;
- travel leakage;
- unbilled WIP;
- invoice aging;
- collections;
- forecast at completion.

## Billing

- labor invoice draft/final;
- expense invoice draft/final;
- fixed/milestone invoice;
- adjustment/credit document;
- internal invoice reconciliation.

Exports:

```text
PDF
CSV
XLSX optional
JSON accounting export optional
```

---

# 67. Internal financial report template

Header:

```text
Project #
Project
Client
Period
Billing model
Workers
```

Operations:

```text
Expected hours
Actual hours
Approved hours
Standby hours
Travel hours
Unapproved hours
```

Revenue:

```text
Labor billable candidate
Expense billable candidate
Milestone/fixed candidate
Previously invoiced
Approved unbilled WIP
```

Cost:

```text
Direct labor cost
Hotel
Rental vehicle
Travel
Other direct expenses
```

Budget:

```text
PO/budget
Consumed
Remaining
Forecast at completion
```

Result:

```text
Contribution margin
Contribution margin %
Forecast final margin
```

Exceptions:

```text
Missing reports
Missing receipts
Pending approvals
Rate errors
Budget warnings
Technical safety flags
```

---

# 68. Two canonical commercial examples

## 68.1 Client pays hotel and rental car

```text
Project: C-0008-P-004
Labor: hourly
Expected schedule: 10h Mon–Sat
Client daily minimum: 10h
Hotel: reimbursable at cost
Rental car: reimbursable + configured markup
Meals: non-billable
Labor tax profile: TAX-LABOR-A
Expense tax profile: TAX-EXP-B
Labor cadence: Every 14 days
Expense cadence: Monthly
```

Result:

- worker reports actual hours;
- minimum billing applied transparently;
- approved hotel/car enter expense stream;
- period may generate one labor invoice and one expense invoice;
- internal finance shows actual costs and total margin.

## 68.2 All-in client

```text
Project: C-0012-P-002
Price: fixed $50,000 equivalent configured currency
Hotel: included
Rental car: included
Flights: included
Labor billing: milestone
```

Week:

```text
Internal labor      8,000
Hotel               1,500
Rental                500
Flight              1,200
Direct cost        11,200
```

If milestone billed:

```text
Revenue            15,000
Direct cost        11,200
Contribution        3,800
```

Hotel/rental do not appear on customer invoice.

Travel leakage is visible internally.

---

# 69. Worker “My Pay” canonical example

Configured worker:

```text
Hourly compensation: $40/h
Expected: 10h Mon–Sat
Worker guarantee: 10h/day
Client bill rate: hidden
Internal loaded cost: hidden
```

Current period:

```text
Approved regular        30h
Approved standby        10h
Submitted regular       18h
Expected remaining      12h

Approved estimated      $1,600
Pending estimate          $720
Projected period        $2,800
Reimbursable expenses     $185
```

The exact rules must use configured project/worker policy; UI copy must not call this a final payslip.

---

# 70. Automatic billing example

Project labor stream:

```text
Cadence: Semi-monthly
Current period: Aug 1–15
```

At close:

```text
Worker A time: approved
Worker B time: approved
Daily reports: complete
PLC report: complete
Labor rate: valid
Tax profile: valid
PO remaining: valid
```

System:

```text
Billing batch READY
→ source rows locked to batch
→ labor draft created
→ report package created
→ Finance notified
```

Expenses stream:

```text
Hotel receipt missing
```

System:

```text
Expense batch INCOMPLETE
→ no expense invoice issue
→ missing receipt listed
→ worker/PM notified
```

The two streams do not block each other unless project policy explicitly says they must close together.

---

# 71. Public website + portal localization

Public website:

```text
EN
PT-BR
ES
```

Portal UI should also support those languages, with English as canonical source.

Do not translate:

- project/client codes;
- PLC tags;
- invoice numbers;
- vendor software product names.

Localize:

- labels;
- statuses;
- help;
- report headings;
- invoice template text if configured.

Store canonical structured data language-neutral where possible.

---

# 72. Accessibility

Target WCAG 2.2 AA.

Required:

- keyboard access;
- visible focus;
- semantic landmarks;
- form labels;
- screen-reader validation;
- no color-only state;
- reduced motion;
- large touch targets;
- browser zoom allowed;
- accessible tables;
- chart tabular alternatives.

Worker core flows must work without drag-and-drop.

---

# 73. Observability

Keep it lightweight.

Structured JSON logs:

```text
timestamp
level
request/correlation id
module
event
user id hashed/opaque where appropriate
project id optional
duration
```

Never log sensitive payloads by default.

Metrics can initially be:

- process health;
- request errors;
- job failures;
- job duration;
- DB busy errors;
- PDF failures;
- email failures;
- disk usage;
- backup success.

No need for a full observability platform in V1.

---

# 74. Disk monitoring

Because SQLite and private documents share the VPS, disk is a production dependency.

Alerts/health should warn:

```text
<20% free
<10% free critical
backup growth abnormal
receipt/temp directory growth abnormal
```

Do not allow file uploads to consume the whole VPS.

Configure per-file and per-project practical limits.

---

# 75. Deployment acceptance

Production is not accepted until:

## Host

- existing Caddy still works;
- existing NexIA/EVOCON apps still work;
- no port conflict;
- J&A portal only binds localhost;
- no DB public port exists because there is no DB server.

## Public site

- `/j-aautomation/en`, `/pt`, `/es` work;
- assets use base path;
- Employee Portal works;
- inquiry/support works;
- no server required for ordinary pages.

## Portal

- login works;
- PWA scope correct;
- worker can submit time/report/receipt from phone;
- admin can approve;
- finance can generate labor and expense draft separately;
- worker pay estimate works;
- no cross-worker data leak.

## Database

- WAL active;
- foreign keys active;
- migration version correct;
- backup works;
- restore tested;
- integrity check passes.

## Finance

- invoice source traceability;
- duplicate billing blocked;
- labor/expense taxes independently configured;
- issued invoice immutable;
- period job idempotent;
- margin reconciles.

---

# 76. Implementation phases

## Phase 0 — Repository and architecture cleanup

- preserve public website factual content/assets;
- create pnpm monorepo;
- remove .NET/PostgreSQL assumptions from active implementation docs;
- create SvelteKit site/portal;
- define env/base-path abstraction;
- design tokens;
- threat model.

Gate:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Phase 1 — Public website migration

- migrate approved visual/content spec;
- EN/PT/ES;
- hero;
- capabilities;
- industries;
- projects;
- Aquarex;
- contact;
- Employee Portal link;
- static build.

Gate: Lighthouse/mobile/a11y.

## Phase 2 — Identity and authorization

- Better Auth;
- invite-only;
- MFA/passkey;
- roles;
- backend authorization;
- audit baseline.

Gate: IDOR tests.

## Phase 3 — Clients, projects, workers

- numbering;
- client records;
- project records;
- assignments;
- schedule;
- rate/compensation models;
- project budgets.

Gate: worker cannot see finance fields.

## Phase 4 — Time + Worker Pay

- actual time;
- categories;
- 10h rule;
- standby;
- daily minimum billing;
- worker guarantee;
- timesheets;
- My Pay.

Gate: client bill calculation and worker pay calculation proven independent.

## Phase 5 — Reports + PLC

- daily reports;
- PLC reports;
- technical changes;
- backup register;
- PDF reports.

Gate: technical artifacts private.

## Phase 6 — Expenses

- mobile capture;
- receipts;
- who-paid;
- all-in/reimbursable;
- reimbursement;
- approval.

Gate: billing-treatment tests.

## Phase 7 — Billing engine

- billing models;
- streams;
- periods;
- tax profiles;
- money engine;
- WIP;
- budgets;
- forecast.

Gate: exhaustive unit/invariant tests.

## Phase 8 — Invoices

- labor templates;
- expense templates;
- snapshots;
- issue;
- PDF;
- payment tracking;
- adjustment workflow.

Gate: issued immutable, duplicate billing impossible.

## Phase 9 — Automation

- durable jobs;
- reminders;
- period close;
- report package;
- automatic drafts;
- failure/retry UI.

Gate: idempotency tests.

## Phase 10 — Planning + dashboards

- staffing;
- skills;
- utilization;
- financial dashboard;
- EAC/ETC;
- aging;
- alerts.

## Phase 11 — Offline PWA

- offline worker drafts;
- sync;
- conflicts;
- receipt queue.

Gate: offline/online E2E.

## Phase 12 — VPS production deployment

- static public site;
- portal container;
- Caddy;
- systemd;
- backup;
- restore;
- security hardening.

---

# 77. Definition of done

The product is done only when J&A can execute this end-to-end scenario without spreadsheet intervention:

1. Admin creates client `C-0042`.
2. Admin creates project `C-0042-P-003`.
3. Admin configures 10h Mon–Sat.
4. Admin configures worker compensation.
5. Admin configures client labor rate.
6. Admin chooses reimbursable hotel/car.
7. Admin configures Labor tax profile A.
8. Admin configures Expense tax profile B.
9. Labor cadence = Every 14 days.
10. Expense cadence = Monthly.
11. Worker opens phone.
12. Worker logs regular + standby time.
13. Worker sees own estimated compensation.
14. Worker submits daily report.
15. Worker submits PLC change/report.
16. Worker photographs hotel receipt.
17. PM approves operational records.
18. Finance approves billability.
19. Dashboard updates project cost, revenue candidate and margin.
20. Period close creates customer report.
21. Period close creates labor invoice draft.
22. Month close creates expense invoice draft.
23. Finance reviews and issues.
24. PDFs are immutable and traceable.
25. Payment is recorded.
26. Project finance reconciles to the underlying approved records.
27. Backup/restore can reproduce the issued documents and source snapshots.

---

# 78. Internet research basis for the V3 decisions

The feature set was cross-checked against current official documentation for several modern categories of tools on 2026-08-18.

Architecture / framework:

- SvelteKit official Node adapter: https://svelte.dev/docs/kit/adapter-node
- SvelteKit static adapter: https://svelte.dev/docs/kit/adapter-static
- Drizzle + Node SQLite: https://orm.drizzle.team/docs/sqlite/connect-node-sqlite
- SQLite documentation / backup API: https://sqlite.org/docs.html
- Node.js 24 LTS releases/docs: https://nodejs.org/

Project/time/expense patterns:

- Clockify approvals: https://clockify.me/help/track-time-and-expenses/approval
- Clockify expense/invoice workflow: https://clockify.me/help/track-time-and-expenses/expenses
- Float budget utilization/profitability: https://support.float.com/en/articles/13742802-budget-utilization-and-profitability
- Fieldwire mobile/photo/offline workflow: https://help.fieldwire.com/

The objective is not to clone those products. Their patterns are used only to validate which workflows have become operationally important: approvals, locking, budget vs actual, profitability, mobile capture, offline field work, scheduled reporting and resource planning.

---

# 79. Final architecture statement

Build J&A Automation as a **SvelteKit + TypeScript modular monolith with SQLite**, a static multilingual public website, and a PWA private field/finance portal. The portal must model projects, workers, actual time, 10-hour availability/standby rules, compensation, client rates, all-in vs reimbursable travel, PLC reports, receipts, budgets, forecasts, approvals and immutable billing. Labor and expenses are independent billing streams so each can have its own cadence, tax profile and invoice. Workers can see their own hours, assignment budget and estimated compensation; Finance sees cost, revenue and contribution margin. Automatic period-close jobs generate reports and invoice drafts but do not issue/send by default. Development requires only Node/pnpm on Windows; production requires one Node container, one SQLite file, private filesystem storage and the existing Ubuntu/Caddy VPS.

