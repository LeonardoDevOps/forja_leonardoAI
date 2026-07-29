# Plan 003 — CI y supply chain

## Objetivo

Hacer que la validación automatizada sea reproducible, con permisos mínimos y referencias verificables de
GitHub Actions.

## Alcance

- Reforzar CI con Node 20/22, instalación congelada, formato, lint, tipos, tests y cobertura.
- Añadir CodeQL, Dependency Review y Dependabot.
- Fijar Actions oficiales a SHAs completos verificados, con comentario de versión.
- Revisar el workflow de publicación sin ejecutarlo ni cambiar la autorización legítima de npm.
- Aplicar actualizaciones mínimas de dependencias para vulnerabilidades con parche compatible.

## Tareas

- [ ] Verificar versiones y SHAs oficiales de las Actions utilizadas.
- [ ] Actualizar `ci.yml` con permisos, concurrencia, timeout y matriz.
- [ ] Crear `codeql.yml` y `dependency-review.yml`.
- [ ] Crear o integrar `.github/dependabot.yml`.
- [ ] Endurecer de forma conservadora `publish-cli.yml`, sin publicar.
- [ ] Ejecutar `pnpm audit`, clasificar rutas y aplicar parches compatibles.
- [ ] Validar YAML con `actionlint` o revisión estructural documentada.

## Aceptación

- Todos los workflows tienen permisos mínimos y timeout explícito.
- CI cubre Node 20 y 22 y ejecuta `pnpm install --frozen-lockfile`.
- CodeQL analiza `javascript-typescript` con consultas extendidas.
- Dependency Review falla desde severidad alta y Dependabot cubre npm y Actions semanalmente.
- El workflow de publicación conserva OIDC/provenance y no se ejecuta.
