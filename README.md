# J&A Automation MVP

Este repositorio contiene una demostración funcional de la futura plataforma de J&A Automation. Incluye una web corporativa estática en inglés, portugués y español, un portal de campo y gestión, persistencia SQLite, datos demo, panel financiero por proyecto y previsualización de facturas.

El MVP usa datos sintéticos identificados con `· Demo`. No atribuye esos clientes o proyectos a J&A.

## Aplicaciones

- `apps/site`: web pública SvelteKit prerenderizada.
- `apps/portal`: portal Node/SvelteKit para trabajadores, project managers, finanzas y owner/admin.
- `packages/database`: migraciones SQLite, repositorios y seed demo.
- `packages/money` y `packages/billing-engine`: importes enteros, impuestos y periodos.
- `deployment`: imágenes, Compose, integración Caddy y systemd para Ubuntu.

## Arranque local del demo

Requiere Node 24.19.0 y pnpm 11.22.0.

```powershell
pnpm install --frozen-lockfile
pnpm demo:seed
$env:JA_DATABASE_PATH="$PWD\packages\database\data\demo.db"
$env:JA_MIGRATIONS_PATH="$PWD\migrations"
$env:JA_DOCUMENT_ROOT="$PWD\data\documents"
$env:JA_DEMO_MODE="true"
pnpm dev:portal
```

El portal abre en `http://127.0.0.1:5174/j-aautomation/app/login`. Los botones del bloque “Company demonstration” entran sin contraseña y solo funcionan con `JA_DEMO_MODE=true`.

Para la web pública:

```powershell
pnpm dev:site
```

Abre `http://127.0.0.1:5173/j-aautomation/en/`.

## Usuarios y roles demo

| Acceso          | Persona demo                                | Correo en SQLite                  | Puede ver                                                              |
| --------------- | ------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| Owner / Admin   | Antonny Nascimento, Chief Executive Officer | `owner@demo.jaautomation.local`   | clientes, proyectos, trabajadores, aprobaciones, finanzas y billing    |
| Finance         | Elena Costa                                 | `finance@demo.jaautomation.local` | costes, tarifas, contribución, borradores de factura y pagos           |
| Project Manager | Daniel Brooks                               | `pm@demo.jaautomation.local`      | proyectos asignados, planificación y revisión operativa                |
| Worker          | Alex Rivera                                 | `worker@demo.jaautomation.local`  | asignación propia, tiempo real, informes, gastos y compensación propia |
| Worker          | Rafael Santos                               | `rafael@demo.jaautomation.local`  | segundo técnico para planificación y horas de proyecto                 |
| Worker          | Maya Chen                                   | `maya@demo.jaautomation.local`    | commissioning, viaje y actividad de procesos                           |

La ficha pública aportada para Antonny se limita en el demo a su nombre y cargo. El MVP no copia perfiles externos ni inventa datos biográficos.

## Datos demo

`pnpm demo:seed` borra y recrea solo `packages/database/data/demo.db`.

- 3 clientes sintéticos y 4 proyectos industriales.
- Proyecto principal: `C-0001-P-001`, actualización de controles de Body Shop Line 4.
- Jornadas esperadas de 10 horas separadas del tiempo real registrado.
- Tiempo regular, commissioning, standby, travel y overtime.
- Informes diarios y un informe PLC ControlLogix con validación y rollback.
- Hotel y alquiler de coche reembolsables; combustible all-in en otro proyecto.
- Costes internos, tarifas cliente, presupuesto y contribución coherentes.
- Streams de labor y expenses con impuestos demo distintos y dos facturas preview.

## Recorrido recomendado

1. Web pública: Home → Capabilities → Industries → Projects → Employee Portal.
2. Owner/Admin: Today → proyecto `C-0001-P-001` → workforce → reports → expense treatment → finance.
3. Billing: abre los dos streams y pulsa `Preview` para comparar labor y expenses.
4. Worker: Today → Time → Reports → Expenses → My Pay.
5. PM: Approvals y Planning muestran la revisión operativa sin exponer tarifas ni margen.

## Calidad

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm exec playwright test -c playwright.mvp.config.ts
```

## Despliegue Ubuntu

Sigue [deployment/README_VPS.md](deployment/README_VPS.md). El despliegue conserva Caddy como único proxy público y publica los contenedores solo en `127.0.0.1:5100` y `127.0.0.1:5101`.

## Alcance

Consulta [docs/MVP_DEMO_STATUS.md](docs/MVP_DEMO_STATUS.md) para ver el límite entre el MVP y el roadmap V3 de producción.
