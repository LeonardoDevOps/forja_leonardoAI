# Mantenimiento de dependencias

Esta guía define cómo revisar y actualizar dependencias sin convertir una alerta
en una migración funcional no planificada.

## Cadencia

| Frecuencia | Responsable                    | Acción                                                                 |
| ---------- | ------------------------------ | ---------------------------------------------------------------------- |
| Semanal    | Mantenedor de guardia          | Revisar el workflow `Dependency Audit`, Dependabot y alertas abiertas. |
| Mensual    | Mantenedor de supply chain     | Clasificar versiones atrasadas y preparar parches compatibles.         |
| Trimestral | Mantenedor y segundo revisor   | Reevaluar todos los overrides y migraciones pre-1.0 pendientes.        |
| Inmediata  | Responsable de una alerta HIGH | Corregir o aplicar el proceso de excepción de `SECURITY.md`.           |

El workflow programado se ejecuta los lunes a las 05:00 UTC con permisos de
solo lectura. Dependabot propone actualizaciones después, según
`.github/dependabot.yml`.

## Comprobación reproducible

Ejecuta siempre con la versión de pnpm declarada por el repositorio:

```bash
corepack pnpm@10.34.5 install --frozen-lockfile
corepack pnpm@10.34.5 check:ci
corepack pnpm@10.34.5 audit --audit-level low
```

Una alerta nueva de severidad LOW o superior hace fallar `security:audit`. No
uses `pnpm audit --fix --force`: puede introducir majors o reescribir el árbol
sin las pruebas de migración necesarias.

## Política de actualización

1. Confirma la ruta con `pnpm why <paquete>` y revisa el advisory y el changelog
   oficiales.
2. Prefiere una versión dentro del rango que ya admite el consumidor.
3. Inspecciona el diff del manifiesto y del lockfile; evita actualizaciones no
   relacionadas.
4. Ejecuta instalación congelada, calidad, cobertura y auditoría.
5. Aísla cualquier major, dependencia pre-1.0 o cambio de runtime en un plan y
   una rama propios.
6. Registra en el PR el riesgo, la compatibilidad comprobada y el rollback.

Los PR de Dependabot son propuestas, no autorizaciones automáticas. Nunca deben
modificar `member/`, placeholders de `wrangler.toml`, secretos ni configuración
privada.

## Registro de overrides

Los overrides son controles temporales y deben poder justificarse:

| Paquete                     | Versión | Motivo y criterio de retirada                                                                              |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk` | 1.30.0  | `agents 0.3.10` fija 1.25.2. Mantiene correcciones MCP y permite Hono 2.x; retirar al migrar `agents`.     |
| `@hono/node-server`         | 2.0.12  | Corrige `GHSA-frvp-7c67-39w9`; MCP 1.30 admite `^1.19.9 \|\| ^2.0.5`. Retirar cuando MCP lo resuelva solo. |
| `axios`                     | 1.18.0  | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `brace-expansion`           | 5.0.8   | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `fast-uri`                  | 3.1.4   | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `form-data`                 | 4.0.6   | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `postcss`                   | 8.5.18  | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `sharp`                     | 0.35.2  | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `undici`                    | 7.28.0  | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `vite`                      | 8.0.16  | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |
| `ws`                        | 8.21.0  | Pin de seguridad transitivo; reevaluar trimestralmente.                                                    |

El 2026-07-30, el árbol resuelve una única versión de MCP 1.30.0 y Hono
2.0.12. `pnpm audit --audit-level low` informa cero vulnerabilidades.

## Migraciones separadas

`agents` permanece en 0.3.10. La versión disponible ha avanzado por múltiples
series pre-1.0 e incorpora cambios de peers, x402, MCP y Durable Objects. Su
migración se controla en el [Plan 016](../plans/016-migrar-agents-0-20.md), con
pruebas de caracterización y rollback propios.
