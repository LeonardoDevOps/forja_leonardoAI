# Backlog de endurecimiento y modernización

Este backlog da trazabilidad al trabajo iniciado desde
`ffe32d87c9615945079eb9d073e6c6a51a71c8e9` en la rama
`chore/forja-hardening-20260729-1700`.

## Reglas de ejecución

- No modificar `member/` ni sustituir placeholders de `wrangler.toml`.
- No leer o modificar secretos, desplegar en Cloudflare, publicar npm ni fusionar en `main`.
- Conservar el comportamiento funcional y aplicar cambios pequeños, comprobables y revisables.
- Registrar evidencia local de cada validación en `.forja-reports/`, fuera del control de versiones.
- Corregir hallazgos de seguridad solo cuando sean demostrables, de riesgo bajo o medio y estén cubiertos
  por pruebas.

## Estado

| ID | Plan | Prioridad | Estado | Dependencias |
|---|---|---:|---|---|
| 001 | [Calidad, formato y reproducibilidad](./001-calidad-formato-reproducibilidad.md) | P0 | En curso | Ninguna |
| 002 | [Tests, cobertura y seguridad del código](./002-tests-cobertura-seguridad.md) | P0 | Pendiente | 001 |
| 003 | [CI y supply chain](./003-ci-supply-chain.md) | P0 | Pendiente | 001, 002 |
| 004 | [Documentación, validación y entrega](./004-documentacion-validacion-entrega.md) | P0 | Pendiente | 001, 002, 003 |

## Línea base confirmada

- El árbol de trabajo estaba limpio antes de comenzar.
- `origin/main` y `upstream/main` apuntaban al mismo commit base.
- Entorno inicial: Node 24.18.0 y pnpm 11.9.0.
- El lockfile usa formato 9.0 y las herramientas de desarrollo estaban declaradas como `latest`.
- La instalación congelada reconoció el lockfile como sincronizado, pero pnpm 11 terminó con una política
  nueva de scripts de construcción; se normalizará una versión compatible dentro del rango requerido.
- La auditoría inicial detectó vulnerabilidades altas, tanto en herramientas de desarrollo como en cadenas
  transitivas de runtime; se evaluarán actualizaciones mínimas compatibles.
- La CI inicial solo validaba Node 20, tipos y tests, sin formato, lint, cobertura ni controles de supply chain.

## Definición de terminado

Los cuatro planes deben estar completados, las validaciones obligatorias ejecutadas y cualquier resultado
no verde documentado con su causa, impacto y seguimiento. La rama podrá publicarse y abrirse como pull
request en borrador, pero nunca se fusionará desde esta tarea.
