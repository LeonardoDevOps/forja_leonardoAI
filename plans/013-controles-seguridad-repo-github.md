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

- [ ] Dependabot Alerts + Graph + Security Updates habilitados.
- [ ] Branch protection exige CI Node 22/24 y CodeQL antes de fusionar `main`.
- [ ] Política de triage de alertas CodeQL/deps documentada y enlazada al 012.
- [ ] Dependency Review documentado (activo donde la API lo permita).
- [ ] `plans/README.md` actualizado.

## Condiciones de parada

Detente e informa si:

- no hay permisos de administrador para cambiar Security settings o branch protection;
- un control exige un plan de GitHub no disponible para el repo;
- habilitar un control abriría PRs automáticos que rocen `member/` o `wrangler.toml`
  sin revisión (configúralo para requerir revisión).
