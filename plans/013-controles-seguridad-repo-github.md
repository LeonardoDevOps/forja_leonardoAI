# Plan 013: Activar los controles de seguridad del repositorio en GitHub

> **Instrucciones para el ejecutor**: la mayoría de estos pasos son de
> **configuración en GitHub**, no de código. Requieren permisos de administrador
> del repositorio del propietario. No cambian el runtime. Documenta cada cambio y,
> si algo exige un permiso o plan de GitHub no disponible, regístralo como
> BLOQUEADO con el motivo. Al terminar, actualiza `plans/README.md`.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: S
- **Riesgo**: LOW
- **Depende de**: 012 (para definir la política ante alertas CodeQL HIGH del CLI)
- **Categoría**: DevSecOps / gobernanza
- **Origen del hallazgo**: Informe 2026-07-30 §8 y §9 (P1 — controles de repositorio)
- **Planificado en**: commit `f7fdd77`, 2026-07-30
- **Ejecución**: COMPLETADO el 2026-07-30
- **Rama**: `advisor/013-repo-security-controls`, creada desde `origin/main`
  (`dedabc8`)

## Por qué importa

El código y CI están endurecidos, pero varios controles de GitHub están inactivos
y dejan pasar riesgo de supply chain y regresiones:

- **Dependabot Alerts deshabilitado** (la API devuelve 403): sin alertas de
  vulnerabilidades de dependencias en el fork.
- Branch protection no exige explícitamente CI Node 22/24 ni CodeQL.
- No hay política escrita sobre qué hacer con alertas CodeQL HIGH (corregir vs.
  descartar justificado).
- Dependency Review se omite en forks (403 de la API).

## Alcance

**Dentro del alcance (configuración GitHub + docs):**

- Security settings del repo: Dependency Graph, Dependabot Alerts y Dependabot
  Security Updates.
- Branch protection de `main`: exigir checks requeridos (CI Node 22, CI Node 24,
  CodeQL), revisión de PR y estado actualizado.
- `SECURITY.md` / `CONTRIBUTING.md` / `docs/`: documentar la política de triage de
  alertas CodeQL y de dependencias.
- `.github/dependabot.yml` y workflows: revisar que la cadencia y los permisos
  siguen siendo mínimos; no ampliarlos.

**Fuera de alcance:**

- Cambiar código de producción o del CLI (eso es el plan 012).
- Desactivar controles existentes.
- Tocar `member/`, `wrangler.toml`, secretos, despliegues o npm publish.

## Pasos

### Paso 1: Habilitar Dependabot y Dependency Graph

En Settings → Code security: activar Dependency Graph, Dependabot Alerts y
Dependabot Security Updates. Confirmar que `.github/dependabot.yml` (npm + Actions,
semanal) queda coherente.

**Verificar**: la pestaña de alertas responde (ya no 403) y Dependabot puede abrir
PRs de seguridad.

### Paso 2: Branch protection de `main`

Exigir como checks requeridos: `CI / Node 22`, `CI / Node 24` y el análisis
CodeQL; exigir PR con al menos una revisión y rama actualizada antes de fusionar;
prohibir push directo a `main`.

**Verificar**: un PR de prueba no puede fusionarse hasta que los checks pasen.

### Paso 3: Política de alertas CodeQL y dependencias

Documentar en `SECURITY.md`/`docs`: toda alerta HIGH se corrige o se descarta con
justificación revisada y registrada; las alertas del CLI se rigen por el plan 012.
Definir responsable y cadencia de triage.

**Verificar**: la política existe y referencia el plan 012.

### Paso 4: Dependency Review

Confirmar el comportamiento en forks (403) y dejar documentado que en el repo
canónico/o al portar upstream debe quedar activo para bloquear nuevas dependencias
HIGH.

**Verificar**: nota documental clara; sin falso sentido de cobertura.

## Criterios de terminado

- [x] Dependabot Alerts + Graph + Security Updates habilitados.
- [x] Branch protection exige CI Node 22/24 y CodeQL antes de fusionar `main`.
- [x] Política de triage de alertas CodeQL/deps documentada y enlazada al 012.
- [x] Dependency Review documentado (activo donde la API lo permita).
- [x] `plans/README.md` actualizado.

## Resultado de la ejecución

### Controles activados en GitHub

- Antes de la ejecución, `GET /vulnerability-alerts` devolvía `404`, la API de
  alertas Dependabot devolvía `403` y
  `dependabot_security_updates.status` era `disabled`.
- Se habilitaron Vulnerability Alerts/Dependency Graph y Automated Security
  Fixes mediante la API administrativa. La verificación posterior devuelve
  `204`, permite listar alertas y muestra
  `dependabot_security_updates.status: enabled`.
- Dependabot detectó el residual `MEDIUM` ya conocido de
  `@hono/node-server` (`GHSA-frvp-7c67-39w9`, parche disponible solo en
  `2.0.5`). No se forzó esa major transitiva: su no alcanzabilidad en workerd y
  la reevaluación antes de 2026-09-30 permanecen en el plan 015.

### Protección de `main`

La regla exige:

- rama actualizada (`strict: true`);
- checks `Node 22`, `Node 24` y `JavaScript y TypeScript`, vinculados a la app
  oficial GitHub Actions (`app_id: 15368`);
- un review aprobatorio y descarte de aprobaciones obsoletas tras nuevos
  commits;
- resolución de conversaciones;
- prohibición de force-push y eliminación de `main`.

Los nombres reales de los checks no incluyen el prefijo visual del workflow
(`CI /` o `CodeQL /`), por lo que la protección usa los contextos que GitHub
registró en el commit base.

### Política y workflows

- `SECURITY.md` define responsable, cadencia, SLA por severidad, evidencia
  necesaria para descartar alertas y referencia el plan 012.
- `CONTRIBUTING.md` alinea Node 22/24, checks, review y tratamiento de PR
  automatizados.
- `.github/dependabot.yml` ya cubría npm y GitHub Actions semanalmente.
- Los workflows conservan permisos mínimos. Dependency Review ya usa
  `contents: read`, bloquea severidad `HIGH` y evita la llamada que GitHub
  rechaza con `403` en forks; no se amplió ningún permiso.

## Desviaciones y residuales

- El repositorio solo tiene un colaborador directo:
  `LeonardoDevOps`. Activar `enforce_admins` junto con una aprobación obligatoria
  impediría todo merge, porque GitHub no cuenta la autoaprobación. Se mantuvo el
  bypass administrativo como salida de emergencia y se aplicaron todas las
  restricciones al resto de actores. Al incorporar un segundo mantenedor con
  permiso de escritura debe activarse `enforce_admins`.
- No se abrió un PR artificial para probar la protección. La API confirmó la
  regla y los tres contextos se obtuvieron de checks reales exitosos de
  `dedabc8`; la prueba end-to-end ocurrirá en el PR de esta rama.
- Este repositorio es un fork. Dependency Review se omite aquí para evitar el
  `403`, por lo que no constituye un gate efectivo hasta portar el cambio a un
  repositorio canónico compatible.

## Validación

- Formato focal de los cuatro Markdown modificados: PASS.
- `git diff --check`: PASS.
- ESLint con `--max-warnings 0`: PASS.
- TypeScript `--noEmit`: PASS.
- Vitest con cobertura: 74 archivos y 541 pruebas, todas PASS; 83,35 % de
  líneas globales.
- Gate administrativo: PASS, 32/32 comparaciones.
- Auditoría con umbral `high`: PASS; solo permanece el `MEDIUM` de
  `@hono/node-server` registrado arriba.
- Verificación API: Vulnerability Alerts devuelve `204`, Automated Security
  Fixes está habilitado y la protección refleja los tres checks, una aprobación
  y `strict: true`.

`check:ci` se detuvo únicamente en el formato global porque este checkout de
Windows materializa 129 archivos heredados con CRLF pese a que Git y
`.gitattributes` declaran LF. No se normalizaron archivos ajenos al alcance; el
formato focal y todos los demás gates equivalentes sí pasaron.

## Condiciones de parada

Detente e informa si:

- no hay permisos de administrador para cambiar Security settings o branch protection;
- un control exige un plan de GitHub no disponible para el repo;
- habilitar un control abriría PRs automáticos que rocen `member/` o `wrangler.toml`
  sin revisión (configúralo para requerir revisión).
