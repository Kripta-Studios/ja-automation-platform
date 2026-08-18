# Estado del MVP demo

## Implementado

- Web pública EN/PT/ES con fotografía industrial real, rutas localizadas, SEO, formularios y diseño responsive.
- Portal responsive con acceso demo aislado de la autenticación de producción.
- Owner/admin dashboard, lista y detalle de proyectos, workforce, planificación y aprobaciones.
- Registro de tiempo real por categorías, sin crear horas desde la planificación.
- Informes diarios y PLC con campos específicos de automatización.
- Gastos con recibo content-addressed y tratamiento all-in, reimbursable o non-billable.
- My Pay limitado al trabajador autenticado.
- Finanzas de proyecto con presupuesto, coste, valor facturable y Contribution Margin.
- Labor y expenses como streams separados, perfiles fiscales configurables y preview imprimible.
- Seed demo reproducible y pruebas de escritorio, tablet y móvil.
- Compose, imágenes Node 24 no-root, Caddy y systemd para Ubuntu.

## Limitaciones conocidas del MVP

- Los botones demo sustituyen credenciales solo cuando `JA_DEMO_MODE=true`.
- El invoice preview demuestra composición y cálculo; no constituye una factura fiscal.
- El uploader valida tipo/tamaño y hash, pero el escáner antimalware queda fuera del MVP.
- La PWA conserva una base de caché local; la resolución completa de conflictos queda pendiente.
- Los textos legales, SMTP, dominio definitivo y perfiles fiscales requieren aprobación antes de producción.

## Roadmap V3 posterior

- Invitaciones, MFA/passkeys, recuperación y offboarding completos.
- RBAC/IDOR exhaustivo, step-up y auditoría ampliada.
- Jobs de cierre de periodo, PDF Chromium, recordatorios y reintentos durables.
- Escaneo antimalware, retención documental, backups cifrados fuera del VPS y simulacros de restore.
- Créditos, aging, forecasting avanzado, exports y todos los edge cases de cadencia/impuestos.
- Revisión legal, contable, accesibilidad asistida y carga antes del go-live real.

## Evidencia visual revisada

- 390×844: Today, Time, Daily/PLC Reports y Expenses.
- 768×1024: admin dashboard, project detail e invoice preview.
- 1440×900: admin dashboard, project detail e invoice preview.

Playwright comprueba además ausencia de overflow horizontal y errores de consola en el recorrido principal.
