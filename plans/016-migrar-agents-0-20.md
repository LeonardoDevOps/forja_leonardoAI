# Plan 016: Migrar `agents` 0.3.10 a la serie actual

> **Instrucciones para el ejecutor**: esta es una migración pre-1.0, no una
> actualización rutinaria. Revalida la versión objetivo y lee todos los
> changelogs intermedios antes de editar. No despliegues ni publiques paquetes.
> Al terminar, actualiza `plans/README.md`.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: M–L
- **Riesgo**: MEDIUM
- **Depende de**: 015
- **Categoría**: runtime / Durable Objects / supply chain
- **Versión base**: `agents 0.3.10`
- **Candidata observada**: `agents 0.20.1` (2026-07-30; revalidar al ejecutar)
- **Planificado en**: Plan 015, 2026-07-30
- **Completado en**: rama `advisor/016-agents-0-20`, 2026-07-30

## Por qué requiere una migración propia

La dependencia ha avanzado por numerosas series pre-1.0. El recorrido incluye
cambios en x402, peers de AI SDK y Zod, PartyServer, MCP y APIs de agentes.
Actualizarla junto con mantenimiento ordinario podría cambiar la persistencia,
los alarms o el scheduling de los Durable Objects sin un fallo de compilación.

Forja usa en `src/agent.ts` el estado de `Agent`, `setState`, `getSchedules`,
`cancelSchedule` y `schedule`. Esas operaciones gobiernan el debounce de
mensajes y deben conservar exactamente su semántica.

## Alcance

**Dentro del alcance:**

- actualizar `agents` y únicamente los peers/transitivos necesarios;
- retirar overrides que la nueva versión haga innecesarios;
- caracterizar estado, scheduling, alarms, reanudación en frío y deduplicación;
- validar Node 22/24, workerd/Miniflare, auditoría y cobertura;
- documentar compatibilidad, migración de datos y rollback.

**Fuera de alcance:**

- rediseñar el chatbot, canales o herramientas;
- adoptar x402 si Forja no lo utiliza;
- tocar `member/`, placeholders de `wrangler.toml` o secretos;
- desplegar en Cloudflare o publicar npm.

## Fases

### 1. Congelar el contrato observable

- Inventariar todos los imports de `agents` y comprobar que no se usan entry
  points obsoletos.
- Añadir pruebas de caracterización del buffer: alta, reemplazo del alarm
  anterior, cancelación, procesamiento único y recuperación tras nueva
  instancia.
- Registrar el esquema y las tablas Durable Object existentes sin escribir
  directamente en tablas internas de `agents`.

### 2. Revisión de compatibilidad

- Leer los changelogs desde 0.3.10 hasta la versión objetivo.
- Revisar especialmente la migración de x402 legacy a `@x402/core` /
  `@x402/evm` v2, el salto de PartyServer y la transición de MCP v1/v2.
- Confirmar los peers efectivos de AI SDK, React, Zod, TypeScript y Vite.
- Demostrar con búsqueda y tests si x402 y los entry points auxiliares no son
  alcanzables en Forja; no añadir paquetes que el proyecto no consume.

### 3. Spike aislado

- Actualizar en una rama creada desde `origin/main`.
- Regenerar el lockfile con pnpm 10.34.5 y revisar cada cambio transitivo.
- Adaptar solo APIs que hayan cambiado, sin acceder a tablas internas ni
  implementar fallbacks que oculten errores de scheduling.
- Retirar los overrides MCP/Hono solo si el árbol nuevo resuelve versiones
  corregidas y `pnpm audit --audit-level low` continúa en cero.

### 4. Compatibilidad de datos y runtime

- Ejecutar las pruebas con Node 22 y 24.
- Probar en Miniflare/workerd: estado existente, nueva conversación, alarm
  pendiente, cancelación, reinicio en frío y ausencia de dobles respuestas.
- Si upstream exige una migración de almacenamiento, escribir primero una
  prueba con datos de la versión anterior y documentar rollback. No modificar
  tablas internas manualmente.

### 5. Entrega gradual

- Ejecutar instalación congelada, formato, ESLint con cero warnings,
  typecheck, suite completa, cobertura administrativa y auditoría LOW.
- Preparar notas de actualización y rollback a la versión/lockfile anterior.
- La validación en staging y cualquier despliegue requieren autorización
  explícita y el runbook Cloudflare; no forman parte de la implementación
  automática del plan.

## Criterios de terminado

- [x] Changelogs y peers intermedios registrados en la documentación.
- [x] Pruebas de caracterización fallan ante debounce o scheduling duplicado.
- [x] Estado y alarms previos siguen siendo compatibles; la migración está
      probada y el rollback queda documentado.
- [x] Una sola versión de `agents`, MCP, PartyServer y Hono en el árbol.
- [x] `pnpm audit --audit-level low` informa cero vulnerabilidades.
- [x] Node 22/24, cobertura y gates administrativos pasan.
- [x] Overrides innecesarios retirados y los restantes justificados.
- [x] `member/`, `wrangler.toml`, secretos y despliegues permanecen intactos.

## Condiciones de parada

Detente e informa si:

- la versión objetivo exige Node fuera de las líneas 22/24 soportadas o un
  runtime no compatible con Workers;
- no existe una ruta probada para conservar estado o alarms en producción;
- aparecen dobles respuestas, pérdida de buffers o cambios de orden;
- la migración exige infraestructura, secretos o un despliegue no autorizado;
- una dependencia nueva no tiene procedencia o licencia verificable.

## Resultado

La versión oficial vigente se revalidó en 0.20.1 y quedó fijada exactamente, sin
adoptar AI SDK 7 ni instalar peers opcionales. Miniflare se actualizó a
4.20260730.0 porque la versión anterior no implementaba la API de tracing usada
por el SDK actual.

El único cambio de producción sustituye el getter síncrono deprecado
`getSchedules()` por `await listSchedules()`. `schedule()` y
`cancelSchedule()` conservan el debounce existente.

El lockfile resuelve una única versión de:

- `agents 0.20.1`;
- `partyserver 0.5.9`;
- MCP SDK 1.30.0 y MCP client/server 2.0.0;
- `@hono/node-server 2.0.12`.

Los overrides temporales MCP/Hono del Plan 015 se retiraron. La auditoría LOW
permanece en cero y las integraciones opcionales x402, Codemode y AI Chat no se
instalaron. La revisión de licencias de producción no encontró licencias sin
declarar; los componentes principales migrados usan MIT, Apache-2.0 o ISC.

El rango de motor se precisó a Node 22.18+ o 24.11+ (Node 23 excluido), que es
el mínimo efectivo de las nuevas transitivas. La matriz ejecutada pasó con
Node 22.23.2 y Node 24.18.0.

La prueba `test/agents-migration.test.ts` construye el Worker con Wrangler
`--dry-run`, siembra estado y un schedule con el esquema 0.3.10, reinicia el
mismo Durable Object bajo 0.20.1 y comprueba que el schedule sobrevive y es
reemplazado por un único debounce. Las pruebas unitarias cubren rehidratación
del buffer y callbacks solapados sin doble respuesta.

La revisión de changelogs, peers, esquema, rollback y evidencia está en
`docs/agents-0.20-migration.md`.

## Evidencia de validación

- instalación congelada con pnpm 10.34.5;
- ESLint con cero errores y cero warnings;
- typecheck en Node 22.23.2 y 24.18.0;
- 17 pruebas focales en Node 22;
- 552 pruebas en 76 archivos en Node 24;
- cobertura: 83,35 % líneas, 80,45 % statements, 69,68 % branches y 84,51 %
  functions;
- gate administrativo: 32/32;
- `pnpm audit --audit-level low`: cero vulnerabilidades;
- build local de Wrangler con `--dry-run` y prueba real en Miniflare, sin
  despliegue;
- `git diff --check` y formato de todos los archivos modificados superados.

El `format:check` global sigue detectando 126 archivos CRLF heredados del
checkout de Windows. No se normalizaron archivos ajenos al plan; todos los
archivos tocados por el Plan 016 sí pasan Prettier.
