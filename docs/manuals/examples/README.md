# Ejemplos de documentos de J&A Automation

**86 archivos de ejemplo** · 13 CSV, 1 JSON, 64 PDF, 6 XLSX, 2 ZIP.

Todos los datos son sintéticos. No se ha consultado la base de datos de producción. Estos archivos no son facturas reales ni acreditan una aprobación, firma o pago real.

- [Descargar toda la colección](all-examples.zip).
- [Abrir la galería](index.html): descarga y descomprime el ZIP para verla localmente; GitHub muestra el código HTML.
- [Inventario con tamaños, idiomas y SHA-256](manifest.json).
- [Comprobaciones de lectura de los archivos](validation.json).
- [Manuales de uso](../).

## Cobertura

| Familia | Formatos | Idiomas | Archivos |
| --- | --- | --- | ---: |
| Accounting pack | CSV, JSON, PDF, XLSX | en, es, native, pt-BR | 7 |
| Collections workbench | CSV | native | 3 |
| Customer period report | PDF | en, es, pt-BR | 3 |
| Daily field report | PDF | en, es, pt-BR | 3 |
| Expense register | CSV, PDF, XLSX | native | 3 |
| Internal period report | PDF | en, es, pt-BR | 3 |
| Invoice | PDF | en, es, pt-BR | 15 |
| Invoice collection ledger | CSV, XLSX | native | 2 |
| Project finance review | XLSX | en, es, pt-BR | 3 |
| Supplier operational report | CSV | en, es, pt-BR | 3 |
| Technical / PLC report | PDF | en, es, pt-BR | 3 |
| Worker statement | CSV, PDF | en, es, pt-BR | 6 |
| browser-print-daily-report | PDF | en, es, pt-BR | 3 |
| browser-print-expense | PDF | en, es, pt-BR | 3 |
| browser-print-invoice | PDF | en, es, pt-BR | 3 |
| browser-print-period-report-customer | PDF | en, es, pt-BR | 3 |
| browser-print-period-report-internal | PDF | en, es, pt-BR | 3 |
| browser-print-project | PDF | en, es, pt-BR | 3 |
| browser-print-supplier-report | PDF | en, es, pt-BR | 3 |
| browser-print-technical-report | PDF | en, es, pt-BR | 3 |
| browser-print-time-entry | PDF | en, es, pt-BR | 3 |
| browser-print-time-register | PDF | en, es, pt-BR | 3 |
| project-closeout | ZIP | en | 2 |

Los PDF de factura incluyen las cinco plantillas: mano de obra detallada/resumida, gastos, hitos e importe de ajuste. Los informes de período separan la versión para aceptación del cliente y la versión interna. El paquete contable incluye PDF, XLSX, CSV de facturas, CSV de gastos y JSON. También se muestran gastos, liquidación del trabajador, revisión económica del proyecto, cobros, informe del proveedor y cierre del proyecto para cliente/equipo interno.

`browser-print/` contiene la impresión real del navegador de diez pantallas en los tres idiomas de la interfaz, utilizando su CSS de impresión. No sustituye al PDF descargable de cada módulo. El ejemplo de proveedor impreso muestra el estado vacío de un proyecto asignado; sus CSV muestran filas pobladas. La opción genérica Imprimir también sirve para otras secciones y depende de los filtros visibles.

Los ZIP de cierre se generan mediante el ciclo real preparar → confirmar el contenido destinado al cliente → finalizar → descargar. Incluyen resumen PDF, JSON, índice de documentos y manifiesto; el ZIP del cliente incluye un PDF técnico sintético seleccionado. La copia extraída del resumen en `previews/` facilita consultarlo, sin inventar un formato adicional de la aplicación.

No se incluyen originales subidos por usuarios (recibos, copias firmadas, fotografías ni respaldos PLC): son adjuntos, no documentos generados por la app. Los manuales de ayuda siguen en la carpeta superior. `all-examples.zip` es únicamente el paquete descargable de esta documentación.

## Apariencia y datos

Se han mejorado el ancho de las tablas y los resúmenes de período y liquidación, los campos de informes técnicos/diarios, el registro de gastos, las cabeceras/formatos de Excel y la paginación del resumen de cierre. Los importes, reglas económicas y permisos se conservan. Excel almacena como texto los valores que exceden sus 15 cifras significativas para evitar pérdida de precisión. Los ejemplos de tiempo incluyen intervalos y pausas cuando el formato los admite.

Los informes internos/contables y la revisión económica requieren los permisos financieros de la app; la liquidación del trabajador es personal; el proveedor ve únicamente su ámbito autorizado. Esta carpeta es una demostración pública con datos ficticios, no un método de descarga de datos privados.

La previsualización de Excel/CSV muestra las primeras 15 filas de la primera hoja. El archivo original conserva todas las hojas, filtros, tipos y formatos. Las imágenes PDF muestran la primera página; descarga el PDF para leer todas. El resumen de cierre usa una fuente ligera compatible con EN/ES/PT; otros caracteres se muestran explícitamente como `[U+XXXX]` y se conservan en el JSON y en la copia/búsqueda del PDF.

## Regeneración

Desde la raíz del repositorio, con las dependencias instaladas y Poppler disponible:

```sh
node --experimental-strip-types scripts/generate-manual-examples.ts
pnpm exec tsx scripts/generate-manual-closeout-examples.ts
pnpm exec playwright test tests/e2e/manual-export-print-examples.spec.ts --project=desktop
python3 -m venv .tmp/examples-python
.tmp/examples-python/bin/pip install openpyxl==3.1.5
.tmp/examples-python/bin/python scripts/package-manual-examples.py
```

Playwright crea su propia base de datos desechable. Los generadores no deben apuntarse al almacenamiento de producción. Los importes de la colección principal se concilian en `manifest-base.json`; la impresión usa el escenario E2E y el cierre usa un segundo proyecto independiente.
