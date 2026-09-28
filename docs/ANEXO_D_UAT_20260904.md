# ANEXO D — Client Ready UAT

Fecha de preparación: 2026-09-04

Rama: `codex/v3-production-completion-orchestrated-20260819`

Release ejecutable: `8d02bd5e32032e26895d3f5a5260620e3935ba6d`

SHA-256 del ZIP desplegado: `63c13b1d28ef9c29166e2a16dee592e639e374084a14ddebcb8d5dae6e9431a7`

Este documento registra la aceptación humana y externa que no puede ser sustituida por pruebas
automatizadas. No adjuntar contraseñas, tokens, hashes de credenciales, cabeceras de autorización,
respuestas JMAP completas ni contenido privado de correo.

## Evidencia técnica ya cerrada

- [x] Web pública, portal y health: HTTP 200; readiness privada externa: HTTP 404.
- [x] Rutas EN/ES/PT de Home, Contact y Careers: HTTP 200.
- [x] Formulario real de Contact: HTTP 202.
- [x] Evento del formulario aceptado mediante STARTTLS Submission autenticado y persistido como
      `delivered`.
- [x] Recepción confirmada por el operador en `migration-test@j-aautomation.com`, con ubicación Inbox.
- [x] STARTTLS/TLS válido en SMTP 25, SMTPS 465, Submission 587 e IMAPS 993.
- [x] SQLite schema 35, `integrity_check=ok`, cero violaciones FK y un único Owner activo.
- [x] Dos PDFs localizados históricos atascados fueron reconciliados a `failed` reintentable, con
      intentos durables inmutables; no quedan variantes en estado `running`.
- [x] Jobs automáticos, timers, Caddy, portal, site, Stalwart y Roundcube operativos.
- [x] Backlog anterior al corte aislado sin reenvío masivo.
- [x] Backup local previo y material de rollback verificados.
- [x] La continuidad en un segundo servidor fue excluida como bloqueo por decisión del Owner.

Evidencia protegida en el VPS:

- `/var/log/jaautomation-client-essential-operations-evidence.json`
- `/var/log/jaautomation-client-ready-mail-evidence.json`
- `/var/log/jaautomation-client-ready-mail-acceptance-20260904.json`
- `/var/log/jaautomation-client-ready-pdf-recovery-20260904.json`
- `/var/log/jaautomation-dkim-preflight-20260904.json`
- `/var/log/jaautomation-anexo-d-preflight-evidence.json`
- `/var/log/jaautomation-uat-visual-20260904-85a407c/SHA256SUMS`

## D.1 — Aceptación de web y contenido

El aprobador debe revisar en 360, 390, 768 y 1440 px el contenido e imágenes acordados de Home,
Capabilities/Services, Industries, Projects, Aquarex, About, Careers, Contact, Employee Portal y las
secciones legales, además de las versiones EN/ES/PT.

- [ ] Contenido e imágenes aprobados por J&A.
- [ ] Navegación, formularios y textos localizados aprobados por J&A.
- [x] Evidencia visual técnica adjunta: 124 capturas del sitio desplegado en EN/ES/PT a 360, 390,
      768 y 1440 px, más login del portal; manifiesto en
      `/var/log/jaautomation-uat-visual-20260904-85a407c/SHA256SUMS`.

Observaciones o referencia de evidencia: `[pendiente de aprobación J&A]`

## D.3 — Aceptación de correo

### Recepción de la notificación de aplicación

Se usó el buzón de aceptación `migration-test@j-aautomation.com` conforme a la instrucción del Owner.
El mensaje de prueba con asunto `New website contact request` se generó el 2026-09-04 aproximadamente
a las 11:11 Europe/Madrid.

- [x] El operador confirma que el mensaje llegó al buzón esperado y quedó en Inbox, no Junk.
- Fecha/hora observada: 2026-09-04; la hora exacta mostrada por Webmail no se registró.
- Referencia redacted: `/var/log/jaautomation-client-ready-mail-acceptance-20260904.json`.

### DNS y autenticación del remitente

El preflight autoritativo del 2026-09-04 observó MX hacia `mx1.j-aautomation.com`, SPF
`v=spf1 a mx ~all`, DMARC `p=none`, autodiscover, autoconfig y SRV de Submission/IMAPS. Stalwart
declara gestión DKIM `Automatic`, habilita RSA-SHA256 y Ed25519-SHA256, y usa la plantilla de selector
`v{version}-{algorithm}-{date-%Y%m%d}`. La clave restringida del portal devuelve `forbidden` al
enumerar objetos de firma DKIM, que es el resultado correcto para su alcance de mínimo privilegio;
no se ampliaron sus permisos. El PTR sigue siendo el nombre genérico de Hetzner y no está alineado
con `mx1.j-aautomation.com`. Esta configuración no identifica por sí sola el selector generado ni
demuestra su TXT público o una firma recibida externamente.

- [ ] Selector DKIM autoritativo identificado y su TXT verificado.
- [ ] Firma DKIM validada en un mensaje recibido externamente.
- [ ] PTR alineado con el hostname de correo aprobado, o excepción formalmente aceptada.
- [ ] SPF y DMARC revisados y aceptados para go-live.

Selector DKIM: `[pendiente]` Resultado: `[pendiente]`

Referencia redacted del preflight:
`/var/log/jaautomation-dkim-preflight-20260904.json` (`root:root`, modo `0600`).

### Envío y recepción externos

Usar buzones controlados por los aprobadores. No copiar el contenido del mensaje a este documento;
registrar solo dirección redacted, fecha/hora, resultado e identificador no secreto.

- [ ] Envío desde una cuenta `@j-aautomation.com` a un proveedor externo recibido correctamente.
- [ ] Respuesta desde el proveedor externo recibida correctamente en J&A Webmail.
- [ ] Alias/forwarders e histórico migrado validados conforme al alcance contractual acordado.

Referencia de envío: `[pendiente]` Referencia de recepción: `[pendiente]`

## Owner smoke — portal y asignaciones

Antonny debe iniciar sesión con su cuenta real, sin compartir la contraseña, y verificar:

- [ ] La cuenta aparece como único `owner_admin` y no exige MFA obligatorio.
- [ ] Proyectos → Equipo muestra Specialists y Mailboxes correctamente.
- [ ] Un usuario Worker activo aparece en los selectores de asignación de proyecto.
- [ ] Una asignación de prueba puede revisarse o realizarse según el procedimiento acordado.
- [ ] El directorio de buzones carga y las acciones autorizadas muestran mensajes comprensibles.

Observaciones: `[pendiente del smoke del Owner]`

## Decisión y firmas

- [ ] J&A acepta D.1.
- [ ] J&A/EVOCON acepta D.3.
- [ ] Los aprobadores declaran el release `CLIENT READY`.

Nombre y cargo — J&A: `[pendiente]` Fecha: `[pendiente]`

Firma — J&A: `[pendiente]`

Nombre y cargo — EVOCON/segundo aprobador, si aplica: `[pendiente]`

Firma: `[pendiente]` Fecha: `[pendiente]`

Decisión final: `ACEPTADO / RECHAZADO / ACEPTADO CON OBSERVACIONES`

Observaciones finales: `[pendiente]`
