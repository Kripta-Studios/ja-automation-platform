# Release ZIP y despliegue en el VPS

El repositorio incluye un flujo reproducible para compilar la web pública, el portal y el worker de trabajos, crear un ZIP desde un commit revisado y copiarlo al VPS `kripta`.

## Requisitos locales

- Git con el árbol de trabajo limpio.
- PowerShell 7.
- pnpm `11.22.0`.
- Acceso SSH mediante el alias `kripta`.
- `scp`, `ssh` y `tar` en `PATH`.

El script ejecuta pnpm con Node `24.19.0`. Crea una base SQLite y un directorio de documentos temporales para el build del portal. No usa datos ni secretos de producción.

## Crear y subir el ZIP

Desde la raíz del repositorio:

```powershell
pwsh -File scripts/build-release-and-upload.ps1 -ReleaseDate 20260825
```

El comando realiza estas operaciones:

1. rechaza un árbol Git con cambios pendientes por defecto (usa `-AllowDirty` solo para empaquetar explícitamente el worktree revisado);
2. instala dependencias con `--frozen-lockfile`;
3. instala con `--frozen-lockfile` y, salvo `-SkipQualityGates`, ejecuta el `typecheck` recursivo;
4. compila `@ja/site`, `@ja/portal` y el worker de jobs;
5. crea `jaautomation-release-20260825-final.zip` desde `HEAD`;
6. escribe el SHA-256 local;
7. sube el ZIP y su archivo `.sha256` con nombres temporales y los renombra en `/home/kripta/` después de completar `scp`;
8. ejecuta `sha256sum -c` en el VPS y compara el SHA-256 remoto con el local;
9. sube el desplegador y su instalador a `/home/kripta/`.

Usa `-NoUpload` para crear y validar el ZIP sin copiarlo. Usa `-Force` para reemplazar un ZIP local del mismo día. `-AllowDirty` crea un índice Git temporal con el contenido actual del worktree, registra el `source_tree` en `RELEASE-BUILD.txt` y no crea ningún commit; úsalo solo después de revisar los cambios que se van a desplegar. `-SkipQualityGates` omite únicamente el `typecheck`; el script no ejecuta `format:check`, `lint`, E2E, backup/restore ni la matriz 360/390/768/1440. No uses esta opción para una entrega al cliente.

## Contenido del ZIP

El ZIP contiene una carpeta superior `jaautomation-release-YYYYMMDD/`. El script archiva estos
paths del árbol revisado:

```text
.dockerignore
.env.example
.gitignore
.node-version
.nvmrc
README.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json
eslint.config.js
prettier.config.mjs
vitest.config.ts
playwright.config.ts
playwright.mvp.config.ts
website/
apps/
packages/
migrations/
deployment/
docs/
scripts/
tests/
```

Además genera `RELEASE-BUILD.txt` y `RELEASE-MANIFEST.sha256` dentro de la carpeta superior.
El script excluye `.git`, `node_modules`, bases SQLite, documentos privados, cargas y salidas
locales de build porque no forman parte de la lista archivada. Los builds locales se ejecutan
antes de crear el archivo sobre el worktree actual; con un árbol limpio ese contenido coincide con
`HEAD`. Con `-AllowDirty`, `RELEASE-BUILD.txt` registra el `source_tree` del índice temporal y el
ZIP representa explícitamente el snapshot revisado, no `HEAD`. El VPS recompila las imágenes desde
los Dockerfiles fijados a Node `24.19.0` y pnpm `11.22.0`.

## Instalar el watcher y desplegar el ZIP subido

Revisa primero los dos scripts subidos:

```bash
less /home/kripta/install-jaautomation-zip-deploy.sh
less /home/kripta/jaautomation-zip-deploy
sha256sum /home/kripta/jaautomation-release-20260825-final.zip
```

Después ejecuta:

```bash
sudo bash /home/kripta/install-jaautomation-zip-deploy.sh \
  --archive /home/kripta/jaautomation-release-20260825-final.zip
```

El instalador conserva los servicios J&A existentes. Añade:

- `/usr/local/sbin/jaautomation-zip-deploy`;
- `jaautomation-zip-deploy.service`;
- `jaautomation-zip-deploy.path`;
- `jaautomation-zip-deploy.timer`;
- estado y bloqueo en `/var/lib/jaautomation-zip-deploy/`.

El despliegue explícito acepta el ZIP aunque ya estuviera en `/home/kripta/` cuando se creó la línea base. El watcher ignora los ZIP antiguos durante los escaneos automáticos.

## Operaciones del desplegador

El desplegador:

- comprueba estabilidad, integridad y rutas del ZIP;
- rechaza enlaces y tipos de archivo especiales;
- exige al menos 5 GiB libres;
- crea un backup online antes del cambio si existe la base de datos;
- valida Compose y construye las imágenes sin detener los contenedores actuales;
- conserva las imágenes anteriores con una etiqueta de rollback;
- valida el snippet de Caddy;
- cambia `/opt/jaautomation/current` y `JA_RELEASE_TAG`;
- espera la salud local del site y del portal;
- verifica las URLs públicas;
- restaura el release, las imágenes, el enlace, la etiqueta y Caddy si falla la activación.

El script no ejecuta el seed de demostración ni reemplaza `/var/lib/jaautomation/data` o `/var/lib/jaautomation/files`.

## Evidencia adicional antes de declarar `CLIENT READY`

El ZIP confirma la compilación y la integridad del archivo, pero no ejecuta la aceptación
funcional completa. En el mismo snapshot validado, ejecuta como mínimo:

```powershell
pnpm exec playwright test --project=phone-360 --project=phone-390 --project=tablet-768 --project=desktop
pwsh -File scripts/run-quality-gates.ps1 -IncludeE2E -IncludeOps
```

La primera orden cubre las cuatro anchuras representativas; la segunda añade los gates de
integración, seguridad, build, backup/restore y el resto de suites configuradas. Registra los
resultados y cualquier evidencia de VPS por separado. Un ZIP creado correctamente no transforma un
`PARTIAL`, `FAIL` o DoD abierto en `PASS`.

## Seguimiento

```bash
sudo journalctl -u jaautomation-zip-deploy.service -f
sudo systemctl status jaautomation-zip-deploy.path jaautomation-zip-deploy.timer --no-pager
sudo systemctl status jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer --no-pager
curl -fsS https://gex-dashboard.hopto.org/j-aautomation/en >/dev/null
curl -fsS https://gex-dashboard.hopto.org/j-aautomation/app/login >/dev/null
```

Crear un ZIP y desplegarlo no cambia el veredicto del checklist Client Essential. La entrega solo puede llamarse `CLIENT READY` cuando el checklist y las pruebas de release lo demuestren.
