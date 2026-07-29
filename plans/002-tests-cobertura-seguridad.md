# Plan 002 — Tests, cobertura y seguridad del código

## Objetivo

Medir la cobertura real, reforzar pruebas de alto valor y corregir únicamente vulnerabilidades de código
demostrables sin alterar integraciones legítimas.

## Alcance

- Integrar cobertura V8 conservando aliases y tiempos de Miniflare.
- Medir statements, branches, functions y lines antes de definir umbrales.
- Revisar autenticación administrativa, webhooks, consultas D1, HTML, URLs externas, medios, herramientas y
  respuestas HTTP.
- Añadir pruebas de regresión para cada corrección de seguridad aplicada.
- Clasificar hallazgos no corregidos con severidad, escenario, mitigación y motivo.

## Tareas

- [ ] Ejecutar tests y cobertura con el entorno normalizado.
- [ ] Identificar módulos críticos con cobertura insuficiente.
- [ ] Revisar rutas `/admin` y endpoints de control.
- [ ] Revisar firmas, tamaños y parsing de webhooks.
- [ ] Revisar interpolación HTML, URLs, fetch externos y herramientas invocadas por el LLM.
- [ ] Aplicar y probar correcciones de riesgo bajo o medio que sean claramente compatibles.
- [ ] Documentar hallazgos pendientes sin publicar detalles ofensivos.

## Aceptación

- `pnpm test` y `pnpm test:coverage` funcionan sin llamadas a servicios reales.
- No se eliminan o desactivan tests, ni se excluye código crítico para elevar porcentajes.
- Cada corrección de seguridad tiene una prueba de regresión.
- Los hallazgos pendientes quedan registrados en el informe local.
