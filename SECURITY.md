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

La resolución de pnpm fuerza `@modelcontextprotocol/sdk 1.26.0` bajo
`agents 0.3.10` para incorporar las protecciones de
`GHSA-345p-7cg4-v4c7` sin adoptar una actualización pre-1.0 incompatible de
`agents`. El lockfile debe instalarse siempre con `--frozen-lockfile` y
`pnpm audit --audit-level high` forma parte del control de supply chain.

Permanece un aviso moderado en `@hono/node-server 1.19.17`
(`GHSA-frvp-7c67-39w9`). En Forja no es alcanzable: el artefacto se ejecuta en
Cloudflare workerd y no importa el adaptador Node ni su `serve-static`
vulnerable en Windows. No se fuerza la major 2 transitiva. El residual debe
reevaluarse antes del 2026-09-30 o durante la siguiente migración de `agents`,
lo que ocurra primero.

## Respuesta

Los mantenedores intentarán confirmar la recepción, evaluar severidad y acordar una
divulgación coordinada. El tiempo de corrección depende del impacto y de la compatibilidad
con instalaciones existentes. No se garantiza recompensa económica.
