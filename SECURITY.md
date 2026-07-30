# Política de seguridad

## Versiones soportadas

| Versión                        | Soporte        |
| ------------------------------ | -------------- |
| Rama `main`                    | Sí             |
| Commits o versiones anteriores | No garantizado |

Las correcciones de seguridad se preparan primero para `main`. Quien mantenga una
instalación propia debe revisar y aplicar esas actualizaciones sin sustituir su
configuración privada de `member/`.

## Reportar una vulnerabilidad

Usa el reporte privado de **GitHub Security Advisories** de este repositorio
(`Security` → `Advisories` → `Report a vulnerability`). No publiques detalles
explotables, pruebas de concepto ni datos sensibles en un issue público.

Incluye, cuando sea posible:

- componente, ruta y versión o commit afectados;
- impacto y condiciones necesarias para reproducir el problema;
- pasos mínimos de reproducción sin datos reales;
- mitigación o corrección sugerida;
- forma segura de contactar contigo dentro del propio advisory.

No adjuntes credenciales, tokens, llaves, conversaciones reales ni datos de clientes.
Usa valores ficticios y elimina metadatos sensibles de capturas o archivos.

## Alcance

Se consideran especialmente relevantes:

- bypass de autenticación o autorización administrativa;
- bypass o ausencia de validación de firmas de webhooks;
- SSRF, inyección SQL o inyección de comandos;
- XSS en el panel o en notificaciones HTML;
- exposición de datos entre usuarios o negocios;
- filtración de secretos o datos de clientes;
- manejo inseguro de archivos, imágenes o audio;
- compromiso de dependencias o del proceso de actualización;
- abuso de herramientas controladas por prompts;
- prompt injection con consecuencias operativas;
- autorización insuficiente en endpoints administrativos o de control.

Los problemas de configuración que requieren exponer deliberadamente el panel, reutilizar
credenciales débiles o modificar el código pueden quedar fuera de alcance, pero se
agradece reportarlos de forma privada si producen un riesgo inesperado.

## Acceso administrativo y control-plane

El panel `/admin` siempre exige HTTP Basic Auth con el usuario `admin`.
`DASHBOARD_PASSWORD` debe tener al menos 16 caracteres; una configuración
ausente, vacía o corta devuelve `503` y no ejecuta ninguna ruta administrativa.
Las respuestas, incluidos los rechazos, llevan `Cache-Control: no-store`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y
`Referrer-Policy: no-referrer`.

Rota la contraseña con `wrangler secret put DASHBOARD_PASSWORD`, publica la
nueva versión y verifica el acceso sin reutilizar la credencial anterior. Usa
un valor aleatorio y exclusivo almacenado en un gestor de contraseñas; no lo
guardes en código, chats, logs ni `wrangler.toml`.

La API opcional `/api/*` falla cerrada y solo acepta
`CONTROL_PLANE_TOKEN` de al menos 32 caracteres. No se implementa backoff
local: el estado en memoria de un isolate de Workers no es compartido ni
durable, y añadir KV/Durable Objects solo para intentos fallidos complicaría el
despliegue. Para límites confiables por IP, configura Rate Limiting, WAF o
Cloudflare Access delante del Worker.

## Autenticación de webhooks

Forja verifica la autenticidad antes de parsear o enrutar mensajes:

- Telegram compara `X-Telegram-Bot-Api-Secret-Token` con
  `TELEGRAM_WEBHOOK_SECRET`;
- Twilio recalcula `X-Twilio-Signature` con `TWILIO_AUTH_TOKEN`, la URL pública
  exacta y todos los parámetros del formulario;
- ManyChat compara `X-Forja-Webhook-Secret` con
  `MANYCHAT_WEBHOOK_SECRET`;
- Meta y WhatsApp Cloud validan `X-Hub-Signature-256`.

La ausencia de configuración siempre rechaza la ingestión. Twilio responde con
TwiML vacío para evitar retries, pero no entrega el evento al agente. Las
instalaciones existentes deben configurar los nuevos secrets y volver a
registrar sus webhooks como parte de la actualización.

## Descarga de medios y egress

Forja valida las URLs de audio e imagen con una política cerrada por canal:
HTTPS, puerto estándar, ausencia de credenciales, bloqueo de hosts locales e IPs
privadas y una allowlist de hostnames exactos. Cada destino de redirección se
valida con la misma política. Los canales con CDN variable requieren
`MEDIA_ALLOWED_HOSTS`; sin esa configuración, el medio se rechaza y no se
descarga.

No se permiten comodines ni coincidencias por sufijo. Aun así, esta medida no
garantiza la IP o ASN final: Cloudflare Workers no ofrece a este código una
resolución DNS y conexión atómicas bajo una política de egress propia. Permanece
riesgo de DNS rebinding o compromiso en un hostname autorizado. Para entornos
que necesiten eliminar ese residual, usa un Service Binding o proxy de egress
con resolución DNS y controles de red confiables.

## Dependencias transitivas

La resolución de pnpm fija `@modelcontextprotocol/sdk 1.30.0` bajo
`agents 0.3.10`. Esa versión mantiene las protecciones de
`GHSA-345p-7cg4-v4c7` y admite de forma oficial
`@hono/node-server ^1.19.9 || ^2.0.5`. El override de Hono selecciona 2.0.12 y
cierra `GHSA-frvp-7c67-39w9` sin actualizar `agents` a una serie pre-1.0
incompatible.

El lockfile debe instalarse siempre con `--frozen-lockfile`.
`pnpm security:audit` revisa desde severidad LOW y el workflow
`Dependency Audit` ejecuta semanalmente la instalación, todos los gates de
calidad y la auditoría. La política, cadencia y registro de overrides están en
la [guía de mantenimiento](./docs/dependency-maintenance.md). La migración
deliberada de `agents` se mantiene separada en el
[plan 016](./plans/016-migrar-agents-0-20.md).

## Gobernanza de alertas y controles del repositorio

La cuenta administradora del repositorio es responsable de revisar semanalmente,
cada lunes, las alertas de CodeQL y Dependabot. La severidad determina el plazo
de triaje:

- `CRITICAL` y `HIGH`: evaluar en un día laborable y bloquear releases hasta
  corregirlas o documentar un descarte revisado;
- `MEDIUM`: evaluar en la revisión semanal y asignar corrección, mitigación o
  fecha de reevaluación;
- `LOW`: revisar mensualmente y agrupar el mantenimiento compatible.

Una alerta `HIGH` solo puede cerrarse sin cambio de código cuando la
justificación registra alcance, alcanzabilidad, impacto, mitigación, evidencia y
fecha de reevaluación, y otra persona con permisos de mantenimiento la revisa.
Mientras el repositorio tenga un único mantenedor, esas alertas deben corregirse
o esperar a que se incorpore un segundo revisor: no se acepta la
autoaprobación. La revisión dedicada del CLI y sus criterios están registrados
en el [plan 012](./plans/012-revision-seguridad-cli.md).

`main` exige una rama actualizada, una aprobación, resolución de conversaciones
y los checks `Node 22`, `Node 24` y `JavaScript y TypeScript` (CodeQL). Los
pushes forzados y la eliminación de la rama están deshabilitados. Existe un
bypass administrativo temporal porque solo hay una cuenta con permisos de
escritura; debe retirarse al incorporar un segundo mantenedor para evitar
bloquear todos los merges.

Dependency Graph, Dependabot Alerts y Dependabot Security Updates permanecen
habilitados. Las actualizaciones se ejecutan semanalmente según
`.github/dependabot.yml` y siempre requieren revisión: un PR automatizado no
autoriza cambios en `member/`, placeholders de `wrangler.toml`, secretos ni
configuración privada.

Dependency Review bloquea nuevas dependencias `HIGH` cuando GitHub permite
consultar la API. GitHub devuelve `403` para ese análisis en pull requests de
forks; por ello el workflow lo omite explícitamente en este fork y no debe
interpretarse como un gate efectivo. Al portar los cambios a un repositorio
canónico, debe verificarse que `Revisar dependencias` se ejecute y quede verde.

## Operación segura en Cloudflare

El [runbook de producción en Cloudflare](./docs/cloudflare-production-runbook.md)
exige entornos y recursos separados, rotación interactiva sin registrar valores,
Access/WAF y Rate Limiting delante de `/admin` y `/api`, pruebas positivas y
negativas en staging, monitorización y una versión estable preparada para
rollback.

El gate `pnpm cloudflare:preflight` valida únicamente evidencia redactada y
falla cerrado si falta un control. No consulta Cloudflare, no lee secretos y no
autoriza por sí solo una promoción. El residual DNS se acepta temporalmente
hasta el 2026-09-30; debe cerrarse con un proxy/Service Binding probado o
reevaluarse antes de esa fecha.

## Auditoría de preparación para producción

El [informe de auditoría y endurecimiento](./docs/auditoria-produccion-2026-07-30.md)
compara el fork con la base original, registra las vulnerabilidades por
severidad, resume los siete PR aplicados y documenta los riesgos residuales y
las acciones pendientes antes de un despliegue.

## Respuesta

Los mantenedores intentarán confirmar la recepción, evaluar severidad y acordar una
divulgación coordinada. El tiempo de corrección depende del impacto y de la compatibilidad
con instalaciones existentes. No se garantiza recompensa económica.
