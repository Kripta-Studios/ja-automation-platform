# Actualización de manuales y verificación funcional — 9 de septiembre de 2026

## Solicitud y orden autorizado

El usuario solicita corregir los PDFs y comprobar que sus procedimientos funcionan, destacando varios trabajadores con configuraciones diferentes en un proyecto, aislamiento de datos del Worker, generación de informes y persistencia de archivos. Posteriormente ordena terminar primero los PDFs, hacer git push inmediatamente y enviar un mensaje de exactamente 1000 letras A mayúsculas; las pruebas completas de Owner y Worker deben seguir después de ese hito.

Base de trabajo: `71d4bda`, con aplicación desplegada `5a615d9`. Se preservan las autorizaciones de commit, push y despliegue de esta sesión. La evidencia sintética nunca se presenta como operaciones realizadas sobre los datos de producción.

## Dependencias y responsabilidades

1. Contrastar el contenido con rutas, permisos y ciclos actuales (CORE-01–17; hallazgos M01–M08 de la auditoría).
2. En paralelo: el implementador documental actualiza contenido/generadores/PDFs; el agente principal obtiene capturas autenticadas sintéticas y manifiesto con hashes. Sin escrituras compartidas sobre los mismos archivos.
3. Generar PDFs vinculados al digest de código de la captura; verificar texto, figuras, enlaces, privacidad y presentación. Revisión independiente del resultado.
4. Commit/push inmediato del conjunto documental comprobado y mensaje solicitado.
5. Ejecutar recorridos y comprobaciones completas Owner/Worker, corregir regresiones con pruebas y actualizar cualquier instrucción afectada.
6. Verificación final, revisión de cambios materiales, publicación autorizada y evidencia de producción.

Ruta seleccionada: full por el alcance financiero, de privacidad y documental. Implementación documental: Terra/High; agente principal integra y verifica; revisión final fresca Sol/High. Plantillas de roles comprobadas. El entorno permite escrituras amplias; la revisión se controla como solo lectura por instrucciones y comparación de estado, sin afirmar aislamiento forzado.

## Estado

- Actualización de PDFs: cinco archivos regenerados y comprobados. Owner/Finance: 16 páginas; Worker: 10; guías EN/ES/PT-BR: cinco cada una. Todos A4 etiquetados, con figuras actuales y revisión 2026-09-09. Fuentes editables y hashes de los cinco resultados en `docs/manuals/manual-build.json`.
- Capturas actuales: 45 imágenes y 52 comprobaciones, una prueba Playwright completada en 1,3 minutos. `tests/e2e/manual-current-capture.spec.ts` utiliza sesiones reales en la instancia sintética, abre formularios y comprueba respuestas, incluidos rechazos 403 Worker.
- Verificación documental del agente principal: generación independiente de los cinco PDFs; ocho pruebas de catálogo/descarga privada superadas; seis rechazos comprobados de manifiestos con digest, hash de imagen o resultado fallido, sin mutar PDFs; todos los hashes/tamaños coinciden con el manifiesto. Índice con destinos, extracción de texto y páginas representativas de Owner/Worker/ES/PT inspeccionados.
- La revisión independiente confirmó correspondencia de los procedimientos con el código y pidió corregir encabezados de fecha, traducción de leyendas y puntuación. Esas correcciones están aplicadas y verificadas; el usuario reiteró que se haga el push inmediatamente para ver los PDFs en GitHub. La nueva revisión de esas correcciones continúa, sin bloquear esta publicación expresamente solicitada.
- Pruebas funcionales completas solicitadas: pendientes del push de PDFs. La navegación y las capturas no certifican por sí solas el funcionamiento de un ciclo de negocio.

## Matriz de comprobación posterior al push

| Área                         | Owner                                                   | Worker y límites                               | Evidencia que debe comprobarse                                                     |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Identidad                    | Acceso, invitación/gestión, perfil y seguridad opcional | Acceso/perfil propio; sin administración ajena | Sesiones, permisos persistidos, denegaciones HTTP, controles visibles              |
| Clientes/proyectos/equipo    | Altas, edición, asignaciones, calendario, cierre        | Solo proyectos asignados y alcance efectivo    | Persistencia, fechas, concurrencia, historial y retiro de acceso                   |
| Configuración por trabajador | Varios trabajadores, modelos/importes/fechas distintos  | Ninguna configuración privada ajena            | Cálculos exactos independientes y ausencia de datos ajenos en HTML/JSON/descargas  |
| Tiempo                       | Revisión, devolución/corrección, aprobación             | Crear/enviar/corregir lo propio                | Fuente temporal, versiones, auditoría, conflictos y privacidad                     |
| Informes                     | Revisión, PDF vigente, firma/seguimiento, cierre        | Crear/enviar/consultar lo propio según alcance | Bytes PDF reales, hashes/versiones, exclusión de dinero en informe cliente         |
| Gastos                       | Revisión y tratamiento comercial; reembolso separado    | Gasto/recibo/pagador propio                    | Corrección, estados, importes y separación de recuperación cliente                 |
| Archivos                     | Subida/consulta autorizada, versiones y paquetes        | Solo archivos permitidos de su ámbito          | Bytes guardados/descargados, hash, reinicio/restore, cuarentena y denegación ajena |
| Facturación/cobros           | Borrador, emitir, PDF, corrección, cobro y reverso      | Acceso denegado                                | Inmutabilidad, no duplicación, reconciliación y estados veraces                    |
| Compensación                 | Configuración y obligaciones por trabajador             | My Pay exclusivamente propio                   | Cálculo y declaración de pago sin inventar transferencias                          |
| Finanzas/exportación         | Preview, caja, ledger, accounting, informes internos    | Acceso denegado                                | Moneda/entidad/fuente, formatos independientes y ausencia de filtraciones          |
| Ayuda/avisos                 | Guías y avisos propios                                  | Guías permitidas y avisos propios              | PDF correcto, no-store, revisión visible, lectura y destinos autorizados           |
| Interfaz                     | Flujos de escritorio y móvil                            | Flujos de escritorio y móvil                   | Etiquetas, teclado, geometría útil y resultados reales, no solo ancho de página    |

Los resultados concretos, fallos encontrados y limitaciones se añadirán al ejecutar cada fase. No se etiqueta una función como verificada por mera presencia de código o texto del manual.
