# Recibo de despliegue del seguimiento UX — 25/09/2026

## Primera entrega (activa mientras se corrige un defecto residual)

- ZIP revisado: `jaautomation-release-20260925-final.zip`, SHA-256 `666c3a596d839de059c645016cd3132f071497a18951fd98800940dbe69b9755`; árbol fuente Git `e92465efc582ebb29d62dc535e336c7330f27fa9`.
- Preparación: índice temporal con lista positiva de 1746 archivos fuente, 1747 entradas en el manifiesto y los nueve PDF públicos requeridos por Dockerfile. Se excluyeron `docs/evidence`, todos los `*.private.md`, `__pycache__`, `*.pyc`, archivos `.env` reales, salidas de compilación y datos de sesión. `sha256sum -c` del manifiesto y `unzip -tqq` pasaron. Se preservó `.env.example`.
- Despliegue: ejecutor ZIP soportado en modo explícito; registro `/var/tmp/ja-release-stage.x6OOuH/deploy.log`. Release previo `7d45f83c55fd9f5295264dfac0b477666eb2ec9667400d43adcc8834ef6b8a88`, conservado como ruta de reversión. Release nuevo `/opt/jaautomation/releases/ja-automation-666c3a596d839de059c645016cd3132f071497a18951fd98800940dbe69b9755`; `/opt/jaautomation/current` coincide con ese SHA.
- Backup online previo al cambio: `/var/backups/jaautomation/2026-09-25T120244311Z-879d7254-bb02-4135-a55a-55d993343d58`, 46 documentos, SHA-256 `51a53bc781ae100b9335c38ec97d79c5ba5c1a722031e5e9e1c378cf2365351f`.
- Puertas previas: pruebas de integración focalizadas 38/38, E2E focalizadas 4/4, typecheck, lint, formato y revisión independiente de código. La revisión independiente ejecutó 33/33 pruebas de integración. El ZIP se inspeccionó antes de autorizar su ejecución.
- Salud posterior: portal y sitio `healthy`, jobs `running`, URLs públicas y endpoints locales HTTP 200; `verify-vps.sh` pasó (`/var/tmp/ja-release-stage.x6OOuH/verify-vps.log`). El enlace ZIP temporal se eliminó. Auditoría de ocho ZIP físicos en `/home/kripta`: ninguno pendiente de procesar; el vigilante path/timer quedó activo sin cambiar el release.

## Incidencia residual y siguiente entrega

Una repetición real en producción a 390 px mostró que el resumen de pasos y Siguiente ya son visibles, pero el primer `section` del asistente conserva un ancho intrínseco de aproximadamente 736 px por el selector de proyecto. El cuerpo de la hoja mide `scrollWidth=752` frente a `clientWidth=390`; la descripción y el control quedan recortados. Captura: `/home/kripta/production-browser-audit-20260925/post-finance-wizard-390.png`. La primera entrega sigue operativa; esta incidencia requiere corrección CSS, prueba geométrica a 360/390 px, segundo ZIP revisado y repetición del gesto en producción. No se considera cerrado UX-02 con la primera entrega.
