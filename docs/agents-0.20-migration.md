# Migración de `agents` 0.3.10 a 0.20.1

## Decisión

Forja fija `agents` exactamente en 0.20.1. No usa un rango `^` porque cada minor
pre-1.0 puede incluir cambios incompatibles. Se mantiene AI SDK 6, React 19 y
Zod 4; no se adopta AI SDK 7.

El motor efectivo es Node 22.18+ o 24.11+; Node 23 no está soportado. El límite
refleja los requisitos de Babel 8 y del plugin de Rolldown incorporados por el
árbol actualizado, no un requisito adicional de la lógica de Forja.

El único import de producción es `Agent` desde la raíz del paquete. No existen
imports de x402, Codemode, AI Chat, React client, MCP ni entry points
experimentales. Esos peers opcionales no se añadieron.

## Cambios upstream revisados

Se leyó el changelog oficial completo desde 0.3.10 hasta 0.20.1. Los cambios con
impacto potencial para Forja fueron:

- 0.4 migra x402 a `@x402/core` y `@x402/evm` v2; no aplica porque Forja no usa
  x402.
- 0.4 actualiza MCP por aislamiento entre clientes y hace síncronos algunos
  getters; el código de Forja no importa MCP.
- 0.7–0.8 endurece alarms, scheduling e intervalos y corrige recuperación tras
  reinicios.
- 0.8 añade scheduling idempotente y mantiene `setState`/estado como APIs
  compatibles.
- 0.11 eleva PartyServer a 0.5.x y corrige la identidad de Durable Objects al
  despertar con compatibility dates anteriores.
- 0.16 mejora la supervivencia de callbacks one-shot ante resets de plataforma.
- 0.19 conserva compatibilidad simultánea con AI SDK 6 y 7.
- 0.20 incorpora MCP v2 manteniendo MCP SDK v1 1.30.0 para compatibilidad.

`getSchedules()` permanece, pero está deprecado. Forja usa ahora
`await listSchedules()` y conserva `cancelSchedule()`/`schedule()` para el
debounce.

Fuentes primarias:

- [changelog de `agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/CHANGELOG.md);
- [paquete y peers de `agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/package.json);
- [repositorio oficial](https://github.com/cloudflare/agents).

## Árbol resultante

El lockfile contiene una sola versión de cada componente principal:

| Componente                     | Versión      |
| ------------------------------ | ------------ |
| `agents`                       | 0.20.1       |
| `partyserver`                  | 0.5.9        |
| `@modelcontextprotocol/sdk`    | 1.30.0       |
| `@modelcontextprotocol/client` | 2.0.0        |
| `@modelcontextprotocol/server` | 2.0.0        |
| `@hono/node-server`            | 2.0.12       |
| `miniflare`                    | 4.20260730.0 |

Los overrides temporales de MCP y Hono ya no son necesarios. Los peers x402,
Codemode y AI Chat no aparecen en el árbol.

`pnpm licenses list --prod` confirma licencias declaradas para todo el árbol.
Los componentes principales migrados se distribuyen con licencias permisivas:
`agents` y MCP bajo MIT, PartyServer bajo ISC y los paquetes de AI SDK bajo
Apache-2.0.

## Compatibilidad de estado y scheduling

El esquema 0.20.1 conserva `cf_agents_state` y `cf_agents_schedules`. Su
migración es aditiva e idempotente: añade columnas de retry/ownership, crea
tablas nuevas y registra una versión interna. No elimina el estado de usuario
ni schedules existentes; únicamente limpia un heartbeat interno legado.

Las pruebas cubren:

- buffer persistido y rehidratado tras una nueva instancia;
- schedule delayed creado con el esquema 0.3.10;
- migración real en Miniflare/workerd al bundle 0.20.1;
- cancelación del schedule anterior y creación de un único debounce;
- dos callbacks solapados procesando el buffer una sola vez;
- bot pausado sin crear schedules.

La prueba de migración genera una configuración Wrangler temporal con valores
ficticios, construye el Worker con `--dry-run`, siembra el esquema 0.3.10 y
reinicia el mismo Durable Object con 0.20.1. No lee secretos, no usa la plantilla
`wrangler.toml` y no despliega.

## Rollback

No se revierte el esquema interno manualmente. Las columnas y tablas nuevas son
aditivas y 0.3.10 ignora las que no conoce.

1. Detener promociones y conservar la evidencia del fallo.
2. Reponer el commit/lockfile anterior al Plan 016 o seleccionar la versión
   estable previa mediante el runbook Cloudflare.
3. Desplegar esa versión solo con autorización operativa explícita.
4. Verificar ingestión, un único debounce y respuesta en staging.
5. No borrar `cf_agents_*`, no editar SQLite y no cancelar schedules de forma
   masiva.

El rollback operativo está fuera de esta implementación: no se realizó ningún
despliegue.

## Validación ejecutada

| Gate                        | Resultado                                 |
| --------------------------- | ----------------------------------------- |
| instalación congelada       | pasa con pnpm 10.34.5                     |
| Node 22.23.2                | typecheck y 17 pruebas focales pasan      |
| Node 24.18.0                | typecheck y suite completa pasan          |
| suite completa              | 552 pruebas en 76 archivos                |
| cobertura                   | 83,35 % líneas; gate administrativo 32/32 |
| ESLint                      | 0 errores, 0 warnings                     |
| auditoría LOW               | 0 vulnerabilidades                        |
| Wrangler/Miniflare          | build `--dry-run` y migración real pasan  |
| archivos modificados        | Prettier y `git diff --check` pasan       |
| `member/` / `wrangler.toml` | sin cambios                               |
| despliegue Cloudflare / npm | no realizado                              |

El chequeo global de formato conserva una desviación conocida del checkout de
Windows: 126 archivos heredados usan CRLF. Los archivos modificados por este
plan están normalizados y pasan Prettier; no se amplió el diff para corregir
formato ajeno a la migración.
