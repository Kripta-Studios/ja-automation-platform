# Despliegue MVP en `kripta`

## Estado comprobado el 18-08-2026

- Ubuntu 24.04, kernel 6.8.
- Docker 29.1.3 y Compose 2.40.3 activos.
- Caddy 2.11.4 activo en 80/443.
- 29 GiB libres tras la limpieza del disco.
- Los puertos 5100 y 5101 están libres.
- El `jaautomation.service` antiguo figura activo aunque no mantiene contenedores. Este despliegue lo reemplaza.
- Los ficheros `Servidor/jaautomation*.service` apuntan a una arquitectura PostgreSQL anterior. No se deben copiar.

## 1. Empaquetar y subir desde Windows

Después de confirmar el commit final:

```powershell
git archive --format=tar.gz -o jaautomation-mvp.tar.gz HEAD
scp .\jaautomation-mvp.tar.gz kripta:/tmp/
```

## 2. Crear el release en el VPS

Ejecuta:

```bash
ssh kripta
export JA_RELEASE="$(date +%Y%m%d-%H%M%S)"
sudo mkdir -p "/opt/j-aautomation/releases/$JA_RELEASE"
sudo tar -xzf /tmp/jaautomation-mvp.tar.gz -C "/opt/j-aautomation/releases/$JA_RELEASE"
sudo ln -sfn "/opt/j-aautomation/releases/$JA_RELEASE" /opt/j-aautomation/current
cd /opt/j-aautomation/current
sudo bash deployment/scripts/install-vps.sh
```

El instalador crea un backup del Caddyfile, añade un `import` antes del reverse proxy catch-all, valida Caddy y restaura el backup si falla.

## 3. Configurar el entorno

Genera el secreto y sustituye el placeholder:

```bash
SECRET="$(openssl rand -hex 32)"
sudo sed -i "s/CHANGE_ME_WITH_OPENSSL_RAND_HEX_32/$SECRET/" /etc/j-aautomation/portal.env
sudo chmod 600 /etc/j-aautomation/portal.env
sudo grep -vE 'SECRET|SMTP|RECIPIENT' /etc/j-aautomation/portal.env
```

El MVP se publica en `https://gex-dashboard.hopto.org/j-aautomation/`. `JA_DEMO_MODE=true` mantiene visibles los cuatro accesos demo. Cámbialo a `false` antes de usar cuentas reales.

## 4. Construir, sembrar y arrancar

La primera instalación crea la base demo. El comando de seed borra `app.db`; no vuelvas a ejecutarlo después de empezar a introducir datos que quieras conservar.

```bash
cd /opt/j-aautomation/current
sudo chown -R 10001:10001 /var/lib/j-aautomation
sudo -u '#10001' test -w /var/lib/j-aautomation
sudo docker compose --env-file /etc/j-aautomation/portal.env -f deployment/compose.production.yml --profile tools run --rm demo-seed
sudo systemctl restart jaautomation.service
sudo systemctl status jaautomation.service --no-pager
sudo docker compose --env-file /etc/j-aautomation/portal.env -f deployment/compose.production.yml ps
```

## 5. Verificar

```bash
cd /opt/j-aautomation/current
sudo bash deployment/scripts/verify-vps.sh
curl -I https://gex-dashboard.hopto.org/j-aautomation/en/
curl -I https://gex-dashboard.hopto.org/j-aautomation/app/login
sudo journalctl -u jaautomation.service -n 100 --no-pager
```

Abre:

- `https://gex-dashboard.hopto.org/j-aautomation/en/`
- `https://gex-dashboard.hopto.org/j-aautomation/app/login`

## Rollback

Conserva el nombre del release anterior y cambia el symlink:

```bash
sudo systemctl stop jaautomation.service
sudo ln -sfn /opt/j-aautomation/releases/RELEASE_ANTERIOR /opt/j-aautomation/current
sudo systemctl start jaautomation.service
sudo systemctl reload caddy
```

Las releases no contienen la base ni documentos. `/var/lib/j-aautomation` permanece intacto durante el rollback.

## Operación posterior

```bash
cd /opt/j-aautomation/current
sudo docker compose --env-file /etc/j-aautomation/portal.env -f deployment/compose.production.yml logs --tail=100 portal site
sudo systemctl status caddy jaautomation.service --no-pager
df -h /
```

Antes de un uso real: desactiva demo mode, configura cuentas/invitaciones, SMTP, backups externos, tax/legal text y escaneo de archivos.
