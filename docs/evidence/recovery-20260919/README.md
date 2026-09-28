# Evidencia — recuperación y aceptación 19/09/2026

Código de aplicación: `3893245d52c9afdf1653f88032737649cf8af27b`.
La regresión general de 1.050 casos pertenece a `5db9bfc`; el cambio posterior de proyección
del listado está cubierto por 8 pruebas focalizadas, revisión independiente y la nueva aceptación.
Los cambios posteriores del test de aceptación y de documentación no modifican el runtime.

- `release.json` y `runtime-verification.json`: ZIP, ruta activa, comparación de fuentes, salud y caché.
- `production-recovery.json`: IDs y hashes de recuperaciones/sustituciones, conservación y auditoría.
- `backup-verification.json` y `isolated-restore.json`: backup/restauración de 59 archivos y límites de cobertura.
- `quality-gates.json`: pruebas, análisis estático y hashes de logs operativos retenidos de forma privada.
- `acceptance-diagnostics.json`: intentos fallidos previos; no se cuentan como aceptación.
- `acceptance-32-steps.json`: 32/32 PASS en el SHA actual, con identidad/hash del test.
- `operations-evidence.json`: dos ciclos automáticos, backup y rollback actuales; dispensa histórica conservada.

Los recibos omiten credenciales y filas financieras. Los IDs técnicos permiten correlacionar la
recuperación con la auditoría protegida. Los originales y los cuatro jobs agotados permanecen.
Los dos PDF legacy siguen bloqueados y tienen nuevos sustitutos; no se convierten en documentos válidos
por cambiar su etiqueta.

## Reproducción

Con Node 24 y dependencias instaladas:

```sh
pnpm test:unit
pnpm typecheck
pnpm --filter @ja/portal exec svelte-check --tsconfig ./tsconfig.json
pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop --workers=1
```

Para los pasos 30–32, Playwright requiere evidencia operativa **actual**, ligada por SHA-256, tenant
y deployment, y `JA_E2E_CADDY_BASE_URL=https://j-aautomation.com`. Configurar
`JA_E2E_OPERATIONS_EVIDENCE_PATH`, `JA_E2E_OPERATIONS_EVIDENCE_SHA256`,
`JA_E2E_OPERATIONS_TENANT_ID` y `JA_E2E_OPERATIONS_DEPLOYMENT_ID` con una captura verificada.
El propio fixture rechaza evidencia operativa caducada. No modificar fechas para reutilizar este
recibo; una decisión Owner duradera conserva su fecha original, las mediciones se vuelven a tomar.

La aceptación usa una base desechable con datos sintéticos y contrasta la operación del despliegue
real mediante evidencia de solo lectura. No crea facturas, firmas ni invitaciones sintéticas en
producción. La copia PDF aportada por el firmante sintético acredita el circuito y la vinculación
de evidencia a la versión/hash, no una firma humana real ni una validación jurídica. Los scripts privados de recuperación son específicos de estos IDs, con comprobaciones
de backup, identidad desplegada y preservación; no constituyen una operación genérica para reejecutar.

## Revisión independiente

- Runtime: integración, seguridad, finanzas y cumplimiento aprobados antes de desplegar.
- Recuperación productiva: revisión independiente de solo lectura PASS; comparación completa contra
  backup inicial, hashes de 50 originales y vínculos auditados confirmados.
- Aceptación: vínculo causal de firma/cierre y emisión revisado; ejecución completa 32/32 PASS.

Estos resultados no sustituyen aprobación fiscal/legal, aceptación humana ni cobertura de 30 días.
