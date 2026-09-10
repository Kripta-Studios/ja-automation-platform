# Proveedores y configuración financiera — 10 de septiembre de 2026

## Resultado

La sección de proveedores y su informe reutilizan `PortalChrome`, con navegación lateral, menú móvil accesible, selección de idioma y enlaces correspondientes al perfil del usuario.

El propietario dispone de un directorio con búsqueda y filtros por estado. Puede editar el nombre del proveedor y el nombre/correo del técnico, dar de baja y restaurar fichas. Los correos asociados a credenciales se gestionan desde el perfil de la cuenta. Los formularios conservan los valores cuando falla el guardado y las bajas/restauraciones requieren confirmación explícita.

Dar de baja un proveedor lo marca como inactivo, revoca sus autorizaciones y cierra las sesiones asociadas. Restaurarlo no restaura las autorizaciones revocadas. Dar de baja un técnico suspende su cuenta y cierra sus sesiones. Las horas, asignaciones y periodos históricos se conservan. Los proveedores inactivos siguen disponibles para consultar informes históricos del propietario; sus técnicos dejan de aparecer en los selectores operativos.

La configuración financiera separa la introducción comercial, el enlace al ejemplo, la autoridad de emisión y las políticas. Los bloques tienen separación de 24–36 px, relleno de 16–24 px, descripciones con interlineado 1,7 y un aviso independiente cuando falta la autoridad de emisión. No se modifican cálculos ni reglas financieras.

## Verificación

- Svelte: cero errores; siete avisos previos de selectores sin uso en `BillingSection.svelte`.
- ESLint y `git diff --check`: correctos en el alcance modificado.
- Integración y seguridad de proveedores: 41 pruebas superadas.
- Migraciones y disponibilidad del contrato: 91 pruebas comprobadas entre la pasada general y la repetición de las tres suites cuyas expectativas de versión se actualizaron. Incluye actualización poblada de esquema 42 a 43, conservación de metadatos/historial, integridad y rechazo de acciones de auditoría no registradas.
- Navegador: 16 escenarios superados en 360×800, 390×844, 768×1024 y 1440×900. Incluyen propietario, Finance, coordinador y técnico externo; navegación móvil, edición, cancelación, baja/restauración, registro y envío de horas, revocación de accesos y espaciado financiero.
- Tras el ajuste final de tipografía de los botones, se repite el directorio en los cuatro tamaños, comprobando también que Editar y Dar de baja comparten tipografía y radio de borde.
- Las ejecuciones de navegador compilan tanto la web como el portal de producción y usan bases de datos desechables.

Comandos principales:

```sh
pnpm --filter @ja/portal exec svelte-check --output machine
pnpm exec vitest run tests/integration/supplier-workforce.test.ts tests/security/supplier-financial-access.test.ts tests/security/supplier-route-access.test.ts --no-file-parallelism
pnpm exec vitest run tests/migrations tests/integration/lifecycle-security-migration.test.ts tests/operations/migration-contract-readiness.test.ts --no-file-parallelism
pnpm exec playwright test tests/e2e/supplier-directory-ui.spec.ts tests/e2e/supplier-workforce.spec.ts --project=phone-360 --project=phone-390 --project=tablet-768 --project=desktop
```

## Capturas

Las capturas contienen exclusivamente datos ficticios de las pruebas.

- [Directorio móvil](supplier-directory-phone-360.png)
- [Directorio de escritorio y navegación lateral](supplier-directory-desktop.png)
- [Configuración financiera: propietario, móvil](finance-owner-phone-360.png)
- [Configuración financiera: propietario, escritorio](finance-owner-desktop.png)
- [Configuración financiera: Finance, móvil](finance-finance-phone-360.png)
- [Configuración financiera: Finance, escritorio](finance-finance-desktop.png)

## Entrega

Implementado y verificado en el repositorio local. No se ha desplegado en producción ni modificado su base de datos. La entrega debe incluir la migración aditiva `0043_supplier_directory_lifecycle.sql`, su manifiesto y el código del portal/base de datos juntos. Las migraciones anteriores permanecen intactas.
