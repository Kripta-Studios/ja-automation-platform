# ANEXO D — Client Ready UAT

Fecha de preparación: 2026-09-04  
Rama: `codex/v3-production-completion-orchestrated-20260819`  
Release ejecutable: `297ff28e75283d8f93d3e91127d00802ba113a49`  
SHA-256 del ZIP desplegado: `89cce4a82b6e7a95a2c70110245488072bc8acf8487b96cd47d2e314d1236a44`

Este documento registra la aceptación humana y externa que no puede ser sustituida por pruebas
automatizadas. No adjuntar contraseñas, tokens, hashes de credenciales, cabeceras de autorización,
respuestas JMAP completas ni contenido privado de correo.

## Evidencia técnica ya cerrada

- [x] Web pública, portal y health: HTTP 200; readiness privada externa: HTTP 404.
- [x] Rutas EN/ES/PT de Home, Contact y Careers: HTTP 200.
- [x] Formulario real de Contact: HTTP 202.
- [x] Evento del formulario aceptado por Stalwart y persistido como `delivered`.
- [x] STARTTLS/TLS válido en SMTP 25, SMTPS 465, Submission 587 e IMAPS 993.
- [x] SQLite schema 35, `integrity_check=ok`, cero violaciones FK y un único Owner activo.
- [x] Jobs automáticos, timers, Caddy, portal, site, Stalwart y Roundcube operativos.
- [x] Backlog anterior al corte aislado sin reenvío masivo.
- [x] Backup local previo y material de rollback verificados.
- [x] La continuidad en un segundo servidor fue excluida como bloqueo por decisión del Owner.

Evidencia protegida en el VPS:

- `/var/log/jaautomation-client-essential-operations-evidence.json`
- `/var/log/jaautomation-client-ready-mail-evidence.json`
- `/var/log/jaautomation-anexo-d-preflight-evidence.json`

## D.1 — Aceptación de web y contenido

El aprobador debe revisar en 360, 390, 768 y 1440 px el contenido e imágenes acordados de Home,
Capabilities/Services, Industries, Projects, Aquarex, About, Careers, Contact, Employee Portal y las
secciones legales, además de las versiones EN/ES/PT.

- [ ] Contenido e imágenes aprobados por J&A.
- [ ] Navegación, formularios y textos localizados aprobados por J&A.
- [ ] Evidencia visual o referencia al paquete de capturas/trace adjunta.

Observaciones o referencia de evidencia: ************************\_************************

## D.3 — Aceptación de correo

### Recepción de la notificación de aplicación

Buscar en el buzón acordado el mensaje de prueba con asunto `New website contact request`, generado
el 2026-09-04 aproximadamente a las 03:45 Europe/Madrid.

- [ ] Antonny confirma que el mensaje llegó al buzón esperado.
- Fecha/hora observada: ********\_\_\_\_********
- Identificador no secreto o referencia redacted: ********\_\_\_\_********

### DNS y autenticación del remitente

El preflight ya observó MX hacia `mx1.j-aautomation.com`, SPF, DMARC `p=none`, autodiscover,
autoconfig y SRV de Submission/IMAPS. El PTR observado seguía siendo el nombre genérico de Hetzner y
el selector DKIM autoritativo no estaba documentado.

- [ ] Selector DKIM autoritativo identificado y su TXT verificado.
- [ ] Firma DKIM validada en un mensaje recibido externamente.
- [ ] PTR alineado con el hostname de correo aprobado, o excepción formalmente aceptada.
- [ ] SPF y DMARC revisados y aceptados para go-live.

Selector DKIM: ********\_\_\_\_******** Resultado: ********\_\_\_\_********

### Envío y recepción externos

Usar buzones controlados por los aprobadores. No copiar el contenido del mensaje a este documento;
registrar solo dirección redacted, fecha/hora, resultado e identificador no secreto.

- [ ] Envío desde una cuenta `@j-aautomation.com` a un proveedor externo recibido correctamente.
- [ ] Respuesta desde el proveedor externo recibida correctamente en J&A Webmail.
- [ ] Alias/forwarders e histórico migrado validados conforme al alcance contractual acordado.

Referencia de envío: ********\_\_\_\_******** Referencia de recepción: ********\_\_\_\_********

## Owner smoke — portal y asignaciones

Antonny debe iniciar sesión con su cuenta real, sin compartir la contraseña, y verificar:

- [ ] La cuenta aparece como único `owner_admin` y no exige MFA obligatorio.
- [ ] Proyectos → Equipo muestra Specialists y Mailboxes correctamente.
- [ ] Un usuario Worker activo aparece en los selectores de asignación de proyecto.
- [ ] Una asignación de prueba puede revisarse o realizarse según el procedimiento acordado.
- [ ] El directorio de buzones carga y las acciones autorizadas muestran mensajes comprensibles.

Observaciones: ************************************\_\_************************************

## Decisión y firmas

- [ ] J&A acepta D.1.
- [ ] J&A/EVOCON acepta D.3.
- [ ] Los aprobadores declaran el release `CLIENT READY`.

Nombre y cargo — J&A: ****************\_\_\_\_**************** Fecha: ********\_\_\_\_********

Firma — J&A: ************************************\_\_\_************************************

Nombre y cargo — EVOCON/segundo aprobador, si aplica: ****************\_****************

Firma: ************************\_\_\_\_************************ Fecha: ********\_\_\_\_********

Decisión final: `ACEPTADO / RECHAZADO / ACEPTADO CON OBSERVACIONES`

Observaciones finales: ********************************\_\_********************************
