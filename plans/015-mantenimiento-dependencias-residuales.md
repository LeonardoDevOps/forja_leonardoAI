# Plan 015: Mantenimiento de dependencias y residuales

> **Instrucciones para el ejecutor**: cambios de mantenimiento de bajo riesgo. No
> actualices a `latest` de forma ciega ni fuerces majors incompatibles con workerd.
> Al terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `corepack pnpm@10.34.5 audit --audit-level low`

## Estado

- **Prioridad**: P2
- **Esfuerzo**: S–M
- **Riesgo**: LOW
- **Depende de**: ninguno
- **Categoría**: supply chain / mantenimiento
- **Origen del hallazgo**: Informe 2026-07-30 §5.3 y §9 (P2 — dependencias)
- **Planificado en**: commit `f7fdd77`, 2026-07-30
- **Completado en**: rama `advisor/015-dependency-maintenance`, 2026-07-30

## Por qué importa

El fork queda con **un único advisory MODERATE residual no alcanzable** en workerd
(`@hono/node-server 1.19.17`, vía `agents > @modelcontextprotocol/sdk`,
`GHSA-frvp-7c67-39w9`, en `serve-static` del adaptador Node). Además, `agents` es
pre-1.0 y su actualización debe ser deliberada. Sin una cadencia de revisión, el
residual y las dependencias se vuelven deuda silenciosa.

## Alcance

**Dentro del alcance:**

- `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` — solo actualizaciones
  compatibles y justificadas (el residual de Hono; parches menores).
- `docs/` / `plans/README.md` — cadencia de auditoría y estado de residuales.
- Overrides existentes — revisar que siguen siendo necesarios.

**Fuera de alcance:**

- Forzar `@hono/node-server` 2.x (major transitiva; adaptador Node no corre en workerd).
- Migrar `agents` a `latest` sin plan dedicado.
- Tocar `member/`, `wrangler.toml`, secretos, despliegues o npm publish.

## Pasos

### Paso 1: Reevaluar `@hono/node-server` (antes del 30-09-2026)

Comprobar con fuentes oficiales si `agents`/MCP SDK ya arrastran una versión
parcheada (`>=2.0.5`) sin romper el peer ni el runtime. Si la hay y es compatible,
adoptarla y regenerar el lockfile congelado; si no, reafirmar el residual (no
alcanzable) y actualizar la fecha de revisión.

**Verificar**: `pnpm audit` refleja el nuevo estado; `check:ci` pasa.

### Paso 2: Plan de migración de `agents`

Definir (sin ejecutar aún) una migración dedicada de `agents` pre-1.0: leer el
changelog de la versión objetivo (p. ej. 0.4.x y sus cambios en peers x402),
identificar breaking changes de scheduling/DO y preparar pruebas de caracterización
antes de subir. No actualizar a ciegas.

**Verificar**: existe un plan de migración con riesgos y pruebas, listo para su
propia rama.

### Paso 3: Cadencia de auditoría

Documentar (y opcionalmente automatizar vía workflow programado) la ejecución
periódica:

```bash
corepack pnpm@10.34.5 install --frozen-lockfile
corepack pnpm@10.34.5 check:ci
corepack pnpm@10.34.5 audit --audit-level low
```

**Verificar**: la cadencia está documentada y, si se automatiza, el workflow tiene
permisos mínimos.

## Criterios de terminado

- [x] Residual de `@hono/node-server` reevaluado y corregido.
- [x] Plan de migración de `agents` documentado (sin ejecutar).
- [x] Cadencia de auditoría documentada y automatizada.
- [x] Gates equivalentes a `check:ci` y auditoría LOW superados; solo archivos
      de alcance.
- [x] `plans/README.md` actualizado.

## Condiciones de parada

Detente e informa si:

- cerrar el residual obliga a una major incompatible o rompe el runtime;
- una actualización de `agents` requiere cambios amplios que exceden mantenimiento;
- sería necesario tocar `member/`, `wrangler.toml`, secretos o desplegar.

## Resultado

La comprobación de deriva encontró que `agents` había avanzado de 0.3.10 a
0.20.1 y que el advisory moderado seguía presente. No se hizo esa migración
pre-1.0: queda especificada en el [Plan 016](./016-migrar-agents-0-20.md).

`@modelcontextprotocol/sdk` se actualizó de 1.26.0 a 1.30.0. Esta versión
declara compatibilidad con `@hono/node-server ^1.19.9 || ^2.0.5`; pnpm conservó
1.19.17 por estabilidad del lockfile, por lo que se añadió un override exacto a
2.0.12. La desviación respecto a la exclusión inicial de “forzar Hono 2.x” es
deliberada y compatible: no se impuso una versión fuera del rango del
consumidor y el adaptador sigue sin importarse desde el runtime de Forja.

El árbol resultante contiene una sola versión de MCP 1.30.0 y Hono 2.0.12.
`pnpm audit --audit-level low` pasó de un aviso moderado a cero vulnerabilidades.
El script `security:audit` exige ahora el nivel LOW.

La guía `docs/dependency-maintenance.md` registra los overrides, la revisión
semanal/mensual/trimestral y el procedimiento de actualización. El workflow
`Dependency Audit` ejecuta los lunes con `contents: read`, Node 24, instalación
congelada, `check:ci` y la auditoría LOW.

Validación local: instalación congelada, formato focal, ESLint sin warnings,
tipos, 548 pruebas en 75 archivos, 83,35 % de líneas, gate administrativo
32/32, auditoría LOW sin vulnerabilidades y `git diff --check` superados. El
comando integrado `check:ci` se detuvo solo en los 128 archivos CRLF heredados
del checkout de Windows y ajenos al alcance; sus gates restantes se ejecutaron
por separado. No se normalizaron archivos no relacionados.
