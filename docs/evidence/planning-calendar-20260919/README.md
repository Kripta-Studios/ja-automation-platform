# Evidencia de calendarios y disponibilidad — 19/09/2026

Las capturas `worker-*` y `owner-*` proceden de Chromium real sobre una base aislada con
cuentas sintéticas. La matriz automatizada recorre Worker, Project Manager, Owner, Finance y
Auditor en 360, 390, 768 y 1440 px. Comprueba creación, edición y recarga de disponibilidad,
propiedad del trabajador, publicación y edición de turnos, navegación de proyectos, límites
del PM, perfil propio sin asignaciones, accesibilidad y dimensiones de controles.

`production-copy-upgrade.json` registra el ensayo de migración 48 → 49 en copia online
aislada: comparación de las filas anteriores, integridad, claves foráneas y triggers.

`production-before.json` y `production-after.json` documentan el estado real alrededor del
despliegue. Los hashes completos usados para comparar filas financieras permanecen fuera del
repositorio; aquí solo se publican cantidades y resultados. No se incluyen datos de clientes,
credenciales ni cookies de sesión.

El recibo de despliegue enlazado desde el análisis funcional contiene los resultados finales,
el commit, la identidad del archivo desplegado y las comprobaciones de producción. Las pruebas
autenticadas por rol se ejecutan en el entorno aislado; la comprobación pública posterior usa
la web de producción sin introducir operaciones ficticias en sus datos reales.
