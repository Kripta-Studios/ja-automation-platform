# V3 showcase access

This is the safe access sheet for the VPS showcase release. The workspace is populated by
`packages/database/src/demo-seed.ts` with synthetic clients, contacts, projects, users, workers,
operational records, private documents, travel expenses, planning data and finance artifacts.

The showcase deliberately enables `JA_DEMO_MODE=true`. The role buttons create an eight-hour,
HMAC-signed demo cookie; they do not create a Better Auth session and they do not require a
password. This is suitable for a public product walkthrough only. Turn demo mode off and replace
the database before using the deployment for real users or customer data.

## URLs

- Public website: `https://gex-dashboard.hopto.org/j-aautomation/en`
- Portal login: `https://gex-dashboard.hopto.org/j-aautomation/app/login`
- Portal base path: `/j-aautomation/app/`

If the hostname changes, update the four origin/RP values in the VPS environment before building.

## Demo accounts

| Role button           | Name               | Email                             | Role              | Password                  |
| --------------------- | ------------------ | --------------------------------- | ----------------- | ------------------------- |
| Owner admin · Antonny | Antonny Nascimento | `antonny.luty@j-aautomation.com`  | `owner_admin`     | None; use the demo button |
| Finance               | Elena Costa        | `finance@demo.jaautomation.local` | `finance_admin`   | None; use the demo button |
| Project manager       | Daniel Brooks      | `pm@demo.jaautomation.local`      | `project_manager` | None; use the demo button |
| Field worker          | Alex Rivera        | `worker@demo.jaautomation.local`  | `worker`          | None; use the demo button |

The seed also creates two additional workers for assignments and team listings:

- Rafael Santos — `rafael@demo.jaautomation.local`
- Maya Chen — `maya@demo.jaautomation.local`

These `.local` addresses are synthetic display data and must not receive email. The supplied
company address belongs only to the owner/admin showcase identity.

## Mock workspace

| Client                           | Projects                                                            | Showcase focus                                         |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Northline Mobility (Demo)        | Body Shop Line 4 Controls Upgrade; Remote Controls Support Retainer | automotive controls, daily minimums and remote support |
| Harbor Packaging Group (Demo)    | High-Speed Palletizer Commissioning                                 | all-in commissioning and travel expense treatment      |
| BlueRiver Process Systems (Demo) | Caustic Recovery Skid Integration                                   | time-and-materials process controls work               |

The seed contains four projects, six active users, three workers, six client contacts, approved and
pending actual time, daily and technical reports, approved reimbursable/all-in expenses, planning
assignments, schedules, skills, worker availability, client/worker/internal rates, legal/tax
configuration, notifications, two technical-change approval states, two milestone approval states,
three separate draft invoice streams (labor, expense and milestone), closed billing periods, period
reports, an Accounting Pack draft and a project closeout draft. The expense set includes hotel
folios, an airfare ticket/boarding-pass document, rental-car invoice, fuel, ground transport, meals,
per diem, tolls, tools and materials. Each receipt is a real, valid synthetic PDF stored under the
private document root and marked clean for the showcase scanner workflow. Planned/expected/minimum
minutes never become actual time, labor and expense billing remain separate, auto-issue and auto-send
remain disabled, and every monetary value stays synthetic and not for payment.

## Local access

```powershell
pnpm install --frozen-lockfile
$env:JA_DATABASE_PATH="$PWD\packages\database\data\demo.db"
$env:JA_MIGRATIONS_PATH="$PWD\migrations"
$env:JA_DOCUMENT_ROOT="$PWD\data\documents"
$env:JA_DEMO_MODE="true"
pnpm demo:seed
pnpm dev:portal
```

Open `http://127.0.0.1:5174/j-aautomation/app/login` and select a role button. The public site can
run separately with `pnpm dev:site` at `http://127.0.0.1:5173/j-aautomation/en`.

## VPS handoff

The complete archive and exact extraction/seed/start commands are described in
`deployment/README_VPS.md`. The archive contains source and deployment definitions, not a database,
private uploads, `.env` secrets, `node_modules` or generated build output. The database is created
on the VPS by the reviewed demo seed after the migration-aware portal image is built.
