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

| ID  | Plan                                                                             | Prioridad | Estado     | Dependencias  |
| --- | -------------------------------------------------------------------------------- | --------: | ---------- | ------------- |
| 001 | [Calidad, formato y reproducibilidad](./001-calidad-formato-reproducibilidad.md) |        P0 | Completado | Ninguna       |
| 002 | [Tests, cobertura y seguridad del código](./002-tests-cobertura-seguridad.md)    |        P0 | Completado | 001           |
| 003 | [CI y supply chain](./003-ci-supply-chain.md)                                    |        P0 | Completado | 001, 002      |
| 004 | [Documentación, validación y entrega](./004-documentacion-validacion-entrega.md) |        P0 | Completado | 001, 002, 003 |
| 005 | [Migrar `agents` 0.3.x y supply chain](./005-migrar-agents-0-3-supply-chain.md)  |        P1 | Completado | Ninguna       |
| 006 | [Endurecer egress de medios y DNS](./006-endurecer-egress-medios-dns.md)         |        P1 | Completado | Ninguna       |
| 007 | [Eliminar los 33 avisos ESLint](./007-eliminar-avisos-eslint.md)                 |        P1 | TODO       | 005, 006      |
| 008 | [Elevar cobertura administrativa](./008-elevar-cobertura-admin.md)               |        P2 | TODO       | Ninguna       |

Estados permitidos para los planes pendientes: `TODO`, `EN PROGRESO`,
`COMPLETADO`, `BLOQUEADO: <motivo>` o `RECHAZADO: <motivo>`.

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
- Residual alto: `agents 0.3.10` fija
  `@modelcontextprotocol/sdk 1.25.2`; `GHSA-345p-7cg4-v4c7` se corrige en 1.26.0.
  Forja no crea servidores/clientes MCP ni reutiliza transports entre clientes,
  por lo que la ruta vulnerable no está activa. No se fuerza 1.26.0 fuera del
  pin exacto del SDK. Revisar antes del 2026-08-29 o cuando Cloudflare publique
  una versión compatible.
- Residual moderado: ese MCP admite `@hono/node-server 1.19.17`;
  `GHSA-frvp-7c67-39w9` requiere 2.0.5. Forja produce un Worker y no usa
  `serve-static` del adaptador Node en producción. No se fuerza la major 2.
  Revisar en la misma fecha.
- Los medios usan hostnames exactos por canal. `MEDIA_ALLOWED_HOSTS` solo
  habilita CDNs variables; comodines, URLs, puertos, hosts locales y redirects
  no autorizados se rechazan.
- Riesgo DNS residual: un hostname aprobado comprometido todavía necesita un
  egress confiable para garantizar IP/ASN. Está documentado en README y
  SECURITY.
- Validación: instalación congelada, formato, tipos, 469 tests, cobertura
  (72,90% líneas globales), pruebas focales y diff pasaron. ESLint conserva los
  33 avisos inventariados para el plan 007.

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

## Definición de terminado

Los planes 001–004 permanecen completados. La segunda ola termina cuando
005–008 estén completados, las validaciones obligatorias se hayan ejecutado y
cualquier resultado no verde tenga causa, impacto, mitigación y seguimiento.
Cada ejecutor debe limitarse a su rama y no publicar, desplegar ni abrir PR salvo
instrucción expresa. Nunca se fusionará `main` desde estos planes.
