# Plan 004 — Documentación, validación y entrega

## Objetivo

Alinear la documentación con el comportamiento validado, ejecutar la matriz completa de comprobaciones y
entregar una rama revisable con informe local.

## Alcance

- Crear o mejorar `SECURITY.md` sin inventar correo de contacto.
- Actualizar requisitos y comandos de mantenimiento en documentación existente.
- Mantener referencias deliberadas al upstream y documentar decisiones sobre enlaces del fork.
- Ejecutar todas las comprobaciones obligatorias, incluido secret scan prudente.
- Crear `.forja-reports/forja-hardening-20260729-1700.md` y excluirlo solo en `.git/info/exclude`.
- Crear commits temáticos, publicar solo la rama si hay autenticación y abrir PR en borrador si `gh` existe.

## Tareas

- [ ] Documentar Node, pnpm, calidad, cobertura, auditoría y CI.
- [ ] Crear la política de reporte privado de vulnerabilidades.
- [ ] Ejecutar formato, lint, tipos, tests, cobertura, auditoría, checks agregados y validaciones auxiliares.
- [ ] Revisar diff completo, placeholders, `member/`, secretos y permisos de workflows.
- [ ] Generar el informe local con resultados antes/después, riesgos y reversión segura.
- [ ] Crear commits revisables.
- [ ] Comprobar autenticación sin leer tokens; publicar rama y crear PR borrador cuando sea posible.

## Aceptación

- La documentación refleja exactamente versiones y comandos validados.
- El informe local contiene los 20 apartados solicitados y no está versionado.
- No hay whitespace inválido, secretos añadidos, cambios en `member/` ni placeholders sustituidos.
- La rama queda publicada y el PR en borrador si el entorno dispone de autenticación y `gh`.
