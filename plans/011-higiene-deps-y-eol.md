# Plan 011: Higiene de dependencias transitivas y normalización de fin de línea

> **Instrucciones para el ejecutor**: sigue este plan paso a paso. Son cambios de
> higiene de bajo riesgo. No fuerces majors incompatibles. Si ocurre una condición
> de parada, detente e informa. Al terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat 792bc637dd3b84b6c29440ea6aae9729794299b5..HEAD -- package.json pnpm-lock.yaml .prettierrc.json`
> `corepack pnpm@10.34.5 audit --audit-level high`

## Estado

- **Prioridad**: P3
- **Esfuerzo**: S
- **Riesgo**: LOW
- **Depende de**: ninguno
- **Categoría**: supply chain / mantenibilidad
- **Origen del hallazgo**: INFO-001 y INFO-002 — auditoría 2026-07-30
- **Planificado en**: commit `792bc63`, 2026-07-30
- **Resultado**: COMPLETADO el 2026-07-30

## Por qué importa

Dos temas de higiene sin impacto explotable hoy, pero que conviene cerrar para no
acumular deuda ni ruido de CI:

1. **INFO-001 — advisories transitivos no alcanzables.**
   `@modelcontextprotocol/sdk` (HIGH, `GHSA-345p-7cg4-v4c7`) y `@hono/node-server`
   (moderate, `GHSA-frvp-7c67-39w9`) entran solo como transitivos de
   `agents 0.3.10`. El SDK de MCP no se importa en `src/` y `@hono/node-server`/
   `serve-static` es código Node inexistente en workerd, por lo que **no son
   alcanzables** en Forja. El residual ya está documentado en `plans/README.md`
   con revisión antes del **2026-08-29**. Toca reevaluar si hay versión de
   `agents` con el SDK parcheado.

2. **INFO-002 — sin normalización de EOL.**
   No existe `.gitattributes`; Prettier usa `endOfLine: "lf"`. En checkouts
   Windows aparece ruido CRLF que hace fallar `pnpm format:check` en local (no en
   CI Linux). Es fricción para el dueño en Windows, no un defecto de runtime.

## Estado actual (evidencia)

- `pnpm audit --audit-level high` → 1 high + 1 moderate, ambos con path
  `.>agents>@modelcontextprotocol/sdk[>@hono/node-server]`.
- `grep -rn "modelcontextprotocol" src/` → vacío (no se importa).
- No hay `.gitattributes` en la raíz; `prettier . --check` marca ~157 archivos
  bajo checkout CRLF y ninguno bajo LF.

## Alcance

**Dentro del alcance:**

- `.gitattributes` (crear) con normalización de EOL a LF para texto y `-text`
  para binarios.
- `package.json` / `pnpm-lock.yaml` — **solo** si existe una versión de `agents`
  (o un override justificado y compatible con Workers) que suba
  `@modelcontextprotocol/sdk` a `>=1.26.0` sin romper el peer ni el runtime.
- `plans/README.md` — actualizar el estado del residual y la fecha de revisión.
- `README.md`/`SECURITY.md` — solo si cambia el estado del residual.

**Fuera de alcance:**

- Forzar `agents`/SDK a majors incompatibles o romper el pin exacto sin evidencia
  de compatibilidad con workerd.
- Reescribir archivos masivamente por EOL en el mismo commit que otros cambios
  (hacer el renormalizado en un commit aislado y claramente etiquetado).
- Tocar `member/`, `wrangler.toml`, secretos, despliegues o npm publish.

## Flujo Git

- Rama: `advisor/011-deps-and-eol-hygiene`.
- Commits sugeridos:
  - `chore: add .gitattributes to normalize line endings`
  - `chore(deps): review MCP sdk transitive advisory` (solo si hay upgrade viable)
  - `docs: refresh transitive advisory residual status`
- No publicar ni abrir PR salvo instrucción expresa.

## Pasos

### Paso 1: Normalizar EOL

Crea `.gitattributes`:

```gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.woff2 binary
```

Renormaliza en un commit aislado (`git add --renormalize .`). No lo mezcles con
cambios de lógica. Confirma que `member/` no cambie de contenido, solo EOL si
aplica.

**Verificar**: en un checkout limpio, `corepack pnpm@10.34.5 format:check` pasa;
`git diff --check` no reporta problemas.

### Paso 2: Reevaluar el advisory de MCP

Comprueba con fuentes oficiales si existe una versión de `agents` que fije
`@modelcontextprotocol/sdk >=1.26.0`. Si la hay y es compatible con Workers y con
el peer de React, súbela y regenera el lockfile congelado. Si **no** la hay,
mantén el residual y actualiza la fecha de revisión en `plans/README.md`
(justificando la no-alcanzabilidad, como ya se documentó para los planes 005/006).

**Verificar**: `pnpm audit` refleja el nuevo estado; `check:ci` pasa; no se
rompió el runtime (tests verdes).

### Paso 3: Documentar

Actualiza `plans/README.md` con el estado final del residual y, si corresponde,
`README`/`SECURITY`.

**Verificar**:

```powershell
corepack pnpm@10.34.5 check:ci
git diff --name-only
```

## Plan de pruebas

- `format:check` verde en checkout limpio tras `.gitattributes`.
- Suite completa (`check:ci`) verde tras cualquier cambio de dependencias.
- `pnpm audit` documentado antes/después.

## Criterios de terminado

- [x] `.gitattributes` normaliza EOL y `format:check` pasa en cualquier plataforma.
- [x] El renormalizado va en un commit aislado y `member/` no cambia de contenido.
- [x] Advisory de MCP actualizado mediante un override compatible; el residual
      moderado se reafirma con fecha de revisión y justificación de no-alcanzabilidad.
- [x] `check:ci` pasa; solo archivos de alcance.
- [x] `plans/README.md` actualizado.

## Condiciones de parada

Detente e informa si:

- subir `@modelcontextprotocol/sdk` obliga a un major incompatible de `agents` o
  rompe el peer/runtime;
- el renormalizado de EOL alteraría contenido de `member/` más allá de fin de
  línea;
- sería necesario tocar `wrangler.toml`, secretos, desplegar o publicar npm.

## Resultado de ejecución

- Base real: `origin/main` en `c4ba1c7`; la deriva desde el commit planificado
  correspondía únicamente a los planes 009 y 010 ya fusionados. No había
  cambios en `package.json`, `pnpm-lock.yaml` ni `.prettierrc.json`.
- EOL: se añadió `.gitattributes` y se aisló en `bfd15b6`. Se exceptuó
  deliberadamente la conversión forzada de `member/**` y `wrangler.toml` para
  cumplir la restricción superior de no modificarlos.
- Supply chain: `agents 0.4.0` ya usa MCP 1.26.0, pero introduce cambios
  pre-1.0 en sus peers x402. Se conservó `agents 0.3.10` y se añadió un override
  de workspace a `@modelcontextprotocol/sdk 1.26.0`, cuya resolución única fue
  validada con `pnpm why`.
- Auditoría: antes, 1 HIGH + 1 moderada; después,
  `pnpm audit --audit-level high` pasa y queda 1 moderada no alcanzable en
  `@hono/node-server 1.19.17`.
- Validación limpia: instalación congelada y `check:ci` completos; 73 archivos,
  526 pruebas, 83,35 % de cobertura de líneas y gate administrativo PASS
  (32 comparaciones).
- No se modificaron `member/` ni `wrangler.toml`; no se leyeron secretos, no se
  desplegó, no se publicó npm y no se publicó la rama.
