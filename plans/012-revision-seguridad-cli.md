# Plan 012: Revisión de seguridad dedicada del CLI (instalador/actualizador)

> **Instrucciones para el ejecutor**: sigue este plan paso a paso. El CLI corre en
> la máquina del usuario final (no técnico) con permisos de su cuenta, así que cada
> defecto aquí es de mayor impacto que uno del Worker. Prioriza integridad de lo
> descargado y escrituras atómicas/canónicas. No cambies el comportamiento de una
> instalación legítima. Si ocurre una condición de parada, detente e informa. Al
> terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat ffe32d87c9615945079eb9d073e6c6a51a71c8e9..HEAD -- cli/bin/cli.js cli/package.json`
> El informe indica que `cli/bin/cli.js` es idéntico al de la base `ffe32d8`: las 13
> alertas CodeQL son **preexistentes**, no las introdujo el hardening. Reconfirma
> las líneas exactas antes de editar (el archivo tiene ~1897 líneas).

## Estado

- **Prioridad**: P0
- **Esfuerzo**: L
- **Riesgo**: MEDIUM (toca el flujo de instalación/actualización; requiere pruebas cuidadosas)
- **Depende de**: ninguno (bloquea considerar el CLI apto para producción)
- **Categoría**: seguridad
- **Origen del hallazgo**: Informe de auditoría 2026-07-30 §7 y §9 (P0) — 14 alertas CodeQL abiertas (5 HIGH, 9 MEDIUM)
- **Planificado en**: commit `f7fdd77`, 2026-07-30

## Por qué importa

El Worker/chatbot está listo para producción, pero el **CLI todavía no es un canal
confiable de instalación/actualización**. CodeQL mantiene 13 alertas en
`cli/bin/cli.js` y 1 en un test. El CLI descarga un artefacto del servidor y lo
**extrae con `tar` en el directorio del usuario sin verificación de integridad**,
y hace varias escrituras _check-then-write_ sobre archivos de configuración
sensibles. Un servidor comprometido, un MITM o un artefacto manipulado podrían
escribir fuera del destino (tar-slip), pisar configuración o colocar symlinks
maliciosos en la máquina del usuario. Este plan cierra o justifica cada alerta y
endurece el flujo de descarga/extracción/escritura.

## Inventario de alertas (evidencia)

**HIGH — `js/file-system-race` (TOCTOU):** `cli/bin/cli.js:559, 596, 839, 912`
Patrón `existsSync/readFileSync` seguido de `writeFileSync` sobre `wrangler.toml`
o `~/.claude/skills/forja/SKILL.md` (ej. L596: `existsSync(wt)` → `readFileSync` →
`writeFileSync`; L912: `existsSync(file)` → `writeFileSync`).

**MEDIUM — `js/http-to-file-access` (datos de red → filesystem):**
`cli/bin/cli.js:329, 478, 559, 565, 577`
Núcleo del riesgo: `extractFresh`/`extractOver` hacen `writeFileSync(tgz, buf)`
del artefacto **descargado** y luego `execFileSync("tar", ["-xzf", tgz, "-C", dir …])`
(L565, L577) **sin checksum/firma ni protección anti path-traversal/symlink**.

**MEDIUM — `js/file-access-to-http` (datos locales → red):**
`cli/bin/cli.js:434, 444, 1182, 1416`
`claimFree`/`subscribe`/health/`fetchTimeout` envían datos (email, name,
fingerprint) al `SERVER`. Verificar que solo se envían campos previstos y ningún
secreto/archivo local.

**HIGH — `js/incomplete-url-substring-sanitization` (test-only):**
`test/campaigns.test.ts:145` — aserción de test. Verificar que es test-only y
descartar (dismiss) con justificación revisada.

## Diseño de la solución

1. **Integridad de lo descargado (lo primero):** antes de escribir/extraer,
   verificar el artefacto contra un **checksum/firma** servidos por el mismo
   backend (p. ej. header `x-artifact-sha256` o un `.sha256`/manifiesto firmado).
   Fijar `SERVER` a HTTPS exacto y rechazar si el hash no coincide. Sin verificación
   disponible, documentar el residual y, como mínimo, aplicar (2) y (3).
2. **Extracción segura (anti tar-slip):** extraer a un directorio temporal y
   validar que **cada** entrada resuelta quede dentro del destino canónico
   (`path.resolve` + comprobación de prefijo); rechazar entradas con `..`, rutas
   absolutas y **symlinks/hardlinks**. Añadir flags defensivas de `tar`
   (`--no-same-owner`, `-p` off, límites) o usar un extractor que permita filtrar
   entradas. Aplicar límites de tamaño total y por archivo.
3. **Escrituras atómicas y canónicas (TOCTOU):** sustituir _check-then-write_ por
   escritura a archivo temporal + `rename` atómico; resolver el path canónico y
   **rechazar si el destino es un symlink/reparse point** antes de escribir
   `wrangler.toml`, `member/*` protegidos o el `SKILL.md`. `mkdirSync(..., {recursive:true})`
   con verificación de que el destino final es un directorio real, no un enlace.
4. **file-to-network:** confirmar la lista blanca de campos enviados (email, name,
   fingerprint, key, source) y que nunca se lea/adjunte `.env`, `.dev.vars`,
   credenciales ni contenido de `member/`. Destinos HTTPS exactos.
5. **Preservación garantizada:** mantener y probar las exclusiones ya presentes en
   `extractOver` (`member/*.local.ts`, `member/kb`, `wrangler.toml`, `.dev.vars*`,
   `.env*`) para que una actualización nunca pise datos del usuario.

## Alcance

**Dentro del alcance:**

- `cli/bin/cli.js` — funciones `claimFree`, `subscribe`, `extractFresh`,
  `extractOver`, `writeMarker`, escritura de `wrangler.toml`/skill y helpers de
  fetch; introducir helpers de verificación de hash, extracción segura y escritura
  atómica.
- `cli/package.json` — solo si hace falta una utilidad de extracción/verificación
  fijada por versión y compatible (preferir cero dependencias nuevas o mínimas).
- `cli/README.md` — documentar el modelo de integridad y las garantías.
- `test/` — pruebas del CLI (crear `test/cli/…`): tar-slip rechazado, symlink
  rechazado, checksum inválido rechazado, TOCTOU/atomicidad, exclusiones
  preservadas, campos enviados.
- `test/campaigns.test.ts:145` — solo si procede reescribir la aserción para
  eliminar el falso positivo; si no, dejar constancia del dismiss justificado.
- `.github/` — si se decide fallar CI ante nuevas alertas CodeQL HIGH (coordinar
  con el plan 013).
- `plans/README.md`.

**Fuera de alcance:**

- Cambiar el flujo funcional de una instalación/actualización correcta.
- Rediseñar el backend de artefactos (solo consumir el checksum/firma que provea).
- Publicar en npm o ejecutar el workflow de publicación.
- Fusionar a ciegas el commit upstream del CLI 1.1.18 (se reconcilia en el Paso 7,
  después de endurecer).
- Tocar `member/`, sustituir placeholders de `wrangler.toml`, leer/mostrar secretos
  o desplegar.

## Flujo Git

- Rama: `advisor/012-cli-security-review`.
- Commits sugeridos:
  - `fix(cli): verify artifact integrity before extraction`
  - `fix(cli): extract archives safely (reject traversal and symlinks)`
  - `fix(cli): make sensitive config writes atomic and canonical`
  - `test(cli): cover extraction, integrity and toctou hardening`
  - `chore(cli): reconcile upstream 1.1.18 after hardening`
- No publicar ni abrir PR salvo instrucción expresa.

## Pasos

### Paso 1: Reproducir y fijar la línea base de CodeQL

Recuperar las 14 alertas (Code scanning del fork) y mapear cada una a
`archivo:línea` actual. Confirmar que las 13 del CLI y la del test siguen vigentes
en el árbol de trabajo.

**Verificar**: cada alerta tiene una línea localizada y una hipótesis de causa.

### Paso 2: Integridad del artefacto descargado

Añadir verificación de checksum/firma del `buf` antes de `writeFileSync(tgz, buf)`
en `extractFresh`/`extractOver`. Fijar el origen a HTTPS exacto. Fallar (y limpiar
temporales) si no coincide.

**Verificar**: artefacto con hash correcto → procede; hash alterado → aborta sin
escribir el árbol; sin red real (fixtures locales).

### Paso 3: Extracción segura

Extraer a temporal, validar cada ruta contra el destino canónico, rechazar `..`,
rutas absolutas y symlinks/hardlinks, aplicar límites de tamaño y solo entonces
mover a `dir`. Conservar las exclusiones de `extractOver`.

**Verificar**: un `.tgz` de prueba con una entrada `../evil` o un symlink es
rechazado; un artefacto legítimo se extrae idéntico; `member/*.local.ts`,
`member/kb`, `wrangler.toml`, `.dev.vars*` y `.env*` no se pisan.

### Paso 4: Escrituras atómicas y anti-symlink (TOCTOU)

Sustituir las secuencias check-then-write de L559/596/839/912 por temp+rename con
resolución canónica y rechazo de reparse points. Probar en rutas con espacios y
caracteres especiales (Windows/Linux/macOS).

**Verificar**: escribir sobre un `wrangler.toml` que es symlink es rechazado; una
escritura concurrente no deja el archivo a medias.

### Paso 5: file-to-network

Auditar `claimFree`, `subscribe`, health y `fetchTimeout`: lista blanca de campos,
sin secretos ni archivos locales, destino HTTPS exacto. Añadir prueba que falle si
se intenta enviar un campo no previsto.

**Verificar**: el cuerpo enviado contiene solo los campos esperados; no se lee
`.env`/`member/`.

### Paso 6: Alerta de test #3

Confirmar que `test/campaigns.test.ts:145` es test-only y no un sink real. Si la
aserción induce el falso positivo, reescribirla para comparar el host de forma
exacta (no substring). Documentar el dismiss con motivo.

**Verificar**: la alerta se cierra por corrección o se descarta con justificación
revisable; el test sigue afirmando lo mismo.

### Paso 7: Reconciliar upstream CLI 1.1.18

Solo tras endurecer, revisar el commit upstream `3fd4142` (CLI 1.1.18) y portar sus
cambios de forma revisable, re-aplicando estas protecciones. No hacer merge ciego.

**Verificar**: el diff del CLI queda revisado, con las protecciones intactas y
tests verdes.

### Paso 8: CI local y revisión

**Verificar**:

```powershell
node --check cli/bin/cli.js
corepack pnpm@10.34.5 check:ci
git diff --check
git diff --name-only
```

Todo pasa; solo archivos de alcance. CodeQL (o el escaneo local disponible)
reejecutado sobre el CLI sin las alertas corregidas.

## Plan de pruebas

- **Extracción**: tar-slip (`../`), ruta absoluta, symlink y hardlink → rechazados;
  artefacto legítimo → idéntico; exclusiones preservadas.
- **Integridad**: checksum válido/ inválido; origen no-HTTPS → rechazado.
- **TOCTOU/atomicidad**: destino symlink → rechazado; sin archivos a medias.
- **file-to-network**: solo campos previstos; sin secretos.
- **Portabilidad**: rutas con espacios/acentos en Windows/Linux/macOS.
- Sin red real, sin publicar, sin tocar `member/`.

## Criterios de terminado

- [ ] Las 13 alertas del CLI están corregidas o descartadas con justificación revisada.
- [ ] La alerta #3 (test) está cerrada o descartada como test-only documentado.
- [ ] La extracción rechaza traversal, rutas absolutas y symlinks, con límites de tamaño.
- [ ] El artefacto se verifica por integridad antes de extraer (o residual documentado).
- [ ] Las escrituras de config sensible son atómicas, canónicas y anti-symlink.
- [ ] Las exclusiones de actualización preservan `member/`, `wrangler.toml` y secretos locales.
- [ ] file-to-network limita campos y destinos; sin fuga de secretos.
- [ ] Upstream 1.1.18 reconciliado con las protecciones intactas.
- [ ] `node --check` y `check:ci` pasan; solo archivos de alcance.
- [ ] `plans/README.md` actualizado.

## Condiciones de parada

Detente e informa si:

- el backend no ofrece checksum/firma del artefacto y no hay forma de verificar
  integridad sin cambiarlo (documenta el residual y su plan);
- corregir una alerta exige cambiar el contrato del servidor de artefactos;
- reconciliar 1.1.18 reintroduce un patrón inseguro que no puede endurecerse en el
  mismo cambio;
- confirmar un caso requiere un servidor, credencial o red reales;
- sería necesario tocar `member/`, `wrangler.toml`, secretos, desplegar o npm publish.
