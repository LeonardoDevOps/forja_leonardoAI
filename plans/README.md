# Backlog de endurecimiento y modernización

Este backlog da trazabilidad al trabajo iniciado desde
`ffe32d87c9615945079eb9d073e6c6a51a71c8e9` en la rama
`chore/forja-hardening-20260729-1700`.

La segunda ola de remediación fue planificada el 2026-07-29 en
`c9025b99a76950a659c6bd6c731d63073394a12c`. Los planes 005–008 están escritos
para ejecutores sin contexto previo: deben leerse completos, respetar sus
condiciones de parada y actualizar aquí su estado.

## Reglas de ejecución

- No modificar `member/` ni sustituir placeholders de `wrangler.toml`.
- No leer o modificar secretos, desplegar en Cloudflare, publicar npm ni fusionar en `main`.
- Conservar el comportamiento funcional y aplicar cambios pequeños, comprobables y revisables.
- Registrar evidencia local de cada validación en `.forja-reports/`, fuera del control de versiones.
- Corregir hallazgos de seguridad solo cuando sean demostrables, de riesgo bajo o medio y estén cubiertos
  por pruebas.

## Estado

| ID  | Plan                                                                             | Prioridad | Estado      | Dependencias  |
| --- | -------------------------------------------------------------------------------- | --------: | ----------- | ------------- |
| 001 | [Calidad, formato y reproducibilidad](./001-calidad-formato-reproducibilidad.md) |        P0 | Completado  | Ninguna       |
| 002 | [Tests, cobertura y seguridad del código](./002-tests-cobertura-seguridad.md)    |        P0 | Completado  | 001           |
| 003 | [CI y supply chain](./003-ci-supply-chain.md)                                    |        P0 | Completado  | 001, 002      |
| 004 | [Documentación, validación y entrega](./004-documentacion-validacion-entrega.md) |        P0 | Completado  | 001, 002, 003 |
| 005 | [Migrar `agents` 0.3.x y supply chain](./005-migrar-agents-0-3-supply-chain.md)  |        P1 | Completado  | Ninguna       |
| 006 | [Endurecer egress de medios y DNS](./006-endurecer-egress-medios-dns.md)         |        P1 | Completado  | Ninguna       |
| 007 | [Eliminar los 33 avisos ESLint](./007-eliminar-avisos-eslint.md)                 |        P1 | COMPLETADO  | 005, 006      |
| 008 | [Elevar cobertura administrativa](./008-elevar-cobertura-admin.md)               |        P2 | COMPLETADO  | Ninguna       |
| 009 | [Autenticar webhooks de canales](./009-autenticar-webhooks-canales.md)           |        P0 | COMPLETADO  | Ninguna       |
| 010 | [Endurecer acceso al panel](./010-endurecer-acceso-panel-admin.md)               |        P2 | COMPLETADO  | Ninguna       |
| 011 | [Higiene de dependencias y EOL](./011-higiene-deps-y-eol.md)                     |        P3 | COMPLETADO  | Ninguna       |
| 012 | [Revisión de seguridad del CLI](./012-revision-seguridad-cli.md)                 |        P0 | EN PROGRESO | Ninguna       |
| 013 | [Controles de seguridad del repo](./013-controles-seguridad-repo-github.md)      |        P1 | TODO        | 012           |
| 014 | [Preparación operativa Cloudflare](./014-preparacion-operativa-cloudflare.md)    |        P1 | TODO        | Ninguna       |
| 015 | [Mantenimiento de dependencias](./015-mantenimiento-dependencias-residuales.md)  |        P2 | TODO        | Ninguna       |

Estados permitidos para los planes pendientes: `TODO`, `EN PROGRESO`,
`COMPLETADO`, `BLOQUEADO: <motivo>` o `RECHAZADO: <motivo>`.

## Resultado del plan 009

Implementado el 2026-07-30 en la rama
`advisor/009-authenticate-webhooks`, creada desde `origin/main` en
`792bc63`.

- Telegram exige `X-Telegram-Bot-Api-Secret-Token` y falla cerrado si
  `TELEGRAM_WEBHOOK_SECRET` falta o no coincide.
- Twilio valida HMAC-SHA1/base64 sobre la URL pública exacta y todos los
  parámetros del formulario antes de ingerir. Las instalaciones con proxy
  pueden fijar `TWILIO_WEBHOOK_URL`.
- ManyChat exige `X-Forja-Webhook-Secret`; el mismo control protege
  `/webhooks/learn/manychat` para impedir capturas envenenadas.
- La comparación timing-safe y la firma Twilio viven en `src/http-auth.ts`; las
  copias de admin y WhatsApp se sustituyeron sin cambiar su comportamiento.
- Las guías separan las credenciales de API de los secretos de webhook y
  prohíben pegarlos en chats, código o plantillas.
- Validación: lint sin warnings, tipos, 520 pruebas y cobertura global
  (83,31 % líneas) superados; `src/http-auth.ts` queda al 100 % de líneas y el
  gate administrativo conserva sus 32 comparaciones.
- Desviación local documentada: `check:ci` se detuvo únicamente en el chequeo
  global de formato por los finales CRLF heredados del checkout de Windows
  (seguimiento en el plan 011). El formato de todos los archivos modificados,
  `git diff --check` y el resto de gates equivalentes sí pasan. No se
  normalizaron 195 archivos ajenos al alcance.

## Resultado del plan 010

Implementado el 2026-07-30 en la rama
`advisor/010-admin-access-hardening`, creada desde `origin/main` en
`98c891b`.

- El panel requiere siempre Basic Auth y rechaza configuraciones de
  `DASHBOARD_PASSWORD` ausentes o de menos de 16 caracteres con un `503` sin
  revelar el valor.
- Se retiró el bypass legado `DASHBOARD_PUBLIC`; las instalaciones que lo
  usaban deben guardar una contraseña fuerte antes de actualizar.
- Las respuestas admin conservan `no-store`, protección de framing, `nosniff` y
  política de referrer, incluidos los rechazos `401`/`503`.
- `/api/*` permanece fail-closed y ahora exige un
  `CONTROL_PLANE_TOKEN` de 32+ caracteres.
- No se añadió un backoff local no confiable ni infraestructura nueva. El
  residual y las opciones perimetrales se documentan en `README.md` y
  `SECURITY.md`.
- Validación: lint sin warnings, tipos, 526 pruebas, 83,35 % de cobertura de
  líneas y gate administrativo de 32 comparaciones superados.
- Desviación local: `check:ci` se detuvo solo en el formato global por CRLF
  heredado en 189 archivos fuera del cambio. El formato focal,
  `git diff --check` y todos los demás gates equivalentes pasan.

## Resultado del plan 011

Implementado el 2026-07-30 en la rama
`advisor/011-deps-and-eol-hygiene`, creada desde `origin/main` en `c4ba1c7`.

- `.gitattributes` normaliza a LF los archivos de texto y marca explícitamente
  los binarios habituales. `member/**` y `wrangler.toml` quedan fuera de la
  conversión forzada para respetar su propiedad y no fueron modificados.
- La normalización está aislada en `bfd15b6`; el checkout limpio confirma LF
  en los archivos de proyecto y `format:check` pasa en Windows.
- Se conserva `agents 0.3.10`. `agents 0.4.0` incorpora MCP 1.26.0, pero es una
  actualización pre-1.0 con cambios incompatibles para consumidores x402. En
  su lugar, `pnpm-workspace.yaml` fija de forma compatible
  `@modelcontextprotocol/sdk 1.26.0`; el lockfile contiene una única versión.
- `GHSA-345p-7cg4-v4c7` queda corregido: `pnpm audit --audit-level high` pasa
  con cero vulnerabilidades altas. Antes del cambio reportaba una alta y una
  moderada.
- Permanece una vulnerabilidad moderada en `@hono/node-server 1.19.17`
  (`GHSA-frvp-7c67-39w9`). Forja se ejecuta en workerd y no importa el
  adaptador Node ni `serve-static`, por lo que esa ruta no es alcanzable. No se
  fuerza la major 2; revisar antes del 2026-09-30 o al migrar `agents`.
- Validación en checkout limpio: instalación congelada, formato, ESLint sin
  avisos, tipos, 526 pruebas en 73 archivos, 83,35 % de líneas y las 32
  comparaciones del gate administrativo superadas.

## Resultado del plan 012

Implementado el 2026-07-30 en la rama
`advisor/012-cli-security-review`, creada desde `origin/main` en `1781ae4`.

- El CLI 1.1.18 analiza GZIP/TAR sin dependencias ni `tar` externo, con
  checksums estructurales, staging, límites y rechazo de traversal, rutas
  absolutas/Windows, symlinks, hardlinks, tipos especiales y duplicados.
- Todas las escrituras sensibles usan temporal exclusivo, `fsync` y `rename`;
  los destinos symlink/reparse y rutas fuera de la raíz se rechazan.
- Las actualizaciones preservan `wrangler.toml`, `.env*`, `.dev.vars*`,
  `member/*.local.ts`, `member/kb`, estados y marcador locales.
- Los servicios propios exigen origen HTTPS exacto y los payloads de red usan
  listas blancas. El falso positivo de Twilio compara ahora el hostname exacto.
- `X-Artifact-SHA256` se verifica cuando existe y puede exigirse con
  `FORJA_REQUIRE_ARTIFACT_INTEGRITY=1`. Residual: el backend no está en este
  repositorio y debe publicar el header antes de activar fail-closed por
  defecto.
- Validación parcial: sintaxis, formato focal, ESLint sin warnings, tipos,
  22 pruebas focales, 541 pruebas totales, 83,35 % de líneas y gate
  administrativo 32/32 superados. El `check:ci` definitivo se repite en un
  worktree limpio porque el checkout original materializa 130 archivos
  heredados como CRLF aunque Git y `.gitattributes` declaran LF.
- CodeQL remoto recalculará las alertas al publicar la rama; no se descartaron
  alertas por API.

## Orden y dependencias de la segunda ola

1. Ejecutar 005 y 006 primero; son independientes entre sí.
2. Ejecutar 007 después de ambos para tipar la API `agents` y la política de
   medios definitivas, evitando rehacer `agent.ts` y `transcribe.ts`.
3. Ejecutar 008 en paralelo con 005/006 o después; solo comparte
   `package.json`, por lo que debe reconciliar ese diff antes de añadir el gate.

## Decisiones de alcance

- No se desactiva ESLint ni se aceptan warnings heredados: el objetivo es cero
  avisos y `--max-warnings 0`.
- No se propone saltar directamente a la versión actual de `agents`; la
  transición solicitada se limita a 0.3.10 y documenta residuales transitivos
  sin forzar majors incompatibles.
- No se presenta una consulta DNS desde Workers como solución a rebinding. Sin
  egress confiable, se usa una allowlist exacta por canal y se mantiene el
  residual explícito.
- No se persigue cobertura mediante snapshots o exclusiones: se prueban
  estados, datos, errores y escapes, con umbral por archivo.

## Resultado de los planes 005 y 006

Implementados el 2026-07-29 en la rama combinada
`advisor/005-006-agents-media-security`. Se usó una sola rama porque ambos
planes fueron solicitados juntos y comparten `agent.ts`, pruebas y
documentación; se conservaron commits temáticos separados.

- `agents` pasó de 0.1.6 a 0.3.10 y su peer obligatorio React quedó en 19.0.0.
- El debounce usa `getSchedules`, `cancelSchedule` y `schedule`; no escribe
  `cf_agents_schedules` ni llama directamente a alarmas de storage.
- Wrangler pasó de 4.86.0 a 4.105.0 y el lockfile se deduplicó en
  `esbuild 0.28.1`.
- La auditoría pasó de 6 moderadas + 5 bajas a 1 alta + 1 moderada, sin bajas.
  Desaparecieron los tres avisos directos de `agents`, `uuid`, `x402`, el
  `ai` antiguo y los avisos de `esbuild`.
- El residual alto de `@modelcontextprotocol/sdk 1.25.2`
  (`GHSA-345p-7cg4-v4c7`) quedó cerrado en el plan 011 mediante un override
  compatible a 1.26.0, validado con la suite completa.
- Residual moderado: MCP mantiene `@hono/node-server 1.19.17`;
  `GHSA-frvp-7c67-39w9` requiere 2.0.5. Forja produce un Worker y no usa
  `serve-static` del adaptador Node en producción. No se fuerza la major 2.
  Revisar antes del 2026-09-30 o al migrar `agents`.
- Los medios usan hostnames exactos por canal. `MEDIA_ALLOWED_HOSTS` solo
  habilita CDNs variables; comodines, URLs, puertos, hosts locales y redirects
  no autorizados se rechazan.
- Riesgo DNS residual: un hostname aprobado comprometido todavía necesita un
  egress confiable para garantizar IP/ASN. Está documentado en README y
  SECURITY.
- Validación: instalación congelada, formato, tipos, 469 tests, cobertura
  (72,90% líneas globales), pruebas focales y diff pasaron. ESLint conserva los
  33 avisos inventariados para el plan 007.

## Resultado del plan 007

Implementado el 2026-07-29 en la rama `advisor/007-zero-eslint-warnings`, creada
sobre los planes 005 y 006 completados.

- Los 33 avisos `@typescript-eslint/no-explicit-any` fueron eliminados sin
  supresiones ni exclusiones nuevas.
- Las respuestas JSON, resultados de Workers AI y excepciones externas se
  tratan como `unknown` y se validan antes de leer propiedades.
- El bucle del agente usa `ModelMessage` y `LanguageModel` de AI SDK 6; las
  llamadas a herramientas conservan la inferencia de `streamText`.
- `@typescript-eslint/no-explicit-any` es error en producción y permanece
  desactivada únicamente para los dobles de `test/**/*.ts`.
- El script `lint` usa `eslint . --max-warnings 0`, por lo que cualquier aviso
  nuevo hace fallar CI.
- Validación: 11 archivos focales y 76 pruebas pasaron; `check:ci` completó
  formato, lint, tipos y 482 pruebas con cobertura global de 73,81% de líneas.

## Resultado del plan 008

Implementado el 2026-07-29 en la rama `advisor/008-admin-coverage`, creada
sobre el plan 007 completado.

- Se añadió un doble D1 reutilizable y determinista, con consultas parametrizadas,
  registro de operaciones y errores claros cuando una consulta esperada no está
  configurada.
- Las pruebas administrativas cubren uso de Twilio, costes, estadísticas,
  insights, campañas, base de conocimiento, conexiones y leads.
- Se ejercitan estados con y sin datos, errores, escape HTML, exportación CSV y
  respuestas externas simuladas, sin red real, sleeps ni snapshots.
- El gate `coverage:admin` exige por cada uno de los ocho módulos al menos 70%
  de líneas, statements y funciones, y 50% de branches. También falla si falta
  un archivo en el informe de cobertura.
- Los ocho módulos superan los umbrales; el menor resultado es 74,19% de
  branches en campañas y el menor resultado restante es 88,88% de funciones
  en conexiones.
- Validación focal: 16 archivos y 109 pruebas administrativas. Validación
  completa: formato, ESLint sin avisos, tipos y 507 pruebas; cobertura global
  de 82,62% de líneas. Las 32 comparaciones del gate administrativo pasaron.
- No se modificaron módulos de producción ni el comportamiento funcional.

## Línea base confirmada

- El árbol de trabajo estaba limpio antes de comenzar.
- `origin/main` y `upstream/main` apuntaban al mismo commit base.
- Entorno inicial: Node 24.18.0 y pnpm 11.9.0.
- El lockfile usa formato 9.0 y las herramientas de desarrollo estaban declaradas como `latest`.
- La instalación congelada reconoció el lockfile como sincronizado, pero pnpm 11 terminó con una política
  nueva de scripts de construcción; se normalizará una versión compatible dentro del rango requerido.
- La auditoría inicial detectó vulnerabilidades altas, tanto en herramientas de desarrollo como en cadenas
  transitivas de runtime; se evaluarán actualizaciones mínimas compatibles.
- La CI inicial solo validaba Node 20, tipos y tests, sin formato, lint, cobertura ni controles de supply chain.

## Cuarta ola — remediación del informe post-merge (2026-07-30)

Planificada a partir del **Informe de auditoría y endurecimiento para producción**
(commit de referencia `f7fdd77`, tras fusionar el informe). Las olas 001–011 están
completadas; esta recoge lo pendiente antes de considerar el sistema —y en especial
el **CLI**— apto para producción, ordenado por severidad:

1. **012 (P0)** — Revisión de seguridad **dedicada del CLI**: 14 alertas CodeQL
   abiertas (5 HIGH + 9 MEDIUM), todas en `cli/bin/cli.js` salvo una de test.
   Cubre integridad de la descarga y extracción anti tar-slip, TOCTOU, escrituras
   atómicas, file-to-network y la reconciliación del upstream CLI 1.1.18. **Bloquea
   usar el CLI como canal confiable de instalación/actualización.**
2. **013 (P1)** — Activar controles del repo: Dependabot Alerts/Graph, branch
   protection con CI Node 22/24 + CodeQL, y política de triage de alertas.
3. **014 (P1)** — Preparación operativa Cloudflare: secretos, Access/WAF/Rate
   Limiting en `/admin` y `/api`, egress para el residual DNS, staging y rollback.
4. **015 (P2)** — Mantenimiento de dependencias: reevaluar `@hono/node-server`
   (residual no alcanzable) antes del **2026-09-30**, migración deliberada de
   `agents` y cadencia de auditoría.

Residuales aceptados con seguimiento: DNS rebinding (requiere egress confiable),
ausencia de rate limiting dentro del Worker (se cubre en el borde, plan 014) y el
advisory MODERATE de `@hono/node-server` no alcanzable en workerd (plan 015).

## Definición de terminado

Los planes 001–004 permanecen completados. La segunda ola termina cuando
005–008 estén completados, las validaciones obligatorias se hayan ejecutado y
cualquier resultado no verde tenga causa, impacto, mitigación y seguimiento.
Cada ejecutor debe limitarse a su rama y no publicar, desplegar ni abrir PR salvo
instrucción expresa. Nunca se fusionará `main` desde estos planes.
