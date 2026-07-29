# Plan 001 — Calidad, formato y reproducibilidad

## Objetivo

Establecer una base de desarrollo reproducible con Node 20/22, pnpm compatible con el lockfile, ESLint plano,
Prettier y EditorConfig, sin cambios semánticos ni reformateos innecesariamente masivos.

## Alcance

- Fijar `engines`, `packageManager` y versiones explícitas de herramientas antes declaradas como `latest`.
- Añadir scripts `lint`, `format`, `check`, cobertura y auditoría sin eliminar scripts existentes.
- Crear `.nvmrc`, `.npmrc`, `.editorconfig`, `.prettierrc.json`, `.prettierignore` y `eslint.config.js`.
- Evaluar `cli/` y `como-funciona.html` antes de decidir exclusiones de formato.
- Actualizar `pnpm-lock.yaml` con cambios de dependencias intencionales y compatibles.
- Resolver advertencias sencillas de lint sin refactors funcionales.

## Tareas

- [x] Seleccionar y validar una versión concreta de pnpm 10.
- [x] Consultar versiones resueltas y peer dependencies de las herramientas.
- [x] Actualizar metadatos, scripts y dependencias en `package.json`.
- [x] Crear configuraciones de editor, formato y lint.
- [x] Instalar con pnpm, aplicar correcciones automáticas y revisar manualmente el diff.
- [x] Confirmar que `member/` y `wrangler.toml` no cambian.

## Aceptación

- `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint` y `pnpm typecheck` funcionan.
- No quedan dependencias de desarrollo con `latest`, salvo desviación explícitamente justificada.
- El diff de formato es proporcionado y no incluye datos privados, artefactos o archivos generados.
