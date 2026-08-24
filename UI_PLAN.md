# Plan Maestro de Reestructuración UI/UX y Diseño de Interfaz
## J&A Automation — Portal Web Empresarial (Client Essential)

---

## 1. Diagnóstico y Análisis Crítico de la UI/UX Actual

Tras una auditoría exhaustiva del frontend del portal (`apps/portal/src/`), sus estilos (`apps/portal/src/styles/portal/`), la navegación (`portal-navigation.ts`) y su componente central (`PortalShell.svelte` con más de 3.700 líneas), se identifican los siguientes problemas estructurales de experiencia de usuario:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ESTADO ACTUAL (CAÓTICO)                         │
├────────────────────────────────┬───────────────────────────────────────┤
│ Sidebar plano de 16 ítems      │ Lista vertical sin jerarquía ni       │
│ sin agrupación funcional       │ dominios de negocio claros            │
├────────────────────────────────┼───────────────────────────────────────┤
│ "Muro de Formularios"          │ 10 a 15 campos y desplegables         │
│ (The Wall of Inputs)           │ visibles simultáneamente en el top    │
├────────────────────────────────┼───────────────────────────────────────┤
│ Falta de Divulgación           │ Casos especiales (Overtime caps,      │
│ Progresiva                     │ Travel billable, fiscalidad por flujo)│
│                                │ mostrados a usuarios ordinarios       │
├────────────────────────────────┼───────────────────────────────────────┤
│ Ausencia de Paneles Laterales  │ Para editar o configurar hay que      │
│ y Modales (Side Drawers)       │ hacer scroll infinito o saltar páginas│
├────────────────────────────────┼───────────────────────────────────────┤
│ Tablas saturadas de botones    │ Cada fila muestra 4 o 5 botones de    │
│ de acción individual           │ acción directa sin menú contextual    │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 1.1 Sobrecarga Cognitiva y "Muro de Formularios"
Actualmente, al entrar a casi cualquier sección (`time`, `expenses`, `projects`, `billing`, `finance`), la pantalla recibe al usuario con formularios verticales extensos colocados directamente encima de las tablas de datos. Cada formulario contiene entre 8 y 16 inputs, dropdowns de selección múltiple, checkboxes y campos numéricos. Esto genera:
- **Fatiga visual inmediata:** El usuario tiene que buscar dónde empieza la información real (las listas y métricas) tras pasar un bloque masivo de edición.
- **Dificultad en pantallas móviles y tablets:** En viewports de 360px a 768px, el formulario ocupa más de dos pantallas de scroll antes de mostrar un solo registro histórico.

### 1.2 Navegación Plana y Desestructurada (`apps/portal/src/lib/portal-navigation.ts`)
En el archivo `portal-navigation.ts`, para usuarios administradores y de finanzas se despliegan **16 ítems de primer nivel**:
*Dashboard, Projects, Clients, Team, Planning, Time, Reports, PLC / Technical, Expenses, Approvals, Billing, Invoices, Finance, Documents, Notifications, Settings, Audit.*
- Vistas que conceptualmente son filtros o pestañas de un mismo dominio (`Clients` y `Team` pertenecen a `Projects`; `PLC / Technical` pertenece a `Reports`; `Invoices` pertenece a `Billing`) están aplanadas en la barra lateral con glifos ASCII (`▦`, `◉`, `◌`, `⌘`, `◷`, `▤`, `⌁`, `◇`, `✓`, `◫`).
- Esto satura el menú y rompe el modelo mental del usuario sobre cuál es el flujo de trabajo principal.

### 1.3 Falta de Divulgación Progresiva (Progressive Disclosure)
El sistema soporta casos de uso avanzados exigidos por la especificación (`CORE-02` a `CORE-17`), tales como:
- Horas de viaje facturables vs no facturables.
- Mínimos facturables por proyecto.
- Umbrales y multiplicadores de Overtime diferenciados (trabajador vs cliente).
- Compensación porcentual sobre labor elegible.
- Gastos All-in vs Reembolsables y su tratamiento económico separado.
- Bloqueo de facturación por firma de cliente requerida.

**El error de diseño actual es que todos estos campos avanzados están expuestos permanentemente en los formularios ordinarios.** El 90% de las entradas diarias (un trabajador registrando 8 horas de labor regular o subiendo un ticket de comida) se ven obligadas a convivir con campos de configuración técnica y fiscal avanzada.

---

## 2. Principios Rectores del Rediseño UI/UX

Para transformar esta interfaz en una plataforma fluida, profesional, intuitiva y estética, el rediseño se fundamentará en **7 principios**, no sólo en un cambio visual.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                    PRINCIPIOS DEL REDISEÑO UX                            │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Flujo de negocio continuo                                             │
│ 2. Configuration is not data entry                                       │
│ 3. Divulgación progresiva                                                 │
│ 4. Experiencia especializada por rol                                      │
│ 5. Una única fuente de verdad y varias proyecciones                       │
│ 6. Patrones UI consistentes y responsive                                  │
│ 7. Reducción deliberada de ruido visual                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Alineación con el Business Loop de J&A

La interfaz debe guiar al usuario a través del ciclo operativo natural:

```text
Setup Proyecto
→ Registro de trabajo real
→ Aprobación PM
→ Interpretación comercial / Finance
→ Reporte cliente + conformidad cuando aplique
→ Facturación
→ Cobro / pago trabajador
→ Cierre y reporting
```

La navegación, los dashboards y las llamadas a la acción deben reflejar este flujo, no la estructura interna del código.

### 2.2 Regla central: **Configuration is not data entry**

Esta regla es obligatoria para evitar tanto caos visual como errores financieros:

> **Workers record operational truth. Project/Finance configuration determines its commercial interpretation.**

Consecuencias:

- El Worker registra horas reales, tipo operacional, actividad, standby y travel.
- El Worker **no decide** si Travel es facturable al cliente.
- El Worker **no decide** qué multiplicador económico de Overtime aplica.
- El Worker no ve client rates, costes internos, margen, tax profiles ni reglas de facturación.
- Overtime derivado de un umbral configurado debe calcularse desde las reglas del proyecto, salvo que el dominio autoritativo requiera una categoría operacional explícita.
- Finance/Admin puede realizar overrides autorizados, pero éstos deben ser explícitos, auditados y no convertirse en campos ordinarios del formulario de campo.

Ejemplo:

```text
REALIDAD OPERATIVA
11h labor + 2h travel
        │
        ▼
REGLAS DEL PROYECTO
OT threshold = 10h
Worker OT = 2.0x
Client OT = 1.6x
Travel client billable = no
        │
        ├──────────────────────┐
        ▼                      ▼
WORKER COMPENSATION       CLIENT BILLING
10h base                  10h base
1h overtime @ 2.0x        1h overtime @ 1.6x
2h travel según regla     0h travel billable
```

La UI nunca debe obligar al trabajador a conocer ni reconstruir esta transformación.

### 2.3 Divulgación Progresiva

Los formularios del día a día mostrarán sólo los campos necesarios para completar la tarea actual. Como referencia:

- **3–6 campos visibles** para un alta operacional normal.
- Campos condicionales sólo cuando una selección los haga relevantes.
- Configuración avanzada en superficies Finance/Admin, no escondida simplemente bajo un acordeón visible al Worker.
- Un acordeón no debe convertirse en un segundo “muro de formularios”.

### 2.4 Experiencia especializada por rol

- **Worker:** captura rápida de tiempo, gasto y actividad; consulta de su propio estado y compensación.
- **Project Manager:** proyectos, equipo operativo, aprobaciones, reports y excepciones.
- **Finance:** revisión económica, commercial rules, billing, collections, worker settlements y accounting.
- **Owner/Admin:** visión consolidada y configuración administrativa, con step-up cuando corresponda.

No basta con ocultar botones: los DTOs, métricas, columnas y acciones visibles deben ser coherentes con el rol.

### 2.5 Una fuente de verdad, varias proyecciones

Las tres vistas centrales confirmadas por J&A se derivan de la misma verdad operativa y financiera:

```text
Hours + Activities + Expenses
             │
             ▼
   Approved operational truth
             │
             ▼
       Commercial rules
             │
             ▼
 Canonical financial calculation
             │
     ┌───────┼────────┐
     ▼       ▼        ▼
 CLIENT    WORKER    ADMIN/FINANCE
 hours     own pay    pay/receive
 activity  dates      WIP/cash/margin
 sign-off
 no money
```

La UI **no debe duplicar cálculos financieros** en cada vista.

### 2.6 Patrones UI estándar y responsive

- Drawer lateral en tablet/desktop para create/edit/detail de complejidad moderada.
- **Full-screen sheet/page en móvil** para los mismos flujos.
- Tabs sólo para subdominios estrechamente relacionados.
- Menú contextual `⋯` para acciones secundarias.
- Acción primaria siempre visible y claramente priorizada.
- Badges de estado con texto, no sólo color.
- **Nunca Drawer dentro de Drawer.** Si una segunda operación es compleja, reemplazar la superficie o navegar a una vista dedicada.

### 2.7 Reducción deliberada de ruido visual

Las pantallas deben priorizar en este orden:

1. Qué está pasando.
2. Qué requiere atención.
3. Cuál es la acción principal.
4. Datos y filtros.
5. Acciones secundarias.

No se deben añadir cards, sombras, iconos o animaciones si no mejoran esa jerarquía.

---

## 3. Nueva Arquitectura de Navegación y Menús

La navegación no debe ser una única lista común con elementos ocultos. Debe mantener una arquitectura coherente, pero mostrar **un conjunto realmente distinto por rol**.

### 3.1 Worker

```text
J&A AUTOMATION

HOY
  • Mi Jornada

TRABAJO
  • Horas
  • Gastos
  • Reportes

MI CUENTA
  • My Pay
  • Perfil
```

El Worker no verá Billing, Finance, Commercial Rules, Audit global, otros trabajadores ni documentos financieros.

### 3.2 Project Manager

```text
J&A AUTOMATION

RESUMEN
  • Dashboard

OPERACIONES
  • Proyectos
  • Aprobaciones                     [badge pendientes]
  • Reportes

PLANIFICACIÓN
  • Equipo / Asignaciones
  • Planning

DOCUMENTACIÓN
  • Documentos / PLC Backups autorizados
```

El PM puede gestionar operación y aprobaciones dentro de su alcance, pero no debe recibir client rates, worker compensation de terceros, internal loaded costs o company margin salvo requisito autoritativo expreso.

### 3.3 Finance

```text
J&A AUTOMATION

RESUMEN
  • Finance Overview

OPERACIÓN
  • Proyectos
  • Aprobaciones Finance

FINANZAS
  • Economic Review
  • Billing
  • Collections
  • Accounting

CONFIGURACIÓN
  • Commercial Rules
  • Users / Settlements según permisos
  • Audit autorizado
```

### 3.4 Owner/Admin

Owner/Admin ve la unión coherente de Management + Finance + System, manteniendo step-up y controles de alto riesgo.

### 3.5 Reglas de navegación

- `Invoices` vive dentro de `Billing`.
- `PLC / Technical` vive dentro de `Reports` y/o el detalle del proyecto.
- `Clients` vive junto a `Projects`, pero como tab/vista de gestión, no como 16º ítem plano.
- `Team` no debe mezclar equipo operativo y tarifas comerciales en una misma vista visible a PM.
- `Documents` debe priorizar archivos operativos y artefactos relacionados con el contexto actual; no convertirse en un DMS genérico.
- `Notifications` sólo merece navegación propia si existe volumen real; en otro caso puede vivir en header/inbox ligero.

---

## 4. Reestructuración Detallada Sección por Sección

### 4.1 Horas y Jornadas (`/app/time`)

*Archivos de referencia:* `apps/portal/src/lib/portal/sections/TimesheetPanel.svelte` y superficies relacionadas.

#### Objetivo

La pantalla principal muestra primero el periodo y la información registrada. Crear horas es una acción, no el contenido dominante de la página.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [SEMANA: 18 Ago - 24 Ago 2026]   < Hoy >       [+ REGISTRAR TRABAJO]   │
├────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│ │ HORAS TOTAL  │ │ LABOR        │ │ TRAVEL       │ │ ESTADO PERIODO  │ │
│ │    42.5 h    │ │    40.5 h    │ │     2.0 h    │ │ [Pendiente PM]  │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └─────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ VISTA SEMANAL                                                          │
│ LUN 8.5h | MAR 8h | MIÉ 9h | JUE 8h | VIE 9h | SÁB -- | DOM --       │
├────────────────────────────────────────────────────────────────────────┤
│ [Buscar...] [Proyecto ▾] [Estado ▾]                                    │
│ Fecha       Proyecto      Trabajo/Actividad         Horas   Estado  ⋯  │
│ 24/08      CP-12 Magna    Commissioning línea 3     8.0h   Aprobado ⋯  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Fast Log del Worker

Desktop/tablet: `TimeEntryDrawer.svelte`.
Móvil: la misma experiencia se convierte en full-screen sheet/page.

Campos ordinarios:

1. Proyecto asignado.
2. Fecha.
3. Horas/duración real.
4. Tipo operacional simple: `Work`, `Travel`, `Standby`, `Commissioning` u otros tipos realmente existentes en el dominio.
5. Resumen breve de la actividad.
6. Notas sólo si son necesarias.

#### Progressive disclosure real

- Si selecciona `Travel`, aparece únicamente el campo operacional adicional que realmente sea necesario. **No aparece “Travel billable yes/no” al Worker.**
- Si selecciona `Standby`, aparece `Standby reason`.
- Si una actividad requiere report técnico, se ofrece `Añadir / vincular Technical Report`, sin obligar a completar configuración comercial.
- Customer contact sólo se muestra cuando sea relevante para el reporte o sign-off.

#### Overtime

La UI diferencia **tiempo operacional** de **tratamiento económico**:

- El Worker no necesita conocer el client overtime multiplier.
- Si overtime se deriva del umbral del proyecto, el sistema lo calcula automáticamente al revisar/facturar.
- Si el dominio existente requiere una clasificación operacional explícita, la UI debe presentarla sin revelar la fórmula económica.
- Finance/Admin ve la transformación `actual → regular/OT billable → worker/client calculation` en la revisión económica.

#### Corrección administrativa

Para Admin/Finance autorizado:

```text
CORREGIR REGISTRO APROBADO

Valor vigente       8.0 h
Nuevo valor         7.5 h
Diferencia         -0.5 h

Motivo *
[ Corrección confirmada con supervisor ]

[ Cancelar ] [ Crear corrección auditada ]
```

Nunca se muestra una acción ordinaria `Editar` sobre verdad aprobada/locked. La UI comunica que se está creando una corrección/superseding version.

---

### 4.2 Gastos y Recibos (`/app/expenses`)

#### Objetivo

El Worker registra el hecho económico mínimo. Finance clasifica/valida su tratamiento comercial cuando no pueda derivarse de la configuración.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ GASTOS Y REEMBOLSOS                              [+ NUEVO GASTO]       │
├────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│ │ PENDIENTES   │ │ POR REEMBOLSAR│ │ RECUPERABLE  │ │ TOTAL PERIODO   │ │
│ │      3       │ │   USD 180    │ │   USD 420    │ │   USD 600       │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └─────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ [Buscar...] [Proyecto ▾] [Estado ▾]                                    │
│ Fecha   Proyecto   Concepto          Importe     Reembolso   Cliente ⋯  │
│ 23/08   CP-12      Hotel Marriott    $145.00     Pendiente   Approved ⋯ │
└────────────────────────────────────────────────────────────────────────┘
```

#### `ExpenseEntryDrawer.svelte` / mobile sheet

Worker:

1. Foto/PDF receipt con preview.
2. Proyecto.
3. Fecha.
4. Categoría.
5. Importe y moneda.
6. Quién pagó.
7. Descripción breve.

No mostrar al Worker:

- markup;
- tax profile;
- client billing state editable;
- Finance-only treatment;
- internal margin impact.

#### Clasificación Finance/PM autorizada

La revisión presenta claramente dos ejes independientes:

```text
WORKER REIMBURSEMENT
Pending / Scheduled / Paid
Expected payment date
Actual payment date

CLIENT RECOVERY
Reimbursable / All-in / Non-billable
Not invoiced / Draft / Invoiced / Collected
Expected collection date
Actual collection date
```

No añadir `Markup` como requisito nuevo de producto sólo por rediseñar la UI. Si ya existe de forma legítima en el dominio, mantenerlo únicamente en la configuración autorizada correspondiente.

---

### 4.3 Reportes de Servicio (`/app/reports`)

Los reportes pasan a **3 tabs de primer nivel dentro del dominio Reports**:

```text
[ Daily ]   [ Technical / PLC ]   [ Client Sign-off ]
```

#### Tab 1 — Daily

- Nuevo Daily Report.
- Proyecto / fecha / trabajador.
- Actividad realizada, progreso, blockers y next actions.
- Estado Draft / Submitted / Approved.

#### Tab 2 — Technical / PLC

- Problem / diagnosis / change / validation.
- Safety flag visual y textual.
- Attachments privados.
- PLC backups y version history vinculados al proyecto/sistema.

#### Tab 3 — Client Sign-off

Esta superficie es de primer nivel porque es release-blocking cuando el proyecto requiere conformidad antes de facturar.

```text
CLIENT TIME & ACTIVITY REPORT
Magna — CP-12
12 Aug → 18 Aug 2026

Worker        Hours       Status
A. Silva      52.0 h      Ready to sign

ACTIVITIES
✓ PLC commissioning
✓ Robot integration
✓ HMI validation
✓ Production support

MONETARY INFORMATION
None — intentionally excluded

[ Preview PDF ]     [ Capture conformity ]
```

Después de firmar:

```text
✓ Signed / Conformed
Signer: John Smith
Signed at: 24 Aug 2026 · 15:42
Document version: v3
Immutable artifact reference / hash: available
```

Reglas:

- No worker compensation.
- No client rates.
- No internal costs.
- No margin.
- No hidden monetary metadata en DTO/document payload destinado al cliente.
- La firma/conformidad queda vinculada a una versión inmutable del reporte.
- Si el proyecto requiere sign-off, Billing enlaza directamente a esta superficie cuando falte.

`SignaturePadModal.svelte` sólo es una implementación posible del input. El dominio debe modelar **conformidad/version binding**, no depender del dibujo de una firma como único mecanismo.

---

### 4.4 Proyectos, Clientes y Asignaciones (`/app/projects`)

#### Vista superior

No usar `Equipo y Tarifas` como tab conjunta.

```text
[ Proyectos ]   [ Clientes ]
```

```text
┌────────────────────────────────────────────────────────────────────────┐
│ PROYECTOS                                      [+ NUEVO PROYECTO]      │
├────────────────────────────────────────────────────────────────────────┤
│ [Buscar...] [Estado ▾] [Cliente ▾]                                    │
│ Código   Proyecto          Cliente      PO/Cap       Estado            │
│ PRJ-01   Línea Ensamble    CP-12        $50,000      Activo            │
└────────────────────────────────────────────────────────────────────────┘
```

La columna `Margin` **no aparece universalmente**. Sólo Finance/Owner recibe métricas financieras autorizadas.

#### Detail view

Al entrar en un proyecto:

```text
CP-12 · Magna Assembly Line
Active

[ Overview ] [ Team ] [ Commercial ] [ Reports & Files ] [ Billing ]
```

Visibilidad:

- **Overview:** datos operativos, fechas, cliente, PO/cap y estado permitido por rol.
- **Team:** asignaciones, fechas efectivas y estado. PM puede gestionar sólo dentro de su autoridad.
- **Commercial:** Finance/Admin only. Rates, minimum billable, overtime thresholds/multipliers, Travel treatment, tax profiles, billing cadence, customer-signoff-required.
- **Reports & Files:** daily/technical/client sign-off/backups según permisos.
- **Billing:** Finance/Admin o vista limitada según rol.

#### Asignación de trabajador

No mezclar automáticamente la asignación operacional con tarifas confidenciales.

Para PM:

```text
Assign worker
Worker
Start date
End date optional
Operational role / notes
```

Para Finance/Admin, en Commercial o una segunda superficie autorizada:

```text
Worker compensation rule
Internal/direct cost
Client bill rate
OT worker treatment
OT client treatment
Travel worker treatment
Travel client treatment
```

---

### 4.5 Facturación, Invoices y Collections (`/app/billing`)

El pipeline visual se conserva como **resumen y filtros**, no como Kanban editable.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ BILLING & COLLECTIONS                                                  │
├────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ │ WIP READY    │ │ DRAFTS     │ │ OUTSTANDING  │ │ OVERDUE      │     │
│ │ $4,160       │ │ $8,000     │ │ $14,500      │ │ $2,400       │     │
│ │ 52 h         │ │ 2 invoices │ │ 3 invoices   │ │ 1 invoice    │     │
│ └──────────────┘ └────────────┘ └──────────────┘ └──────────────┘     │
├────────────────────────────────────────────────────────────────────────┤
│ [Estado ▾] [Cliente ▾] [Labor | Expenses] [Periodo ▾]                 │
│ Invoice        Cliente   Stream     Total       Estado              ⋯  │
│ INV-2026-001   CP-12     Labor      $4,800      Outstanding         ⋯  │
│ INV-2026-002   CP-12     Expenses   $650        Paid                ⋯  │
└────────────────────────────────────────────────────────────────────────┘
```

Click en una StatCard aplica un filtro; **no arrastra invoices entre estados**.

#### Inmutabilidad

Issued invoice:

- muestra `Issued · Locked`;
- no ofrece `Edit`;
- acciones disponibles: `Record payment`, `Issue credit/adjustment`, `Void` o `Replace` sólo donde el lifecycle lo permita;
- operaciones destructivas/financieras de alto riesgo requieren el step-up definido por CORE-01/15.

#### Sign-off gate

```text
⚠ Labor issue blocked
Customer sign-off required for CP-12 · 12–18 Aug
[ View report ready for conformity ]
```

Se puede preparar un draft, pero no presentar una acción de issue habilitada mientras exista el bloqueo autoritativo.

#### Identificadores de Invoice

La preview debe exponer claramente cuando estén configurados:

- client acronym/code;
- client number;
- project number;
- project cost-center code/number;
- PO/reference;
- service period;
- Labor/Expenses tax treatment.

---

### 4.6 Revisión Económica y Finanzas (`/app/finance`)

El dashboard debe hacer imposible confundir previsión con realidad.

```text
FINANCE OVERVIEW
Periodo: Agosto 2026      Proyecto: Todos

EXPECTED / PLANNED
┌──────────────────┐ ┌──────────────────┐ ┌────────────────────┐
│ TO INVOICE       │ │ TO COLLECT       │ │ TO PAY WORKERS     │
│ $18,400          │ │ $14,500          │ │ $9,200             │
└──────────────────┘ └──────────────────┘ └────────────────────┘

ACTUAL
┌──────────────────┐ ┌──────────────────┐ ┌────────────────────┐
│ INVOICED         │ │ COLLECTED        │ │ PAID TO WORKERS    │
│ $14,000          │ │ $12,000          │ │ $6,500             │
└──────────────────┘ └──────────────────┘ └────────────────────┘

CONTRIBUTION
Direct project result      $X
Contribution margin        Y%
```

No usar `Net Profit` ni `Gross Margin` si el dominio autoritativo habla de `Contribution Margin / Direct Project Result`.

#### Reconciliation table

```text
Worker / Project | Hours | Worker Pay | Direct Cost | Billable | WIP |
Expected Invoice | Actual Invoice | Expected Collection | Collected |
Expected Worker Payment | Paid Worker
```

En móvil esta tabla no se comprime hasta ser ilegible: se transforma en cards/rows expandibles con los mismos datos autorizados.

---

### 4.7 Aprobaciones (`/app/approvals`)

La UI debe priorizar excepciones y reducir el coste de revisión.

```text
APPROVALS                                              7 pending

[ Time 3 ] [ Expenses 2 ] [ Reports 2 ]

A. Silva · CP-12 · 24 Aug
8.5 h · Commissioning line 3
No conflicts detected

[ Reject / Needs changes ]             [ Approve ]
```

Reglas:

- Reject/Needs Changes exige razón.
- Owner override se presenta como acción excepcional, no junto al botón Approve ordinario.
- Finance billability review se separa de PM operational approval cuando sean dos decisiones distintas.
- Los datos Finance-only no se serializan hacia PM sólo por reutilizar el mismo componente.

---

### 4.8 Dashboards / Home por rol

No crear un dashboard universal con todos los KPIs.

#### Worker — `Mi Jornada`

- qué tiene que registrar hoy;
- drafts pendientes;
- submissions esperando aprobación;
- own pay / reimbursement status resumido;
- acciones rápidas: `Registrar trabajo`, `Nuevo gasto`, `Nuevo report`.

#### PM

- proyectos activos;
- aprobaciones pendientes;
- missing/exceptional time;
- reports con Safety Flag;
- pendientes de sign-off cuando sean operativamente relevantes.

#### Finance

- WIP ready;
- drafts pendientes;
- invoices outstanding/overdue;
- expected vs actual collections;
- worker payments/reimbursements due;
- alerts de cap/sign-off/configuración incompleta.

#### Owner

- resumen consolidado con drill-down, no una duplicación de todas las tablas del sistema.

---

## 5. Catálogo de Componentes UI Propuestos

Crear componentes sólo cuando reduzcan repetición real o garanticen comportamiento consistente.

| Componente | Archivo sugerido | Propósito UX |
| :--- | :--- | :--- |
| `ResponsiveSheet.svelte` o evolución de `Drawer.svelte` | `apps/portal/src/lib/portal/ui/` | Drawer en desktop/tablet y full-screen sheet en móvil. |
| `Tabs.svelte` | `apps/portal/src/lib/portal/ui/Tabs.svelte` | Tabs accesibles con teclado para subdominios relacionados. |
| `CollapsibleSection.svelte` | `apps/portal/src/lib/portal/ui/CollapsibleSection.svelte` | Campos avanzados sólo para roles/contextos apropiados. |
| `StatCard.svelte` | `apps/portal/src/lib/portal/ui/StatCard.svelte` | KPI resumido; clickable sólo cuando aplica filtro/drill-down real. |
| `ActionMenu.svelte` | `apps/portal/src/lib/portal/ui/ActionMenu.svelte` | Acciones secundarias contextuales. |
| `FilterBar.svelte` | `apps/portal/src/lib/portal/ui/FilterBar.svelte` | Búsqueda y filtros consistentes. |
| `StatusBadge.svelte` | `apps/portal/src/lib/portal/ui/StatusBadge.svelte` | Estado con texto + semántica, nunca sólo color. |
| `MoneyValue.svelte` | `apps/portal/src/lib/portal/ui/MoneyValue.svelte` | Formateo visual consistente sin introducir cálculos. |
| `EmptyState.svelte` | `apps/portal/src/lib/portal/ui/EmptyState.svelte` | Estado vacío útil con siguiente acción. |
| `CorrectionDialog.svelte` | `apps/portal/src/lib/portal/ui/CorrectionDialog.svelte` | Diferencia anterior/nueva + razón + aviso de auditoría. |
| `SignaturePadModal.svelte` | `apps/portal/src/lib/portal/ui/SignaturePadModal.svelte` | Captura de firma cuando sea el mecanismo elegido; no sustituye al modelo de sign-off/version. |

### Reglas de composición

- No nested drawers.
- Máximo una acción primaria dominante por superficie.
- Un modal sólo para tareas acotadas; no para formularios de 20 campos.
- Acciones peligrosas nunca escondidas entre acciones triviales sin separación visual.
- Componentes visuales no contienen lógica financiera de negocio; reciben valores ya calculados por capas autorizadas.

---

## 6. Sistema Visual y Estilos

La intención es **industrial + financiera + profesional**, no “SaaS template genérico”.

### 6.1 Paleta

Mantener identidad EVOCON/J&A con contraste accesible:

- Fondo app: neutro claro.
- Surface: blanco/neutral con border sutil.
- Sidebar: oscuro sobrio.
- Acción primaria: rojo corporativo.
- Estados: success / warning / danger / info, siempre acompañados de texto/iconografía comprensible.

Los valores exactos se deben validar con contraste WCAG antes de fijarlos como tokens definitivos.

### 6.2 Tipografía

- Preferir la fuente ya disponible en el producto o una familia web segura/embebida por el proyecto; no introducir una dependencia externa sólo por estética.
- Títulos con jerarquía consistente, no tamaños arbitrarios por pantalla.
- Datos numéricos: `font-variant-numeric: tabular-nums`.
- Monedas y horas alineadas para comparación visual.

### 6.3 Densidad

- Desktop Finance puede ser más denso que Worker mobile.
- Separación clara entre summary, filters, data y actions.
- Cards sólo para resúmenes o objetos con affordance real.
- No convertir cada dato en una tarjeta.

### 6.4 Microinteracciones

Evitar `transition: all`.

Usar sólo propiedades necesarias, por ejemplo:

```css
transition:
  background-color 160ms ease,
  border-color 160ms ease,
  opacity 160ms ease,
  transform 160ms ease;
```

Añadir soporte:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

No aplicar elevación/hover a elementos que no sean interactivos.

---

## 7. Responsive y Accesibilidad

El responsive no se deja para una fase cosmética final: forma parte del contrato de cada componente.

### 7.1 Breakpoints de evidencia

- 360/390 phone.
- 768 tablet.
- 1440 desktop.

Otros tamaños: smoke tests según riesgo.

### 7.2 Mobile patterns

- Drawer → full-screen sheet/page.
- Tables financieras densas → cards/rows expandibles o columnas prioritarias + detail.
- Sticky primary action cuando ayude al flujo, sin ocultar contenido.
- Filtros secundarios pueden colapsarse en `Filters` con badge del número activo.
- No hover-only interactions.

### 7.3 Accessibility

- Focus visible.
- Labels persistentes; placeholders no sustituyen labels.
- Touch targets suficientemente cómodos.
- Tabs/menus/dialogs con navegación por teclado y ARIA correctos.
- Estado no comunicado sólo por color.
- Errores próximos al campo y summary cuando el formulario lo requiera.
- Focus trap y restore focus para dialogs/sheets.
- Escape cierra sólo superficies seguras; nunca descarta silenciosamente cambios o acciones financieras.

---

## 8. Plan de Implementación por Fases

La implementación debe ser incremental y compatible con el Client Essential, no un big-bang rewrite.

```text
FASE 0 — CONTRATOS UX Y SEGURIDAD
  • congelar navegación por rol y matriz de visibilidad
  • mapear campos operational vs commercial/Finance
  • inventariar componentes existentes reutilizables
  • definir browser journeys y screenshots/evidencia antes de mover lógica

FASE 1 — NAVEGACIÓN + PRIMITIVAS
  • reorganizar portal-navigation.ts por rol/grupo
  • ResponsiveSheet/Drawer, Tabs, ActionMenu, StatusBadge, FilterBar
  • mantener URLs/actions existentes cuando no haya razón funcional para cambiarlas

FASE 2 — WORKER FIELD FLOWS
  • /app/time → Fast Log + weekly/history
  • /app/expenses → receipt-first simplified entry
  • /app/reports → Daily / Technical / Client Sign-off
  • My Pay → own-only privacy

FASE 3 — PM / PROJECT MANAGEMENT
  • Projects / Clients limpios
  • project detail: Overview / Team / Commercial(role-gated) / Reports / Billing
  • approvals orientadas a excepción

FASE 4 — FINANCE / BILLING
  • Finance Overview expected vs actual
  • billing summary cards + invoice table
  • sign-off billing blocker
  • collections / worker settlement states
  • contribution terminology coherente

FASE 5 — POLISH + CROSS-ROLE QA
  • design tokens y densidad
  • responsive 360/390, 768, 1440
  • keyboard/a11y
  • browser privacy checks y screenshot review
```

### Gate por fase

Cada fase debe terminar con:

1. focused component/unit tests;
2. role/DTO security tests afectados;
3. Playwright del journey modificado;
4. screenshots en viewport representativo;
5. revisión de regresión de acciones/lifecycles;
6. cero reimplementación de lógica financiera en frontend.

---

## 9. Invariantes de Implementación UI/UX

Este plan queda subordinado al Client Essential SPEC/CHECKLIST. Si una propuesta visual contradice una regla de dominio, seguridad o lifecycle, **manda el dominio autoritativo**.

1. **Operational truth first:** Workers capturan hechos reales; las reglas comerciales interpretan esos hechos después.
2. **No commercial leakage:** Worker/PM no reciben rates, internal cost, other-worker pay, margin ni Finance-only exports cuando están prohibidos.
3. **Server authorization remains authoritative:** Ocultar un control no sustituye RBAC/IDOR/DTO allowlists.
4. **Exact money:** La UI formatea; no recalcula dinero con floats ni duplica business logic.
5. **Issued invoice immutability:** nunca aparece `Edit` sobre invoice issued.
6. **Approved history is corrected, not rewritten:** correction UI muestra prior truth y razón.
7. **Sign-off version binding:** conformidad cliente pertenece a una versión concreta del reporte.
8. **Planned ≠ actual cash:** previstos y efectivos se distinguen visual y semánticamente.
9. **Expense dual state:** worker reimbursement y client recovery son estados separados.
10. **Active/inactive preserves history:** desactivar no borra ni oculta historia financiera necesaria.
11. **Offline/PWA remains conditional:** preservar la infraestructura existente, pero no ampliar UX offline como gate salvo activación autoritativa. Si está activo, mantener aislamiento por usuario y sync truth.
12. **No new business scope from UI work:** no introducir markup, nuevos tax engines, approval centers, DMS, CRM u otras features sólo porque parezcan convenientes visualmente.
13. **No nested drawers and no hidden complexity:** progressive disclosure reduce complejidad; no la desplaza a tres niveles de overlays.
14. **Role-specific projections:** una misma entidad puede tener diferentes columnas/actions por rol sin duplicar la fuente de verdad.
15. **Semantic terminology:** usar `Contribution Margin / Direct Project Result`; evitar `Net Profit` o etiquetas contables no definidas.

---

## 10. Criterios de Aceptación UX

El rediseño se considera correcto cuando, además de pasar los requisitos funcionales:

- Un Worker puede registrar un día normal sin enfrentarse a configuración comercial.
- Un Worker puede subir un receipt desde móvil con un flujo corto y claro.
- Travel y Overtime se capturan sin obligar al Worker a conocer reglas de facturación.
- PM puede revisar y aprobar sin recibir información Finance-only.
- El proyecto concentra su contexto sin mezclar Team y confidential Rates indiscriminadamente.
- Client Sign-off es localizable desde Reports y desde cualquier bloqueo de Billing relacionado.
- Finance distingue a simple vista expected vs actual, money in vs money out y contribution.
- Issued invoices no presentan affordances de edición destructiva.
- Las tablas importantes tienen una representación móvil deliberada.
- 360/390, 768 y 1440 permiten completar los journeys Essential sin horizontal-scroll accidental en formularios críticos.
- Keyboard focus, labels, estados y errores son comprensibles.
- Ninguna pantalla obtiene un aspecto “más limpio” a costa de ocultar un error, estado pending/failed o bloqueo real.
- El resultado visual se percibe como una herramienta empresarial industrial/financiera coherente, no como una colección de formularios ni como un dashboard template genérico.
