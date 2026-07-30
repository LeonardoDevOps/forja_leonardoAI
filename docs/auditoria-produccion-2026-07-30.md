# Informe de auditoría y endurecimiento de Forja para producción

- **Fecha de corte:** 30 de julio de 2026
- **Destinatario:** creador y mantenedores del repositorio original `santmun/forja`
- **Fork auditado:** `LeonardoDevOps/forja_leonardoAI`
- **Objetivo:** resumir los cambios realizados respecto del código original, la evolución de las
  vulnerabilidades y los pendientes antes de considerar una adopción en producción.

## 1. Resumen ejecutivo

El trabajo de endurecimiento partió del commit original
[`ffe32d8`](https://github.com/santmun/forja/commit/ffe32d87c9615945079eb9d073e6c6a51a71c8e9)
y terminó integrado en el fork mediante el commit
[`17098bc`](https://github.com/LeonardoDevOps/forja_leonardoAI/commit/17098bc62c016f576a5e2aa2d20fafe5207b4cdf).

Entre ambos puntos se fusionaron **7 pull requests**, con **40 commits** sobre la base común y
cambios en **173 archivos**: 9.450 líneas añadidas y 8.069 eliminadas. Una parte importante de
ese volumen corresponde al lockfile, normalización de formato, documentación y pruebas.

Resultados principales:

- autenticación fail-closed para Telegram, Twilio, ManyChat, Meta y WhatsApp Cloud;
- cierre de rutas directas de SSRF en medios y allowlist exacta por canal;
- validación de redirects, límites de tamaño, timeout y rechazo de destinos privados;
- eliminación de filtración de errores y escape seguro de contenido controlado por usuarios/LLM;
- panel administrativo siempre autenticado, sin bypass público, con credenciales mínimas y
  cabeceras de seguridad;
- migración de `agents 0.1.6` a `0.3.10` y sustitución del acceso a internals por la API pública;
- reducción del lockfile de 739 a 444 dependencias auditadas;
- reducción de **47 rutas vulnerables en el lock original** a **1 ruta moderada residual**;
- ESLint con cero warnings, tipos explícitos en fronteras externas y CI que bloquea regresiones;
- 526 pruebas, 83,35 % de cobertura de líneas y un gate administrativo por archivo;
- CI en Node 22 y 24, CodeQL, Dependabot configurado, Actions fijadas por SHA y permisos mínimos.

La conclusión no es una certificación de “cero riesgo”. Persisten:

1. **14 alertas CodeQL abiertas**: 5 HIGH y 9 MEDIUM, todas en código preexistente del CLI o en
   una aserción de test;
2. **1 advisory npm MODERATE** no alcanzable en el runtime workerd;
3. riesgo residual de DNS rebinding si se compromete un hostname autorizado;
4. ausencia de rate limiting distribuido dentro del Worker;
5. Dependabot Alerts deshabilitado en la configuración del fork;
6. configuración operativa y secretos que deben aplicarse en Cloudflare antes del despliegue.

Por tanto, el Worker/chatbot está significativamente más preparado para producción, pero el
**CLI requiere una revisión de seguridad dedicada** antes de usarlo como canal confiable de
instalación o actualización.

## 2. Alcance y línea base

| Elemento                 | Referencia                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base común auditada      | `ffe32d87c9615945079eb9d073e6c6a51a71c8e9`                                                                                                                          |
| `origin/main` endurecido | `17098bc62c016f576a5e2aa2d20fafe5207b4cdf`                                                                                                                          |
| `upstream/main` actual   | `3fd4142abfac537e64ff275651d37293b47ce609`                                                                                                                          |
| Divergencia actual       | upstream: 1 commit propio; fork: 40 commits propios                                                                                                                 |
| Comparación completa     | [ffe32d8...17098bc](https://github.com/LeonardoDevOps/forja_leonardoAI/compare/ffe32d87c9615945079eb9d073e6c6a51a71c8e9...17098bc62c016f576a5e2aa2d20fafe5207b4cdf) |

Después de la base común, upstream añadió
[`3fd4142`](https://github.com/santmun/forja/commit/3fd4142abfac537e64ff275651d37293b47ce609),
que modifica `cli/bin/cli.js` y `cli/package.json` para CLI 1.1.18. Ese commit no está integrado
en el fork auditado. Debe reconciliarse después de revisar las alertas CodeQL del CLI; no se
recomienda una fusión ciega.

La auditoría incluyó:

- comparación Git entre la base original y el fork fusionado;
- revisión de los siete PR y de los once planes de implementación;
- `pnpm audit --audit-level low` sobre el lockfile original y el actual;
- grafo efectivo de dependencias mediante pnpm;
- estado de CodeQL y Dependabot mediante la API de GitHub;
- validaciones de CI, pruebas, cobertura, lint, tipos y formato;
- revisión de restricciones: `member/`, `wrangler.toml`, secretos, despliegues y publicación npm.

## 3. Entregas fusionadas

| PR                                                              | Alcance                                                                             | Evidencia principal                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [#1](https://github.com/LeonardoDevOps/forja_leonardoAI/pull/1) | Calidad reproducible, SSRF/medios, escape HTML, errores, CI y política de seguridad | 452 tests; 72,56 % líneas; 0 HIGH/CRITICAL en la auditoría de aquel momento |
| [#2](https://github.com/LeonardoDevOps/forja_leonardoAI/pull/2) | `agents 0.3.10`, API pública de scheduling, supply chain y egress exacto            | 469 tests; 72,90 % líneas; cierre de 3 GHSA directos de `agents`            |
| [#3](https://github.com/LeonardoDevOps/forja_leonardoAI/pull/3) | Eliminación de 33 warnings ESLint y tipado de fronteras externas                    | 482 tests; 73,81 % líneas; `--max-warnings 0`                               |
| [#4](https://github.com/LeonardoDevOps/forja_leonardoAI/pull/4) | Cobertura administrativa y gate por archivo                                         | 507 tests; 82,62 % líneas; 32 controles de cobertura                        |
| [#5](https://github.com/LeonardoDevOps/forja_leonardoAI/pull/5) | Autenticación de webhooks                                                           | 520 tests; 83,31 % líneas                                                   |
| [#6](https://github.com/LeonardoDevOps/forja_leonardoAI/pull/6) | Panel y control-plane fail-closed                                                   | 526 tests; 83,35 % líneas                                                   |
| [#7](https://github.com/LeonardoDevOps/forja_leonardoAI/pull/7) | EOL reproducible y SDK MCP parcheado                                                | CI Node 22/24 y CodeQL ejecutados; auditoría sin HIGH                       |

## 4. Cambios realizados para producción

### 4.1 Seguridad del runtime y de las entradas

| Superficie original                                            | Cambio aplicado                                                                                                               | Estado    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| Telegram, Twilio y ManyChat aceptaban eventos sin autenticidad | Telegram exige secret token; Twilio valida HMAC-SHA1/base64 sobre URL y parámetros exactos; ManyChat exige secreto compartido | Corregido |
| Meta/WhatsApp Cloud                                            | Se conserva y prueba HMAC-SHA256 sobre el cuerpo crudo                                                                        | Protegido |
| Eventos falsos podían disparar LLM, costes, spam o aprendizaje | Verificación anterior al parseo y a la ingestión; fallo cerrado si falta configuración                                        | Corregido |
| URLs de medios externas controladas por payload                | Solo HTTPS, puerto estándar, sin credenciales, sin hosts locales/IP privadas                                                  | Mitigado  |
| Redirects de medios                                            | Cada destino se valida de nuevo, con máximo de redirects                                                                      | Corregido |
| Descargas sin límites operativos suficientes                   | Timeout de 15 s y máximo de 25 MiB, incluso sin `Content-Length`                                                              | Corregido |
| Host público arbitrario                                        | Allowlist exacta por canal; sin comodines ni coincidencias por sufijo                                                         | Corregido |
| Posible DNS rebinding de un hostname aprobado                  | Documentado; requiere proxy/Service Binding de egress para eliminarlo                                                         | Residual  |
| Excepciones de webhook devueltas al cliente                    | Respuesta genérica; detalle solo en logs                                                                                      | Corregido |
| Texto de usuario/LLM interpolado en email de handoff           | Escape HTML, saneado de subject, límites Zod y URL construida con `URL`                                                       | Corregido |
| Panel cacheable o embebible                                    | `no-store`, `DENY`, `nosniff` y `no-referrer`, incluidos rechazos                                                             | Corregido |

### 4.2 Autenticación administrativa

- `/admin/*` siempre exige Basic Auth; se eliminó el bypass `DASHBOARD_PUBLIC`.
- `DASHBOARD_PASSWORD` debe tener al menos 16 caracteres; si falta o es débil devuelve `503`.
- `/api/*` exige `CONTROL_PLANE_TOKEN` de al menos 32 caracteres.
- Las comparaciones sensibles son timing-safe.
- La rotación de credenciales quedó documentada.
- No se añadió un contador local engañoso: un isolate de Workers no proporciona rate limiting
  distribuido. Para producción se recomienda Cloudflare Access, WAF o Rate Limiting.

### 4.3 Dependencias y supply chain

- `agents`: `0.1.6` → `0.3.10`.
- Scheduling: se retiró la escritura en `cf_agents_schedules` y el uso directo de alarmas; ahora
  se usan `getSchedules`, `cancelSchedule` y `schedule`.
- React 19 se declaró como peer requerido por `agents`.
- Hono, Wrangler, Miniflare, TypeScript, Vitest y herramientas quedaron fijados.
- `@anthropic-ai/sdk` directo se retiró al no ser necesario.
- Se añadieron overrides compatibles para paquetes con parches de seguridad.
- `@modelcontextprotocol/sdk` se fuerza a `1.26.0`, que corrige
  [`GHSA-345p-7cg4-v4c7`](https://github.com/advisories/GHSA-345p-7cg4-v4c7).
- Se evitó forzar `@hono/node-server` 2.x porque es una major transitiva y el adaptador Node no
  se ejecuta en workerd.
- Instalación reproducible con pnpm 10.34.5 y `--frozen-lockfile`.

### 4.4 Calidad y pruebas

- ESLint 9 y TypeScript ESLint fijados.
- Los 33 warnings `no-explicit-any` fueron eliminados mediante tipos y validación de `unknown`.
- Cualquier warning nuevo hace fallar CI.
- Prettier y `.gitattributes` normalizan LF en código y documentación.
- `member/**` y `wrangler.toml` quedan fuera de la conversión forzada.
- Suite final: **73 archivos / 526 pruebas**.
- Cobertura final:

| Métrica    | Resultado |
| ---------- | --------: |
| Statements |   80,42 % |
| Branches   |   69,64 % |
| Functions  |   84,51 % |
| Lines      |   83,35 % |

- Gate administrativo para ocho módulos: mínimo 70 % en líneas/statements/functions y 50 % en
  branches, con **32/32 comparaciones PASS**.

### 4.5 CI y mantenimiento

- Matriz CI en Node 22 y 24.
- Instalación congelada, formato, ESLint, tipos y cobertura en cada PR.
- Actions fijadas a SHA, permisos mínimos, concurrencia y timeouts.
- CodeQL `security-extended` en PR, push, ejecución manual y semanal.
- Dependency Review configurado para bloquear nuevas dependencias HIGH en repositorios donde la
  API esté disponible.
- Dependabot configurado semanalmente para npm y GitHub Actions.
- Workflow de publicación npm endurecido, pero nunca ejecutado durante esta auditoría.
- Política `SECURITY.md` para reporte privado y divulgación coordinada.

## 5. Registro de vulnerabilidades por severidad

### 5.1 Interpretación de los conteos

La base de advisories cambia con el tiempo. La reauditoría realizada en la fecha de este informe
sobre el lockfile original encontró **47 rutas vulnerables**, correspondientes a **44 advisories
únicos**:

| Severidad npm | Rutas vulnerables | Advisories únicos |
| ------------- | ----------------: | ----------------: |
| CRITICAL      |                 0 |                 0 |
| HIGH          |                13 |                12 |
| MODERATE      |                27 |                26 |
| LOW           |                 7 |                 6 |
| **Total**     |            **47** |            **44** |

Algunos advisories cuentan más de una vez porque el mismo paquete aparece por varias cadenas.
Este reanálisis no sustituye la evidencia histórica: al fusionar el PR #1, el registro informaba
0 HIGH/CRITICAL, 6 MODERATE y 4 LOW; antes del plan 005 se registraron 6 MODERATE y 5 LOW.

### 5.2 Advisories HIGH del lockfile original

| Paquete   | Advisory y riesgo resumido                                                                                                                                                                                                                                   | Estado en el fork   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| axios     | [`GHSA-gcfj-64vw-6mp9`](https://github.com/advisories/GHSA-gcfj-64vw-6mp9) — proxy heredado en adaptador Node                                                                                                                                                | Eliminado/parcheado |
| fast-uri  | [`GHSA-4c8g-83qw-93j6`](https://github.com/advisories/GHSA-4c8g-83qw-93j6), [`GHSA-v2hh-gcrm-f6hx`](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) — confusión de host                                                                                   | Parcheado           |
| form-data | [`GHSA-hmw2-7cc7-3qxx`](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) — inyección CRLF                                                                                                                                                                  | Parcheado           |
| hono      | [`GHSA-88fw-hqm2-52qc`](https://github.com/advisories/GHSA-88fw-hqm2-52qc) — CORS con credenciales                                                                                                                                                           | Parcheado           |
| postcss   | [`GHSA-r28c-9q8g-f849`](https://github.com/advisories/GHSA-r28c-9q8g-f849) — path traversal/source map                                                                                                                                                       | Parcheado           |
| sharp     | [`GHSA-f88m-g3jw-g9cj`](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — vulnerabilidades heredadas de libvips                                                                                                                                           | Parcheado           |
| undici    | [`GHSA-hm92-r4w5-c3mj`](https://github.com/advisories/GHSA-hm92-r4w5-c3mj), [`GHSA-vmh5-mc38-953g`](https://github.com/advisories/GHSA-vmh5-mc38-953g), [`GHSA-vxpw-j846-p89q`](https://github.com/advisories/GHSA-vxpw-j846-p89q) — proxy/TLS/DoS WebSocket | Parcheado           |
| vite      | [`GHSA-fx2h-pf6j-xcff`](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) — bypass `server.fs.deny` en Windows                                                                                                                                              | Parcheado           |
| ws        | [`GHSA-96hv-2xvq-fx4p`](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) — agotamiento de memoria                                                                                                                                                          | Parcheado           |

**Estado actual npm HIGH: 0.**

### 5.3 Advisories MODERATE del lockfile original

| Paquete             | Advisories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Estado en el fork                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `@anthropic-ai/sdk` | [`GHSA-p7fg-763f-g4gf`](https://github.com/advisories/GHSA-p7fg-763f-g4gf)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Dependencia directa retirada                   |
| `@hono/node-server` | [`GHSA-frvp-7c67-39w9`](https://github.com/advisories/GHSA-frvp-7c67-39w9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **Residual vigente, no alcanzable en workerd** |
| `agents`            | [`GHSA-cvhv-6xm6-c3v4`](https://github.com/advisories/GHSA-cvhv-6xm6-c3v4), [`GHSA-r7x9-8ph7-w8cg`](https://github.com/advisories/GHSA-r7x9-8ph7-w8cg), [`GHSA-w5cr-2qhr-jqc5`](https://github.com/advisories/GHSA-w5cr-2qhr-jqc5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Corregidos con `agents 0.3.10`                 |
| axios               | [`GHSA-42h9-826w-cgv3`](https://github.com/advisories/GHSA-42h9-826w-cgv3), [`GHSA-7q8q-rj6j-mhjq`](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq), [`GHSA-f4gw-2p7v-4548`](https://github.com/advisories/GHSA-f4gw-2p7v-4548), [`GHSA-hcpx-6fm6-wx23`](https://github.com/advisories/GHSA-hcpx-6fm6-wx23), [`GHSA-jqh4-m9w3-8hp9`](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9), [`GHSA-mmx7-hfxf-jppx`](https://github.com/advisories/GHSA-mmx7-hfxf-jppx), [`GHSA-mwf2-3pr3-8698`](https://github.com/advisories/GHSA-mwf2-3pr3-8698), [`GHSA-pmv8-rq9r-6j72`](https://github.com/advisories/GHSA-pmv8-rq9r-6j72), [`GHSA-xj6q-8x83-jv6g`](https://github.com/advisories/GHSA-xj6q-8x83-jv6g) | Eliminados/parcheados                          |
| hono                | [`GHSA-hvrm-45r6-mjfj`](https://github.com/advisories/GHSA-hvrm-45r6-mjfj), [`GHSA-j6c9-x7qj-28xf`](https://github.com/advisories/GHSA-j6c9-x7qj-28xf), [`GHSA-rv63-4mwf-qqc2`](https://github.com/advisories/GHSA-rv63-4mwf-qqc2), [`GHSA-w62v-xxxg-mg59`](https://github.com/advisories/GHSA-w62v-xxxg-mg59), [`GHSA-wgpf-jwqj-8h8p`](https://github.com/advisories/GHSA-wgpf-jwqj-8h8p), [`GHSA-wwfh-h76j-fc44`](https://github.com/advisories/GHSA-wwfh-h76j-fc44), [`GHSA-xgm2-5f3f-mvvc`](https://github.com/advisories/GHSA-xgm2-5f3f-mvvc)                                                                                                                                                         | Parcheados                                     |
| undici              | [`GHSA-p88m-4jfj-68fv`](https://github.com/advisories/GHSA-p88m-4jfj-68fv), [`GHSA-pr7r-676h-xcf6`](https://github.com/advisories/GHSA-pr7r-676h-xcf6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Parcheados                                     |
| uuid                | [`GHSA-w5hq-g745-h8pq`](https://github.com/advisories/GHSA-w5hq-g745-h8pq)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Eliminado de las cadenas vigentes              |
| vite                | [`GHSA-v6wh-96g9-6wx3`](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Parcheado                                      |
| ws                  | [`GHSA-58qx-3vcg-4xpx`](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Parcheado                                      |

**Estado actual npm MODERATE: 1.**

El único residual es `@hono/node-server 1.19.17`, introducido por
`agents > @modelcontextprotocol/sdk`. La vulnerabilidad afecta a `serve-static` del adaptador
Node en Windows. Forja se ejecuta en Cloudflare workerd y no importa ese adaptador ni
`serve-static`, por lo que la ruta no es alcanzable en producción. No se forzó la major 2.x.
Revisión comprometida antes del **30 de septiembre de 2026** o al migrar `agents`.

### 5.4 Advisories LOW del lockfile original

| Paquete                  | Advisory                                                                                                                                               | Estado en el fork                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `@ai-sdk/provider-utils` | [`GHSA-866g-f22w-33x8`](https://github.com/advisories/GHSA-866g-f22w-33x8)                                                                             | Eliminado de la cadena vulnerable   |
| ai                       | [`GHSA-rwvc-j5jr-mgvh`](https://github.com/advisories/GHSA-rwvc-j5jr-mgvh)                                                                             | Parcheado                           |
| body-parser              | [`GHSA-v422-hmwv-36x6`](https://github.com/advisories/GHSA-v422-hmwv-36x6)                                                                             | Eliminado/parcheado por transitivas |
| esbuild                  | [`GHSA-g7r4-m6w7-qqqr`](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)                                                                             | Parcheado                           |
| undici                   | [`GHSA-35p6-xmwp-9g52`](https://github.com/advisories/GHSA-35p6-xmwp-9g52), [`GHSA-g8m3-5g58-fq7m`](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) | Parcheados                          |

**Estado actual npm LOW: 0.**

### 5.5 Evolución de la auditoría npm

| Momento                              | CRITICAL | HIGH | MODERATE | LOW | Nota                            |
| ------------------------------------ | -------: | ---: | -------: | --: | ------------------------------- |
| Reauditoría actual del lock original |        0 |   13 |       27 |   7 | 47 rutas / 44 advisories únicos |
| PR #1, después del primer hardening  |        0 |    0 |        6 |   4 | Evidencia histórica del PR      |
| Inicio del plan 005                  |        0 |    0 |        6 |   5 | Registro del plan               |
| Después de planes 005/006            |        0 |    1 |        1 |   0 | MCP HIGH + Hono MODERATE        |
| Estado final después del plan 011    |        0 |    0 |        1 |   0 | Solo Hono Node no alcanzable    |

La diferencia entre la primera y la segunda fila se debe a que el registro de advisories incorpora
hallazgos nuevos con el tiempo. No significa que el PR #1 ocultara trece HIGH; esas entradas no
formaban parte de la fotografía registrada entonces.

## 6. Hallazgos de seguridad de aplicación

| ID/área              | Severidad   | Hallazgo original                                                                           | Estado                        |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| SEC-001              | HIGH        | Webhooks Telegram, Twilio y ManyChat sin autenticación                                      | Corregido                     |
| SEC-002              | LOW         | Panel sin requisito de contraseña fuerte, bypass público y sin rotación documentada         | Corregido                     |
| Medios/SSRF          | MEDIUM      | Payload externo podía elegir hosts públicos arbitrarios; redirects y DNS añadían superficie | Mitigado con hosts exactos    |
| DNS rebinding        | Residual    | Un hostname aprobado comprometido puede cambiar de resolución                               | Requiere egress confiable     |
| Rate limiting admin  | Residual    | No existe backoff distribuido dentro del Worker                                             | Usar Access/WAF/Rate Limiting |
| Error disclosure     | No puntuada | Excepciones internas se devolvían al webhook                                                | Corregido                     |
| Inyección en email   | No puntuada | Texto de herramienta/LLM se interpolaba en HTML y subject                                   | Corregido                     |
| EOL/reproducibilidad | INFO        | CRLF rompía validaciones locales en Windows                                                 | Corregido                     |

## 7. Alertas CodeQL abiertas

El workflow CodeQL se ejecuta correctamente, pero GitHub mantiene **14 alertas abiertas**. Un
check CodeQL verde confirma que el análisis terminó; no confirma ausencia de hallazgos.

### 7.1 HIGH — 5 alertas

| Alertas        | Regla                                      | Ubicación                             | Evaluación                                                                                             |
| -------------- | ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| #4, #5, #6, #7 | `js/file-system-race`                      | `cli/bin/cli.js`: 559, 596, 839 y 912 | Posible TOCTOU; preexistente y pendiente de remediación                                                |
| #3             | `js/incomplete-url-substring-sanitization` | `test/campaigns.test.ts`:145          | Aserción de test preexistente; probable falso positivo, debe revisarse y descartarse con justificación |

### 7.2 MEDIUM — 9 alertas

| Alertas | Regla                    | Ubicación                                  | Evaluación                                                                                             |
| ------- | ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| #12–#16 | `js/http-to-file-access` | `cli/bin/cli.js`: 329, 478, 559, 565 y 577 | Datos de red escritos al filesystem; validar origen, path, tamaño, symlinks y atomicidad               |
| #8–#11  | `js/file-access-to-http` | `cli/bin/cli.js`: 434, 444, 1182 y 1416    | Datos de archivos enviados por red; confirmar consentimiento, destinos exactos y exclusión de secretos |

Las 13 alertas del CLI afectan a `cli/bin/cli.js`, archivo idéntico al de la base `ffe32d8`; no
fueron introducidas por el hardening. La alerta de test también señala una línea creada antes de
la auditoría. Sin embargo, que sean preexistentes no reduce la obligación de revisarlas.

Enlaces de seguridad del fork:

- [Code scanning](https://github.com/LeonardoDevOps/forja_leonardoAI/security/code-scanning)
- [Alerta #3](https://github.com/LeonardoDevOps/forja_leonardoAI/security/code-scanning/3)
- [Alerta #4](https://github.com/LeonardoDevOps/forja_leonardoAI/security/code-scanning/4)
- [Alerta #5](https://github.com/LeonardoDevOps/forja_leonardoAI/security/code-scanning/5)
- [Alerta #6](https://github.com/LeonardoDevOps/forja_leonardoAI/security/code-scanning/6)
- [Alerta #7](https://github.com/LeonardoDevOps/forja_leonardoAI/security/code-scanning/7)

## 8. Estado de los controles de GitHub

| Control           | Estado            | Observación                                                |
| ----------------- | ----------------- | ---------------------------------------------------------- |
| CI Node 22        | PASS              | Formato, lint, tipos y cobertura                           |
| CI Node 24        | PASS              | Formato, lint, tipos y cobertura                           |
| CodeQL workflow   | PASS de ejecución | 14 alertas abiertas                                        |
| Dependency Review | Configurado       | Se omite en forks porque la API devuelve 403               |
| Dependabot config | Presente          | npm y Actions semanalmente                                 |
| Dependabot Alerts | **Deshabilitado** | La API devuelve 403 hasta habilitarlo en Security settings |
| Secret scanning   | No consultado     | Se evitó deliberadamente leer metadatos de secretos        |

## 9. Pendientes recomendados antes de producción

### P0 — revisar el CLI

1. Auditar y corregir las cuatro alertas `file-system-race`.
2. Sustituir secuencias check-then-use por operaciones atómicas y paths canónicos.
3. Rechazar symlinks/reparse points cuando se escriban configuraciones sensibles.
4. Limitar descargas por origen HTTPS exacto, tamaño, tipo y checksum cuando exista.
5. Revisar cada flujo file-to-network para impedir el envío accidental de `.env`, credenciales,
   `member/` u otros archivos locales.
6. Descartar la alerta #3 únicamente después de confirmar que es test-only.

### P1 — controles de repositorio

1. Habilitar Dependency Graph, Dependabot Alerts y Dependabot Security Updates.
2. Hacer que branch protection exija CI Node 22/24 y CodeQL.
3. Definir política sobre alertas CodeQL HIGH: corregir o descartar con justificación revisada.
4. Reconciliar el commit upstream CLI 1.1.18 después del hardening del CLI.

### P1 — operación Cloudflare

1. Configurar y rotar:
   - `TELEGRAM_WEBHOOK_SECRET`;
   - `MANYCHAT_WEBHOOK_SECRET`;
   - `TWILIO_AUTH_TOKEN` y, si aplica, `TWILIO_WEBHOOK_URL`;
   - `DASHBOARD_PASSWORD` único de 16+ caracteres;
   - `CONTROL_PLANE_TOKEN` aleatorio de 32+ caracteres.
2. Colocar Cloudflare Access/WAF/Rate Limiting delante de `/admin` y `/api`.
3. Usar proxy o Service Binding de egress si se necesita eliminar el residual DNS.
4. Probar webhooks legítimos y firmas inválidas en staging antes de cambiar tráfico.
5. Preparar rollback al commit anterior y monitorización de rechazos/errores.

### P2 — dependencias

1. Reevaluar `@hono/node-server` antes del 30 de septiembre de 2026.
2. Planificar una migración dedicada de `agents` pre-1.0; no actualizar a latest de forma ciega.
3. Ejecutar periódicamente:

   ```bash
   corepack pnpm@10.34.5 install --frozen-lockfile
   corepack pnpm@10.34.5 check:ci
   corepack pnpm@10.34.5 audit --audit-level low
   ```

## 10. Restricciones respetadas

Durante el trabajo:

- no se modificó `member/`;
- no se sustituyeron placeholders de `wrangler.toml`;
- no se leyeron ni modificaron secretos;
- no se desplegó nada en Cloudflare;
- no se publicó ningún paquete npm;
- los cambios se prepararon en ramas separadas y mediante PR revisables;
- los merges en `main` se realizaron solo tras autorización expresa;
- se conservaron los cambios locales existentes del propietario.

## 11. Recomendación al creador original

Se recomienda adoptar el hardening por bloques revisables, no como copia manual de archivos:

1. portar primero calidad, CI y política de seguridad;
2. portar autenticación de webhooks y protección del panel;
3. portar egress de medios y tests;
4. migrar `agents` junto con el cambio a la API pública de scheduling;
5. reconciliar los cambios nuevos del CLI 1.1.18;
6. cerrar o justificar las 14 alertas CodeQL antes de considerar el CLI apto para producción.

El resultado del fork demuestra que el comportamiento funcional puede conservarse con 526 pruebas
y controles automatizados, pero la adopción upstream debe incluir una revisión específica del CLI
y la activación de los controles de seguridad del repositorio.

---

## Mensaje breve sugerido

> Hemos completado una auditoría y una serie de siete PR de endurecimiento sobre la base
> `ffe32d8` de Forja. El fork resultante añade autenticación de webhooks, protección del panel,
> mitigación SSRF/egress, migración segura de `agents`, CI/CodeQL, cobertura y supply chain
> reproducible. La auditoría npm del lock original detecta actualmente 47 rutas vulnerables
> (13 HIGH, 27 MODERATE y 7 LOW); el fork queda en una sola MODERATE no alcanzable en workerd.
> Como pendiente importante, CodeQL registra 14 alertas preexistentes en el CLI/test
> (5 HIGH y 9 MEDIUM), por lo que recomendamos una revisión dedicada del CLI antes de usarlo
> como mecanismo de instalación o actualización en producción. El informe incluye commits,
> PR, advisories, residuales y orden de adopción.
