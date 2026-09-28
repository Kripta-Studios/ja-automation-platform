# Producción: calendarios y disponibilidad — 19/09/2026

Código `7b369598d23a7a74b872d05a0cc0682597d7f2a6`, publicado en la rama
`codex/v3-production-completion-orchestrated-20260819` y activado el **19/09/2026 a las
08:44:17 UTC (10:44:17 Madrid)**. Sitio y portal saludables; worker de jobs en ejecución.

El ZIP desplegado tiene SHA-256
`eb9094bf75957c4c68559161e34a34d634bb0826ddc22638f14f77fdab27c6de`.
Los **1.753 archivos** extraídos coinciden byte a byte con el ZIP y su comentario identifica
el commit. [Identidad del release](evidence/planning-calendar-20260919/release.json).
Los recibos posteriores son documentación; no cambian el código de aplicación desplegado.

## Cambios entregados

- Calendarios mensuales en disponibilidad, planificación y proyectos, con navegación de meses,
  agenda del día y enlaces a registros autorizados.
- Crear y editar disponibilidad desde el calendario, con valores conservados ante error,
  versión optimista, propiedad del trabajador y auditoría transaccional.
- Selección de día para preparar un turno; apertura del editor del Owner desde la agenda.
  El editor conserva correctamente el estado publicado.
- Perfil seleccionado por el servidor, acceso del PM a compañeros autorizados y acceso propio
  de Worker/PM aunque no tengan una asignación activa. Habilidades propias sin autoverificación.
- EN/ES/PT, horario UTC explícito, paneles adaptables y controles accesibles.

[Análisis, comparación con referencias open source y límites funcionales](ERP_PLANNING_REVIEW_2026-09-19.md).

## Verificación

| Comprobación                                | Resultado                                        |
| ------------------------------------------- | ------------------------------------------------ |
| Suite unitaria general                      | 1.074/1.074, 158 archivos                        |
| Corrección final de perfil propio           | 17/17 pruebas focalizadas                        |
| Integración general                         | 527/527, 70 archivos                             |
| Calendarios en Chromium                     | 48/48, cinco roles, 360/390/768/1440 px          |
| Proveedores en Chromium                     | 2/2, coordinador y técnico externo, 390/1440 px  |
| Tipos, Svelte, ESLint y formato             | PASS; Svelte sin errores ni advertencias         |
| Aceptación integral posterior al despliegue | 32/32 pasos, una prueba agregada estricta        |
| Producción pública en Chromium              | 3/3; login móvil/escritorio y sitio público      |
| Operación automática                        | Dos ciclos posteriores al despliegue, sin fallos |

La suite unitaria general precede a la última corrección del acceso propio; las 17 pruebas
focalizadas, integración y navegador cubren el código final. Las sesiones autenticadas y sus
mutaciones usan una base aislada con datos sintéticos. En producción se comprueban navegación
pública, identidad del release, datos y operación, sin introducir operaciones ficticias.

[Resultados y alcance](evidence/planning-calendar-20260919/quality-gates.json),
[capturas y logs](evidence/planning-calendar-20260919/README.md) y
[verificación de runtime](evidence/planning-calendar-20260919/runtime-verification.json).

La aceptación de 32 pasos usa evidencia operativa nueva ligada al release, dos ciclos reales,
backup posterior y recuperación aislada. [Recibo de aceptación](evidence/planning-calendar-20260919/acceptance-32-steps.json)
y [operaciones verificadas](evidence/planning-calendar-20260919/operations-evidence.json).

## Datos, backups y recuperación

- Migración 48 → 49 previamente ensayada en copia aislada: **163 tablas y 259.034 filas**
  anteriores conservadas. Se añade el permiso de auditoría para editar disponibilidad y se
  conserva la inmutabilidad del registro de migraciones.
- Producción en **esquema 49**, integridad SQLite `ok`, cero infracciones de claves foráneas.
  Los hashes de las 36 filas comprobadas de facturas, pagos, documentos y revisiones/snapshots
  contables permanecen idénticos a la medición anterior al despliegue.
- Backup posterior en esquema 49: integridad, claves foráneas y **59 documentos** verificados.
  Backup anterior en esquema 48 restaurado en un directorio aislado usando el código anterior:
  integridad y 59 documentos verificados. Los directorios temporales se retiraron al finalizar.
- Se conservan el release anterior y ambas imágenes de rollback. Volver al código anterior
  requiere su copia compatible de esquema 48 y documentos, además de conciliar las escrituras
  posteriores al corte. La prueba fue una restauración aislada, no un rollback en vivo.
- Caché de construcción Docker eliminada mediante `docker builder prune -af`: **6,961 GB
  liberados y 0 B restantes**. No se podaron imágenes ni volúmenes.

[Conservación de filas](evidence/planning-calendar-20260919/production-after.json),
[backup posterior](evidence/planning-calendar-20260919/backup-verification.json) y
[restauración de la copia anterior](evidence/planning-calendar-20260919/precutover-restore.json).

## Pendientes históricos

P04 continúa parcial: **20 snapshots en 11 días UTC**, sin cobertura diaria de 30 días.
Se conservan los cuatro jobs agotados y los dos PDF históricos bloqueados con sus sustituciones
ya documentadas. No se reintentan ni se reinterpretan por esta entrega.

Las aprobaciones fiscal/comercial, legal/privacidad y UAT humana siguen pendientes. La dispensa
offsite mantiene su fecha y alcance originales; no se renueva. No se conectan Intuit/QuickBooks
ni se declara `CLIENT READY`. Véase el [registro consolidado](PROJECT_STATUS_2026-09-19.md).
