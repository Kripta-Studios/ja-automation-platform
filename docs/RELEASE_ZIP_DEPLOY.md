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
pwsh -File scripts/build-release-and-upload.ps1 -ReleaseDate 20260823
```

El comando realiza estas operaciones:

1. rechaza un árbol Git con cambios pendientes;
2. instala dependencias con `--frozen-lockfile`;
3. ejecuta `format:check`, `lint` y `typecheck`;
4. compila `@ja/site`, `@ja/portal` y el worker de jobs;
5. crea `jaautomation-release-20260823-final.zip` desde `HEAD`;
6. escribe el SHA-256 local;
7. sube el ZIP y su archivo `.sha256` con nombres temporales y los renombra en `/home/kripta/` después de completar `scp`;
8. ejecuta `sha256sum -c` en el VPS y compara el SHA-256 remoto con el local;
9. sube el desplegador y su instalador a `/home/kripta/`.

Usa `-NoUpload` para crear y validar el ZIP sin copiarlo. Usa `-Force` para reemplazar un ZIP local del mismo día. `-SkipQualityGates` omite formato, lint y typecheck; no debe usarse para una entrega al cliente.

## Contenido del ZIP

El ZIP contiene una carpeta superior `jaautomation-release-YYYYMMDD/`. Dentro aparecen los archivos necesarios para los Dockerfiles de producción:

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
website/
apps/portal/
packages/
migrations/
deployment/compose.production.yml
deployment/Dockerfile.site
deployment/Dockerfile.portal
deployment/Caddyfile.snippet
RELEASE-BUILD.txt
RELEASE-MANIFEST.sha256
```

El script empaqueta el contenido de Git `HEAD`. Excluye `.git`, `node_modules`, bases SQLite, documentos privados, cargas, resultados de pruebas y salidas locales de build. Los builds locales validan el commit. El VPS recompila las imágenes desde los Dockerfiles fijados a Node `24.19.0` y pnpm `11.22.0`.

## Instalar el watcher y desplegar el ZIP subido

Revisa primero los dos scripts subidos:

```bash
less /home/kripta/install-jaautomation-zip-deploy.sh
less /home/kripta/jaautomation-zip-deploy
sha256sum /home/kripta/jaautomation-release-20260823-final.zip
```

Después ejecuta:

```bash
sudo bash /home/kripta/install-jaautomation-zip-deploy.sh \
  --archive /home/kripta/jaautomation-release-20260823-final.zip
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

## Seguimiento

```bash
sudo journalctl -u jaautomation-zip-deploy.service -f
sudo systemctl status jaautomation-zip-deploy.path jaautomation-zip-deploy.timer --no-pager
sudo systemctl status jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer --no-pager
curl -fsS https://gex-dashboard.hopto.org/j-aautomation/en >/dev/null
curl -fsS https://gex-dashboard.hopto.org/j-aautomation/app/login >/dev/null
```

Crear un ZIP y desplegarlo no cambia el veredicto del checklist Client Essential. La entrega solo puede llamarse `CLIENT READY` cuando el checklist y las pruebas de release lo demuestren.
