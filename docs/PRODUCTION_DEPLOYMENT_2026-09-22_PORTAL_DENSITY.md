# Portal más despejado — despliegue del 22 de septiembre de 2026

Publicado en https://j-aautomation.com/j-aautomation/app a las 11:33:26 Europe/Madrid.

Más separación entre paneles, campos y acciones; etiquetas más legibles; filtros secundarios plegables; acciones por proyecto y administración bajo menús; historiales de equipo y aprobaciones concluidas desplegables; selector de tarea en configuración financiera. Se mantienen las operaciones, datos, permisos y semántica financiera. Los formularios conservan valores al plegarse, revelan errores y se expanden al imprimir.

Código de trabajo: `/home/kripta/ja-automation-platform-vps-hotfix`. Producción: `/opt/jaautomation/current`, release `0ba62783814af13aa36f3f9c0e6a6d3394499b12cad478dde89aec79f5dc672f`.

Seis manuales principales EN/PT-BR y tres guías rápidas regenerados con 112 capturas y 196 comprobaciones. Los nueve PDF instalados coinciden por hash. Descargas en [Ayuda del portal](https://j-aautomation.com/j-aautomation/app/help), según perfil. [Catálogo local](manuals/README.md). En el momento de este despliegue la revisión aún no se había subido a GitHub; su publicación posterior se registra en la evidencia de `github-release-20260922`.

Validación: 64 casos de navegador en cuatro tamaños; 187 pruebas focalizadas; cuatro pruebas de autorización de manuales; tipos y lint; revisión independiente. La última regresión y captura pasó 13 casos; el ajuste final para evitar el estiramiento de Nuevo proyecto se compiló y comprobó nuevamente en los cuatro tamaños, con cinco casos y capturas finales aprobados. Las exclusiones de captura por viewport se deben a que un único caso recorre todos los perfiles, idiomas y tamaños.

Producción: 594 archivos de ejecución idénticos, SQLite íntegro, cero errores FK, ocho tablas financieras y 59 archivos privados conservados. Respaldo previo verificado y dos ciclos automáticos posteriores correctos. Un 502 puntual del proxy durante la primera comprobación de login queda documentado; la segunda ejecución completa de seis páginas pasó sin errores. Su causa no se ha establecido. La retención histórica de backups sigue parcial: 14/30 días. No se repitió la aceptación funcional completa de 32 pasos.

Caché Docker: **6,861 GB liberados, 0 B restantes**. Imágenes, volúmenes y rollback conservados. Timers de tareas y respaldo, y watchers de despliegue activos.

[Evidencias y límites](evidence/portal-density-20260922/README.md).
