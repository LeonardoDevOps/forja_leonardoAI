# Plan 009: Autenticar los webhooks de Telegram, Twilio y ManyChat

> **Instrucciones para el ejecutor**: sigue este plan paso a paso. No cambies el
> comportamiento funcional de los mensajes legítimos. Prioriza fail-closed y
> pruebas de regresión negativas. Si ocurre una condición de parada, detente e
> informa. Al terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat 792bc637dd3b84b6c29440ea6aae9729794299b5..HEAD -- src/index.ts src/channels/telegram.ts src/channels/twilio.ts src/channels/manychat.ts src/env.ts`
> Si estos archivos cambiaron, vuelve a localizar los puntos de enrutado antes de
> editar. El contraste correcto es `src/index.ts:145-220` (Meta/WhatsApp) donde ya
> se valida `X-Hub-Signature-256`.

## Estado

- **Prioridad**: P0
- **Esfuerzo**: M
- **Riesgo**: LOW
- **Depende de**: ninguno
- **Categoría**: seguridad
- **Origen del hallazgo**: SEC-001 (HIGH, CONFIRMADO, PREEXISTENTE) — auditoría 2026-07-30
- **Planificado en**: commit `792bc63`, 2026-07-30

## Por qué importa

Los webhooks de Meta y WhatsApp Cloud validan la firma HMAC-SHA256 del cuerpo
crudo antes de parsear (`src/index.ts:145-220`). Los de **Telegram, Twilio y
ManyChat no verifican ninguna autenticidad**. Cualquiera que conozca la URL
pública del Worker (`*.workers.dev`, no secreta) puede:

- inyectar mensajes falsos que consumen presupuesto de LLM y de Cloudflare;
- por Twilio, provocar mensajes de WhatsApp **salientes facturados al dueño**
  hacia números arbitrarios (relay de spam / abuso de coste);
- envenenar el historial de conversaciones y el "flywheel" de aprendizaje;
- por Telegram, falsificar `from.id = OWNER_TELEGRAM_CHAT_ID`
  (`src/agent.ts:83-87`) para pausar el bot (DoS por conversación).

CWE-345 (falta de verificación de autenticidad) / OWASP API2. `SECURITY.md`
lista "ausencia de validación de firmas de webhooks" en alcance, y `plans/002`
marca la revisión de firmas como hecha: este plan cierra ese _drift_.

## Estado actual (evidencia)

- `src/index.ts:107` — `app.post("/webhooks/telegram", (c) => routeToAgent(c, telegramAdapter))` sin comprobar header.
- `src/index.ts:108` — `app.post("/webhooks/manychat", (c) => routeToAgent(c, manychatAdapter))` sin secreto.
- `src/index.ts:112` — `app.post("/webhooks/twilio", …)` llama a `twilioAdapter.parseIncoming` sin validar firma.
- `src/channels/telegram.ts:38` y `src/channels/twilio.ts:6` — los adaptadores no reciben ni verifican secreto/firma.
- Patrón correcto a imitar: `verifyMetaSignature(raw, sig, secret)` en `src/channels/meta.ts` + su uso en `src/index.ts`.

## Diseño de la solución

Toda verificación ocurre en `src/index.ts` **antes** de parsear o enrutar, y es
**fail-closed**: si el secreto no está configurado o no coincide, se responde el
código HTTP que el proveedor espera y **no** se ejecuta el LLM.

1. **Telegram** — al registrar el webhook (`setWebhook`) se fija un
   `secret_token`; Telegram lo reenvía en el header
   `X-Telegram-Bot-Api-Secret-Token` en cada POST. Comparar (timing-safe) contra
   `env.TELEGRAM_WEBHOOK_SECRET`. Si no coincide → `401`/`403` sin procesar.
2. **Twilio** — validar `X-Twilio-Signature`: HMAC-SHA1 con el `TWILIO_AUTH_TOKEN`
   sobre la URL pública exacta del webhook concatenada con los parámetros del
   formulario **ordenados alfabéticamente** (`clave+valor`), en base64, comparado
   timing-safe. La URL debe ser la que Twilio firmó: derivarla de
   `DASHBOARD_BASE_URL` (o `TWILIO_WEBHOOK_URL` si se añade) + path, no de
   `c.req.url` si hay proxy. Si no coincide → responder TwiML vacío `200` (para
   no gatillar reintentos) pero **sin** ingerir el mensaje. Registrar el rechazo.
3. **ManyChat** — no ofrece firma nativa. Exigir un secreto compartido
   `env.MANYCHAT_WEBHOOK_SECRET` presentado como header personalizado
   (configurable en el "External Request" de ManyChat, p. ej.
   `X-Forja-Webhook-Secret`) **o** como segmento de path no adivinable. Comparar
   timing-safe. Si falta o no coincide → `403` sin procesar.

Reutiliza un helper `timingSafeEqual` (ya existe en `src/admin/auth.ts` y
`src/channels/whatsapp.ts`): extrae uno compartido a `src/http-auth.ts` o a un
`src/crypto.ts` en lugar de duplicarlo por tercera vez.

## Alcance

**Dentro del alcance — archivos modificables/creables:**

- `src/index.ts` — añadir verificación por ruta antes de enrutar.
- `src/channels/telegram.ts`, `src/channels/twilio.ts` — solo si conviene mover
  la verificación al adaptador (opcional; preferir `index.ts`).
- `src/env.ts` — declarar `TELEGRAM_WEBHOOK_SECRET`, `MANYCHAT_WEBHOOK_SECRET` y,
  si se usa, `TWILIO_WEBHOOK_URL`.
- `src/http-auth.ts` (o `src/crypto.ts`) — helper `timingSafeEqual` compartido +
  helper de firma Twilio.
- Tests: `test/channels/telegram.test.ts`, `test/channels/twilio.test.ts`,
  `test/channels/manychat.test.ts`, `test/index.test.ts` — casos positivos y
  negativos.
- `skill/configurar-mi-chatbot.md` y
  `skill/references/channel-setup-guides/{telegram-botfather,twilio-whatsapp,manychat-webhook}.md`
  — instruir el registro del secreto (con `wrangler secret put`, nunca en chat).
- `README.md` / `SECURITY.md` — reflejar que los tres canales ya autentican.
- `plans/README.md`.

**Fuera de alcance:**

- Tocar Meta/WhatsApp Cloud (ya autentican).
- Cambiar el parsing de mensajes, la lógica del agente o el formato de respuesta.
- Rate limiting global (es el plan 010/otra iteración).
- Modificar `member/`, sustituir placeholders de `wrangler.toml`, leer/mostrar
  secretos, desplegar o publicar npm.

## Flujo Git

- Rama: `advisor/009-authenticate-webhooks`.
- Commits sugeridos:
  - `feat(security): verify telegram webhook secret token`
  - `feat(security): validate twilio request signature`
  - `feat(security): require shared secret for manychat webhook`
  - `docs: document webhook authentication setup`
- No publicar ni abrir PR salvo instrucción expresa.

## Pasos

### Paso 1: Helper de comparación y firma

Extrae un `timingSafeEqual(a, b)` compartido (elimina las copias de
`src/admin/auth.ts` y `src/channels/whatsapp.ts` reusándolo). Añade
`twilioExpectedSignature(url, params, authToken)` que implemente el algoritmo
oficial (URL + params ordenados, HMAC-SHA1, base64) usando `crypto.subtle`.

**Verificar**: pruebas unitarias del helper con vectores conocidos (positivo,
un byte cambiado → false, longitudes distintas → false).

### Paso 2: Telegram

En `src/index.ts`, antes de `routeToAgent(c, telegramAdapter)`, lee
`X-Telegram-Bot-Api-Secret-Token` y compáralo con `env.TELEGRAM_WEBHOOK_SECRET`.
Fail-closed: si el secreto no está configurado o no coincide, responde `403` y no
enrutes. No filtres detalle del error.

**Verificar**: POST sin header → 403; con header incorrecto → 403; con header
correcto → se ingiere (mock del DO). El bot NO se pausa con un `from.id` de owner
falsificado si la firma no cuadra.

### Paso 3: Twilio

Deriva la URL pública del webhook (de `DASHBOARD_BASE_URL`/`TWILIO_WEBHOOK_URL`),
lee el `formData`, calcula la firma esperada y compárala con `X-Twilio-Signature`.
Solo si coincide, continúa con `twilioAdapter.parseIncoming`. Si no, responde
TwiML vacío `200` sin ingerir. Fail-closed cuando falte `TWILIO_AUTH_TOKEN` o la
URL configurada.

**Verificar**: firma válida → ingiere; firma inválida/ausente → no ingiere y no
hay llamada saliente; parámetros reordenados producen la misma firma.

### Paso 4: ManyChat

Exige `env.MANYCHAT_WEBHOOK_SECRET` vía header `X-Forja-Webhook-Secret` (o path
`/webhooks/manychat/:secret`). Comparación timing-safe. Fail-closed → `403`.

**Verificar**: sin secreto configurado → 403; header incorrecto → 403; correcto
→ ingiere. `learn/:channel` mantiene su semántica (evaluar si también debe
protegerse; documentar la decisión).

### Paso 5: Env, documentación y guías de setup

Declara las variables en `src/env.ts`. Actualiza las guías de canal y el skill de
configuración para: (a) generar un secreto aleatorio, (b) guardarlo con
`wrangler secret put …` (nunca pegarlo en el chat), (c) en Telegram, incluir
`secret_token` al llamar `setWebhook`, (d) en ManyChat, añadir el header en el
"External Request". Refleja en `README.md`/`SECURITY.md` que los tres canales ya
autentican y elimina el _drift_ documental.

**Verificar**: las guías no piden pegar secretos en chat ni en logs.

### Paso 6: CI local y revisión

**Verificar**:

```powershell
corepack pnpm@10.34.5 check:ci
git diff --check
git diff --name-only
```

Todo pasa y solo aparecen archivos de alcance.

## Plan de pruebas

- Positivos: cada canal ingiere solo con secreto/firma válidos.
- Negativos (regresión del hallazgo): header/firma ausente o incorrecta → no se
  ingiere, no se llama al LLM, no hay salida a Twilio; owner falsificado en
  Telegram no pausa el bot.
- Sin red real: proveedores, D1 y firma se prueban con mocks/vectores.
- Fail-closed: secreto no configurado → rechazo, nunca "abierto por defecto".

## Criterios de terminado

- [ ] Telegram valida `X-Telegram-Bot-Api-Secret-Token` (timing-safe, fail-closed).
- [ ] Twilio valida `X-Twilio-Signature` sobre URL+params antes de ingerir.
- [ ] ManyChat exige secreto compartido (header o path), fail-closed.
- [ ] Meta/WhatsApp intactos; parsing y respuestas sin cambios funcionales.
- [ ] Pruebas negativas cubren cada canal y demuestran el bloqueo del abuso.
- [ ] Guías de setup y `README`/`SECURITY` actualizados sin exponer secretos.
- [ ] `check:ci` y `git diff --check` pasan; solo archivos de alcance.
- [ ] `plans/README.md` marca el plan como completado.

## Condiciones de parada

Detente e informa si:

- validar Twilio exige conocer la URL pública real y no hay forma de derivarla de
  configuración no secreta;
- fail-closed rompería una instalación existente sin una ruta de migración clara
  (documenta la migración: fijar el secreto y re-registrar el webhook);
- confirmar un caso requiere un proveedor, secreto o servicio real;
- sería necesario tocar `member/`, `wrangler.toml`, secretos, desplegar o npm.

## Resultado de ejecución

Implementado el 2026-07-30 en `advisor/009-authenticate-webhooks`.

- Los tres webhooks fallan cerrados antes del parseo y la ingestión.
- `/webhooks/learn/manychat` reutiliza el secreto de ManyChat para evitar
  capturas envenenadas; los demás canales de aprendizaje conservan su
  semántica.
- Las firmas se validaron sin red real con el vector oficial de Twilio y mocks
  del Durable Object.
- Lint, tipos, 520 pruebas, cobertura y `git diff --check` pasan. El comando
  agregado `check:ci` se detiene solamente por finales CRLF heredados en 195
  archivos no modificados; el formato de todos los archivos de este plan sí
  pasa. La normalización global queda fuera de alcance y se sigue en el plan 011.
