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

- [ ] Residual de `@hono/node-server` reevaluado: actualizado o reafirmado con fecha.
- [ ] Plan de migración de `agents` documentado (sin ejecutar).
- [ ] Cadencia de auditoría documentada (y automatizada si procede).
- [ ] `check:ci` pasa; solo archivos de alcance.
- [ ] `plans/README.md` actualizado.

## Condiciones de parada

Detente e informa si:

- cerrar el residual obliga a una major incompatible o rompe el runtime;
- una actualización de `agents` requiere cambios amplios que exceden mantenimiento;
- sería necesario tocar `member/`, `wrangler.toml`, secretos o desplegar.
